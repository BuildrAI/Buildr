import { isActiveRun, type ManagedRunRecord } from '../domain/runs.ts';
import type { DeploymentRecord } from '../domain/deployment.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import { readDeploymentState } from '../persistence/deployments-repository.ts';
import { readRuntimeDefinition } from '../persistence/runtime-definition-repository.ts';
import type { ServiceDeploymentApplication } from './service-deployment-application.ts';
import type { ServiceRuntimeApplication } from './service-runtime-application.ts';

export type ServiceRuntimeCatalogEntry = {
  id: string;
  code: string;
  name: string;
  modulePath: string;
  repositoryId: string | null;
  projects: string[];
};

export type ServiceRuntimeCatalogPort = {
  listServices(targetRoot: string): ServiceRuntimeCatalogEntry[];
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
  definition: {
    source: 'agent';
    verifiedAt: string;
    path: string;
    local: { command: string[]; cwd: string; profile: string | null; preferredPort: number; portOverride: string | null; readiness: { kind: 'log'; pattern: string } | { kind: 'http'; path: string }; timeoutSeconds: number };
  } | null;
  definitionDiagnostic: string | null;
  runs: ManagedRunRecord[];
  local: { activeCount: number; activePorts: number[] };
  environments: Record<string, ServiceEnvironmentState>;
};

export type ServiceRuntimeDetail = {
  service: ServiceRuntimeSummary;
  worktrees: ServiceWorktree[];
  diagnostics: string[];
};

export function createServiceRuntimeView(deps: {
  catalog: ServiceRuntimeCatalogPort;
  runtime: ServiceRuntimeApplication;
  deployment: ServiceDeploymentApplication;
  now?(): string;
}) {
  const now = deps.now ?? (() => new Date().toISOString());

  function summarize(entry: ServiceRuntimeCatalogEntry, runs: ManagedRunRecord[], targetRoot: string): ServiceRuntimeSummary {
    // 单个服务的运行定义损坏只降级该服务，不影响其他服务的运行与部署读取。
    let existing: ReturnType<typeof readRuntimeDefinition> = null;
    let definitionDiagnostic: string | null = null;
    try {
      existing = readRuntimeDefinition(targetRoot, entry.code);
    } catch (cause) {
      definitionDiagnostic = (cause as Error).message;
    }
    const serviceRuns = runs.filter(run => run.serviceCode === entry.code).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    const active = serviceRuns.filter(isActiveRun);
    const deployments = readDeploymentState(targetRoot, entry.code).latest;
    const defined = existing?.definition.environments ?? {};
    // 环境集合是服务数据：qa 作为首期基线始终呈现，定义或最近结果存在即增加对应环境行。
    const environmentIds = [...new Set(['qa', ...Object.keys(defined), ...Object.keys(deployments)])];
    const environments: Record<string, ServiceEnvironmentState> = {};
    for (const id of environmentIds) {
      const environment = defined[id];
      environments[id] = {
        defined: Boolean(environment),
        target: environment?.target ?? null,
        targetRef: environment?.targetRef ?? null,
        connectionId: environment?.connectionId ?? null,
        integrationBranch: environment?.integrationBranch ?? null,
        latest: deployments[id] ?? null,
      };
    }
    return {
      id: entry.id,
      code: entry.code,
      name: entry.name,
      projects: entry.projects,
      repositoryId: entry.repositoryId,
      definition: existing ? {
        source: existing.definition.source,
        verifiedAt: existing.definition.verifiedAt,
        path: existing.path,
        local: {
          command: existing.definition.local.command,
          cwd: existing.definition.local.cwd,
          profile: existing.definition.local.profile,
          preferredPort: existing.definition.local.preferredPort,
          portOverride: existing.definition.local.portOverride,
          readiness: existing.definition.local.readiness,
          timeoutSeconds: existing.definition.local.timeoutSeconds,
        },
      } : null,
      definitionDiagnostic,
      runs: serviceRuns,
      local: { activeCount: active.length, activePorts: active.map(run => run.actualPort).sort((left, right) => left - right) },
      environments,
    };
  }

  return Object.freeze({
    async overview(targetRoot: string) {
      const entries = deps.catalog.listServices(targetRoot);
      const runs = await deps.runtime.listRuns(targetRoot);
      return {
        schemaVersion: 'buildr.service-runtime-overview/v1',
        readAt: now(),
        runs,
        local: {
          activeCount: runs.filter(isActiveRun).length,
          active: runs.filter(isActiveRun).map(run => ({ id: run.id, serviceCode: run.serviceCode, worktreeLabel: run.worktreeLabel, branch: run.branch, actualPort: run.actualPort, status: run.status, startedAt: run.startedAt })),
        },
        services: entries.map(entry => summarize(entry, runs, targetRoot)),
      };
    },

    async detail(targetRoot: string, serviceCode: string): Promise<ServiceRuntimeDetail> {
      const entries = deps.catalog.listServices(targetRoot);
      const entry = entries.find(item => item.code === serviceCode);
      if (!entry) throw Object.assign(new Error(`服务未登记：${serviceCode}`), { code: 'service_runtime_service_unknown', status: 404 });
      const runs = await deps.runtime.listRuns(targetRoot, serviceCode);
      const diagnostics: string[] = [];
      let worktrees: ServiceWorktree[] = [];
      try {
        worktrees = deps.runtime.listWorktrees(targetRoot, serviceCode);
      } catch (cause) {
        diagnostics.push(`读取服务检出目录失败：${(cause as Error).message}`);
      }
      return { service: summarize(entry, runs, targetRoot), worktrees, diagnostics };
    },
  });
}

export type ServiceRuntimeView = ReturnType<typeof createServiceRuntimeView>;
