import type { TaskWorkContextApplication } from '../../application/work-context-application.ts';

export function createWorkContextHttpContribution(application: TaskWorkContextApplication) {
  return Object.freeze({
    id: 'task-work-context.http',
    async handle({ request, suffix, searchParams, root, authorizeWrite, readJsonBody }: any) {
      const match = suffix.match(/^\/tasks\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/work-context(\/respond)?$/);
      if (!match && suffix !== '/tasks/work-contexts') return null;
      if (suffix === '/tasks/work-contexts' && request.method === 'GET' && searchParams.has('ids')) {
        if ([...searchParams.keys()].some((key) => key !== 'ids') || searchParams.getAll('ids').length > 1) throw Object.assign(new Error('批量工作摘要仅接受一个 ids 参数。'), { code: 'workbench_query_forbidden', status: 400 });
        return { status: 200, body: application.inspectTaskWorkContexts(root, searchParams.get('ids') ? searchParams.get('ids').split(',') : []) };
      }
      if (!match) return null;
      if (searchParams.size) throw Object.assign(new Error('工作摘要接口不接受查询参数。'), { code: 'workbench_query_forbidden', status: 400 });
      if (request.method === 'GET' && !match[2]) return { status: 200, body: application.inspectTaskWorkContext(root, match[1]) };
      if (request.method === 'PUT' && !match[2]) { authorizeWrite(); return { status: 200, body: application.recordTaskWorkContext(root, match[1], await readJsonBody()) }; }
      if (request.method === 'POST' && match[2]) { authorizeWrite(); return { status: 200, body: application.respondTaskWorkContext(root, match[1], await readJsonBody()) }; }
      return null;
    },
  });
}
