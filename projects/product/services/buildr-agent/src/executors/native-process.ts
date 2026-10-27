import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { realpath, stat, lstat, mkdir, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { dirname, isAbsolute, join } from 'node:path';
import type { ExecutorBinding } from '../contracts.ts';
import { isCompatibleProgram, nativeProgramPolicy } from './program-policy.ts';
import { toolEnvironment } from './tool-environment.ts';

export type NativeEnvironment = NodeJS.ProcessEnv;
/** Deliberately excludes desktop RPC credentials and default provider credentials. */
export function isolatedEnvironment(input: NativeEnvironment, home: string, temporary: string, extra: NativeEnvironment = {}): NativeEnvironment {
  const result: NativeEnvironment = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'USER', 'LOGNAME', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy']) {
    if (input[key] !== undefined) result[key] = input[key];
  }
  return { ...result, ...toolEnvironment(input), HOME: home, USERPROFILE: home, TMPDIR: temporary, TMP: temporary, TEMP: temporary, ...extra };
}
export async function privateDirectories(...directories: string[]): Promise<void> {
  for (const directory of directories) {
    if (!isAbsolute(directory)) throw new Error('agent_config_path_invalid');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('agent_config_symlink_unsupported');
    await chmod(directory, 0o700);
  }
}
export async function executableIdentity(executable: string): Promise<string> {
  if (!isAbsolute(executable)) throw new Error('agent_executable_path_invalid');
  const resolved = await realpath(executable);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error('agent_executable_invalid');
  return createHash('sha256').update(JSON.stringify([resolved, info.dev, info.ino, info.size, info.mtimeMs])).digest('hex');
}
export async function bounded<T>(promise: Promise<T>, timeoutMs: number, code = 'agent_native_timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
export async function closeOwnedProcess(child: ChildProcessWithoutNullStreams, timeoutMs = 2500): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.stdin.end();
  try { await bounded(exited, timeoutMs); return; } catch { /* Own exact live ChildProcess, never a recovered PID. */ }
  child.kill('SIGTERM');
  try { await bounded(exited, timeoutMs); return; } catch { child.kill('SIGKILL'); }
  await bounded(exited, timeoutMs);
}
export interface RpcMessage { id?: string | number; method?: string; params?: any; result?: any; error?: { code?: number; message?: string }; }
export class NativeRpc {
  private sequence = 0;
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private pending = new Map<string | number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private listeners = new Set<(message: RpcMessage) => void>();
  readonly child: ChildProcessWithoutNullStreams;
  private disposed = false;
  private failed = false;
  get closed(): boolean { return this.disposed || this.failed || this.child.exitCode !== null || this.child.signalCode !== null || this.child.stdin.destroyed; }
  constructor(command: string, args: string[], options: { cwd: string; env: NativeEnvironment }) {
    this.child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    // Native diagnostics may contain credentials. They never become public errors or events.
    this.child.stderr.on('data', () => {});
    this.child.stdout.on('data', chunk => this.read(this.decoder.write(chunk)));
    this.child.stdin.on('error', () => this.fail('agent_native_process_closed'));
    this.child.once('error', () => this.fail('agent_native_process_failed'));
    this.child.once('exit', () => this.fail('agent_native_process_closed'));
  }
  onMessage(listener: (message: RpcMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private read(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 16 * 1024 * 1024) { this.fail('agent_native_frame_too_large'); this.child.kill('SIGTERM'); return; }
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message: RpcMessage;
      try { message = JSON.parse(line); } catch { this.fail('agent_native_protocol_invalid'); this.child.kill('SIGTERM'); return; }
      if (message.id !== undefined && !message.method && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!; this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(/^(?:agent_|qoder_|dsh_)[a-z0-9_]+$/.test(message.error.message ?? '') ? message.error.message : 'agent_native_request_failed'));
        else pending.resolve(message.result);
      } else for (const listener of this.listeners) { try { listener(message); } catch { this.fail('agent_event_consumer_failed'); this.child.kill('SIGTERM'); return; } }
    }
  }
  private fail(code: string): void { for (const pending of this.pending.values()) pending.reject(new Error(code)); this.pending.clear(); if (!this.failed) { this.failed = true; for (const listener of this.listeners) { try { listener({ method: 'buildr/transportClosed', params: { code } }); } catch { /* Consumer errors cannot escape a process event handler. */ } } } }
  write(message: RpcMessage): void {
    if (this.disposed || this.child.exitCode !== null || this.child.signalCode !== null || this.child.stdin.destroyed) throw new Error('agent_native_process_closed');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  async call(method: string, params: unknown = {}, timeoutMs = 30000): Promise<any> {
    const id = ++this.sequence;
    const result = new Promise<any>((resolve, reject) => { this.pending.set(id, { resolve, reject }); });
    try { this.write({ id, method, params }); return await bounded(result, timeoutMs); }
    finally { this.pending.delete(id); }
  }
  async close(): Promise<void> { if (this.disposed) return; this.disposed = true; this.fail('agent_native_process_closed'); await closeOwnedProcess(this.child, 1000); this.listeners.clear(); }
}
export function opaqueReference(provider: string, nativeSessionId: string, cwd: string, bindingIdentity: string): string {
  return JSON.stringify({ version: 1, provider, nativeSessionId, cwd, bindingIdentity });
}
export function parseReference(reference: string, provider: string, cwd: string, bindingIdentity: string): { nativeSessionId: string } {
  let data: any;
  try { data = JSON.parse(reference); } catch { throw new Error('agent_context_invalid'); }
  if (data.version !== 1 || data.provider !== provider || data.cwd !== cwd || data.bindingIdentity !== bindingIdentity || typeof data.nativeSessionId !== 'string' || !data.nativeSessionId) throw new Error('agent_context_binding_mismatch');
  return data;
}
export function nativeHome(configDirectory: string): { home: string; temporary: string } { return { home: join(configDirectory, 'home'), temporary: join(configDirectory, 'tmp') }; }
export function visibleText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(value => value?.type === 'text' || value?.type === 'input_text').map(value => String(value.text ?? '')).join('\n');
}
export async function findExecutable(explicit: string | undefined, names: string[], environment: NativeEnvironment): Promise<string> {
  if (explicit) { await executableIdentity(explicit); return await realpath(explicit); }
  for (const directory of (environment.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!isAbsolute(directory)) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try { await executableIdentity(candidate); return await realpath(candidate); } catch { /* Try the next actual executable. */ }
    }
  }
  throw new Error('agent_program_missing');
}
export function nativeCommand(executable: string): { command: string; prefix: string[] } {
  return /\.(?:mjs|cjs|js)$/i.test(executable) ? { command: process.execPath, prefix: [executable] } : { command: executable, prefix: [] };
}
export async function inspectVersion(executable: string, environment: NativeEnvironment, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const command = nativeCommand(executable);
  const child = spawn(command.command, [...command.prefix, '--version'], { env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const abort = () => { void closeOwnedProcess(child, 500); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let output = '';
  const append = (chunk: Buffer) => { if (output.length < 8192) output += chunk.toString(); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  try {
    const status = await bounded(new Promise<number | null>((resolve, reject) => { child.once('error', () => reject(new Error('agent_program_unavailable'))); child.once('exit', resolve); }), 15000);
    signal?.throwIfAborted();
    if (status !== 0) throw new Error('agent_program_unavailable');
    const version = output.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?/)?.[0];
    if (!version) throw new Error('agent_version_unrecognized');
    return version;
  } finally { signal?.removeEventListener('abort', abort); if (child.exitCode === null && child.signalCode === null) await closeOwnedProcess(child, 500); }
}
export async function bindingFingerprint(provider: string, executable: string, version: string, configRoot: string): Promise<string> {
  const config = await realpath(configRoot); const info = await stat(config);
  return createHash('sha256').update(JSON.stringify({ provider, executable: await executableIdentity(executable), version, config, dev: info.dev, ino: info.ino })).digest('hex');
}
/** Program contents may change on a compatible update; source/config identity must not. */
export async function nativeBinding(provider: string, executable: string, version: string, configRoot: string, prior?: ExecutorBinding): Promise<Required<Pick<ExecutorBinding, 'identity' | 'data'>>> {
  if (!isCompatibleProgram(provider, version)) throw new Error(`${provider}_version_unsupported`);
  const source = await realpath(executable), config = await realpath(configRoot), info = await stat(config);
  // Keep the v2 namespace byte-for-byte: changing admission must not change old native IDs.
  const provenance = { format: 'buildr-native-binding/v2', provider, executable: source, config, dev: info.dev, ino: info.ino, series: nativeProgramPolicy(provider).bindingSeries };
  const data = { ...provenance, observedVersion: version };
  if (!prior) return { identity: createHash('sha256').update(JSON.stringify(provenance)).digest('hex'), data };
  if (prior.data !== undefined) {
    if (Object.entries(provenance).some(([key, value]) => prior.data?.[key] !== value)) throw new Error('agent_context_binding_mismatch');
    return { identity: prior.identity, data };
  }
  // Older local records have only a fingerprint and source locations. Preserve their
  // existing native IDs only at the same explicitly recorded program/config paths.
  const exactLegacy = prior.identity === await bindingFingerprint(provider, executable, version, configRoot);
  const sameLegacyLocation = prior.executable && prior.configRoot
    && await realpath(prior.executable).catch(() => undefined) === source
    && await realpath(prior.configRoot).catch(() => undefined) === await realpath(dirname(configRoot));
  if (!exactLegacy && !sameLegacyLocation) throw new Error('agent_context_binding_mismatch');
  return { identity: prior.identity, data };
}
/** Bounded display preserves the fact that the native record contains more output. */
export function nativePreview(text: string, maximum = 16000): string {
  if (text.length <= maximum) return text;
  let prefix = text.slice(0, maximum);
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  return prefix + '\n\n[内容已截断，完整内容保留在原生会话中。]';
}
