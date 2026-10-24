import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { bounded, closeOwnedProcess, nativeCommand, type NativeEnvironment } from '../native-process.ts';

export interface DshClient { ctx: any; remote: any; origin: string; close(): Promise<void>; }
/** Owns the complete native web Host; the authorization URL and cookie stay private. */
export async function launchDshHost(executable: string, env: NativeEnvironment, cwd: string, signal?: AbortSignal): Promise<{ child: ChildProcessWithoutNullStreams; client: DshClient; close(): Promise<void> }> {
  signal?.throwIfAborted();
  const launch = nativeCommand(executable);
  const child = spawn(launch.command, [...launch.prefix, 'web', '--no-open', '--port', '0'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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
    signal?.throwIfAborted();
    return { child, client, async close() { await client?.close(); await closeOwnedProcess(child); } };
  } catch (error) { settled = true; await client?.close(); await (abortedClose ?? closeOwnedProcess(child)); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}
export async function connectDshClient(privateUrl: string, signal?: AbortSignal): Promise<DshClient> {
  signal?.throwIfAborted();
  const url = new URL(privateUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port) throw new Error('dsh_host_origin_invalid');
  const handshake = new URL('/connect', url); handshake.search = url.search; handshake.searchParams.set('interactions', 'answer');
  const response = await fetch(handshake, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  if (response.status !== 302) throw new Error('dsh_handshake_failed');
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('dsh_handshake_failed');
  const [{ Context }, { default: TypertRegistry }, { installConnection }, Gateway, { default: WebSocket }] = await Promise.all([
    import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-typert-registry'), import('@deepseek-ai/dsh-client-connection/client'), import('@deepseek-ai/dsh-api-gateway/client'), import('ws'),
  ]);
  signal?.throwIfAborted();
  const ctx: any = new Context(); new TypertRegistry(ctx);
  const abort = () => { void ctx.fiber.dispose(); }; signal?.addEventListener('abort', abort, { once: true });
  const origin = url.origin;
  installConnection(ctx, { interactions: 'answer', transport: {
    streamBaseUrl: origin,
    fetch: (input: any, init: any) => {
      const target = new URL(String(input), origin);
      if (target.origin !== origin) throw new Error('dsh_transport_origin_invalid');
      const headers = new Headers(init?.headers); headers.set('Cookie', cookie);
      return fetch(target, { ...init, headers });
    },
    createWebSocket: (input: any) => {
      const target = new URL(String(input), origin.replace(/^http/, 'ws'));
      if (target.origin !== origin.replace(/^http/, 'ws')) throw new Error('dsh_transport_origin_invalid');
      return new WebSocket(target, { headers: { Cookie: cookie } }) as any;
    },
  } });
  Gateway.apply(ctx);
  const remotes = await Promise.all([
    import('@deepseek-ai/dsh-api-session-controller/remote'), import('@deepseek-ai/dsh-api-account-controller/remote'),
    import('@deepseek-ai/dsh-api-settings-controller/remote'), import('@deepseek-ai/dsh-api-workspace-controller/remote'),
    import('@deepseek-ai/dsh-user-questions/remote'), import('@deepseek-ai/dsh-commands/remote'), import('@deepseek-ai/dsh-permission-presets/remote'),
  ]);
  try {
    for (const remote of remotes) await ctx.remote.$mount(remote.default);
    const deadline = Date.now() + 15000;
    while (!signal?.aborted && ctx.connection.state.getSnapshot() !== 'connected' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    signal?.throwIfAborted();
    if (ctx.connection.state.getSnapshot() !== 'connected') throw new Error('dsh_client_timeout');
    return { ctx, remote: ctx.remote, origin, close: () => ctx.fiber.dispose() };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}
export function dshValue<T = any>(result: any): T { if (!result?.ok) throw new Error('dsh_native_request_failed'); return result.value; }
