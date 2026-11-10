import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { api } from '../../../api';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { useCachedWorkspaceRead, useWorkspaceReadCache } from '../../../components/WorkspaceReadCache';
import {
  createServiceRuntimeClient, SERVICE_RUNTIME_CHANGED,
  type ServiceRuntimeDetail, type ServiceRuntimeOverview, type TaskRuntimeView,
} from '../api/service-runtime-api';

import { createVisiblePoller } from '../../../lib/visible-poller';
import { serviceRuntimePollMs } from '../runtime-polling';
const detailKey = (workspaceId: string | null, code: string | null, taskId?: string) => JSON.stringify([workspaceId, 'runtime-detail', code, taskId ?? null]);

function useServiceRuntimeRead<T extends { runs?: readonly { status: string }[]; service?: { runs: readonly { status: string }[] } } | null>(workspaceId: string | null, key: string, read: (client: ReturnType<typeof createServiceRuntimeClient>, signal: AbortSignal) => Promise<T>) {
  const active = useContext(WorkspaceViewActiveContext);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const state = useCachedWorkspaceRead(key, signal => read(client, signal), Boolean(workspaceId && active));
  const refresh = useCallback((options: { silent?: boolean; invalidate?: boolean } = {}) => state.refresh({ ...options, force: true }), [state.refresh]);
  const latest = useRef(state); latest.current = state;
  const polling = useRef<ReturnType<typeof createVisiblePoller> | null>(null);
  useEffect(() => { polling.current?.reschedule(); }, [state.data, state.error]);
  useEffect(() => {
    if (!active || !workspaceId) return;
    const poller = createVisiblePoller({document, window, read: () => refresh({silent:true}), interval: () => serviceRuntimePollMs(latest.current.data, latest.current.error)});
    polling.current = poller;
    const onChange = (event: Event) => { if ((event as CustomEvent<{ workspaceId?: unknown }>).detail?.workspaceId === workspaceId) void poller.request(); };
    window.addEventListener(SERVICE_RUNTIME_CHANGED, onChange);
    return () => { polling.current = null; poller.dispose(); window.removeEventListener(SERVICE_RUNTIME_CHANGED, onChange); };
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
