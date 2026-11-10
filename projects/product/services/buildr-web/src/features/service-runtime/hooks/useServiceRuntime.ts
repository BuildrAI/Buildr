import { useCallback, useContext, useEffect, useMemo } from 'react';
import { api } from '../../../api';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { useCachedWorkspaceRead, useWorkspaceReadCache } from '../../../components/WorkspaceReadCache';
import {
  createServiceRuntimeClient, SERVICE_RUNTIME_CHANGED,
  type ServiceRuntimeDetail, type ServiceRuntimeOverview, type TaskRuntimeView,
} from '../api/service-runtime-api';

const POLL_INTERVAL_MS = 5000;
const detailKey = (workspaceId: string | null, code: string | null, taskId?: string) => JSON.stringify([workspaceId, 'runtime-detail', code, taskId ?? null]);

function useServiceRuntimeRead<T>(workspaceId: string | null, key: string, read: (client: ReturnType<typeof createServiceRuntimeClient>, signal: AbortSignal) => Promise<T>) {
  const active = useContext(WorkspaceViewActiveContext);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const state = useCachedWorkspaceRead(key, signal => read(client, signal), Boolean(workspaceId && active));
  const refresh = useCallback((options: { silent?: boolean; invalidate?: boolean } = {}) => state.refresh({ ...options, force: true }), [state.refresh]);
  useEffect(() => {
    if (!active || !workspaceId) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh({ silent: true }); };
    const onChange = (event: Event) => { if ((event as CustomEvent<{ workspaceId?: unknown }>).detail?.workspaceId === workspaceId) void refresh({ silent: true }); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(SERVICE_RUNTIME_CHANGED, onChange);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh({ silent: true }); }, POLL_INTERVAL_MS);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener(SERVICE_RUNTIME_CHANGED, onChange); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh, active, workspaceId]);
  return { ...state, refresh, active };
}

export function useServiceRuntimeOverview(workspaceId: string | null) {
  return useServiceRuntimeRead<ServiceRuntimeOverview>(workspaceId, JSON.stringify([workspaceId, 'runtime-overview']), (client, signal) => client.overview({ signal }));
}

export function useServiceRuntimeDetail(workspaceId: string | null, serviceCode: string | null, taskId?: string) {
  return useServiceRuntimeRead<ServiceRuntimeDetail | null>(
    workspaceId && serviceCode ? workspaceId : null, detailKey(workspaceId, serviceCode, taskId),
    (client, signal) => serviceCode ? client.detail(serviceCode, { signal, ...(taskId ? { taskId } : { standalone: true }) }) : Promise.resolve(null),
  );
}

/** Hover/focus and the actual opening share one in-flight read and one observed source. */
export function usePrepareServiceStart(workspaceId: string | null) {
  const cache = useWorkspaceReadCache();
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  return useCallback((code: string) => cache.read(detailKey(workspaceId, code), signal => client.detail(code, { signal, standalone: true }), 3000), [cache, workspaceId, client]);
}

export function useTaskRuntime(workspaceId: string | null, taskId: string) {
  return useServiceRuntimeRead<TaskRuntimeView>(workspaceId, JSON.stringify([workspaceId, 'runtime-task', taskId]), (client, signal) => client.task(taskId, { signal }));
}
