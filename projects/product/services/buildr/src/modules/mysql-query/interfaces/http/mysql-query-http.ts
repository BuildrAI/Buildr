import type { MySqlQueryApplication } from '../../application/mysql-query-application.ts';
import { connectionFailure } from '../../../connections/domain/connection.ts';

type HttpContext = { request: { method?: string }; suffix: string; searchParams: URLSearchParams; root: string; authorizeWrite(): void; readJsonBody(maxBytes?: number): Promise<unknown> };
export function createMySqlQueryHttp(application: MySqlQueryApplication) {
  return Object.freeze({ id: 'mysql-query.http', async handle(context: HttpContext) {
    const { request, suffix, searchParams, root, authorizeWrite, readJsonBody } = context;
    if (!suffix.startsWith('/mysql-query/')) return null;
    const match = suffix.match(/^\/mysql-query\/connections\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/(databases|tables|columns|query|query-preferences)$/);
    if (!match) return null;
    const [, id, operation] = match;
    const allowed = request.method === 'GET' ? ['revision', ...(operation === 'tables' ? ['database'] : operation === 'columns' ? ['database', 'table'] : [])] : [];
    if ([...searchParams.keys()].some(key => !allowed.includes(key) || searchParams.getAll(key).length !== 1)) throw connectionFailure('mysql_query_input_invalid', '查询工具的请求参数无效。');
    const revision = searchParams.get('revision');
    if (request.method === 'GET' && operation === 'databases') return { status: 200, body: await application.databases(root, id, revision) };
    if (request.method === 'GET' && operation === 'tables') return { status: 200, body: await application.tables(root, id, revision, searchParams.get('database')) };
    if (request.method === 'GET' && operation === 'columns') return { status: 200, body: await application.columns(root, id, revision, searchParams.get('database'), searchParams.get('table')) };
    if (request.method === 'POST' && operation === 'query') { authorizeWrite(); return { status: 200, body: await application.query(root, id, await readJsonBody(128 * 1024)) }; }
    if (request.method === 'GET' && operation === 'query-preferences') return { status: 200, body: application.queryPreferences(root, id, revision) };
    if (request.method === 'PUT' && operation === 'query-preferences') { authorizeWrite(); return { status: 200, body: application.saveQueryPreferences(root, id, await readJsonBody(128 * 1024)) }; }
    return null;
  } });
}
