import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../../api';
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
  const generation = useRef(0), readController = useRef<AbortController | null>(null);
  const currentWorkspace = useRef(workspaceId);
  currentWorkspace.current = workspaceId;
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const seq = ++generation.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    try {
      const data = await client.preferences({ signal: controller.signal });
      if (controller.signal.aborted || seq !== generation.current || currentWorkspace.current !== workspaceId) return;
      setPreferences(data); setError('');
    } catch (err) {
      if (!controller.signal.aborted && seq === generation.current && currentWorkspace.current === workspaceId) {
        setError(err instanceof Error ? err.message : '个人关注信息暂时不可用');
      }
    } finally {
      if (!controller.signal.aborted && seq === generation.current && currentWorkspace.current === workspaceId) setLoading(false);
    }
  }, [client, workspaceId]);
  useEffect(() => {
    setPreferences(null); setError('');
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { ++generation.current; readController.current?.abort(); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  const set = useCallback(async (kind: PreferenceKind, key: string, input: PreferenceValue = {}) => {
    if (!workspaceId) throw new Error('请先选择工作空间');
    await client.setPreference(kind, key, input);
    if (currentWorkspace.current !== workspaceId) return;
    setRevision(value => value + 1); await refresh();
  }, [client, workspaceId, refresh]);
  const remove = useCallback(async (kind: PreferenceKind, key: string) => {
    if (!workspaceId) throw new Error('请先选择工作空间');
    await client.removePreference(kind, key);
    if (currentWorkspace.current !== workspaceId) return;
    setRevision(value => value + 1); await refresh();
  }, [client, workspaceId, refresh]);
  const recordVisit = useCallback(async (input: WorkbenchVisitRequest) => {
    if (!workspaceId) return;
    await client.visit(input);
    if (currentWorkspace.current === workspaceId) await refresh();
  }, [client, workspaceId, refresh]);
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
