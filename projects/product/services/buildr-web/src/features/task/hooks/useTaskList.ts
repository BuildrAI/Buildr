import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api';
import { taskApi } from '../api/task-api';
import type { TaskListRequest, TaskListResponse } from '../api/generated/task-dto';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };
type ProjectInfo = { code: string; name: string };
type ServiceInfo = { code: string; name: string; projectCode: string };

export type TaskListItem = TaskListResponse['tasks'][number];

function rank(status: string): number {
  return status === 'todo' ? 0 : status === 'active' ? 1 : 2;
}

export function useTaskList(input: {
  workspaceId: string | null;
  filters: TaskListRequest;
  onWorkspace(payload: WorkspacePayload): void;
}) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ message: string }>>([]);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterServices, setFilterServices] = useState<string[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const workspaceLoaded = useRef(false);
  const catalogsLoaded = useRef(false);
  const filtersKey = JSON.stringify(input.filters);

  const load = useCallback(async () => {
    if (!input.workspaceId) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [data, workspace, projectPayload] = await Promise.all([
        taskApi.list(input.filters, { signal: abort.signal }),
        workspaceLoaded.current ? undefined : api('/api/v1/workspace', { signal: abort.signal }) as Promise<WorkspacePayload>,
        catalogsLoaded.current ? undefined : api('/api/v1/projects', { signal: abort.signal }) as Promise<{ projects: ProjectInfo[] }>,
      ]);
      if (generation.current !== current) return;
      if (workspace) { input.onWorkspace(workspace); workspaceLoaded.current = true; }
      if (projectPayload) {
        setProjectNames(Object.fromEntries(projectPayload.projects.map((project) => [project.code, project.name || project.code])));
        const entries = await Promise.all(projectPayload.projects.map(async (project) => {
          try {
            const payload = await api(`/api/v1/projects/${encodeURIComponent(project.code)}/services`, { signal: abort.signal }) as { services: ServiceInfo[] };
            return payload.services.map((service) => [`${project.code}/${service.code}`, service.name || service.code] as const);
          } catch { return [] as Array<readonly [string, string]>; }
        }));
        if (generation.current !== current) return;
        setServiceNames(Object.fromEntries(entries.flat()));
        catalogsLoaded.current = true;
      }
      setTasks([...data.tasks].sort((left, right) => rank(left.record.status) - rank(right.record.status) || right.record.updatedAt.localeCompare(left.record.updatedAt)));
      setDiagnostics(data.diagnostics);
      setTotalTaskCount(data.totalTaskCount);
      setFilterProjects(data.filterOptions.projects);
      setFilterServices(data.filterOptions.services);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || generation.current !== current) return;
      setTasks([]); setDiagnostics([]); setErrorMessage(error instanceof Error ? error.message : '读取失败');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [input.workspaceId, filtersKey, input.onWorkspace]);

  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  return { tasks, diagnostics, totalTaskCount, filterProjects, filterServices, projectNames, serviceNames, loading, errorMessage, reload: load };
}
