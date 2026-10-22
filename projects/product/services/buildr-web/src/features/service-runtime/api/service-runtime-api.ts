import { api, type ApiClient } from '../../../api';

export type RunStatus = 'starting' | 'running' | 'stopped' | 'failed';
export type BackendMode = 'local' | 'remote';
export type RuntimeReadiness = { kind: 'log'; pattern: string } | { kind: 'http'; path: string };
export type RuntimeLaunch = {
  command: string[];
  cwd: string;
  profile: string | null;
  readiness: RuntimeReadiness;
  timeoutSeconds: number;
  definitionPath: string;
};
export type RunConnection = { mode: BackendMode; url: string; serviceCode: string; runId: string | null };

/** 实例保存启动时来源和实际注入的连接；旧记录中未知的事实保持 null。 */
export type ManagedRun = {
  id: string;
  serviceId: string;
  serviceCode: string;
  worktreeId: string;
  worktreePath: string;
  worktreeLabel: string;
  branch: string | null;
  head: string | null;
  main: boolean | null;
  taskId: string | null;
  taskTitle: string | null;
  dirty: boolean | null;
  origin: 'human' | 'agent' | 'unknown';
  url: string;
  connection: RunConnection | null;
  launch: RuntimeLaunch | null;
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
export type ExpectedWorktree = Pick<ServiceWorktree, 'path' | 'branch' | 'head' | 'dirty'>;
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
    readiness: RuntimeReadiness;
    timeoutSeconds: number;
    backend?: { serviceCode: string; environmentVariable: string; remoteUrl: string };
  };
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
};
export type ServiceRuntimeOverview = {
  schemaVersion: 'buildr.service-runtime-overview/v1';
  readAt: string;
  runs: ManagedRun[];
  local: { activeCount: number; active: Array<{ id: string; serviceCode: string; worktreeLabel: string; branch: string | null; actualPort: number; status: RunStatus; startedAt: string }> };
  services: ServiceRuntimeSummary[];
};
export type LocalBackendAvailability = {
  target: { runId: string; serviceCode: string; url: string; worktreeLabel: string; branch: string | null } | null;
  reason: string | null;
};
export type ServiceRuntimeDetail = { service: ServiceRuntimeSummary; worktrees: ServiceWorktree[]; connectionTargets: Record<string, LocalBackendAvailability>; diagnostics: string[] };
export type TaskRuntimeService = { service: ServiceRuntimeSummary; worktree: ServiceWorktree | null; connectionTarget: LocalBackendAvailability | null; diagnostics: string[] };
export type TaskRuntimeView = { taskId: string; title: string; services: TaskRuntimeService[]; runs: ManagedRun[]; diagnostics: string[] };
export type StartOptions = { connection?: BackendMode; origin?: 'human' | 'agent'; taskId?: string; expectedWorktree?: ExpectedWorktree; expectedBackendRunId?: string };
export type RestartOptions = { connection?: BackendMode; expectedWorktree?: ExpectedWorktree; expectedBackendRunId?: string };
export type TaskStartSelection = { serviceCode: string; worktreeId: string; expectedWorktree?: ExpectedWorktree; expectedBackendRunId?: string };
export type TaskStartResult = { taskId: string; results: Array<{ serviceCode: string; worktreeId: string; run: ManagedRun | null; reused: boolean; error: { code: string; message: string } | null }> };
export type RunLogResponse = { record: ManagedRun; log: string; truncated: boolean; size: number; maxBytes: number };
type ReadOptions = Pick<RequestInit, 'signal'>;
type DetailReadOptions = ReadOptions & { taskId?: string };
export const SERVICE_RUNTIME_CHANGED = 'buildr:service-runtime-changed';

/** 所有入口复用工作空间范围的本地运行接口；写入沿用会话授权。 */
export function createServiceRuntimeClient(client: ApiClient, workspaceId?: string) {
  const path = (suffix: string) => '/api/v1' + (workspaceId ? '/workspaces/' + encodeURIComponent(workspaceId) : '') + suffix;
  const service = (code: string) => path('/service-runtime/services/' + encodeURIComponent(code));
  const task = (id: string) => path('/service-runtime/tasks/' + encodeURIComponent(id));
  const write = async <T>(resource: string, body: unknown): Promise<T> => {
    try { return await client(resource, { method: 'POST', body: JSON.stringify(body) }) as T; }
    finally {
      // 仅通知同一工作空间重新读取；运行事实仍只来自服务器。失败也可能留下独立结果。
      if (workspaceId && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SERVICE_RUNTIME_CHANGED, { detail: { workspaceId } }));
    }
  };
  return {
    overview(options: ReadOptions = {}): Promise<ServiceRuntimeOverview> {
      return client(path('/service-runtime/overview'), options) as Promise<ServiceRuntimeOverview>;
    },
    detail(serviceCode: string, options: DetailReadOptions = {}): Promise<ServiceRuntimeDetail> {
      const { taskId, ...readOptions } = options;
      return client(service(serviceCode) + (taskId ? '?taskId=' + encodeURIComponent(taskId) : ''), readOptions) as Promise<ServiceRuntimeDetail>;
    },
    task(taskId: string, options: ReadOptions = {}): Promise<TaskRuntimeView> {
      return client(task(taskId), options) as Promise<TaskRuntimeView>;
    },
    log(runId: string, maxBytes?: number, options: ReadOptions = {}): Promise<RunLogResponse> {
      return client(path('/service-runtime/runs/' + encodeURIComponent(runId) + '/log') + (maxBytes ? '?maxBytes=' + maxBytes : ''), options) as Promise<RunLogResponse>;
    },
    start(serviceCode: string, worktreeId: string, options: StartOptions = {}): Promise<ManagedRun> {
      return write<ManagedRun>(service(serviceCode) + '/runs', { worktreeId, ...options });
    },
    restart(runId: string, options: RestartOptions = {}): Promise<ManagedRun> {
      return write<ManagedRun>(path('/service-runtime/runs/' + encodeURIComponent(runId) + '/restart'), options);
    },
    startTask(taskId: string, input: { selected: TaskStartSelection[]; connection: BackendMode; origin: 'human' | 'agent' }): Promise<TaskStartResult> {
      return write<TaskStartResult>(task(taskId) + '/runs', input);
    },
    stop(runId: string): Promise<ManagedRun> {
      return write<ManagedRun>(path('/service-runtime/runs/' + encodeURIComponent(runId) + '/stop'), {});
    },
  };
}
export const serviceRuntimeApi = createServiceRuntimeClient(api);
