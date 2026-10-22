import { formatShortDateTime } from '../../lib/taskLabels';
import type { DeploymentRecord, DeploymentState, ManagedRun, RunStatus, ServiceEnvironmentState, ServiceRuntimeSummary } from './api/service-runtime-api';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = { starting: '启动中', running: '运行中', stopped: '已停止', failed: '失败' };

export const DEPLOYMENT_STATE_LABEL: Record<DeploymentState, string> = { success: '成功', submitted: '已提交，构建中', failed: '失败', unknown: '未知' };

export const DEPLOYMENT_STATE_COLOR: Record<DeploymentState, string | undefined> = { success: 'success', submitted: 'processing', failed: 'error', unknown: 'warning' };

export const ENVIRONMENT_LABEL: Record<string, string> = { qa: 'QA' };

export function isActiveRun(run: ManagedRun): boolean {
  return run.status === 'starting' || run.status === 'running';
}

export function activeRuns(service: ServiceRuntimeSummary | null | undefined): ManagedRun[] {
  return service?.runs.filter(isActiveRun) ?? [];
}

export function shortCommit(commit: string | null | undefined): string {
  return commit ? commit.slice(0, 7) : '—';
}

const PENDING_ENVIRONMENT: ServiceEnvironmentState = { defined: false, target: null, targetRef: null, connectionId: null, integrationBranch: null, latest: null };

/** 环境集合是服务数据；新增环境只需运行定义登记，视图不改列。详情读取中先保留 QA 基线页签，避免页签延迟出现。 */
export function environmentEntries(service: ServiceRuntimeSummary | null | undefined): Array<ServiceEnvironmentState & { id: string; label: string }> {
  return Object.entries(service?.environments ?? { qa: PENDING_ENVIRONMENT }).map(([id, entry]) => ({ id, label: ENVIRONMENT_LABEL[id] ?? id.toUpperCase(), ...entry }));
}

export function deploymentSummary(latest: DeploymentRecord | null): string {
  if (!latest) return '未部署';
  return `${DEPLOYMENT_STATE_LABEL[latest.state]} · ${latest.version ?? `${latest.branch}@${shortCommit(latest.commit)}`} · ${formatShortDateTime(latest.at ?? latest.submittedAt)}`;
}

export function runFailure(run: ManagedRun): string {
  return run.failure ?? (run.status === 'failed' ? '进程非零退出' : '');
}
