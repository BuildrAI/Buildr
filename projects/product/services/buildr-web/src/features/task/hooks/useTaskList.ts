import { workspaceApi, type WorkspaceResponse } from '../../workspace/api/workspace-api';
import { type ProjectResponse, projectApi } from '../../project/api/project-api';
import { serviceApi } from '../../service/api/service-api';
import { useCallback, useEffect, useRef, useState } from 'react';


import { taskApi } from '../api/task-api';
import type { TaskListRequest, TaskListResponse } from '../../../../build/generated/task-dto';

export type { WorkspaceResponse } from '../../workspace/api/workspace-api';

export type TaskListItem = TaskListResponse['tasks'][number];

const TASK_PAGE_SIZE = '50';

export function useTaskList(input: {
  workspaceId: string | null;
  filters: TaskListRequest;
  onWorkspace(payload: WorkspaceResponse): void;
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
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const loadedScope = useRef('');
  const visibleCount = useRef(0);
  visibleCount.current = tasks.length;
  const loadMoreController = useRef<AbortController | null>(null);
  const attemptedCursors = useRef(new Set<string>());
  const workspaceLoaded = useRef(false);
  const catalogsLoaded = useRef(false);
  const catalogWorkspace = useRef(input.workspaceId);
  const filtersKey = JSON.stringify(input.filters);
  const scopeKey = JSON.stringify([input.workspaceId, filtersKey]);

  const load = useCallback((): Promise<void> => {
    if (!input.workspaceId) return Promise.resolve();
    if (pending.current?.scope === scopeKey) return pending.current.promise;
    const promise = (async () => {
      const current = ++generation.current;
      controller.current?.abort();
      loadMoreController.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      attemptedCursors.current.clear();
      const retainedCount = loadedScope.current === scopeKey ? visibleCount.current : 0;
      if (loadedScope.current !== scopeKey) {
        setTasks([]);
        setHasMore(false);
        setNextCursor(null);
      }
      if (catalogWorkspace.current !== input.workspaceId) {
        catalogWorkspace.current = input.workspaceId;
        workspaceLoaded.current = false;
        catalogsLoaded.current = false;
        setProjectNames({}); setServiceNames({});
      }
      setLoadingMore(false);
      setLoadMoreError(null);
      setLoading(true);
      setErrorMessage(null);
      try {
        const [data, workspace, projectPayload] = await Promise.all([
          taskApi.list({ ...input.filters, pageSize: TASK_PAGE_SIZE }, { signal: abort.signal }),
          workspaceLoaded.current ? undefined : workspaceApi.read({ signal: abort.signal }),
          catalogsLoaded.current ? undefined : projectApi.listProjects({ signal: abort.signal }),
        ]);
        if (abort.signal.aborted || generation.current !== current) return;
        // Refresh the visible window without sending a larger, unsupported page size.
        let lastPage = data;
        const refreshed = new Map(data.tasks.map(item => [item.record.taskId, item]));
        const cursors = new Set<string>();
        while (refreshed.size < retainedCount && lastPage.hasMore && lastPage.nextCursor && !cursors.has(lastPage.nextCursor)) {
          cursors.add(lastPage.nextCursor);
          lastPage = await taskApi.list({ ...input.filters, pageSize: TASK_PAGE_SIZE, cursor: lastPage.nextCursor }, { signal: abort.signal });
          if (abort.signal.aborted || generation.current !== current) return;
          lastPage.tasks.forEach(item => refreshed.set(item.record.taskId, item));
        }
        if (workspace) { input.onWorkspace(workspace); workspaceLoaded.current = true; }
        if (projectPayload) {
          const projects: NonNullable<ProjectResponse['projects']> = projectPayload.projects || [];
          setProjectNames(Object.fromEntries(projects.map((project) => [project.code, project.name || project.code])));
          const entries = await Promise.all(projects.map(async (project) => {
            try {
              const payload = await serviceApi.services(project.code, { signal: abort.signal });
              return (payload.services || []).map((service) => [`${project.code}/${service.code}`, service.name || service.code] as const);
            } catch { return [] as Array<readonly [string, string]>; }
          }));
          if (abort.signal.aborted || generation.current !== current) return;
          setServiceNames(Object.fromEntries(entries.flat()));
          catalogsLoaded.current = true;
        }
        loadedScope.current = scopeKey;
        setTasks([...refreshed.values()]);
        setRevision(value => value + 1);
        setTotalTaskCount(data.totalTaskCount);
        setMatchingTaskCount(data.matchingTaskCount);
        if (data.filterOptions) {
          setFilterProjects(data.filterOptions.projects);
          setFilterServices(data.filterOptions.services);
        }
        setHasMore(lastPage.hasMore);
        setNextCursor(lastPage.nextCursor);
      } catch (error) {
        if (abort.signal.aborted || (error as Error).name === 'AbortError' || generation.current !== current) return;
        setErrorMessage(error instanceof Error ? error.message : '读取失败');
      } finally {
        if (generation.current === current) setLoading(false);
      }
    })();
    pending.current = { scope: scopeKey, promise };
    void promise.finally(() => { if (pending.current?.promise === promise) pending.current = null; });
    return promise;
  }, [input.workspaceId, filtersKey, scopeKey, input.onWorkspace]);

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
      if (data.filterOptions) {
        setFilterProjects(data.filterOptions.projects);
        setFilterServices(data.filterOptions.services);
      }
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
      ++generation.current;
      pending.current = null;
      controller.current?.abort();
      loadMoreController.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return {
    tasks, totalTaskCount, matchingTaskCount, filterProjects, filterServices, projectNames, serviceNames,
    loading, loadingMore, errorMessage, loadMoreError, hasMore, loadMore, retryLoadMore, reload: load, revision,
  };
}
