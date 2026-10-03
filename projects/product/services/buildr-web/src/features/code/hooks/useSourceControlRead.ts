import { useCallback, useEffect, useRef, useState } from 'react';

type Loader<I, T> = (input: I, signal: AbortSignal) => Promise<T>;
type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string };

/** Each observation owns cancellation, its source key and a bounded cache; an old source cannot replace the current one. */
export function useSourceControlRead<I extends object, T>(key: string, input: I, loader: Loader<I, T>, enabled: boolean, refreshVersion = '') {
  const [state, setState] = useState<ReadState<T>>({ key: '', data: null, loading: false, error: '' });
  const cache = useRef(new Map<string, T>());
  const pending = useRef<AbortController | null>(null), sequence = useRef(0);
  const current = useRef({ key, input, loader, enabled }); current.current = { key, input, loader, enabled };
  const refresh = useCallback(async (override?: Partial<I>, merge?: (previous: T | null, value: T) => T) => {
    const source = current.current;
    if (!source.enabled || !source.key) return;
    const version = ++sequence.current;
    pending.current?.abort();
    const request = new AbortController(); pending.current = request;
    const isCurrent = () => !request.signal.aborted && version === sequence.current && current.current.key === source.key && current.current.enabled;
    setState({ key: source.key, data: cache.current.get(source.key) ?? null, loading: true, error: '' });
    try {
      const result = await source.loader({ ...source.input, ...override }, request.signal);
      if (!isCurrent()) return;
      const data = merge ? merge(cache.current.get(source.key) ?? null, result) : result;
      cache.current.delete(source.key); cache.current.set(source.key, data);
      while (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value!);
      setState({ key: source.key, data, loading: false, error: '' });
    } catch (error) {
      if (isCurrent()) setState({ key: source.key, data: cache.current.get(source.key) ?? null, loading: false, error: error instanceof Error ? error.message : '当前内容不可读取。' });
    } finally { if (pending.current === request) pending.current = null; }
  }, []);
  useEffect(() => {
    if (enabled && key) void refresh();
    return () => { ++sequence.current; pending.current?.abort(); pending.current = null; };
  }, [key, enabled, loader, refreshVersion, refresh]);
  const visible = state.key === key ? state : null;
  return { data: visible?.data ?? cache.current.get(key) ?? null, loading: enabled && Boolean(key) && (!visible || visible.loading), error: visible?.error || '', refresh };
}
