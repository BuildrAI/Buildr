import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { agentOperationsApi, type AgentRegistry } from '../features/agents/api/agent-operations-api';

type AgentRuntimeContextValue = {
  registry: AgentRegistry | null;
  loading: boolean;
  selecting: boolean;
  error: string;
  open: boolean;
  setOpen(open: boolean): void;
  refresh(): Promise<void>;
  select(agentId: string): Promise<void>;
};
const AgentRuntimeContext = createContext<AgentRuntimeContextValue | null>(null);
export function AgentRuntimeProvider({children}: {children: ReactNode}) {
  const [registry, setRegistry] = useState<AgentRegistry | null>(null), [loading, setLoading] = useState(false), [selecting, setSelecting] = useState(false), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const observed = useRef(registry), mounted = useRef(false), serial = useRef(0), writing = useRef(false);
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const request = ++serial.current;
    setLoading(true);
    try { const result = await agentOperationsApi.list(); if (mounted.current && request === serial.current) {observed.current = result; setRegistry(result); setError('');} }
    catch (failure) { if (mounted.current && request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取智能体。'); }
    finally { if (mounted.current && request === serial.current) setLoading(false); }
  }, []);
  const select = useCallback(async (agentId: string) => {
    const snapshot = observed.current;
    if (!snapshot || writing.current || snapshot.defaultAgentId === agentId) return;
    writing.current = true; ++serial.current; setSelecting(true); setError('');
    try { const result = await agentOperationsApi.select(agentId, snapshot.revision); if (mounted.current) {++serial.current; observed.current = result; setRegistry(result); setLoading(false);} }
    catch (failure) { if (mounted.current) {writing.current = false; await refresh(); if (mounted.current) setError(failure instanceof Error ? failure.message : '未能修改默认智能体。');} }
    finally { writing.current = false; if (mounted.current) setSelecting(false); }
  }, [refresh]);
  useEffect(() => { mounted.current = true; void refresh(); return () => {mounted.current = false; ++serial.current;}; }, [refresh]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !writing.current) void refresh(); }, 4000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);
  useEffect(() => {const observe = () => { if (document.visibilityState === 'visible' && !writing.current) void refresh(); }; window.addEventListener('focus', observe); return () => window.removeEventListener('focus', observe);}, [refresh]);
  return <AgentRuntimeContext.Provider value={{registry, loading, selecting, error, open, setOpen, refresh, select}}>{children}</AgentRuntimeContext.Provider>;
}
export function useAgentRuntime() {
  const context = useContext(AgentRuntimeContext);
  if (!context) throw new Error('AgentRuntimeProvider 未提供。');
  return context;
}
