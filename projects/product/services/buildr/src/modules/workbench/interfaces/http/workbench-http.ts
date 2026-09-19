import type { PreferencesApplication } from '../../application/preferences-application.ts';
import type { createWorkbenchApplication } from '../../application/workbench-application.ts';
import type { WorkbenchPreference } from '../../../../../build/generated/workbench-dto.ts';

export function createWorkbenchHttpContribution(application: PreferencesApplication & ReturnType<typeof createWorkbenchApplication>) {
  return Object.freeze({
    id: 'workbench.http',
    async handle({ request, suffix, searchParams, root, authorizeWrite, readJsonBody }: any) {
      if (!suffix.startsWith('/workbench')) return null;
      if (request.method === 'GET' && suffix === '/workbench') {
        if ([...searchParams.keys()].some((key) => !['project', 'date'].includes(key) || searchParams.getAll(key).length !== 1)) throw Object.assign(new Error('工作台仅接受 project 和 date 查询。'), { code: 'workbench_query_forbidden', status: 400 });
        return { status: 200, body: application.inspectWorkbench(root, Object.fromEntries(searchParams)) };
      }
      if (searchParams.size) throw Object.assign(new Error('偏好接口不接受查询参数。'), { code: 'workbench_query_forbidden', status: 400 });
      if (request.method === 'GET' && suffix === '/workbench/preferences') return { status: 200, body: application.inspectWorkbenchPreferences(root) };
      const preference = suffix.match(/^\/workbench\/preferences\/([^/]+)\/([^/]+)$/);
      if (preference && ['PUT', 'DELETE'].includes(request.method)) {
        authorizeWrite();
        let key: string;
        try { key = decodeURIComponent(preference[2]); } catch { throw Object.assign(new Error('偏好身份编码无效。'), { code: 'workbench_preference_invalid', status: 400 }); }
        return { status: 200, body: request.method === 'PUT' ? application.putWorkbenchPreference(root, preference[1] as WorkbenchPreference['kind'], key, await readJsonBody()) : application.removeWorkbenchPreference(root, preference[1], key) };
      }
      if (request.method === 'POST' && suffix === '/workbench/visits') { authorizeWrite(); return { status: 200, body: application.recordWorkbenchVisit(root, await readJsonBody()) }; }
      return null;
    },
  });
}
