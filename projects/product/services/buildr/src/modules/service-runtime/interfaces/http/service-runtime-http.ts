import type { ServiceTaskRuntimeApplication, TaskRunSelection } from '../../application/service-task-runtime-application.ts';
import { ServiceRuntimeError } from '../../domain/errors.ts';
import { RuntimeDefinitionError } from '../../domain/runtime-definition.ts';
import type { ServiceRuntimeApplication, StartRunInput } from '../../application/service-runtime-application.ts';
import type { ServiceRuntimeView } from '../../application/service-runtime-view.ts';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STATUS_BY_CODE: Record<string, number> = {
  runtime_definition_invalid: 400,
  service_runtime_input_invalid: 400,
  service_runtime_task_unknown: 404,
  service_runtime_service_unknown: 404,
  service_runtime_run_unknown: 404,
  service_runtime_worktree_unknown: 404,
};
function failure(code: string, message: string, status = 400): never { throw Object.assign(new Error(message), { code, status }); }
function identifier(value: string | undefined, label: string): string {
  let decoded = '';
  try { decoded = decodeURIComponent(value ?? ''); }
  catch { failure('service_runtime_input_invalid', `${label} 编码无效。`); }
  if (!IDENTIFIER.test(decoded)) failure('service_runtime_input_invalid', `${label} 无效。`);
  return decoded;
}
function assertParams(params: URLSearchParams, allowed: string[]) {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) failure('service_runtime_query_forbidden', `服务运行接口不接受查询参数：${key}。`);
}
export function parseStartRunInput(code: string, body: Record<string, unknown>): StartRunInput {
  if (typeof body.worktreeId !== 'string' || !body.worktreeId) failure('service_runtime_input_invalid', '必须选择要启动的代码目录。');
  if (body.origin !== undefined && body.origin !== 'human' && body.origin !== 'agent') failure('service_runtime_input_invalid', '启动入口无效。');
  if (body.connection !== undefined && body.connection !== 'local' && body.connection !== 'remote') failure('service_runtime_input_invalid', '前端连接必须单选 local 或 remote。');
  if (body.taskId !== undefined && (typeof body.taskId !== 'string' || !IDENTIFIER.test(body.taskId))) failure('service_runtime_input_invalid', '任务编号无效。');
  if (body.expectedBackendRunId !== undefined && (typeof body.expectedBackendRunId !== 'string' || !IDENTIFIER.test(body.expectedBackendRunId))) failure('service_runtime_input_invalid', '已观察的本地后端编号无效。');
  if (body.expectedRoutingDigest !== undefined && (typeof body.expectedRoutingDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(body.expectedRoutingDigest))) failure('service_runtime_input_invalid', '已观察的泳道上下文摘要无效。');
  if (body.backendTargets !== undefined) {
    if (!Array.isArray(body.backendTargets)) failure('service_runtime_input_invalid', '后端目标必须是数组。');
    const seen = new Set<string>();
    for (const item of body.backendTargets) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) failure('service_runtime_input_invalid', '后端目标无效。');
      const target = item as Record<string, unknown>;
      if (Object.keys(target).some(key => !['serviceCode', 'target', 'runId', 'expectedRunId'].includes(key))) failure('service_runtime_input_invalid', '后端目标包含未知字段。');
      if (target.expectedRunId !== undefined && (target.target !== 'auto' || target.expectedRunId !== null && (typeof target.expectedRunId !== 'string' || !IDENTIFIER.test(target.expectedRunId)))) failure('service_runtime_input_invalid', '自动发现目标观察无效。');
      if (typeof target.serviceCode !== 'string' || !IDENTIFIER.test(target.serviceCode)) failure('service_runtime_input_invalid', '后端目标的服务编码无效。');
      if (seen.has(target.serviceCode)) failure('service_runtime_input_invalid', `后端目标重复：${target.serviceCode}。`);
      seen.add(target.serviceCode);
      if (target.target !== 'auto' && target.target !== 'remote' && target.target !== 'run') failure('service_runtime_input_invalid', `后端 ${target.serviceCode} 的目标方式必须为 auto、remote 或 run。`);
      if (target.target === 'run' && (typeof target.runId !== 'string' || !IDENTIFIER.test(target.runId))) failure('service_runtime_input_invalid', `后端 ${target.serviceCode} 的所选实例编号无效。`);
      if (target.target !== 'run' && target.runId !== undefined) failure('service_runtime_input_invalid', `后端 ${target.serviceCode} 未选择实例时不能携带实例编号。`);
    }
  }
  const expected = body.expectedWorktree;
  if (expected !== undefined) {
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) failure('service_runtime_input_invalid', '代码来源观察无效。');
    const snapshot = expected as Record<string, unknown>;
    if (Object.keys(snapshot).some(key => !['path', 'branch', 'head', 'dirty'].includes(key)) || typeof snapshot.path !== 'string' || !snapshot.path || !(snapshot.branch === null || typeof snapshot.branch === 'string') || !(snapshot.head === null || typeof snapshot.head === 'string') || !(snapshot.dirty === null || typeof snapshot.dirty === 'boolean')) failure('service_runtime_input_invalid', '代码来源观察必须包含目录、分支、提交和未提交状态。');
  }
  return { ...body, serviceCode: code, origin: body.origin ?? 'human' } as StartRunInput;
}
export function createServiceRuntimeHttp(deps: { view: ServiceRuntimeView; runtime: ServiceRuntimeApplication; taskRuntime?: ServiceTaskRuntimeApplication }) {
  return Object.freeze({
    id: 'service-runtime.http',
    async handle({ request, suffix, searchParams, root, authorizeWrite, readBody }: any) {
      if (!suffix.startsWith('/service-runtime')) return null;
      try {
        const task = suffix.match(/^\/service-runtime\/tasks\/([^/]+)$/);
        if (task && request.method === 'GET' && deps.taskRuntime) {
          assertParams(searchParams, []);
          return { status: 200, body: await deps.taskRuntime.detail(root, identifier(task[1], '任务编号')) };
        }
        const taskStart = suffix.match(/^\/service-runtime\/tasks\/([^/]+)\/runs$/);
        if (taskStart && request.method === 'POST' && deps.taskRuntime) {
          assertParams(searchParams, []); authorizeWrite();
          const taskId = identifier(taskStart[1], '任务编号');
          const body = await readBody(new Set(['selected', 'connection', 'origin']), '启动任务本地服务');
          if (!Array.isArray(body.selected) || !body.selected.length) failure('service_runtime_input_invalid', '至少选择一个服务。');
          if (body.connection !== undefined && body.connection !== 'local' && body.connection !== 'remote') failure('service_runtime_input_invalid', '前端连接必须单选 local 或 remote。');
          if (body.origin !== undefined && body.origin !== 'human' && body.origin !== 'agent') failure('service_runtime_input_invalid', '启动入口无效。');
          const selected: TaskRunSelection[] = body.selected.map((item: unknown) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) failure('service_runtime_input_invalid', '所选服务无效。');
            const value = item as Record<string, unknown>;
            if (Object.keys(value).some(key => !['serviceCode', 'worktreeId', 'expectedWorktree', 'expectedBackendRunId', 'backendTargets'].includes(key))) failure('service_runtime_input_invalid', '所选服务包含未知字段。');
            if (typeof value.serviceCode !== 'string') failure('service_runtime_input_invalid', '服务编号无效。');
            const code = identifier(value.serviceCode, '服务编号');
            const parsed = parseStartRunInput(code, { worktreeId: value.worktreeId, ...(value.expectedBackendRunId === undefined ? {} : { expectedBackendRunId: value.expectedBackendRunId }), ...(value.backendTargets === undefined ? {} : { backendTargets: value.backendTargets }), ...(value.expectedWorktree === undefined ? {} : { expectedWorktree: value.expectedWorktree }) });
            return { serviceCode: code, worktreeId: parsed.worktreeId, ...(parsed.expectedBackendRunId ? { expectedBackendRunId: parsed.expectedBackendRunId } : {}), ...(parsed.backendTargets ? { backendTargets: parsed.backendTargets } : {}), ...(parsed.expectedWorktree ? { expectedWorktree: parsed.expectedWorktree } : {}) };
          });
          return { status: 200, body: await deps.taskRuntime.start(root, { taskId, selected, origin: body.origin ?? 'human', ...(body.connection ? { connection: body.connection } : {}) }) };
        }
        const service = suffix.match(/^\/service-runtime\/services\/([^/]+)$/);
        if (service && request.method === 'GET') {
          assertParams(searchParams, ['taskId']);
          const taskId = searchParams.has('taskId') ? identifier(searchParams.get('taskId')!, '任务编号') : undefined;
          return { status: 200, body: await deps.view.detail(root, identifier(service[1], '服务编号'), taskId) };
        }
        const start = suffix.match(/^\/service-runtime\/services\/([^/]+)\/runs$/);
        if (start && request.method === 'POST') {
          assertParams(searchParams, []); authorizeWrite();
          const body = await readBody(new Set(['worktreeId', 'origin', 'taskId', 'connection', 'expectedWorktree', 'expectedBackendRunId', 'backendTargets']), '启动本地运行');
          return { status: 200, body: await deps.runtime.startRun(root, parseStartRunInput(identifier(start[1], '服务编号'), body)) };
        }
        if (suffix === '/service-runtime/overview' && request.method === 'GET') { assertParams(searchParams, []); return { status: 200, body: await deps.view.overview(root) }; }
        const restart = suffix.match(/^\/service-runtime\/runs\/([^/]+)\/restart$/);
        if (restart && request.method === 'POST') {
          assertParams(searchParams, []); authorizeWrite();
          const body = await readBody(new Set(['connection', 'expectedWorktree', 'expectedBackendRunId', 'backendTargets', 'expectedRoutingDigest']), '切换本地运行连接');
          const parsed = parseStartRunInput('', { ...body, worktreeId: 'current' });
          return { status: 200, body: await deps.runtime.restartRun(root, identifier(restart[1], '运行编号'), { origin: 'human', connection: parsed.connection, backendTargets: parsed.backendTargets, expectedWorktree: parsed.expectedWorktree, expectedBackendRunId: parsed.expectedBackendRunId, expectedRoutingDigest: parsed.expectedRoutingDigest }) };
        }
        const stop = suffix.match(/^\/service-runtime\/runs\/([^/]+)\/stop$/);
        if (stop && request.method === 'POST') { assertParams(searchParams, []); authorizeWrite(); await readBody(new Set([]), '停止本地运行'); return { status: 200, body: await deps.runtime.stopRun(root, identifier(stop[1], '运行编号')) }; }
        const log = suffix.match(/^\/service-runtime\/runs\/([^/]+)\/log$/);
        if (log && request.method === 'GET') {
          assertParams(searchParams, ['maxBytes']);
          const maxBytes = searchParams.has('maxBytes') ? Number(searchParams.get('maxBytes')) : undefined;
          if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 1024)) failure('service_runtime_input_invalid', 'maxBytes 必须是不小于 1024 的整数。');
          return { status: 200, body: deps.runtime.readLog(root, identifier(log[1], '运行编号'), maxBytes === undefined ? {} : { maxBytes }) };
        }
        return null;
      } catch (cause) {
        if (cause instanceof ServiceRuntimeError) failure(cause.code, cause.message, STATUS_BY_CODE[cause.code] ?? 409);
        if (cause instanceof RuntimeDefinitionError) failure(cause.code, cause.message, 400);
        throw cause;
      }
    },
  });
}
