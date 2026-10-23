import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createWorkspaceReadCache } from '../lib/workspace-read-cache';

const Context = createContext<ReturnType<typeof createWorkspaceReadCache> | null>(null);

/** The shell owns observation lifetime; changing workspace or leaving the shell clears it. */
export function WorkspaceReadCacheProvider({ children }: { children: ReactNode }) {
  const cache = useMemo(() => createWorkspaceReadCache(), []);
  useEffect(() => () => cache.dispose(), [cache]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}

export function useWorkspaceReadCache() {
  const shared = useContext(Context);
  const local = useMemo(() => shared ?? createWorkspaceReadCache(), [shared]);
  useEffect(() => () => { if (!shared) local.dispose(); }, [shared, local]);
  return local;
}

export function useCachedWorkspaceRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>, enabled: boolean, maxAge = 3000) {
  const cache = useWorkspaceReadCache();
  const [, render] = useState(0);
  const reader = useRef(read); reader.current = read;
  const refresh = useCallback(async (options: { silent?: boolean; force?: boolean; invalidate?: boolean } = {}) => {
    if (!enabled) return;
    if (options.invalidate) cache.invalidate(key);
    try { return await cache.read<T>(key, signal => reader.current(signal), options.force ? 0 : maxAge); } catch { /* The shared snapshot owns the error. */ }
  }, [cache, key, enabled, maxAge]);
  useEffect(() => cache.subscribe(key, () => render(version => version + 1)), [cache, key]);
  useEffect(() => { if (enabled) void refresh(); }, [refresh, enabled]);
  const snapshot = cache.snapshot<T>(key);
  return { ...snapshot, loading: enabled && (snapshot.loading || snapshot.data === null && !snapshot.error), refresh };
}
