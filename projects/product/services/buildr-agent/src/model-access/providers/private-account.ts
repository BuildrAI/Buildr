import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile, writeFile, lstat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectories } from '../../executors/native-process.ts';

export interface CredentialRecord { revision: string; accessToken: string; refreshToken?: string; accountId?: string; expiresAt?: number; }
/** This vault owns only explicit model-account logins under the supplied private root. */
export class PrivateAccount {
  private file: string;
  private root: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(root: string) { this.root = root; this.file = join(root, 'model-credential.json'); }
  async read(): Promise<CredentialRecord | undefined> {
    try {
      const info = await lstat(this.file); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error('model_credential_path_invalid');
      const data: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!data || typeof data !== 'object') throw new Error('model_credential_invalid');
      const row = data as Record<string, unknown>;
      if (typeof row.revision !== 'string' || typeof row.accessToken !== 'string' || !row.accessToken) throw new Error('model_credential_invalid');
      return { revision: row.revision, accessToken: row.accessToken, ...(typeof row.refreshToken === 'string' ? { refreshToken: row.refreshToken } : {}), ...(typeof row.accountId === 'string' ? { accountId: row.accountId } : {}), ...(typeof row.expiresAt === 'number' ? { expiresAt: row.expiresAt } : {}) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async save(value: Omit<CredentialRecord, 'revision'>, observed?: string): Promise<CredentialRecord> {
    let result!: CredentialRecord;
    const work = this.queue.then(async () => {
      await privateDirectories(this.root); const current = await this.read();
      if (current?.revision !== observed) throw new Error('model_credential_changed');
      result = { ...value, revision: randomUUID() };
      const temporary = join(this.root, `.credential-${randomUUID()}.tmp`);
      try { await writeFile(temporary, JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, this.file); }
      finally { await unlink(temporary).catch(() => {}); }
    });
    this.queue = work.catch(() => {}); await work; return result;
  }
}
export interface PkceAttempt { url: string; verifier: string; redirectUri: string; result: Promise<string>; close(): Promise<void>; }
/** The callback server receives only a one-use authorization code, never a provider token. */
export async function beginPkce(input: { port: number; fallbackPort?: number; callbackHost?: string; path?: string; authorization: (value: { challenge: string; state: string; redirectUri: string }) => string; signal: AbortSignal; timeoutMs?: number }): Promise<PkceAttempt> {
  input.signal.throwIfAborted();
  const verifier = randomBytes(32).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url'), state = randomBytes(32).toString('base64url');
  let resolve!: (code: string) => void, reject!: (error: Error) => void; let settled = false;
  const result = new Promise<string>((ok, fail) => { resolve = ok; reject = fail; }); result.catch(() => {});
  const finish = (code?: string, error?: Error) => { if (settled) return; settled = true; if (error) reject(error); else resolve(code!); };
  const callbackPath = input.path ?? '/callback';
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== callbackPath) { response.writeHead(404).end('Not found'); return; }
    if (url.searchParams.get('state') !== state || settled) { response.writeHead(400).end('Invalid authorization state'); return; }
    if (url.searchParams.has('error')) { response.writeHead(400).end('Authorization failed'); finish(undefined, new Error('model_login_denied')); return; }
    const code = url.searchParams.get('code');
    if (!code) { response.writeHead(400).end('Missing authorization code'); return; }
    response.writeHead(200).end('登录已收到，请返回 Buildr。'); finish(code);
  });
  async function listen(port: number): Promise<void> {
    await new Promise<void>((ok, fail) => { const error = (e: Error) => { server.off('listening', ready); fail(e); }; const ready = () => { server.off('error', error); ok(); }; server.once('error', error); server.once('listening', ready); server.listen(port, '127.0.0.1'); });
  }
  try { await listen(input.port); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error; await listen(input.fallbackPort ?? 0); }
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('model_callback_unavailable');
  const redirectUri = `http://${input.callbackHost ?? '127.0.0.1'}:${address.port}${callbackPath}`;
  const aborted = () => { finish(undefined, new Error('model_login_cancelled')); }; input.signal.addEventListener('abort', aborted, { once: true }); if (input.signal.aborted) aborted();
  const timer = setTimeout(() => finish(undefined, new Error('model_login_expired')), input.timeoutMs ?? 15 * 60 * 1000);
  let closed = false;
  const close = async () => { if (closed) return; closed = true; clearTimeout(timer); input.signal.removeEventListener('abort', aborted); finish(undefined, new Error('model_login_cancelled')); await closeServer(server); };
  try { return { url: input.authorization({ challenge, state, redirectUri }), verifier, redirectUri, result, close }; }
  catch (error) { await close(); throw error; }
}
async function closeServer(server: Server): Promise<void> { server.closeAllConnections(); await new Promise<void>(resolve => { server.close(() => resolve()); }); }
export function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function string(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
export function positive(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined; }
