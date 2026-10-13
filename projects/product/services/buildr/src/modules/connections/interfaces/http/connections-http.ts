import type { ConnectionsApplication } from '../../application/connections-application.ts';
import { connectionFailure } from '../../domain/connection.ts';

type HttpContext = { request: { method?: string }; suffix: string; searchParams: URLSearchParams; root: string; authorizeWrite(): void; readJsonBody(maxBytes?: number): Promise<unknown> };
export function createConnectionsHttpContribution(application: ConnectionsApplication) {
  return Object.freeze({ id: 'connections.http', async handle(context: HttpContext) {
    const { request, suffix, searchParams, root, authorizeWrite, readJsonBody } = context;
    if (suffix !== '/connections' && !suffix.startsWith('/connections/')) return null;
    const match = suffix.match(/^\/connections\/(connection-[a-f0-9-]{36})(?:\/(databases|tables|columns|query))?$/);
    const operation = match?.[2];
    const allowed = operation === 'tables' ? ['database'] : operation === 'columns' ? ['database', 'table'] : [];
    if ([...searchParams.keys()].some(key => !allowed.includes(key) || searchParams.getAll(key).length !== 1)) throw connectionFailure('connection_query_invalid', '连接接口的查询参数无效。');
    if (request.method === 'GET' && suffix === '/connections') return { status: 200, body: application.list(root) };
    if (request.method === 'POST' && suffix === '/connections') { authorizeWrite(); return { status: 201, body: application.create(root, await readJsonBody(64 * 1024)) }; }
    if (request.method === 'POST' && suffix === '/connections/test') { authorizeWrite(); return { status: 200, body: await application.test(root, await readJsonBody(64 * 1024)) }; }
    if (!match) return null;
    const id = match[1];
    if (!operation && request.method === 'PATCH') { authorizeWrite(); return { status: 200, body: application.update(root, id, await readJsonBody(64 * 1024)) }; }
    if (!operation && request.method === 'DELETE') { authorizeWrite(); return { status: 200, body: application.remove(root, id, await readJsonBody(2048)) }; }
    if (request.method === 'GET' && operation === 'databases') return { status: 200, body: await application.databases(root, id) };
    if (request.method === 'GET' && operation === 'tables') return { status: 200, body: await application.tables(root, id, searchParams.get('database')) };
    if (request.method === 'GET' && operation === 'columns') return { status: 200, body: await application.columns(root, id, searchParams.get('database'), searchParams.get('table')) };
    if (request.method === 'POST' && operation === 'query') { authorizeWrite(); return { status: 200, body: await application.query(root, id, await readJsonBody(128 * 1024)) }; }
    return null;
  } });
}
