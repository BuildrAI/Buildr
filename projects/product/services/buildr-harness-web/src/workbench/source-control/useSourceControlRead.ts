import { useCallback, useEffect, useRef, useState } from 'react';

type Loader<I, T> = (input: I, signal: AbortSignal, publish: (data: T) => void) => Promise<T>;
type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string };

/** Each observation owns cancellation, its source key and a bounded cache; an old source cannot replace the current one. */
export function useSourceControlRead<I extends object, T>(
  key: string,
  input: I,
  loader: Loader<I, T>,
  enabled: boolean,
  refreshVersion = '',
  sharedCache?: Map<string, T>,
) {
  const [state, setState] = useState<ReadState<T>>({ key: '', data: null, loading: false, error: '' });
  const internalCache = useRef(new Map<string, T>());
  const cache = sharedCache ?? internalCache.current;
  const pending = useRef<AbortController | null>(null), sequence = useRef(0);
  const current = useRef({ key, input, loader, enabled }); current.current = { key, input, loader, enabled };
  const cancel = useCallback(() => {
    ++sequence.current; pending.current?.abort(); pending.current = null;
    setState(previous => previous.loading ? {...previous, loading:false} : previous);
  }, []);
  const update = useCallback((apply: (previous: T) => T) => {
    const source = current.current, previous = cache.get(source.key);
    if (!source.enabled || !previous) return;
    ++sequence.current; pending.current?.abort(); pending.current = null;
    const data = apply(previous); cache.set(source.key, data);
    setState({key:source.key, data, loading:false, error:''});
  }, []);
  const refresh = useCallback(async (override?: Partial<I>, merge?: (previous: T | null, value: T) => T) => {
    const source = current.current;
    if (!source.enabled || !source.key) return;
    const version = ++sequence.current;
    pending.current?.abort();
    const request = new AbortController(); pending.current = request;
    const isCurrent = () => !request.signal.aborted && version === sequence.current && current.current.key === source.key && current.current.enabled;
    setState({ key: source.key, data: cache.get(source.key) ?? null, loading: true, error: '' });
    try {
      const result = await source.loader({ ...source.input, ...override }, request.signal, data => {
        if (!isCurrent()) return;
        cache.set(source.key, data);
        setState({key:source.key, data, loading:true, error:''});
      });
      if (!isCurrent()) return;
      const data = merge ? merge(cache.get(source.key) ?? null, result) : result;
      cache.delete(source.key); cache.set(source.key, data);
      while (cache.size > 12) cache.delete(cache.keys().next().value!);
      setState({ key: source.key, data, loading: false, error: '' });
    } catch (error) {
      if (isCurrent()) setState({ key: source.key, data: cache.get(source.key) ?? null, loading: false, error: error instanceof Error ? error.message : '当前内容不可读取。' });
    } finally { if (pending.current === request) pending.current = null; }
  }, []);
  useEffect(() => {
    if (enabled && key) void refresh();
    return () => { ++sequence.current; pending.current?.abort(); pending.current = null; };
  }, [key, enabled, loader, refreshVersion, refresh]);
  const visible = state.key === key ? state : null;
  return { data: visible?.data ?? cache.get(key) ?? null, loading: enabled && Boolean(key) && (!visible || visible.loading), error: visible?.error || '', refresh, update, cancel };
}
