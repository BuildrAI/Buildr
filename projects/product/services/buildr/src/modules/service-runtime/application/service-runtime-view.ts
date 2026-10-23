import { isActiveRun, type ManagedRunRecord } from '../domain/runs.ts';
import type { RuntimeLocalDefinition } from '../domain/runtime-definition.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import { readRuntimeDefinition } from '../persistence/runtime-definition-repository.ts';
import type { LocalBackendAvailability, ServiceRuntimeApplication } from './service-runtime-application.ts';

export type ServiceRuntimeCatalogEntry = { id: string; code: string; name: string; type: string; modulePath: string; repositoryId: string | null; projects: string[] };
export type ServiceRuntimeCatalogPort = { listServices(targetRoot: string): ServiceRuntimeCatalogEntry[] };
export type ServiceRuntimeSummary = {
  id: string; code: string; name: string; type: string; projects: string[]; repositoryId: string | null;
  definition: { source: 'agent'; verifiedAt: string; path: string; local: RuntimeLocalDefinition } | null;
  definitionDiagnostic: string | null;
  runs: ManagedRunRecord[];
  local: { activeCount: number; activePorts: number[] };
};
export type ServiceRuntimeDetail = { service: ServiceRuntimeSummary; worktrees: ServiceWorktree[]; connectionTargets: Record<string, LocalBackendAvailability[]>; diagnostics: string[] };

export function createServiceRuntimeView(deps: { catalog: ServiceRuntimeCatalogPort; runtime: ServiceRuntimeApplication; now?(): string }) {
  const now = deps.now ?? (() => new Date().toISOString());
  function summarize(entry: ServiceRuntimeCatalogEntry, runs: ManagedRunRecord[], root: string): ServiceRuntimeSummary {
    let existing: ReturnType<typeof readRuntimeDefinition> = null;
    let definitionDiagnostic: string | null = null;
    try { existing = readRuntimeDefinition(root, entry.code); }
    catch (cause) { definitionDiagnostic = (cause as Error).message; }
    const serviceRuns = runs.filter(run => run.serviceCode === entry.code).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const active = serviceRuns.filter(isActiveRun);
    return {
      ...entry,
      definition: existing ? { source: existing.definition.source, verifiedAt: existing.definition.verifiedAt, path: existing.path, local: existing.definition.local } : null,
      definitionDiagnostic, runs: serviceRuns,
      local: { activeCount: active.length, activePorts: active.map(run => run.actualPort).sort((a, b) => a - b) },
    };
  }
  return Object.freeze({
    async overview(root: string) {
      const runs = await deps.runtime.listRuns(root);
      return {
        schemaVersion: 'buildr.service-runtime-overview/v1', readAt: now(), runs,
        local: { activeCount: runs.filter(isActiveRun).length, active: runs.filter(isActiveRun).map(run => ({ id: run.id, serviceCode: run.serviceCode, worktreeLabel: run.worktreeLabel, branch: run.branch, actualPort: run.actualPort, status: run.status, startedAt: run.startedAt })) },
        services: deps.catalog.listServices(root).map(entry => summarize(entry, runs, root)),
      };
    },
    async detail(root: string, code: string, taskId?: string): Promise<ServiceRuntimeDetail> {
      const entry = deps.catalog.listServices(root).find(item => item.code === code);
      if (!entry) throw Object.assign(new Error(`服务未登记：${code}`), { code: 'service_runtime_service_unknown', status: 404 });
      const runs = await deps.runtime.listRuns(root);
      const diagnostics: string[] = [];
      let worktrees: ServiceWorktree[] = [];
      try {
        const observed = deps.runtime.listWorktrees(root, code, taskId);
        worktrees = taskId ? observed.filter(worktree => worktree.taskId === taskId && !worktree.main) : observed;
      }
      catch (cause) { diagnostics.push(`读取代码目录失败：${(cause as Error).message}`); }
      const connectionTargets: Record<string, LocalBackendAvailability[]> = {};
      for (const worktree of worktrees) {
        try {
          const availability = deps.runtime.connectionTarget(root, code, worktree);
          if (availability?.length) connectionTargets[worktree.id] = availability;
        } catch (cause) { diagnostics.push(`读取本地后端失败：${(cause as Error).message}`); break; }
      }
      return { service: summarize(entry, runs, root), worktrees, connectionTargets, diagnostics };
    },
  });
}
export type ServiceRuntimeView = ReturnType<typeof createServiceRuntimeView>;
