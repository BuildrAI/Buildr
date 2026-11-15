import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

interface AccountOwner {
  resolveToken(url: string): Promise<string | undefined>;
  rejectToken(token: string): Promise<void>;
}
export const inject = ['deepseekAccount'];
/** Native Host plugin: credentials never cross this authenticated loopback bridge. */
export async function startDeepSeekOwnerServer(owner: AccountOwner, key: string, fetchFn: typeof fetch = fetch): Promise<Server> {
  if (!key) throw new Error('dsh_owner_key_missing');
  const server = createServer(async (request, response) => {
    const expected = Buffer.from(`Bearer ${key}`), actual = Buffer.from(request.headers.authorization ?? '');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) { response.writeHead(401).end(); return; }
    const path = request.url ?? '';
    const allowed = request.method === 'GET' && path === '/models' || request.method === 'POST' && path === '/anthropic/v1/messages';
    if (!allowed) { response.writeHead(404).end(); return; }
    const abort = new AbortController();
    response.on('close', () => { if (!response.writableEnded) abort.abort(); });
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 24 * 1024 * 1024) { response.writeHead(413).end(); return; } chunks.push(Buffer.from(chunk)); }
      const url = `https://api.deepseek.com${path}`;
      const token = await owner.resolveToken(url);
      if (!token) { response.writeHead(401).end(); return; }
      const headers = new Headers({ 'x-dsh-auth-token': token, 'user-agent': '@deepseek-ai/dsh/0.2.1-rc.2' });
      for (const name of ['content-type', 'accept', 'anthropic-version', 'anthropic-beta']) {
        const value = request.headers[name]; if (typeof value === 'string') headers.set(name, value);
      }
      const upstream = await fetchFn(url, { method: request.method, headers, ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}), redirect: 'manual', signal: abort.signal });
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); response.writeHead(502).end(); return; }
      if (upstream.status === 401) await owner.rejectToken(token);
      response.writeHead(upstream.status, Object.fromEntries(['content-type', 'cache-control', 'retry-after', 'request-id'].flatMap(name => { const value = upstream.headers.get(name); return value ? [[name, value]] : []; })));
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as any), response); else response.end();
    } catch {
      if (response.headersSent) response.destroy(); else response.writeHead(502).end();
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server;
}
export async function apply(ctx: any, config: { addressFile: string }): Promise<void> {
  const server = await startDeepSeekOwnerServer(ctx.deepseekAccount, process.env.BUILDR_DSH_OWNER_KEY ?? '');
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('dsh_owner_address_invalid'); }
  try { await writeFile(config.addressFile, JSON.stringify({ port: address.port }), { mode: 0o600, flag: 'wx' }); }
  catch (error) { server.close(); throw error; }
  ctx.on('dispose', () => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
}
