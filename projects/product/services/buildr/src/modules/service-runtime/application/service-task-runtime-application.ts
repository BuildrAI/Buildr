import { ServiceRuntimeError } from '../domain/errors.ts';
import { isActiveRun, type ManagedRunRecord } from '../domain/runs.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import type { LocalBackendAvailability, ServiceRuntimeApplication, StartRunInput } from './service-runtime-application.ts';
import type { ServiceRuntimeCatalogPort, ServiceRuntimeSummary, ServiceRuntimeView } from './service-runtime-view.ts';

export type RuntimeTask = {
  taskId: string;
  title: string;
  scope: { projects: string[]; services: Array<{ project: string; service: string }> };
};
export type TaskRuntimeService = { service: ServiceRuntimeSummary; worktree: ServiceWorktree | null; connectionTarget: LocalBackendAvailability[] | null; diagnostics: string[] };
export type TaskRuntimeDetail = { taskId: string; title: string; services: TaskRuntimeService[]; runs: ManagedRunRecord[]; diagnostics: string[] };
export type TaskRunSelection = Pick<StartRunInput, 'serviceCode' | 'worktreeId' | 'expectedWorktree' | 'expectedBackendRunId' | 'backendTargets'>;
export type TaskRunResult = {
  serviceCode: string;
  worktreeId: string;
  run: ManagedRunRecord | null;
  reused: boolean;
  error: { code: string; message: string } | null;
};
export type StartTaskRunsInput = {
  taskId: string;
  selected: TaskRunSelection[];
  connection?: 'local' | 'remote';
  origin?: 'human' | 'agent';
};

export function runtimeTaskAllowsService(task: RuntimeTask, service: { code: string; projects: string[] }): boolean {
  if (task.scope.services.length) return task.scope.services.some(ref => ref.service === service.code && service.projects.includes(ref.project));
  return task.scope.projects.some(project => service.projects.includes(project));
}

/** Task contributes scope and defaults; each selected service still owns its run and failure. */
export function createServiceTaskRuntimeApplication(deps: {
  readTaskScope(root: string, taskId: string): RuntimeTask;
  catalog: ServiceRuntimeCatalogPort;
  view: ServiceRuntimeView;
  runtime: ServiceRuntimeApplication;
}) {
  const taskServices = (root: string, task: RuntimeTask) => deps.catalog.listServices(root).filter(service => runtimeTaskAllowsService(task, service));

  async function detail(root: string, taskId: string): Promise<TaskRuntimeDetail> {
    const task = deps.readTaskScope(root, taskId);
    const allowed = new Set(taskServices(root, task).map(service => service.code));
    const overview = await deps.view.overview(root);
    const services: TaskRuntimeService[] = overview.services.filter(service => allowed.has(service.code)).map(service => {
      const diagnostics: string[] = [];
      let candidates: ServiceWorktree[] = [];
      try { candidates = deps.runtime.listWorktrees(root, service.code, taskId).filter(worktree => worktree.taskId === taskId && !worktree.main); }
      catch (cause) { diagnostics.push((cause as Error).message); }
      if (candidates.length === 0) diagnostics.push('本任务尚无可用代码目录，请先准备相关工作树。');
      else if (candidates.length > 1) diagnostics.push('本任务有多个代码目录，无法确定唯一来源，请核对工作树归属。');
      const worktree = candidates.length === 1 ? candidates[0]! : null;
      let connectionTarget: LocalBackendAvailability[] | null = null;
      try { if (worktree) connectionTarget = deps.runtime.connectionTarget(root, service.code, worktree); }
      catch (cause) { diagnostics.push((cause as Error).message); }
      return { service, worktree, connectionTarget, diagnostics };
    });
    const diagnostics = services.length ? [] : ['任务尚未明确服务范围，请先核对本次验证涉及的服务。'];
    return { taskId: task.taskId, title: task.title, services, runs: overview.runs.filter(run => run.taskId === taskId), diagnostics };
  }

  function failure(selection: TaskRunSelection, cause: unknown): TaskRunResult {
    const error = cause as { code?: string; message?: string };
    return { serviceCode: selection.serviceCode, worktreeId: selection.worktreeId, run: null, reused: false,
      error: { code: error.code || 'service_runtime_task_start_failed', message: error.message || String(cause) } };
  }

  async function start(root: string, input: StartTaskRunsInput) {
    if (!Array.isArray(input.selected) || input.selected.length === 0) throw new ServiceRuntimeError('service_runtime_input_invalid', '至少选择一个服务。');
    if (new Set(input.selected.map(item => item.serviceCode)).size !== input.selected.length) throw new ServiceRuntimeError('service_runtime_input_invalid', '同一服务不能重复选择。');
    if (input.connection !== undefined && input.connection !== 'local' && input.connection !== 'remote') throw new ServiceRuntimeError('service_runtime_input_invalid', '连接选择必须为 local 或 remote。');
    if (input.origin !== undefined && input.origin !== 'agent' && input.origin !== 'human') throw new ServiceRuntimeError('service_runtime_input_invalid', '启动入口必须为 agent 或 human。');
    // Resolve before any effect. Caller paths never become execution locations.
    const observed = await detail(root, input.taskId);
    const selectedByCode = new Map(input.selected.map(selection => [selection.serviceCode, selection]));
    const servicesByCode = new Map(observed.services.map(item => [item.service.code, item]));
    const results = new Map<string, TaskRunResult>();
    const visiting = new Set<string>();

    const startSelected = async (selection: TaskRunSelection): Promise<TaskRunResult> => {
      const prior = results.get(selection.serviceCode);
      if (prior) return prior;
      if (visiting.has(selection.serviceCode)) {
        const result = failure(selection, new ServiceRuntimeError('service_runtime_dependency_cycle', '本地服务连接声明存在循环，请核对配置。'));
        results.set(selection.serviceCode, result); return result;
      }
      visiting.add(selection.serviceCode);
      try {
        const item = servicesByCode.get(selection.serviceCode);
        if (!item) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', `服务 ${selection.serviceCode} 不在当前任务范围。`);
        if (!item.worktree || item.worktree.id !== selection.worktreeId) throw new ServiceRuntimeError('service_runtime_task_worktree_unavailable', item.diagnostics.join(' ') || '所选目录不属于本任务，请刷新后重选。');
        const task = deps.readTaskScope(root, input.taskId);
        if (!taskServices(root, task).some(service => service.code === selection.serviceCode)) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', '任务服务范围已变化，请刷新后重选。');
        const definition = deps.runtime.readDefinition(root, selection.serviceCode)?.definition;
        if (!definition) throw new ServiceRuntimeError('service_runtime_definition_missing', `服务 ${selection.serviceCode} 尚无已验证的运行定义。`);
        const backends = definition.local.backends ?? [];
        const mode = backends.length ? input.connection ?? 'local' : undefined;
        const backendTargets: NonNullable<StartRunInput['backendTargets']> = [...(selection.backendTargets ?? [])];
        if (mode === 'local') {
          for (const backend of backends) {
            const dependency = selectedByCode.get(backend.serviceCode);
            if (!dependency) continue;
            const result = await startSelected(dependency);
            if (result.error || result.run?.status !== 'running') throw new ServiceRuntimeError('service_runtime_backend_unavailable', `所选本地后端 ${backend.serviceCode} 未就绪，前端未启动。`);
            const index = backendTargets.findIndex(target => target.serviceCode === backend.serviceCode);
            const target = { serviceCode: backend.serviceCode, target: 'run' as const, runId: result.run.id };
            if (index >= 0) backendTargets[index] = target; else backendTargets.push(target);
          }
        }
        // Dependency readiness may take time; re-read scope before the next service starts.
        if (!taskServices(root, deps.readTaskScope(root, input.taskId)).some(service => service.code === selection.serviceCode)) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', '任务服务范围已变化，请刷新后重选。');
        const current = await deps.runtime.listRuns(root);
        const existing = current.find(run => run.serviceCode === selection.serviceCode && run.worktreeId === selection.worktreeId && run.taskId === input.taskId && isActiveRun(run));
        const expected = selection.expectedWorktree;
        const currentSource = () => {
          const source = deps.runtime.listWorktrees(root, selection.serviceCode, input.taskId).find(worktree => worktree.id === selection.worktreeId && worktree.taskId === input.taskId && !worktree.main);
          if (!source || expected && (source.path !== expected.path || source.head !== expected.head || source.branch !== expected.branch || source.dirty !== expected.dirty)) throw new ServiceRuntimeError('service_runtime_worktree_changed', '代码目录或版本已变化，请刷新后核对。');
          return source;
        };
        currentSource();
        let run: ManagedRunRecord;
        let reused = false;
        if (existing) {
          const ready = existing.status === 'starting' ? await deps.runtime.waitForRun(root, existing.id) : existing;
          await deps.runtime.listRuns(root);
          const availabilities = deps.runtime.connectionTarget(root, selection.serviceCode, item.worktree) ?? [];
          const source = currentSource();
          // 每个声明后端逐一核对：显式实例目标失效即所选变化，其余按连接模式比对实际连接。
          for (const backend of backends) {
            const expected = backendTargets.find(target => target.serviceCode === backend.serviceCode);
            const actual = ready.connections.find(connection => connection.serviceCode === backend.serviceCode);
            if (expected?.target === 'run' && (actual?.mode !== 'local' || actual.runId !== expected.runId)) throw new ServiceRuntimeError('service_runtime_backend_changed', `本地后端 ${backend.serviceCode} 实例已变化，请刷新后重新选择。`);
          }
          if (mode === 'local' && selection.expectedBackendRunId && !backendTargets.some(target => target.target === 'run')) {
            const owner = availabilities.find(availability => availability.candidates.some(candidate => candidate.runId === selection.expectedBackendRunId));
            if (owner?.target?.runId !== selection.expectedBackendRunId) throw new ServiceRuntimeError('service_runtime_backend_changed', '本地后端实例已变化，请刷新后重新选择。');
          }
          if (ready.status !== 'running') throw new ServiceRuntimeError('service_runtime_existing_run_failed', ready.failure || '已有实例未就绪，请查看日志后单独重试。');
          const mismatched = backends.find(backend => {
            const expected = backendTargets.find(target => target.serviceCode === backend.serviceCode);
            if (expected?.target === 'run') return false;
            const actual = ready.connections.find(connection => connection.serviceCode === backend.serviceCode);
            if (mode === 'remote' || expected?.target === 'remote') return actual?.mode !== 'remote' || actual.url !== backend.remoteUrl;
            const target = availabilities.find(availability => availability.serviceCode === backend.serviceCode)?.target;
            return !target || actual?.mode !== 'local' || actual.runId !== target.runId || actual.url !== target.url;
          });
          if (mismatched) throw new ServiceRuntimeError('service_runtime_connection_conflict', `该目录已有与 ${mismatched.serviceCode} 不同连接的运行，请明确切换连接后重试。`);
          if (ready.head !== source.head || ready.branch !== source.branch || ready.dirty !== source.dirty) throw new ServiceRuntimeError('service_runtime_worktree_changed', '已有实例的启动时代码与当前目录不同，请核对后重新启动。');
          run = ready; reused = true;
        } else {
          if (!taskServices(root, deps.readTaskScope(root, input.taskId)).some(service => service.code === selection.serviceCode)) throw new ServiceRuntimeError('service_runtime_task_scope_mismatch', '任务服务范围已变化，请刷新后重选。');
          const { backendTargets: _declared, expectedBackendRunId: legacyExpected, ...rest } = selection;
          run = await deps.runtime.startRun(root, { ...rest, ...(backendTargets.length ? {} : { expectedBackendRunId: legacyExpected }), backendTargets, taskId: input.taskId, origin: input.origin ?? 'agent', ...(mode ? { connection: mode } : {}) });
          run = await deps.runtime.waitForRun(root, run.id);
        }
        const result: TaskRunResult = { serviceCode: selection.serviceCode, worktreeId: selection.worktreeId, run, reused,
          error: run.status === 'running' ? null : { code: 'service_runtime_start_failed', message: run.failure || '服务尚未就绪，请查看日志。' } };
        results.set(selection.serviceCode, result); return result;
      } catch (cause) {
        const result = failure(selection, cause); results.set(selection.serviceCode, result); return result;
      } finally { visiting.delete(selection.serviceCode); }
    };
    // Recursive dependency ordering only visits explicitly selected services.
    for (const selection of input.selected) await startSelected(selection);
    return { taskId: input.taskId, results: input.selected.map(selection => results.get(selection.serviceCode)!) };
  }

  return Object.freeze({ detail, start });
}
export type ServiceTaskRuntimeApplication = ReturnType<typeof createServiceTaskRuntimeApplication>;
