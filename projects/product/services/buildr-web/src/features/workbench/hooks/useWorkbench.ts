import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api';
import { createWorkbenchClient, type WorkbenchResponse } from '../api/workbench-api';
import { useWorkbenchPreferences } from './useWorkbenchPreferences';

export function useWorkbench(workspaceId: string | null, project: string, date = '') {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const client = useMemo(() => createWorkbenchClient(api, workspaceId || undefined), [workspaceId]);
  const { revision } = useWorkbenchPreferences(workspaceId);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const pending = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const scopeKey = JSON.stringify([workspaceId, project, date]);
  const requestKey = JSON.stringify([scopeKey, revision]);
  const loadedScope = useRef('');
  const refresh = useCallback((): Promise<void> => {
    if (!workspaceId) return Promise.resolve();
    if (pending.current?.scope === requestKey) return pending.current.promise;
    const promise = (async () => {
      controller.current?.abort();
      const abort = new AbortController(); controller.current = abort;
      const seq = ++generation.current;
      setLoading(true); setError('');
      try {
        const next = await client.overview({ ...(project ? { project } : {}), ...(date ? { date } : {}) }, { signal: abort.signal });
        if (!abort.signal.aborted && seq === generation.current) { loadedScope.current = scopeKey; setData(next); }
      } catch (err) {
        if (!abort.signal.aborted && seq === generation.current) setError(err instanceof Error ? err.message : '工作概览暂时不可用');
      } finally {
        if (!abort.signal.aborted && seq === generation.current) setLoading(false);
      }
    })();
    pending.current = { scope: requestKey, promise };
    void promise.finally(() => { if (pending.current?.promise === promise) pending.current = null; });
    return promise;
  }, [workspaceId, client, project, date, scopeKey, requestKey]);
  useEffect(() => {
    if (loadedScope.current !== scopeKey) setData(null);
    void refresh();
    return () => { ++generation.current; pending.current = null; controller.current?.abort(); };
  }, [refresh, scopeKey]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);
  return { data: loadedScope.current === scopeKey ? data : null, loading, error, refresh };
}
