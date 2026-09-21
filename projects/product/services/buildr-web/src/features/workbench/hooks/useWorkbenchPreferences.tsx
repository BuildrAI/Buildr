import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../../api';
import { createPreferenceWriteQueue } from './preferenceWriteQueue';
import {
  createWorkbenchClient, type PreferenceKind, type WorkbenchPreferencesResponse, type WorkbenchVisitRequest,
} from '../api/workbench-api';

type PreferenceValue = { label?: string; href?: string };
type Preferences = {
  workspaceId: string | null;
  preferences: WorkbenchPreferencesResponse | null;
  data: WorkbenchPreferencesResponse | null;
  loading: boolean;
  error: string;
  revision: number;
  refresh(): Promise<void>;
  has(kind: PreferenceKind, key: string): boolean;
  set(kind: PreferenceKind, key: string, input?: PreferenceValue): Promise<void>;
  remove(kind: PreferenceKind, key: string): Promise<void>;
  recordVisit(input: WorkbenchVisitRequest): Promise<void>;
};
const Context = createContext<Preferences | null>(null);

/** A workspace-scoped React cache; persisted preferences remain application-owned. */
export function WorkbenchPreferencesProvider({ workspaceId, children }: { workspaceId: string | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState<WorkbenchPreferencesResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const client = useMemo(() => createWorkbenchClient(api, workspaceId || undefined), [workspaceId]);
  const writes = useMemo(() => createPreferenceWriteQueue(), [client]);
  const currentClient = useRef(client);
  currentClient.current = client;
  const generation = useRef(0), readController = useRef<AbortController | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback((): Promise<void> => {
    if (!workspaceId) return Promise.resolve();
    if (writes.pending) return writes.settled();
    if (pending.current) return pending.current;
    const promise = (async () => {
      const seq = ++generation.current;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      setLoading(true);
      try {
        const data = await client.preferences({ signal: controller.signal });
        if (controller.signal.aborted || seq !== generation.current || currentClient.current !== client) return;
        setPreferences(data); setError('');
      } catch (err) {
        if (!controller.signal.aborted && seq === generation.current && currentClient.current === client) {
          setError(err instanceof Error ? err.message : '个人关注信息暂时不可用');
        }
      } finally {
        if (!controller.signal.aborted && seq === generation.current && currentClient.current === client) setLoading(false);
      }
    })();
    pending.current = promise;
    void promise.finally(() => { if (pending.current === promise) pending.current = null; });
    return promise;
  }, [client, workspaceId, writes]);
  useEffect(() => {
    setPreferences(null); setError('');
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      ++generation.current; pending.current = null; readController.current?.abort();
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);
  const mutate = useCallback((operation: () => Promise<WorkbenchPreferencesResponse>, notify: boolean) => writes.run(async () => {
    if (currentClient.current === client) {
      ++generation.current;
      readController.current?.abort();
      pending.current = null;
    }
    try {
      const data = await operation();
      if (currentClient.current !== client) return;
      setPreferences(data); setError('');
      if (notify) setRevision(value => value + 1);
    } finally {
      if (currentClient.current === client) setLoading(false);
    }
  }), [client, writes]);
  const set = useCallback(async (kind: PreferenceKind, key: string, input: PreferenceValue = {}) => {
    if (!workspaceId) throw new Error('请先选择工作空间');
    await mutate(() => client.setPreference(kind, key, input), true);
  }, [client, workspaceId, mutate]);
  const remove = useCallback(async (kind: PreferenceKind, key: string) => {
    if (!workspaceId) throw new Error('请先选择工作空间');
    await mutate(() => client.removePreference(kind, key), true);
  }, [client, workspaceId, mutate]);
  const recordVisit = useCallback(async (input: WorkbenchVisitRequest) => {
    if (!workspaceId) return;
    await mutate(() => client.visit(input), false);
  }, [client, workspaceId, mutate]);
  const value = useMemo<Preferences>(() => ({
    workspaceId, preferences, data: preferences, loading, error, revision, refresh,
    has: (kind, key) => Boolean(preferences?.items.some(item => item.kind === kind && item.key === key)),
    set, remove, recordVisit,
  }), [workspaceId, preferences, loading, error, revision, refresh, set, remove, recordVisit]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkbenchPreferences(workspaceId?: string | null): Preferences {
  const value = useContext(Context);
  if (!value) throw new Error('WorkbenchPreferencesProvider 未提供');
  if (workspaceId && value.workspaceId !== workspaceId) throw new Error('工作空间关注范围不一致');
  return value;
}
