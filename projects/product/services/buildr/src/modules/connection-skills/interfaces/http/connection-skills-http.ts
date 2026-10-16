import type { ConnectionSkillsApplication } from '../../application/connection-skills-application.ts';
import { failure } from '../../domain/instance.ts';
type HttpContext = { request: { method?: string }; suffix: string; searchParams: URLSearchParams; root: string; authorizeWrite(): void; readJsonBody(maxBytes?: number): Promise<unknown> };
export function createConnectionSkillsHttp(application: ConnectionSkillsApplication) {
  return Object.freeze({ id: 'connection-skills.http', async handle(context: HttpContext) {
    const { request, suffix, root, searchParams } = context;
    if (!suffix.startsWith('/connection-skills/')) return null;
    if ([...searchParams.keys()].length) throw failure('connection_skill_query_invalid', '不支持的查询参数。', 400);
    const subpath = suffix.slice('/connection-skills'.length);
    if (request.method === 'GET' && subpath === '/directory') return { status: 200, body: application.directory(root) };
    if (request.method === 'GET' && subpath === '/definitions') return { status: 200, body: application.definitions(root) };
    if (request.method === 'GET' && subpath === '/instances') return { status: 200, body: application.list(root) };
    const match = subpath.match(/^\/instances\/([a-zA-Z0-9_-]+)(?:\/(auth(?:\/(?:reveal|migrate|relocate))?|check|help))?$/);
    if (request.method === 'GET' && match && !match[2]) return { status: 200, body: application.get(root, match[1]!) };
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method || '')) return null;
    context.authorizeWrite();
    const input = await context.readJsonBody(256 * 1024);
    if (request.method === 'POST' && subpath === '/instances') return { status: 201, body: application.save(root, null, input) };
    if (request.method === 'POST' && ['/test', '/discover'].includes(subpath)) return { status: 200, body: await application.hook(root, input, subpath === '/test' ? 'test' : 'discover') };
    if (match) {
      const id = match[1]!;
      if (request.method === 'PATCH' && !match[2]) return { status: 200, body: application.save(root, id, input) };
      if (request.method === 'DELETE' && !match[2]) return { status: 200, body: application.remove(root, id, input) };
      if (request.method === 'PUT' && match[2] === 'auth') return { status: 200, body: application.saveAuth(root, id, input) };
      if (request.method === 'POST' && match[2] === 'auth/reveal') return { status: 200, headers: { 'cache-control': 'no-store' }, body: application.revealPersonal(root, id, input) };
      if (request.method === 'POST' && match[2] === 'auth/migrate') return { status: 200, body: application.migrateAuth(root, id, input) };
      if (request.method === 'POST' && match[2] === 'auth/relocate') return { status: 200, body: application.relocateAuth(root, id, input) };
      if (request.method === 'POST' && match[2] === 'check') return { status: 200, body: application.check(root, id) };
      if (request.method === 'POST' && match[2] === 'help') return { status: 200, body: await application.help(root, id) };
    }
    return null;
  } });
}
