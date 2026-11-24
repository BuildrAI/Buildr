import type { ExecutionDiagnosticSink } from '../../contracts.ts';
import { diagnosticCode } from '../../storage/execution-log.ts';
import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dshSdkForVersion } from './program.ts';
import { OwnedControlResource, bounded, closeOwnedProcess, nativeCommand, type NativeEnvironment } from '../native-process.ts';

function isManagedDshExecutable(file: string): boolean {
  const normalized = file.split(path.sep).join('/');
  return normalized.includes('/programs/dsh/');
}

function managedDshRoot(file: string): string | undefined {
  const marker = `${path.sep}programs${path.sep}dsh${path.sep}`;
  const index = file.indexOf(marker);
  if (index < 0) return undefined;
  const restStart = index + marker.length;
  const nextSep = file.indexOf(path.sep, restStart);
  return nextSep < 0 ? undefined : file.slice(0, nextSep);
}

async function loadDshModule(specifier: string, executable?: string): Promise<any> {
  if (executable) {
    const actual = await realpath(executable).catch(() => path.resolve(executable));
    const managed = isManagedDshExecutable(actual);
    try {
      const resolved = await realpath(createRequire(actual).resolve(specifier));
      if (managed) {
        const root = managedDshRoot(actual);
        if (!root) throw new Error('dsh_client_sdk_missing');
        const resolvedRoot = await realpath(root);
        const relative = path.relative(resolvedRoot, resolved);
        if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
          throw new Error('dsh_client_sdk_missing');
        }
      }
      return await import(pathToFileURL(resolved).href);
    } catch (error) {
      if (managed) throw error instanceof Error && error.message === 'dsh_client_sdk_missing' ? error : new Error('dsh_client_sdk_missing');
    }
  }
  return await import(specifier).catch(() => { throw new Error('dsh_client_sdk_missing'); });
}

async function dshAccountRemote(executable?: string): Promise<string> {
  const bundled = dshSdkForVersion('0.2.1-rc.2').accountPackage;
  if (!executable) return `${bundled}/remote`;
  const actual = await realpath(executable).catch(() => path.resolve(executable));
  let version: string;
  try {
    const metadata = await realpath(createRequire(actual).resolve('@deepseek-ai/dsh/package.json'));
    const root = managedDshRoot(actual);
    // The metadata must describe the program being launched, not another copy on the resolver path.
    if (!actual.startsWith(path.dirname(metadata) + path.sep)
      || root && !metadata.startsWith(root + path.sep)) throw new Error('dsh_client_sdk_missing');
    const pkg = JSON.parse(await readFile(metadata, 'utf8'));
    if (pkg.name !== '@deepseek-ai/dsh' || typeof pkg.version !== 'string') throw new Error('dsh_client_sdk_missing');
    version = pkg.version;
  } catch {
    if (isManagedDshExecutable(actual)) throw new Error('dsh_client_sdk_missing');
    return `${bundled}/remote`;
  }
  return `${dshSdkForVersion(version).accountPackage}/remote`;
}

export interface DshClient { ctx: any; remote: any; origin: string; close(): Promise<void>; }
/** Owns the complete native web Host; the authorization URL and cookie stay private. */
export async function launchDshHost(executable: string, env: NativeEnvironment, cwd: string, signal?: AbortSignal, patch?: string,diagnostics?:ExecutionDiagnosticSink): Promise<{ control: OwnedControlResource; child: ChildProcessWithoutNullStreams; client: DshClient; close(): Promise<void> }> {
  signal?.throwIfAborted();
  const launch = nativeCommand(executable);
  const control=new OwnedControlResource(launch.command,[...launch.prefix,'web',...(patch?['--patch',patch]:[]),'--no-open','--port','0'],{cwd,env,diagnostics});
  const child=control.child;
  let output = ''; let settled = false;
  const ready = new Promise<string>((resolve, reject) => {
    const read = (chunk: Buffer) => {
      if (settled) return;
      output = (output + chunk.toString()).slice(-65536).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const found = output.match(/https?:\/\/[^\s\u001b]+\?token=[^\s\u001b]+/g)?.at(-1);
      if (found) { settled = true; output = ''; resolve(found); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', () => reject(new Error('dsh_host_unavailable')));
    child.once('exit', () => reject(new Error('dsh_host_closed')));
  });
  let client: DshClient | undefined;
  let closingHost: Promise<void> | undefined;
  // The Web Host starts disposal on SIGTERM and has its own five-second deadline.
  const closeHost = () => closingHost ??= closeOwnedProcess(child, 1000, { stdinGraceMs: 0, termGraceMs: 6000 });
  const abort = () => {
    void closeHost().catch(() => {});
    void client?.close().catch(() => {});
  };
  const close = async () => {
    try {
      if (client) await bounded(client.close(), 1000, 'dsh_client_close_timeout');
    } catch (error) {
      diagnostics?.({ event: 'native-client-close-deferred', code: diagnosticCode(error) });
    } finally {
      // A stuck SDK socket must never keep the owned DSH web process alive.
      await closeHost();
    }
  };
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  try {
    const privateUrl = await bounded(ready, 45000, 'dsh_host_startup_timeout');
    client = await connectDshClient(privateUrl, signal, executable);
    child.once('exit',()=>{void client?.close().catch(()=>{});});
    signal?.throwIfAborted();
    return { control, child, client, close };
  } catch (error) {
    settled = true;
    await close();
    throw error;
  }
  finally { signal?.removeEventListener('abort', abort); }
}
/** API operators are socket-owned: a closed carrier invalidates its cookie. */
export async function createDshTransport(privateUrl: string, signal?: AbortSignal, credentialsChanged: () => void = () => {}) {
  signal?.throwIfAborted();
  const url = new URL(privateUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port) throw new Error('dsh_host_origin_invalid');
  const handshake = new URL('/connect', url); handshake.search = url.search; handshake.searchParams.set('interactions', 'answer');
  const { default: WebSocket } = await import('ws');
  const origin = url.origin; let credential = { cookie: '', version: 0 }, socketVersion = 0, notifiedVersion = 0;
  let refreshing: Promise<typeof credential> | undefined;
  const renew = (observedVersion: number, openingSignal?: AbortSignal): Promise<typeof credential> => {
    if (credential.version !== observedVersion) return Promise.resolve(credential);
    if (refreshing) return refreshing;
    const work = (async () => {
      const response = await fetch(handshake, { redirect: 'manual', signal: openingSignal ? AbortSignal.any([openingSignal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      try {
        if (response.status !== 302) throw new Error('dsh_handshake_failed');
        const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
        if (!cookie) throw new Error('dsh_handshake_failed');
        credential = { cookie, version: credential.version + 1 }; return credential;
      } finally { await response.body?.cancel(); }
    })();
    refreshing = work;
    void work.finally(() => { if (refreshing === work) refreshing = undefined; }).catch(() => {});
    return work;
  };
  await renew(0, signal);
  return { origin, transport: {
    streamBaseUrl: origin,
    fetch: async (input: any, init: any) => {
      const target = new URL(String(input), origin);
      if (target.origin !== origin) throw new Error('dsh_transport_origin_invalid');
      const observed = credential;
      const request = (cookie: string) => { const headers = new Headers(init?.headers); headers.set('Cookie', cookie); return fetch(target, { ...init, headers, redirect: 'error' }); };
      const response = await request(observed.cookie);
      if (response.status !== 401) return response;
      await response.body?.cancel();
      // Authentication rejected this request before dispatch. Retry only that
      // exact request once, with one credential exchange shared by all callers.
      const next = await renew(observed.version);
      if (socketVersion && socketVersion < next.version && notifiedVersion < next.version) { notifiedVersion = next.version; credentialsChanged(); }
      init?.signal?.throwIfAborted();
      return request(next.cookie);
    },
    createWebSocket: (input: any) => {
      const target = new URL(String(input), origin.replace(/^http/, 'ws'));
      if (target.origin !== origin.replace(/^http/, 'ws')) throw new Error('dsh_transport_origin_invalid');
      return new WebSocket(target, { finishRequest: request => {
        const opening = socketVersion === credential.version ? renew(credential.version) : Promise.resolve(credential);
        void opening.then(next => {
          if (request.destroyed) return;
          socketVersion = next.version;
          request.setHeader('Cookie', next.cookie); request.end();
        }).catch(() => { request.destroy(new Error('dsh_handshake_failed')); });
      } }) as any;
    },
  } };
}
export async function connectDshClient(privateUrl: string, signal?: AbortSignal, executable?: string): Promise<DshClient> {
  let ctx: any;
  const accountRemote = await dshAccountRemote(executable);
  const { origin, transport } = await createDshTransport(privateUrl, signal, () => ctx?.connection.reconnect());
  const [{ Context }, { default: TypertRegistry }, { installConnection }, Gateway] = await Promise.all([
    loadDshModule('@deepseek-ai/cordis', executable),
    loadDshModule('@deepseek-ai/dsh-typert-registry', executable),
    loadDshModule('@deepseek-ai/dsh-client-connection/client', executable),
    loadDshModule('@deepseek-ai/dsh-api-gateway/client', executable),
  ]);
  signal?.throwIfAborted();
  ctx = new Context(); new TypertRegistry(ctx);
  const abort = () => { void ctx.fiber.dispose(); }; signal?.addEventListener('abort', abort, { once: true });
  installConnection(ctx, { interactions: 'answer', transport });
  Gateway.apply(ctx);
  const remotes = await Promise.all([
    loadDshModule('@deepseek-ai/dsh-api-session-controller/remote', executable),
    loadDshModule(accountRemote, executable),
    loadDshModule('@deepseek-ai/dsh-api-settings-controller/remote', executable),
    loadDshModule('@deepseek-ai/dsh-api-workspace-controller/remote', executable),
    loadDshModule('@deepseek-ai/dsh-api-job-controller/remote', executable),
    loadDshModule('@deepseek-ai/dsh-user-questions/remote', executable),
    loadDshModule('@deepseek-ai/dsh-commands/remote', executable),
    loadDshModule('@deepseek-ai/dsh-permission-presets/remote', executable),
  ]);
  try {
    for (const remote of remotes) await ctx.remote.$mount(remote.default);
    const deadline = Date.now() + 15000;
    while (!signal?.aborted && ctx.connection.state.getSnapshot() !== 'connected' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    signal?.throwIfAborted();
    if (ctx.connection.state.getSnapshot() !== 'connected') throw new Error('dsh_client_timeout');
    let closing:Promise<void>|undefined;
    return { ctx, remote: ctx.remote, origin, close: () => closing??=(Promise.resolve(ctx.fiber.dispose())) };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}
export function dshValue<T = any>(result: any): T { if (!result?.ok) throw new Error('dsh_native_request_failed'); return result.value; }
