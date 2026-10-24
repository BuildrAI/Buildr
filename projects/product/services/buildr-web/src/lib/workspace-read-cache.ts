type Snapshot<T> = { data: T | null; loading: boolean; error: string; readAt: number };
type Entry = { snapshot: Snapshot<unknown>; pending?: Promise<unknown>; controller?: AbortController; listeners: Set<() => void> };

/** Short-lived observations only. Writes still validate against the server's current version. */
export function createWorkspaceReadCache(now = Date.now) {
  const entries = new Map<string, Entry>();
  const entry = (key: string) => {
    let value = entries.get(key);
    if (!value) {
      value = { snapshot: { data: null, loading: false, error: '', readAt: 0 }, listeners: new Set() };
      entries.set(key, value);
      for (const [oldKey, old] of entries) {
        if (entries.size <= 64) break;
        if (!old.pending && !old.listeners.size && oldKey !== key) entries.delete(oldKey);
      }
    }
    return value;
  };
  const publish = (value: Entry, snapshot: Snapshot<unknown>) => {
    value.snapshot = snapshot;
    for (const listener of value.listeners) listener();
  };
  return {
    snapshot<T>(key: string): Snapshot<T> { return entry(key).snapshot as Snapshot<T>; },
    subscribe(key: string, listener: () => void) {
      const value = entry(key); value.listeners.add(listener);
      return () => { value.listeners.delete(listener); };
    },
    invalidate(key: string) {
      const value = entry(key); value.controller?.abort(); value.pending = undefined; value.controller = undefined;
      publish(value, { ...value.snapshot, loading: false, readAt: 0 });
    },
    read<T>(key: string, load: (signal: AbortSignal) => Promise<T>, maxAge = 0, silent = false): Promise<T> {
      const value = entry(key);
      if (value.pending) return value.pending as Promise<T>;
      if (value.snapshot.data !== null && now() - value.snapshot.readAt < maxAge) return Promise.resolve(value.snapshot.data as T);
      const controller = new AbortController(); value.controller = controller;
      const pending = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return load(controller.signal); }).then(data => {
        if (!controller.signal.aborted) publish(value, { data, loading: false, error: '', readAt: now() });
        return data;
      }, cause => {
        if (!controller.signal.aborted) publish(value, { ...value.snapshot, loading: false, error: cause instanceof Error ? cause.message : '当前内容暂不可读取' });
        throw cause;
      }).finally(() => { if (value.pending === pending) { value.pending = undefined; value.controller = undefined; } });
      value.pending = pending;
      // 静默轮询已有观察时不公告 loading，避免挂载条件把已展示内容短暂卸下。
      if (!(silent && value.snapshot.data !== null)) publish(value, { ...value.snapshot, loading: true, error: '' });
      return pending;
    },
    dispose() { for (const value of entries.values()) { value.controller?.abort(); value.listeners.clear(); } entries.clear(); },
  };
}
export type WorkspaceReadCache = ReturnType<typeof createWorkspaceReadCache>;
