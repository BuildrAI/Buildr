import { api, type ApiClient } from '../../../api';

export type RunStatus = 'starting' | 'running' | 'stopped' | 'failed';

export type ManagedRun = {
  id: string;
  serviceId: string;
  serviceCode: string;
  worktreeId: string;
  worktreePath: string;
  worktreeLabel: string;
  branch: string | null;
  head: string | null;
  pid: number;
  preferredPort: number;
  actualPort: number;
  portNote: string;
  status: RunStatus;
  startedAt: string;
  stoppedAt: string | null;
  failure: string | null;
  logPath: string;
};

export type ServiceWorktree = {
  id: string;
  path: string;
  label: string;
  main: boolean;
  branch: string | null;
  head: string | null;
  dirty: boolean;
  taskId: string | null;
  taskTitle: string | null;
};

export type RuntimeDefinitionView = {
  source: 'agent';
  verifiedAt: string;
  path: string;
  local: {
    command: string[];
    cwd: string;
    profile: string | null;
    preferredPort: number;
    portOverride: string | null;
    readiness: { kind: 'log'; pattern: string } | { kind: 'http'; path: string };
    timeoutSeconds: number;
  };
};

export type DeploymentState = 'success' | 'submitted' | 'failed' | 'unknown';

export type DeploymentRecord = {
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
  state: DeploymentState;
  version: string | null;
  at: string | null;
  externalUrl: string | null;
  diagnostics: string[];
};

export type ServiceEnvironmentState = {
  defined: boolean;
  target: string | null;
  targetRef: string | null;
  connectionId: string | null;
  integrationBranch: string | null;
  latest: DeploymentRecord | null;
};

export type ServiceRuntimeSummary = {
  id: string;
  code: string;
  name: string;
  projects: string[];
  repositoryId: string | null;
  definition: RuntimeDefinitionView | null;
  definitionDiagnostic: string | null;
  runs: ManagedRun[];
  local: { activeCount: number; activePorts: number[] };
  environments: Record<string, ServiceEnvironmentState>;
};

export type ServiceRuntimeOverview = {
  schemaVersion: 'buildr.service-runtime-overview/v1';
  readAt: string;
  runs: ManagedRun[];
  local: { activeCount: number; active: Array<{ id: string; serviceCode: string; worktreeLabel: string; branch: string | null; actualPort: number; status: RunStatus; startedAt: string }> };
  services: ServiceRuntimeSummary[];
};

export type ServiceRuntimeDetail = {
  service: ServiceRuntimeSummary;
  worktrees: ServiceWorktree[];
  diagnostics: string[];
};

export type RemoteBranch = { branch: string; commit: string; integration: boolean };

export type DeploymentPlan = {
  serviceCode: string;
  serviceId: string;
  environment: string;
  target: string;
  targetRef: string;
  provider: { connectionId: string; name: string; program: string; revision: string } | null;
  branch: string;
  integration: boolean;
  remoteCommit: string | null;
  version: string | null;
  local: ServiceWorktree | null;
  worktrees: ServiceWorktree[];
  branches: RemoteBranch[];
  expiresAt: string;
  available: boolean;
  latest: DeploymentRecord | null;
  diagnostics: string[];
};

export type RunLogResponse = { record: ManagedRun; log: string; truncated: boolean; size: number; maxBytes: number };

type ReadOptions = Pick<RequestInit, 'signal'>;

/** 服务运行与部署只经工作空间范围接口读取；启动、停止与提交是明确写入。 */
export function createServiceRuntimeClient(client: ApiClient, workspaceId?: string) {
  const path = (suffix: string) => '/api/v1' + (workspaceId ? '/workspaces/' + encodeURIComponent(workspaceId) : '') + suffix;
  const service = (code: string) => path('/service-runtime/services/' + encodeURIComponent(code));
  return {
    overview(options: ReadOptions = {}): Promise<ServiceRuntimeOverview> {
      return client(path('/service-runtime/overview'), options) as Promise<ServiceRuntimeOverview>;
    },
    detail(serviceCode: string, options: ReadOptions = {}): Promise<ServiceRuntimeDetail> {
      return client(service(serviceCode), options) as Promise<ServiceRuntimeDetail>;
    },
    plan(serviceCode: string, input: { branch?: string; worktreeId?: string; environment?: string } = {}, options: ReadOptions = {}): Promise<DeploymentPlan> {
      const query = new URLSearchParams();
      if (input.branch) query.set('branch', input.branch);
      if (input.worktreeId) query.set('worktreeId', input.worktreeId);
      if (input.environment) query.set('environment', input.environment);
      return client(service(serviceCode) + '/deployment-plan' + (query.size ? '?' + query : ''), options) as Promise<DeploymentPlan>;
    },
    log(runId: string, maxBytes?: number, options: ReadOptions = {}): Promise<RunLogResponse> {
      return client(path('/service-runtime/runs/' + encodeURIComponent(runId) + '/log') + (maxBytes ? '?maxBytes=' + maxBytes : ''), options) as Promise<RunLogResponse>;
    },
    start(serviceCode: string, worktreeId: string): Promise<ManagedRun> {
      return client(service(serviceCode) + '/runs', { method: 'POST', body: JSON.stringify({ worktreeId }) }) as Promise<ManagedRun>;
    },
    stop(runId: string): Promise<ManagedRun> {
      return client(path('/service-runtime/runs/' + encodeURIComponent(runId) + '/stop'), { method: 'POST', body: JSON.stringify({}) }) as Promise<ManagedRun>;
    },
    deploy(serviceCode: string, input: { branch: string; commit: string; environment?: string; acknowledgeUnknown?: boolean }): Promise<DeploymentRecord> {
      return client(service(serviceCode) + '/deployments', { method: 'POST', body: JSON.stringify(input) }) as Promise<DeploymentRecord>;
    },
  };
}

export const serviceRuntimeApi = createServiceRuntimeClient(api);
