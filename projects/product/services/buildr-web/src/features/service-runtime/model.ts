import type { ManagedRun, RunStatus, RunConnection, RuntimeBackendDeclaration, ServiceRuntimeSummary, ServiceWorktree, ExpectedWorktree, TaskRuntimeService, BackendMode, StartOptions, LocalBackendAvailability, BackendTarget, ConnectionSelection } from './api/service-runtime-api';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = { starting: '启动中', running: '已就绪', stopped: '已停止', failed: '启动失败' };
export const RUN_STATUS_COLOR: Record<RunStatus, string | undefined> = { starting: 'processing', running: 'success', stopped: undefined, failed: 'error' };
export function isActiveRun(run: Pick<ManagedRun, 'status'> & Partial<Pick<ManagedRun, 'stoppedAt' | 'pid'>>): boolean {
  return run.status === 'starting' || run.status === 'running' || (run.status === 'failed' && run.stoppedAt === null && (run.pid ?? 0) > 0);
}
export function activeRuns(service: ServiceRuntimeSummary | null | undefined): ManagedRun[] { return service?.runs.filter(isActiveRun) ?? []; }
export function shortCommit(commit: string | null | undefined): string { return commit ? commit.slice(0, 7) : '未记录提交'; }
export function runFailure(run: ManagedRun): string { return run.failure ?? (run.status === 'failed' ? '进程非正常退出' : ''); }
export function sourceLabel(source: Pick<ManagedRun, 'main' | 'taskId' | 'taskTitle' | 'worktreeLabel'>): string {
  return source.main === true ? '主工作库' : source.taskTitle || (source.taskId ? `任务 ${source.taskId}` : source.main === false ? `其他检出目录${source.worktreeLabel ? ` · ${source.worktreeLabel}` : ''}` : '来源未确认');
}
export function dirtyLabel(dirty: boolean | null | undefined): string { return dirty === true ? '含未提交改动' : dirty === false ? '无未提交改动' : '改动状态未记录'; }
export function expectedWorktree(worktree: ServiceWorktree): ExpectedWorktree { const { path, branch, head, dirty } = worktree; return { path, branch, head, dirty }; }
/** 普通主工作库无需任务身份；其他路由运行仍须有可核实的任务归属。 */
export function routingScopeError(worktree: ServiceWorktree | null): string | null {
  if (!worktree) return null;
  if (worktree.main === true && worktree.taskId === null || worktree.main === false && typeof worktree.taskId === 'string' && worktree.taskId.trim()) return null;
  return worktree.main ? '代码目录同时标记为主工作库和任务目录，请刷新后核对真实来源。' : '代码目录的任务归属尚未确认，请选择主工作库或已确认的任务目录。';
}
/** 切换同一实例时携带其明确任务，交由服务器重验；改选目录绝不继承旧任务。 */
export function startRunOptions(worktree: ServiceWorktree, initialRun?: Pick<ManagedRun, 'worktreeId' | 'taskId'> | null, connection?: BackendMode): StartOptions {
  const taskId = initialRun?.worktreeId === worktree.id ? initialRun.taskId ?? worktree.taskId : worktree.taskId;
  return { origin: 'human', expectedWorktree: expectedWorktree(worktree), ...(taskId ? { taskId } : {}), ...(connection ? { connection } : {}) };
}
/** 旧记录只有单条 connection；新记录按声明顺序保存 connections。 */
export function runConnections(run: Pick<ManagedRun, 'connection' | 'connections'>): RunConnection[] {
  return run.connections ?? (run.connection ? [run.connection] : []);
}
export function availableTaskServices(services: TaskRuntimeService[]): TaskRuntimeService[] { return services.filter(item => item.worktree && !item.worktree.main && item.service.definition); }
export function backendSelectionTargets(backends: RuntimeBackendDeclaration[], selections: Record<string, string>, available: LocalBackendAvailability[] = []): BackendTarget[] {
  return backends.map(backend => {
    const value = selections[backend.serviceCode] ?? 'auto';
    if (value === 'remote') return { serviceCode: backend.serviceCode, target: 'remote' };
    if (value !== 'auto') return { serviceCode: backend.serviceCode, target: 'run', runId: value.slice(4) };
    const observed = available.find(item => item.serviceCode === backend.serviceCode);
    return { serviceCode: backend.serviceCode, target: 'auto', ...(backend.kind === 'service-discovery' && (observed?.target || observed?.state === 'missing')
      ? { expectedRunId: observed.target?.runId ?? null } : {}) };
  });
}
export function taskSelections(services: TaskRuntimeService[], selected: string[], connection?: ConnectionSelection) {
  const wanted = new Set(selected);
  return availableTaskServices(services).filter(item => wanted.has(item.service.code)).map(item => {
    const backendTargets: BackendTarget[] = connection === 'local' || connection === 'auto' ? (item.service.definition?.local.backends ?? [])
      .filter(backend => !wanted.has(backend.serviceCode))
      .flatMap(backend => {
        const availability = item.connectionTarget?.find(entry => entry.serviceCode === backend.serviceCode);
        if (availability?.target) return [{ serviceCode: backend.serviceCode, target: 'run' as const, runId: availability.target.runId }];
        if (connection !== 'auto') return [];
        return backend.kind === 'service-discovery'
          ? backendSelectionTargets([backend], {}, item.connectionTarget ?? [])
          : [{ serviceCode: backend.serviceCode, target: 'remote' as const }];
      }) : [];
    return { serviceCode: item.service.code, worktreeId: item.worktree!.id, expectedWorktree: expectedWorktree(item.worktree!), ...(backendTargets.length ? { backendTargets } : {}) };
  });
}
export function connectionAddress(connection: RunConnection): string {
  return connection.kind === 'service-discovery' ? connection.serviceId : connection.url;
}
export function routingObservationLabel(run: ManagedRun): string {
  const observation = run.routing?.observation;
  if (observation?.status === 'unavailable') return `观察不可用：${observation.error || '尚未确认当前运行身份'}`;
  if (observation?.status !== 'observed') return '尚无当前运行观察';
  return Object.keys(observation.targets ?? {}).length ? '已读取下游发现观察，业务验证仍需执行' : '上下文已核对，下游发现状态尚无观察';
}
type ConnectionItem = { service: ServiceRuntimeSummary; worktree: ServiceWorktree | null; connectionTarget?: LocalBackendAvailability[] | null };
export type BackendConnectionChoice = {
  frontendCode: string;
  backend: RuntimeBackendDeclaration;
  availability: LocalBackendAvailability | null;
  target: LocalBackendAvailability['target'];
  startsBackend: boolean;
  available: boolean;
  reason: string | null;
};
/** 每个声明后端独立解析；任务明确选中的后端可先启动，再把就绪地址交给前端。 */
export function backendConnectionChoices(items: ConnectionItem[], selected: string[], taskScope = false): BackendConnectionChoice[] {
  const wanted = new Set(selected);
  return items.flatMap(item => {
    if (!wanted.has(item.service.code)) return [];
    return (item.service.definition?.local.backends ?? []).map(backend => {
      const availability = item.connectionTarget?.find(entry => entry.serviceCode === backend.serviceCode) ?? null;
      const target = availability?.target ?? null;
      const paired = taskScope ? items.find(candidate => candidate.service.code === backend.serviceCode && wanted.has(candidate.service.code) && candidate.worktree && !candidate.worktree.main && candidate.service.definition) : null;
      return { frontendCode: item.service.code, backend, availability, target, startsBackend: !target && Boolean(paired), available: Boolean(target || paired), reason: target || paired ? null : availability?.reason || `请先启动所选代码来源的 ${backend.serviceCode} 后端并等待就绪。` };
    });
  });
}
export function canUseLocalConnection(items: ConnectionItem[], selected: string[], taskScope = false): boolean {
  return backendConnectionChoices(items, selected, taskScope).every(choice => choice.available);
}
export function visibleRunUrl(run: ManagedRun): string | null {
  if (run.status !== 'running' || !run.url) return null;
  try { const url = new URL(run.url); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function filterRunLog(log: string, query: string): string { const needle = query.trim().toLocaleLowerCase(); return needle ? log.split('\n').filter(line => line.toLocaleLowerCase().includes(needle)).join('\n') : log; }
