import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api';
import { taskApi } from '../api/task-api';
import type { TaskListRequest, TaskListResponse } from '../api/generated/task-dto';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };
type ProjectInfo = { code: string; name: string };
type ServiceInfo = { code: string; name: string; projectCode: string };

export type TaskListItem = TaskListResponse['tasks'][number];

const TASK_PAGE_SIZE = '50';

export function useTaskList(input: {
  workspaceId: string | null;
  filters: TaskListRequest;
  onWorkspace(payload: WorkspacePayload): void;
}) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [matchingTaskCount, setMatchingTaskCount] = useState(0);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterServices, setFilterServices] = useState<string[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loadMoreController = useRef<AbortController | null>(null);
  const attemptedCursors = useRef(new Set<string>());
  const workspaceLoaded = useRef(false);
  const catalogsLoaded = useRef(false);
  const filtersKey = JSON.stringify(input.filters);

  const load = useCallback(async () => {
    if (!input.workspaceId) return;
    const current = ++generation.current;
    controller.current?.abort();
    loadMoreController.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    attemptedCursors.current.clear();
    setTasks([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadingMore(false);
    setLoadMoreError(null);
    setLoading(true);
    setErrorMessage(null);
    try {
      const [data, workspace, projectPayload] = await Promise.all([
        taskApi.list({ ...input.filters, pageSize: TASK_PAGE_SIZE }, { signal: abort.signal }),
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
      setTasks(data.tasks);
      setTotalTaskCount(data.totalTaskCount);
      setMatchingTaskCount(data.matchingTaskCount);
      setFilterProjects(data.filterOptions.projects);
      setFilterServices(data.filterOptions.services);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || generation.current !== current) return;
      setTasks([]); setErrorMessage(error instanceof Error ? error.message : '读取失败');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [input.workspaceId, filtersKey, input.onWorkspace]);

  const requestMore = useCallback(async (retry = false) => {
    if (!input.workspaceId || !hasMore || !nextCursor || loading || loadingMore) return;
    if (attemptedCursors.current.has(nextCursor) && !retry) return;
    const current = generation.current;
    const cursor = nextCursor;
    attemptedCursors.current.add(cursor);
    loadMoreController.current?.abort();
    const abort = new AbortController();
    loadMoreController.current = abort;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await taskApi.list({ ...input.filters, pageSize: TASK_PAGE_SIZE, cursor }, { signal: abort.signal });
      if (generation.current !== current || cursor !== nextCursor) return;
      setTasks((currentTasks) => {
        const known = new Set(currentTasks.map((item) => item.record.taskId));
        return [...currentTasks, ...data.tasks.filter((item) => !known.has(item.record.taskId))];
      });
      setTotalTaskCount(data.totalTaskCount);
      setMatchingTaskCount(data.matchingTaskCount);
      setFilterProjects(data.filterOptions.projects);
      setFilterServices(data.filterOptions.services);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || generation.current !== current) return;
      setLoadMoreError(error instanceof Error ? error.message : '继续读取失败');
    } finally {
      if (generation.current === current) setLoadingMore(false);
    }
  }, [input.workspaceId, filtersKey, hasMore, nextCursor, loading, loadingMore]);

  const loadMore = useCallback(() => { void requestMore(false); }, [requestMore]);
  const retryLoadMore = useCallback(() => { void requestMore(true); }, [requestMore]);

  useEffect(() => {
    void load();
    return () => {
      controller.current?.abort();
      loadMoreController.current?.abort();
    };
  }, [load]);

  return {
    tasks, totalTaskCount, matchingTaskCount, filterProjects, filterServices, projectNames, serviceNames,
    loading, loadingMore, errorMessage, loadMoreError, hasMore, loadMore, retryLoadMore, reload: load,
  };
}
