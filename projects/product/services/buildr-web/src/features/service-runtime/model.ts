import type { ManagedRun, RunStatus, RunConnection, RuntimeBackendDeclaration, ServiceRuntimeSummary, ServiceWorktree, ExpectedWorktree, TaskRuntimeService, BackendMode, StartOptions, LocalBackendAvailability } from './api/service-runtime-api';

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
export function taskSelections(services: TaskRuntimeService[], selected: string[], connection?: BackendMode) {
  const wanted = new Set(selected);
  return availableTaskServices(services).filter(item => wanted.has(item.service.code)).map(item => {
    const backendTargets = connection === 'local' ? (item.service.definition?.local.backends ?? [])
      .filter(backend => !wanted.has(backend.serviceCode))
      .flatMap(backend => {
        const target = item.connectionTarget?.find(entry => entry.serviceCode === backend.serviceCode)?.target;
        return target ? [{ serviceCode: backend.serviceCode, target: 'run' as const, runId: target.runId }] : [];
      }) : [];
    return { serviceCode: item.service.code, worktreeId: item.worktree!.id, expectedWorktree: expectedWorktree(item.worktree!), ...(backendTargets.length ? { backendTargets } : {}) };
  });
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
