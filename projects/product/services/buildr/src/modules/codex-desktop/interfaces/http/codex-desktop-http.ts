import type { CodexDesktopApplication } from '../../application/codex-desktop-application.ts';
import { codexFailure, retiredCodexPlugin } from '../../domain/codex-desktop.ts';
import { CODEX_DESKTOP_HTTP_OPERATIONS, CODEX_DESKTOP_HTTP_REQUESTS, CODEX_DESKTOP_HTTP_SCHEMAS, CODEX_DESKTOP_HTTP_VALIDATORS } from './codex-desktop-http-contracts.ts';

type Context = { request: { method?: string }; root: string; suffix: string; searchParams: URLSearchParams; authorizeWrite(): void; readJsonBody(): Promise<unknown> };
export function createCodexDesktopHttpContribution(application: CodexDesktopApplication, workspaceId: (root: string) => string) {
  const validate = (id: string, value: unknown, response = false) => {
    if (!CODEX_DESKTOP_HTTP_VALIDATORS.validate(id, value).valid) throw codexFailure(response ? 'codex_response_invalid' : 'codex_request_invalid', response ? 'Codex 返回结果不符合契约。' : 'Codex 请求字段无效。', response ? 500 : 400);
    return value;
  };
  const result = (schemaId: string, body: unknown) => ({ status: 200, body: validate(schemaId, body, true) });
  const query = (schemaId: string, params: URLSearchParams) => {
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw codexFailure('codex_request_invalid', 'Codex 查询参数不能重复。');
    return validate(schemaId, Object.fromEntries(params));
  };
  return Object.freeze({
    id: 'codex-desktop.http', schemas: { ...CODEX_DESKTOP_HTTP_SCHEMAS, ...Object.fromEntries(Object.entries(CODEX_DESKTOP_HTTP_REQUESTS).map(([key, value]) => [key + 'Request', value])) }, operations: CODEX_DESKTOP_HTTP_OPERATIONS,
    handleTopLevel({ request, pathname, searchParams }: { request: { method?: string }; pathname: string; searchParams: URLSearchParams }) {
      if (request.method !== 'GET' || pathname !== '/api/v1/app/codex/connections') return null;
      query(CODEX_DESKTOP_HTTP_REQUESTS.empty.$id, searchParams);
      return result(CODEX_DESKTOP_HTTP_SCHEMAS.connections.$id, application.listConnections());
    },
    async handle(context: Context) {
      const { request, suffix, searchParams, root } = context;
      if (!suffix.startsWith('/codex/')) return null;
      const id = workspaceId(root);
      if (request.method === 'GET' && suffix === '/codex/sessions') {
        const input = query(CODEX_DESKTOP_HTTP_REQUESTS.sessions.$id, searchParams) as Parameters<CodexDesktopApplication['sessionRelations']>[1];
        return result(CODEX_DESKTOP_HTTP_SCHEMAS.sessions.$id, application.sessionRelations(id, input));
      }
      if (suffix === '/codex/bindings' || /^\/codex\/bindings\/[^/]+$/.test(suffix)) {
        if (request.method !== 'GET') context.authorizeWrite();
        throw retiredCodexPlugin();
      }
      if (request.method === 'POST' && suffix === '/codex/sessions/unlink') {
        context.authorizeWrite();
        query(CODEX_DESKTOP_HTTP_REQUESTS.empty.$id, searchParams);
        const input = validate(CODEX_DESKTOP_HTTP_REQUESTS.unlink.$id, await context.readJsonBody()) as Parameters<CodexDesktopApplication['unlinkSession']>[1];
        return result(CODEX_DESKTOP_HTTP_SCHEMAS.sessions.$id, application.unlinkSession(id, input));
      }
      return null;
    },
  });
}
