import { useCallback, useEffect, useRef, useState } from 'react';
import { codexDesktopApi } from './api/codex-desktop-api';
import type { CodexConnectionsState } from './codex-connection-state';

const emptyState: CodexConnectionsState = {connections: null, loading: false, error: ''};

/** The open registry and its detail dialog share one read-only connection query. */
export function useCodexConnections(active: boolean) {
  const [state, setState] = useState<CodexConnectionsState>(emptyState);
  const enabled = useRef(active), controller = useRef<AbortController | null>(null), request = useRef(0);
  enabled.current = active;
  const read = useCallback(async (invalidatePending = false) => {
    if (!enabled.current || controller.current && !invalidatePending) return;
    if (invalidatePending) controller.current?.abort();
    const current = new AbortController(), serial = ++request.current;
    controller.current = current;
    setState(previous => ({...previous, loading: true, error: ''}));
    try {
      const result = await codexDesktopApi.connections(current.signal);
      if (!current.signal.aborted && enabled.current && request.current === serial) setState({connections: result.connections, loading: false, error: ''});
    } catch (failure) {
      if (!current.signal.aborted && enabled.current && request.current === serial) setState({connections: null, loading: false, error: failure instanceof Error ? failure.message : '无法读取桌面连接。'});
    } finally {
      if (request.current === serial) controller.current = null;
    }
  }, []);
  const refresh = useCallback(() => read(), [read]);
  const refreshAfterChange = useCallback(() => read(true), [read]);
  useEffect(() => {
    setState(emptyState);
    if (!active) return;
    void refresh();
    const observe = () => {if (document.visibilityState === 'visible') void refresh();};
    const timer = window.setInterval(observe, 4000);
    window.addEventListener('focus', observe);
    return () => {++request.current; controller.current?.abort(); controller.current = null; window.clearInterval(timer); window.removeEventListener('focus', observe);};
  }, [active, refresh]);
  return {state: active ? state : emptyState, refresh, refreshAfterChange};
}
