import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import type { VerifiedReadonlyRequest, VerifiedReadonlyResult } from './verified-readonly-types.ts';

const SCHEMA = 'buildr.windows-verified-readonly/v1';
// Startup, compilation and held-handle reads share this budget. Exceeding the
// target only warns; the separate deadline stops a stuck local system process.
export const WINDOWS_READONLY_TARGET_MS = 10_000;
export const WINDOWS_READONLY_TIMEOUT_MS = 30_000;
function unavailable(): Error { return Object.assign(new Error('来源文件无法在授权根内确认。'), { code: 'readonly_root_unconfirmed' }); }

// Windows PowerShell 5.1 supplies .NET and Add-Type. No downloaded module,
// persistent helper or Node ABI addon is used. The child owns both proof and read.
export const WINDOWS_READONLY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false, $true)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false, $true)
try {
  $inputValue = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class BuildrVerifiedReadonlyWindows {
  const uint Read = 0x80000000, Attributes = 0x80, ShareRead = 1, ShareWrite = 2;
  const uint OpenExisting = 3, BackupSemantics = 0x02000000, OpenReparsePoint = 0x00200000;
  const uint Directory = 0x10, ReparsePoint = 0x400;
  [StructLayout(LayoutKind.Sequential)] struct Basic {
    public long Creation, Access, Write, Change;
    public uint Attributes;
  }
  [StructLayout(LayoutKind.Sequential)] struct Standard {
    public long Allocation, Size;
    public uint Links;
    public byte DeletePending, Directory;
  }
  [StructLayout(LayoutKind.Sequential)] struct FileId {
    public ulong Volume;
    public ulong Low, High;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder name, uint capacity, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out Basic info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out Standard info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out FileId info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetFileType(SafeFileHandle handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ReadFile(SafeFileHandle handle, byte[] buffer, uint length, out uint read, IntPtr overlapped);

  sealed class Root {
    public SafeFileHandle Handle;
    public string Name;
    public FileId Id;
  }
  sealed class Leaf {
    public int Index, Limit;
    public Root Root;
    public SafeFileHandle Handle;
    public string Name;
    public FileId Id;
    public Basic Basic;
    public Standard Standard;
    public byte[] Body;
  }
  public sealed class Result {
    public int index;
    public bool ok;
    public string bytes;
  }
  static void Require(bool valid) { if (!valid) throw new IOException("readonly_root_unconfirmed"); }
  static string Normalize(string name) {
    if (name.StartsWith(@"\\?\UNC\", StringComparison.Ordinal)) name = @"\\" + name.Substring(8);
    else if (name.StartsWith(@"\\?\", StringComparison.Ordinal)) name = name.Substring(4);
    Require(Path.IsPathRooted(name) && name.IndexOf('\0') < 0);
    int rootLength = Path.GetPathRoot(name).Length;
    while (name.Length > rootLength && name.EndsWith(@"\", StringComparison.Ordinal)) name = name.Substring(0, name.Length - 1);
    if (name.Length > 1 && name[1] == ':') name = Char.ToUpperInvariant(name[0]) + name.Substring(1);
    return name;
  }
  static string FinalName(SafeFileHandle handle) {
    StringBuilder name = new StringBuilder(32768);
    uint length = GetFinalPathNameByHandleW(handle, name, (uint)name.Capacity, 0);
    Require(length > 0 && length < name.Capacity);
    return Normalize(name.ToString());
  }
  static FileId Id(SafeFileHandle handle) {
    FileId value;
    Require(GetFileInformationByHandleEx(handle, 18, out value, (uint)Marshal.SizeOf(typeof(FileId))));
    Require(value.Low != 0 || value.High != 0);
    return value;
  }
  static bool Same(FileId a, FileId b) { return a.Volume == b.Volume && a.Low == b.Low && a.High == b.High; }
  static Basic Metadata(SafeFileHandle handle, bool directory) {
    Basic value;
    Require(GetFileType(handle) == 1);
    Require(GetFileInformationByHandleEx(handle, 0, out value, (uint)Marshal.SizeOf(typeof(Basic))));
    Require((value.Attributes & ReparsePoint) == 0 && ((value.Attributes & Directory) != 0) == directory);
    return value;
  }
  static Standard Size(SafeFileHandle handle) {
    Standard value;
    Require(GetFileInformationByHandleEx(handle, 1, out value, (uint)Marshal.SizeOf(typeof(Standard))));
    Require(value.Directory == 0 && value.DeletePending == 0 && value.Size >= 0);
    return value;
  }
  static SafeFileHandle Open(string name, bool directory) {
    // Denying delete holds the root name; denying write and delete also freezes
    // a leaf against existing/new writers, including writers through hard links.
    SafeFileHandle handle = CreateFileW(name, directory ? Attributes : Read,
      directory ? ShareRead | ShareWrite : ShareRead, IntPtr.Zero, OpenExisting,
      OpenReparsePoint | (directory ? BackupSemantics : 0), IntPtr.Zero);
    if (handle.IsInvalid) { handle.Dispose(); throw new IOException("readonly_root_unconfirmed"); }
    return handle;
  }
  static bool Attest(Leaf leaf) {
    try {
      Metadata(leaf.Root.Handle, true);
      Basic basic = Metadata(leaf.Handle, false);
      Standard standard = Size(leaf.Handle);
      return Same(Id(leaf.Root.Handle), leaf.Root.Id) && Same(Id(leaf.Handle), leaf.Id)
        && String.Equals(FinalName(leaf.Root.Handle), leaf.Root.Name, StringComparison.Ordinal)
        && String.Equals(FinalName(leaf.Handle), leaf.Name, StringComparison.Ordinal)
        && standard.Size <= leaf.Limit && standard.Size == leaf.Standard.Size
        && basic.Write == leaf.Basic.Write && basic.Change == leaf.Basic.Change
        && basic.Attributes == leaf.Basic.Attributes;
    } catch { return false; }
  }
  public static Result[] ReadBatch(string[] names, string[] relatives, int[] limits) {
    Require(names.Length == relatives.Length && names.Length == limits.Length && names.Length <= 16);
    Result[] results = new Result[names.Length];
    Dictionary<string, Root> roots = new Dictionary<string, Root>(StringComparer.Ordinal);
    List<SafeFileHandle> held = new List<SafeFileHandle>();
    List<Leaf> leaves = new List<Leaf>();
    try {
      for (int index = 0; index < names.Length; index++) {
        results[index] = new Result { index = index, ok = false, bytes = null };
        try {
          string rootName = Normalize(Path.GetFullPath(names[index]));
          string relative = relatives[index];
          Require(limits[index] > 0 && limits[index] < Int32.MaxValue && !String.IsNullOrEmpty(relative)
            && !Path.IsPathRooted(relative) && relative.IndexOfAny(new char[] {'\\', '\0', ':'}) < 0);
          foreach (string part in relative.Split('/')) Require(part.Length > 0 && part != "." && part != "..");
          Root root;
          if (!roots.TryGetValue(rootName, out root)) {
            SafeFileHandle handle = Open(rootName, true); held.Add(handle);
            Metadata(handle, true);
            Require(String.Equals(FinalName(handle), rootName, StringComparison.Ordinal));
            root = new Root { Handle = handle, Name = rootName, Id = Id(handle) };
            roots.Add(rootName, root);
          } else {
            Metadata(root.Handle, true);
            Require(Same(Id(root.Handle), root.Id) && String.Equals(FinalName(root.Handle), root.Name, StringComparison.Ordinal));
          }
          // Test instrumentation may pause here while real Windows paths change.
          string leafName = Path.Combine(rootName, relative.Replace('/', '\\'));
          SafeFileHandle leafHandle = Open(leafName, false); held.Add(leafHandle);
          Basic before = Metadata(leafHandle, false);
          Standard size = Size(leafHandle);
          Require(size.Size <= limits[index]);
          leaves.Add(new Leaf { Index = index, Limit = limits[index], Root = root,
            Handle = leafHandle, Name = leafName, Id = Id(leafHandle), Basic = before, Standard = size });
        } catch { /* An unavailable file/root never invalidates independent roots. */ }
      }
      List<Leaf> readable = leaves.FindAll(Attest);
      // All root and leaf handles remain held across the entire before/read/after stage.
      foreach (Leaf leaf in readable) {
        try {
          using (MemoryStream body = new MemoryStream()) {
            byte[] buffer = new byte[Math.Min(65536, leaf.Limit + 1)];
            while (body.Length <= leaf.Limit) {
              uint count;
              uint wanted = (uint)Math.Min(buffer.Length, leaf.Limit + 1L - body.Length);
              Require(ReadFile(leaf.Handle, buffer, wanted, out count, IntPtr.Zero));
              if (count == 0) break;
              body.Write(buffer, 0, (int)count);
            }
            Require(body.Length <= leaf.Limit);
            // These bytes remain private until the final full root/leaf proof.
            leaf.Body = body.ToArray();
          }
        } catch { leaf.Body = null; }
      }
      foreach (Leaf leaf in readable) if (leaf.Body != null && Attest(leaf)) {
        results[leaf.Index].bytes = Convert.ToBase64String(leaf.Body);
        results[leaf.Index].ok = true;
      }
      return results;
    } finally {
      for (int index = held.Count - 1; index >= 0; index--) {
        SafeFileHandle handle = held[index];
        bool closed = false;
        try { closed = CloseHandle(handle.DangerousGetHandle()); } catch { }
        if (closed) handle.SetHandleAsInvalid();
        else foreach (Leaf leaf in leaves) if (Object.ReferenceEquals(leaf.Handle, handle) || Object.ReferenceEquals(leaf.Root.Handle, handle)) {
          results[leaf.Index].ok = false; results[leaf.Index].bytes = null;
        }
        try { handle.Dispose(); } catch { /* Continue releasing independent handles. */ }
      }
    }
  }
}
'@
  $items = @($inputValue.requests)
  $roots = New-Object 'string[]' $items.Count
  $relatives = New-Object 'string[]' $items.Count
  $limits = New-Object 'int[]' $items.Count
  for ($i = 0; $i -lt $items.Count; $i++) {
    $roots[$i] = $items[$i].root
    $relatives[$i] = $items[$i].relative
    $limits[$i] = $items[$i].maxBytes
  }
  $results = [BuildrVerifiedReadonlyWindows]::ReadBatch($roots, $relatives, $limits)
  $response = @{ schemaVersion = 'buildr.windows-verified-readonly/v1'; results = @($results) }
  [Console]::Out.Write(($response | ConvertTo-Json -Depth 4 -Compress))
} catch {
  [Console]::Error.Write('windows_readonly_unavailable')
  exit 1
}
`;

/** A malformed/truncated child response cannot supply any tentative body. */
export function parseWindowsReadonlyResponse(bytes: Buffer, requests: readonly VerifiedReadonlyRequest[]): VerifiedReadonlyResult[] {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (value?.schemaVersion !== SCHEMA || Object.keys(value).some(key => !['schemaVersion', 'results'].includes(key)) || !Array.isArray(value.results) || value.results.length !== requests.length) throw unavailable();
  return value.results.map((row: any, index: number) => {
    if (row?.index !== index || typeof row.ok !== 'boolean' || Object.keys(row).some(key => !['index', 'ok', 'bytes'].includes(key))) throw unavailable();
    if (!row.ok) { if (row.bytes !== null) throw unavailable(); return { ok: false, error: unavailable() }; }
    if (typeof row.bytes !== 'string' || row.bytes.length > Math.ceil(requests[index]!.maxBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.bytes)) throw unavailable();
    const body = Buffer.from(row.bytes, 'base64');
    if (body.length > requests[index]!.maxBytes || body.toString('base64') !== row.bytes) throw unavailable();
    return { ok: true, bytes: body };
  });
}

export function readWindowsVerifiedReadonlyBatch(requests: readonly VerifiedReadonlyRequest[]): VerifiedReadonlyResult[] {
  if (!Array.isArray(requests) || requests.length > 16) throw unavailable();
  const results: VerifiedReadonlyResult[] = Array.from({ length: requests.length }, () => ({ ok: false, error: unavailable() }));
  const readable: Array<{ index: number; request: VerifiedReadonlyRequest }> = [];
  requests.forEach((request, index) => {
    try {
      const { root, relative, maxBytes } = request;
      if (typeof root !== 'string' || !root || root.includes('\0') || typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[\\\0:]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes >= 2_147_483_647) throw unavailable();
      readable.push({ index, request: { root: path.resolve(root), relative, maxBytes } });
    } catch { /* Invalid requests occupy only their own result slot. */ }
  });
  if (!readable.length) return results;
  const started = performance.now();
  try {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot || !path.isAbsolute(systemRoot) || systemRoot.includes('\0')) throw unavailable();
    const executable = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const selected = readable.map(item => item.request);
    const bytes = execFileSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WINDOWS_READONLY_SCRIPT, 'utf16le').toString('base64')], {
      input: Buffer.from(JSON.stringify({ requests: selected }), 'utf8'),
      timeout: WINDOWS_READONLY_TIMEOUT_MS,
      maxBuffer: Math.max(64 * 1024, selected.reduce((size, request) => size + Math.ceil(request.maxBytes / 3) * 4 + 1024, 1024)),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const observed = parseWindowsReadonlyResponse(bytes, selected);
    readable.forEach((item, index) => { results[item.index] = observed[index]!; });
  } catch { /* Compiler, policy, timeout or protocol failures disclose no batch bytes. */ }
  finally {
    try {
      const elapsedMs = Math.round(performance.now() - started);
      if (Number.isFinite(elapsedMs) && elapsedMs > WINDOWS_READONLY_TARGET_MS) {
        process.emitWarning(JSON.stringify({ elapsedMs, targetMs: WINDOWS_READONLY_TARGET_MS }), { code: 'BUILDR_WINDOWS_READONLY_SLOW' });
      }
    } catch { /* Optional timing warnings never replace the original read result. */ }
  }
  return results;
}
