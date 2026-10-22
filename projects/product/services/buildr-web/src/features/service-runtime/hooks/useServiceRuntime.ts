import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import {
  createServiceRuntimeClient,
  SERVICE_RUNTIME_CHANGED,
  type ServiceRuntimeDetail,
  type ServiceRuntimeOverview,
  type TaskRuntimeView,
} from '../api/service-runtime-api';

const POLL_INTERVAL_MS = 5000;

function useServiceRuntimeRead<T>(workspaceId: string | null, scope: string, read: (client: ReturnType<typeof createServiceRuntimeClient>, signal: AbortSignal) => Promise<T>) {
  const active = useContext(WorkspaceViewActiveContext);
  const identity = JSON.stringify([workspaceId, scope]);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loadedScope = useRef('');
  const reader = useRef(read);
  reader.current = read;

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!workspaceId) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sequence = ++generation.current;
    if (!options.silent) setLoading(true);
    setError('');
    try {
      const next = await reader.current(client, abort.signal);
      if (!abort.signal.aborted && sequence === generation.current) {
        loadedScope.current = identity;
        setData(next);
      }
    } catch (cause) {
      if (abort.signal.aborted || sequence !== generation.current || (cause as Error).name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : '服务运行状态暂时不可用');
    } finally {
      if (!abort.signal.aborted && sequence === generation.current && !options.silent) setLoading(false);
    }
  }, [client, workspaceId, identity]);

  useEffect(() => {
    if (loadedScope.current !== identity) setData(null);
    if (active) void refresh();
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [refresh, identity, active]);

  useEffect(() => {
    if (!active) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh({ silent: true }); };
    const onChange = (event: Event) => { if ((event as CustomEvent<{ workspaceId?: unknown }>).detail?.workspaceId === workspaceId) void refresh({ silent: true }); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(SERVICE_RUNTIME_CHANGED, onChange);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener(SERVICE_RUNTIME_CHANGED, onChange); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh, active, workspaceId]);

  return { data: loadedScope.current === identity ? data : null, loading, error, refresh, active };
}

export function useServiceRuntimeOverview(workspaceId: string | null) {
  const state = useServiceRuntimeRead<ServiceRuntimeOverview>(workspaceId, 'overview', (client, signal) => client.overview({ signal }));
  const { refresh, active } = state;
  // 视图激活期间持续轮询，后台启动、外部操作与失败变化都能在页面自动反映。
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);
  return state;
}

export function useServiceRuntimeDetail(workspaceId: string | null, serviceCode: string | null, taskId?: string) {
  const state = useServiceRuntimeRead<ServiceRuntimeDetail | null>(
    workspaceId && serviceCode ? workspaceId : null,
    JSON.stringify([serviceCode, taskId ?? null]),
    (client, signal) => (serviceCode ? client.detail(serviceCode, { signal, ...(taskId ? { taskId } : {}) }) : Promise.resolve(null)),
  );
  const { refresh, active } = state;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);
  return state;
}

export function useTaskRuntime(workspaceId: string | null, taskId: string) {
  const state = useServiceRuntimeRead<TaskRuntimeView>(workspaceId, `task:${taskId}`, (client, signal) => client.task(taskId, { signal }));
  const { refresh, active } = state;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);
  return state;
}
