import { request as httpRequest, createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { AgentServiceError, safeDiagnostic } from '../domain/agent-state.ts';

export const privateToken = () => randomBytes(32).toString('base64url');
/** Keep a quiet internal SSE hop alive without inventing business events or cursor changes. */
export function keepEventStreamAlive(res: ServerResponse): () => void {
  const close = () => { clearInterval(timer); res.off('close', close); };
  const timer = setInterval(() => {
    if (res.destroyed || res.writableEnded || res.writableLength > 8 * 1024 * 1024) { close(); res.destroy(); return; }
    res.write(': heartbeat\n\n');
  }, 15_000);
  timer.unref();
  res.once('close', close);
  return close;
}
export function authorize(req: IncomingMessage, token: string): void {
  const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AgentServiceError('agent_process_unauthorized', '执行后台认证失败。', 401);
}
export function localOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new AgentServiceError('agent_process_address_invalid', '执行后台地址无效。');
  return url.origin;
}
export async function body(req: IncomingMessage, limit = 13 * 1024 * 1024): Promise<any> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
    if (size > limit) throw new AgentServiceError('agent_process_input_too_large', '本机请求超过限制。', 413);
    chunks.push(bytes);
  }
  try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new AgentServiceError('agent_process_input_invalid', '本机请求格式无效。'); }
}
export function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value ?? null));
}
export function failure(res: ServerResponse, error: unknown): void {
  if (res.headersSent) { res.destroy(); return; }
  const known = error as { code?: string; status?: number };
  const internalCode = typeof known.code === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(known.code) ? known.code : undefined;
  const code = typeof known.code === 'string' && /^(?:agent_|model_)[a-z0-9_]+$/.test(known.code) ? known.code : 'agent_process_operation_failed';
  json(res, typeof known.status === 'number' ? known.status : 500, { error: { code, message: code==='agent_process_operation_failed' ? '执行后台内部检查未完成'+(internalCode?'（'+internalCode+'）':'')+'，原工作与记录已保留。' : safeDiagnostic(error), ...(internalCode?{internalCode}:{}) } });
}
export async function listen(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<{ server: Server; origin: string; close(): Promise<void> }> {
  const server = createServer((req, res) => { void handler(req, res).catch(error => failure(res, error)); });
  server.requestTimeout = 10 * 60_000; server.headersTimeout = 15_000;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('agent_process_address_invalid');
  let closing: Promise<void> | undefined;
  return { server, origin: `http://127.0.0.1:${address.port}`, close() {
    return closing ??= new Promise<void>(resolve => {
      // Flush accepted control responses before reclaiming long-lived streams.
      // Immediate destruction can leave an accepted update with an unknown result.
      const deadline = setTimeout(() => server.closeAllConnections(), 1_000);
      deadline.unref();
      server.close(() => { clearTimeout(deadline); resolve(); });
      server.closeIdleConnections();
    });
  } };
}
export async function request(origin: string, token: string, route: string, value?: unknown, signal?: AbortSignal): Promise<any> {
  const operation = route === '/operations' ? (value as { operation?: string } | undefined)?.operation : undefined;
  const payload = value === undefined ? undefined : JSON.stringify(value);
  // A private JSON control must never reuse a socket closed while synchronous
  // runtime preparation prevented this client from processing its close event.
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const call = httpRequest(localOrigin(origin) + route, {
      agent: false, method: value === undefined ? 'GET' : 'POST', signal,
      headers: { Authorization: 'Bearer ' + token, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...(operation === 'conversations.addAttachment' ? { 'x-buildr-operation': operation } : {}) },
    }, resolve);
    call.once('error', reject);
    call.end(payload);
  });
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const value of response) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.byteLength;
      if (size > (operation === 'conversations.readAttachment' ? 46 : 16) * 1024 * 1024) throw new AgentServiceError('agent_process_response_too_large', '执行后台返回超过限制。', 502);
      chunks.push(chunk);
    }
  } finally { response.destroy(); }
  const text = Buffer.concat(chunks).toString('utf8');
  let result: any;
  try { result = JSON.parse(text); } catch { throw new AgentServiceError('agent_process_response_invalid', '执行后台返回无效。', 502); }
  if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) { const error=new AgentServiceError(result?.error?.code ?? 'agent_process_operation_failed', result?.error?.message ?? '执行后台操作未完成。', response.statusCode ?? 500); const internal=result?.error?.internalCode; if(typeof internal==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(internal))Object.assign(error,{internalCode:internal}); throw error; }
  return result;
}
