import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export const inject = ['sessionPersistence'];
/** Private native-to-native storage transfer. No session payload enters the public protocol. */
export async function apply(ctx: any, config: { addressFile: string }): Promise<void> {
  const key = process.env.BUILDR_DSH_FORK_KEY;
  if (!key) throw new Error('dsh_fork_key_missing');
  const server = createServer(async (request, response) => {
    const actual = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + key);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.writeHead(401).end(); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { response.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (request.method !== 'POST' || !/^session-[a-f0-9-]{36}$/.test(input.sessionId)) { response.writeHead(400).end(); return; }
      if (request.url === '/export') {
        const handle = await ctx.sessionPersistence.open(input.sessionId, 'read');
        try {
          const { events } = await handle.read();
          const body = JSON.stringify({ header: handle.header, inheritedEventCount: handle.inheritedEventCount, events });
          if (Buffer.byteLength(body) > 64 * 1024 * 1024) { response.writeHead(413).end(); return; }
          response.setHeader('content-type', 'application/json'); response.end(body);
        } finally { await handle[Symbol.asyncDispose](); }
      } else if (request.url === '/import') {
        const { header, inheritedEventCount, events } = input.snapshot ?? {};
        if (header?.id !== input.sessionId || !Array.isArray(events) || !Number.isSafeInteger(inheritedEventCount) || inheritedEventCount < 0) { response.writeHead(400).end(); return; }
        const handle = await ctx.sessionPersistence.create(header, { inheritedEventCount });
        try { await handle.append(events); await handle.flush(); }
        finally { await handle[Symbol.asyncDispose](); }
        response.setHeader('content-type', 'application/json'); response.end('{}');
      } else response.writeHead(404).end();
    } catch { response.writeHead(409).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('dsh_fork_address_invalid'); }
  try { await writeFile(config.addressFile, JSON.stringify({ port: address.port }), { mode: 0o600, flag: 'wx' }); }
  catch (error) { server.close(); throw error; }
  ctx.on('dispose', () => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
}
