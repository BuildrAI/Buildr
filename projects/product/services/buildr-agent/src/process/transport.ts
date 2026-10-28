import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { AgentServiceError, safeDiagnostic } from '../domain/agent-state.ts';

export const privateToken = () => randomBytes(32).toString('base64url');
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
  const code = typeof known.code === 'string' && /^(?:agent_|model_)[a-z0-9_]+$/.test(known.code) ? known.code : 'agent_process_operation_failed';
  json(res, typeof known.status === 'number' ? known.status : 500, { error: { code, message: safeDiagnostic(error) } });
}
export async function listen(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<{ server: Server; origin: string; close(): Promise<void> }> {
  const server = createServer((req, res) => { void handler(req, res).catch(error => failure(res, error)); });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
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
  const response = await fetch(localOrigin(origin) + route, {
    method: value === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...(operation === 'conversations.addAttachment' ? { 'x-buildr-operation': operation } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal,
  });
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > (operation === 'conversations.readAttachment' ? 46 : 16) * 1024 * 1024) throw new AgentServiceError('agent_process_response_too_large', '执行后台返回超过限制。', 502);
      chunks.push(chunk.value);
    }
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  const text = Buffer.concat(chunks).toString('utf8');
  let result: any;
  try { result = JSON.parse(text); } catch { throw new AgentServiceError('agent_process_response_invalid', '执行后台返回无效。', 502); }
  if (!response.ok) throw new AgentServiceError(result?.error?.code ?? 'agent_process_operation_failed', result?.error?.message ?? '执行后台操作未完成。', response.status);
  return result;
}
