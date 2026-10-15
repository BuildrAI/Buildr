import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

export const VERIFIED_READONLY_BATCH_SIZE = 16;
export interface VerifiedReadonlyRequest { root: string; relative: string; maxBytes: number }
export type VerifiedReadonlyResult = { ok: true; bytes: Buffer } | { ok: false; error: Error };
type HeldRoot = { fd: number; canonical: string; identity: fs.Stats };
type HeldFile = { index: number; root: HeldRoot; fd: number; relative: string; maxBytes: number; identity: fs.Stats };

function unavailable(): Error { return Object.assign(new Error('来源文件无法在授权根内确认。'), { code: 'readonly_root_unconfirmed' }); }
function identity(left: fs.Stats, right: fs.Stats): boolean { return Number.isSafeInteger(left.ino) && left.ino > 0 && Number.isSafeInteger(right.ino) && left.dev === right.dev && left.ino === right.ino; }
function unchanged(file: HeldFile): boolean {
  const current = fs.fstatSync(file.fd), before = file.identity;
  return current.isFile() && current.size <= file.maxBytes && identity(current, before) && current.size === before.size && current.mtimeMs === before.mtimeMs && current.ctimeMs === before.ctimeMs;
}
/** Kernel descriptor paths, never another lookup of the caller's mutable file name. */
function descriptorPaths(descriptors: number[]): Map<number, string> {
  if (process.platform === 'linux') {
    const paths = new Map<number, string>();
    for (const fd of descriptors) try {
      const opened = fs.fstatSync(fd), kernel = fs.statSync(`/proc/self/fd/${fd}`);
      if (identity(opened, kernel)) paths.set(fd, fs.readlinkSync(`/proc/self/fd/${fd}`));
    } catch { /* One unavailable descriptor cannot attest its own files. */ }
    return paths;
  }
  if (process.platform !== 'darwin') throw unavailable();
  // At most 32 held descriptors; bounded libproc output, without shell/PATH or DNS.
  const bytes = execFileSync('/usr/sbin/lsof', ['-n', '-P', '-a', '-p', String(process.pid), '-d', descriptors.join(','), '-F0fn'], { timeout: 250, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const fields = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\0');
  const paths = new Map<number, string>(), seen = new Set<number>(); let owner: number | null = null, descriptor: number | null = null;
  for (const raw of fields) {
    // lsof's record separator is a single LF outside NUL fields; never trim paths.
    const field = raw.startsWith('\n') ? raw.slice(1) : raw;
    if (/^p\d+$/.test(field)) { if (owner !== null) throw unavailable(); owner = Number(field.slice(1)); descriptor = null; }
    else if (/^f\d+$/.test(field)) { descriptor = Number(field.slice(1)); if (owner !== process.pid || !descriptors.includes(descriptor) || seen.has(descriptor)) throw unavailable(); seen.add(descriptor); }
    else if (field.startsWith('n')) {
      if (owner !== process.pid || descriptor === null || paths.has(descriptor)) throw unavailable();
      const actual = field.slice(1); if (!path.isAbsolute(actual) || actual.includes('\0')) throw unavailable();
      paths.set(descriptor, actual);
    } else if (field) throw unavailable();
  }
  if (owner !== process.pid) throw unavailable();
  // Missing descriptor records are local failures; unrelated complete records remain usable.
  return paths;
}
function attest(files: HeldFile[]): Set<HeldFile> {
  const candidates = files.filter(file => {
    try { return identity(fs.fstatSync(file.root.fd), file.root.identity) && unchanged(file); } catch { return false; }
  });
  if (!candidates.length) return new Set();
  const paths = descriptorPaths([...new Set(candidates.flatMap(file => [file.root.fd, file.fd]))]);
  return new Set(candidates.filter(file => {
    try {
      return paths.get(file.root.fd) === file.root.canonical && paths.get(file.fd) === path.join(file.root.canonical, ...file.relative.split('/'))
        && identity(fs.fstatSync(file.root.fd), file.root.identity) && unchanged(file);
    } catch { return false; }
  }));
}
/**
 * One bounded stage holds every root and leaf until all before/after kernel-path
 * proofs finish. Results preserve input order; a bad file never supplies bytes.
 * Whole-probe failure invalidates the stage, not a later independent batch.
 */
export function readVerifiedReadonlyBatch(requests: readonly VerifiedReadonlyRequest[]): VerifiedReadonlyResult[] {
  if (!Array.isArray(requests) || requests.length > VERIFIED_READONLY_BATCH_SIZE) throw unavailable();
  const results: Array<VerifiedReadonlyResult | undefined> = Array.from({ length: requests.length }, () => undefined), held = new Set<number>(), roots = new Map<string, HeldRoot>(), files: HeldFile[] = [];
  try {
    if (!['darwin', 'linux'].includes(process.platform) || !fs.constants.O_DIRECTORY) throw unavailable();
    requests.forEach((request: VerifiedReadonlyRequest, index: number) => {
      try {
        const { root, relative, maxBytes } = request;
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw unavailable();
        // Recheck the named root even when its already held descriptor is shared.
        const canonical = path.resolve(root), named = fs.lstatSync(canonical);
        if (!named.isDirectory() || named.isSymbolicLink()) throw unavailable();
        let openedRoot = roots.get(canonical);
        if (openedRoot) {
          if (!identity(named, openedRoot.identity) || !identity(fs.fstatSync(openedRoot.fd), openedRoot.identity)) throw unavailable();
        } else {
          const fd = fs.openSync(canonical, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); held.add(fd);
          const rootIdentity = fs.fstatSync(fd);
          if (!rootIdentity.isDirectory() || !identity(rootIdentity, named)) throw unavailable();
          openedRoot = { fd, canonical, identity: rootIdentity }; roots.set(canonical, openedRoot);
        }
        const fd = fs.openSync(path.join(canonical, ...relative.split('/')), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); held.add(fd);
        const before = fs.fstatSync(fd);
        if (!before.isFile() || before.size > maxBytes) throw unavailable();
        files.push({ index, root: openedRoot, fd, relative, maxBytes, identity: before });
      } catch { results[index] = { ok: false, error: unavailable() }; }
    });
    const before = attest(files), read = new Map<HeldFile, Buffer>();
    for (const file of files) {
      if (!before.has(file)) { results[file.index] = { ok: false, error: unavailable() }; continue; }
      try {
        const buffer = Buffer.alloc(file.maxBytes + 1); let length = 0;
        while (length < buffer.length) { const count = fs.readSync(file.fd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
        if (length > file.maxBytes || !unchanged(file)) throw unavailable();
        read.set(file, buffer.subarray(0, length));
      } catch { results[file.index] = { ok: false, error: unavailable() }; }
    }
    const after = attest([...read.keys()]);
    for (const [file, bytes] of read) results[file.index] = after.has(file) ? { ok: true, bytes } : { ok: false, error: unavailable() };
  } catch {
    // No tentative body survives an untrusted global kernel-path query.
    for (let index = 0; index < results.length; index++) results[index] = { ok: false, error: unavailable() };
  } finally {
    for (const fd of [...held].reverse()) try { fs.closeSync(fd); } catch { /* Still close all other held descriptors. */ }
  }
  return results.map(result => result || { ok: false, error: unavailable() });
}
/** Single-file compatibility uses the same bounded proof, without a fallback. */
export function readVerifiedReadonlyBytes(root: string, relative: string, maxBytes: number): Buffer {
  const result = readVerifiedReadonlyBatch([{ root, relative, maxBytes }])[0]!;
  if (!result.ok) throw result.error;
  return result.bytes;
}
