import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { OwnedControlResource, bounded, closeOwnedProcess, nativeCommand, type NativeEnvironment } from '../native-process.ts';

export interface DshClient { ctx: any; remote: any; origin: string; close(): Promise<void>; }
/** Owns the complete native web Host; the authorization URL and cookie stay private. */
export async function launchDshHost(executable: string, env: NativeEnvironment, cwd: string, signal?: AbortSignal, patch?: string): Promise<{ control: OwnedControlResource; child: ChildProcessWithoutNullStreams; client: DshClient; close(): Promise<void> }> {
  signal?.throwIfAborted();
  const launch = nativeCommand(executable);
  const control=new OwnedControlResource(launch.command,[...launch.prefix,'web',...(patch?['--patch',patch]:[]),'--no-open','--port','0'],{cwd,env});
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
  let client: DshClient | undefined; let abortedClose: Promise<void> | undefined;
  const abort = () => { abortedClose ??= closeOwnedProcess(child, 1000); void client?.close(); };
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  try {
    const privateUrl = await bounded(ready, 45000, 'dsh_host_startup_timeout');
    client = await connectDshClient(privateUrl, signal);
    child.once('exit',()=>{void client?.close().catch(()=>{});});
    signal?.throwIfAborted();
    return { control, child, client, async close() { await client?.close(); await closeOwnedProcess(child); } };
  } catch (error) { settled = true; await client?.close(); await (abortedClose ?? closeOwnedProcess(child)); throw error; }
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
export async function connectDshClient(privateUrl: string, signal?: AbortSignal): Promise<DshClient> {
  let ctx: any;
  const { origin, transport } = await createDshTransport(privateUrl, signal, () => ctx?.connection.reconnect());
  const [{ Context }, { default: TypertRegistry }, { installConnection }, Gateway] = await Promise.all([
    import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-typert-registry'), import('@deepseek-ai/dsh-client-connection/client'), import('@deepseek-ai/dsh-api-gateway/client'),
  ]);
  signal?.throwIfAborted();
  ctx = new Context(); new TypertRegistry(ctx);
  const abort = () => { void ctx.fiber.dispose(); }; signal?.addEventListener('abort', abort, { once: true });
  installConnection(ctx, { interactions: 'answer', transport });
  Gateway.apply(ctx);
  const remotes = await Promise.all([
    import('@deepseek-ai/dsh-api-session-controller/remote'), import('@deepseek-ai/dsh-api-account-controller/remote'),
    import('@deepseek-ai/dsh-api-settings-controller/remote'), import('@deepseek-ai/dsh-api-workspace-controller/remote'),
    import('@deepseek-ai/dsh-api-job-controller/remote'),
    import('@deepseek-ai/dsh-user-questions/remote'), import('@deepseek-ai/dsh-commands/remote'), import('@deepseek-ai/dsh-permission-presets/remote'),
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
