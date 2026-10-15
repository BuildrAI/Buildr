import type { NativeSessionLinksApplication } from '../../application/native-session-links-application.ts';
import { nativeSessionFailure } from '../../domain/native-session-links.ts';
import { NATIVE_SESSION_LINKS_HTTP_OPERATIONS, NATIVE_SESSION_LINKS_HTTP_REQUESTS, NATIVE_SESSION_LINKS_HTTP_SCHEMAS, NATIVE_SESSION_LINKS_HTTP_VALIDATORS } from './native-session-links-http-contracts.ts';

type Context = { request: { method?: string }; root: string; suffix: string; searchParams: URLSearchParams; authorizeWrite(): void; readJsonBody(): Promise<unknown> };
export function createNativeSessionLinksHttpContribution(application: NativeSessionLinksApplication, workspaceId: (root: string) => string) {
  const validate = (id: string, input: unknown, response = false) => {
    if (!NATIVE_SESSION_LINKS_HTTP_VALIDATORS.validate(id, input).valid) throw nativeSessionFailure(response ? 'native_session_response_invalid' : 'native_session_request_invalid', response ? '会话（Session）关联返回结果不符合契约。' : '会话（Session）关联请求字段无效。', response ? 500 : 400);
    return input;
  };
  const query = (id: string, search: URLSearchParams) => {
    if ([...search.keys()].some(key => search.getAll(key).length !== 1)) throw nativeSessionFailure('native_session_request_invalid', '会话（Session）关联查询参数不能重复。');
    return validate(id, Object.fromEntries(search));
  };
  const result = (id: string, body: unknown) => ({ status: 200, body: validate(id, body, true) });
  return Object.freeze({
    id: 'native-session-links.http', schemas: { ...NATIVE_SESSION_LINKS_HTTP_SCHEMAS, ...Object.fromEntries(Object.entries(NATIVE_SESSION_LINKS_HTTP_REQUESTS).map(([key, value]) => [key + 'Request', value])) }, operations: NATIVE_SESSION_LINKS_HTTP_OPERATIONS,
    async handle(context: Context) {
      const { request, suffix, searchParams } = context;
      if (!['/agent-sessions', '/agent-sessions/unlink', '/agent-sessions/open'].includes(suffix)) return null;
      if (request.method === 'GET' && suffix === '/agent-sessions') {
        const input = query(NATIVE_SESSION_LINKS_HTTP_REQUESTS.sessions.$id, searchParams) as Parameters<NativeSessionLinksApplication['sessionRelations']>[1];
        return result(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id, application.sessionRelations(workspaceId(context.root), input));
      }
      if (request.method === 'POST' && suffix !== '/agent-sessions') {
        context.authorizeWrite();
        query(NATIVE_SESSION_LINKS_HTTP_REQUESTS.empty.$id, searchParams);
        const input = validate(NATIVE_SESSION_LINKS_HTTP_REQUESTS.relation.$id, await context.readJsonBody()) as Parameters<NativeSessionLinksApplication['unlinkSession']>[1];
        const id = workspaceId(context.root);
        return suffix.endsWith('/unlink') ? result(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id, application.unlinkSession(id, input)) : result(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.open.$id, await application.openSession(id, input));
      }
      return null;
    },
  });
}
