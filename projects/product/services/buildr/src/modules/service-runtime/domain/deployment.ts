/** 部署适配器契约：连接技能的部署程序按本协议收 JSON 输入、返回归一化结果，Buildr 不接管构建阶段与远端日志。 */
export const DEPLOYMENT_ADAPTER_PROTOCOL = 'buildr.service-deployment/v1';

export type DeploymentState = 'success' | 'submitted' | 'failed' | 'unknown';

export type DeploymentAction = 'submit' | 'list-branches';

export type DeploymentPlan = {
  serviceCode: string;
  environment: string;
  target: string;
  targetRef: string;
  branch: string;
  commit: string;
};

export type DeploymentOutcome = {
  state: DeploymentState;
  version: string | null;
  at: string | null;
  externalUrl: string | null;
  diagnostics: string[];
};

export type DeploymentRecord = DeploymentOutcome & {
  id: string;
  serviceId: string;
  serviceCode: string;
  environment: string;
  target: string;
  targetRef: string;
  branch: string;
  commit: string;
  submittedAt: string;
  provider: { connectionId: string; revision: string; program: string };
};

export type RemoteBranch = { branch: string; commit: string; integration: boolean };

const MAX_DIAGNOSTICS = 20;
const MAX_DIAGNOSTIC_LENGTH = 1024;

export function deploymentVersion(branch: string, commit: string): string {
  return `${branch}@${commit.slice(0, 7)}`;
}

export function planIdentity(plan: DeploymentPlan): string {
  return [plan.serviceCode, plan.environment, plan.branch, plan.commit].join('|');
}

export function adapterInput(action: DeploymentAction, plan: DeploymentPlan): string {
  return JSON.stringify({
    protocol: DEPLOYMENT_ADAPTER_PROTOCOL,
    action,
    service: { code: plan.serviceCode },
    environment: plan.environment,
    target: plan.target,
    targetRef: plan.targetRef,
    ...(action === 'submit' ? { plan: { branch: plan.branch, commit: plan.commit } } : {}),
  });
}

function text(value: unknown, max = 2048): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function boundedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_DIAGNOSTICS)
    .map(item => item.slice(0, MAX_DIAGNOSTIC_LENGTH));
}

function safeUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  return /^https?:\/\/\S+$/.test(url) ? url : null;
}

/** 只有明确符合契约的输出才可能成为 success；无法解析的输出保留 unknown。 */
export function parseDeploymentOutput(raw: unknown): DeploymentOutcome | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const state = body.state;
  if (state !== 'success' && state !== 'submitted' && state !== 'failed' && state !== 'unknown') return null;
  return {
    state,
    version: text(body.version, 512),
    at: text(body.at, 64),
    externalUrl: safeUrl(body.externalUrl),
    diagnostics: boundedList(body.diagnostics),
  };
}

export function parseBranchListOutput(raw: unknown): RemoteBranch[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const branches = (value as Record<string, unknown>).branches;
  if (!Array.isArray(branches)) return null;
  const parsed: RemoteBranch[] = [];
  for (const item of branches.slice(0, 200)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    const branch = text(entry.branch, 256);
    const commit = text(entry.commit, 64);
    if (!branch || !commit) return null;
    parsed.push({ branch, commit, integration: entry.integration === true });
  }
  return parsed;
}

export type ProgramObservation = {
  status: 'exited' | 'timeout' | 'output-limit' | 'spawn-failed';
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  diagnostics: string[];
};

/** 受理不等于成功；退出码非零时不接受 success，避免把未知结果报成已完成。 */
export function normalizeDeploymentResult(observation: ProgramObservation, plan: DeploymentPlan): DeploymentOutcome {
  const diagnostics = [...observation.diagnostics];
  if (observation.status !== 'exited') {
    diagnostics.push(`部署程序${observation.status === 'timeout' ? '超时' : observation.status === 'output-limit' ? '输出超限' : '启动失败'}；实际结果需到外部系统核对。`);
    return { state: 'unknown', version: null, at: null, externalUrl: null, diagnostics: boundedList(diagnostics) };
  }
  const parsed = parseDeploymentOutput(observation.stdout);
  if (!parsed) {
    diagnostics.push(`部署程序退出（code=${observation.exitCode ?? 'null'}, signal=${observation.signal ?? 'null'}）但未返回符合 ${DEPLOYMENT_ADAPTER_PROTOCOL} 的结果；实际结果需到外部系统核对。`);
    return { state: 'unknown', version: null, at: null, externalUrl: null, diagnostics: boundedList(diagnostics) };
  }
  if (parsed.state === 'success' && observation.exitCode !== 0) {
    diagnostics.push(`部署程序声明成功但退出码为 ${observation.exitCode}；结果保留为未知，需到外部系统核对。`);
    return { ...parsed, state: 'unknown', version: parsed.version ?? deploymentVersion(plan.branch, plan.commit), diagnostics: boundedList(diagnostics) };
  }
  return {
    ...parsed,
    version: parsed.version ?? deploymentVersion(plan.branch, plan.commit),
    diagnostics: boundedList([...parsed.diagnostics, ...diagnostics]),
  };
}
