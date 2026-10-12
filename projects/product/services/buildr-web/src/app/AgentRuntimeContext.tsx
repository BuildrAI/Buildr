import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { agentOperationsApi, type AgentRegistry, type CodexConnectRequest, type CodexConnectResult } from '../features/agents/api/agent-operations-api';
import type { ApiError } from '../api/client';

type RemovalFeedback = {removed: boolean; error: string; warning: string};
type AgentRuntimeContextValue = {
  registry: AgentRegistry | null;
  loading: boolean;
  selecting: boolean;
  connecting: boolean;
  removing: string | null;
  error: string;
  open: boolean;
  setOpen(open: boolean): void;
  refresh(): Promise<AgentRegistry | null>;
  select(agentId: string): Promise<void>;
  connectCodex(input: CodexConnectRequest): Promise<CodexConnectResult>;
  removeCodex(agentId: string): Promise<RemovalFeedback>;
};
const AgentRuntimeContext = createContext<AgentRuntimeContextValue | null>(null);
export function AgentRuntimeProvider({children}: {children: ReactNode}) {
  const [registry, setRegistry] = useState<AgentRegistry | null>(null), [loading, setLoading] = useState(false), [selecting, setSelecting] = useState(false), [removing, setRemoving] = useState<string | null>(null), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const observed = useRef(registry), mounted = useRef(false), serial = useRef(0), writing = useRef(false);
  const readRegistry = useCallback(async (foreground = false) => {
    if (writing.current) return null;
    const request = ++serial.current;
    if (foreground) setLoading(true);
    try { const result = await agentOperationsApi.list(); if (mounted.current && request === serial.current) {observed.current = result; setRegistry(result); setError(''); return result;} }
    catch (failure) { if (mounted.current && request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取智能体。'); }
    finally { if (mounted.current && request === serial.current) setLoading(false); }
    return null;
  }, []);
  const refresh = useCallback(() => readRegistry(true), [readRegistry]);
  const select = useCallback(async (agentId: string) => {
    const snapshot = observed.current;
    if (!snapshot || writing.current || snapshot.defaultAgentId === agentId) return;
    writing.current = true; ++serial.current; setSelecting(true); setError('');
    try { const result = await agentOperationsApi.select(agentId, snapshot.revision); if (mounted.current) {++serial.current; observed.current = result; setRegistry(result); setLoading(false);} }
    catch (failure) { if (mounted.current) {writing.current = false; await refresh(); if (mounted.current) setError(failure instanceof Error ? failure.message : '未能修改默认智能体。');} }
    finally { writing.current = false; if (mounted.current) setSelecting(false); }
  }, [refresh]);
  const connectCodex = useCallback(async (input: CodexConnectRequest): Promise<CodexConnectResult> => {
    if (writing.current) throw new Error('请等待当前智能体操作完成后重试。');
    const current = observed.current;
    if (!current) throw new Error('请先重新读取智能体列表。');
    if (input.existingAgentId) {
      if (!current.agents.some(agent => agent.id === input.existingAgentId && agent.kind === 'codex')) throw new Error('Codex 接入已变化，请关闭并重新检查。');
      if (input.makeDefault) throw new Error('接入维护不会更改默认智能体。');
    } else if (current.agents.some(agent => agent.kind === 'codex')) throw new Error('Codex 已接入。请在现有条目的详情中检查接入。');
    writing.current = true; ++serial.current; setConnecting(true); setError('');
    try {
      const result = await agentOperationsApi.connectCodex(input);
      if (!result?.agentId || typeof result.registry?.revision !== 'string' || !Array.isArray(result.registry.agents) || !result.registry.agents.some(agent => agent.id === result.agentId)) throw new Error('接入结果尚未确认。请刷新智能体列表核对后再决定是否重试。');
      if (mounted.current) {observed.current = result.registry; setRegistry(result.registry); setLoading(false);}
      return result;
    } catch (failure) {writing.current = false; await refresh(); throw failure;}
    finally {writing.current = false; if (mounted.current) setConnecting(false);}
  }, [refresh]);
  const removeCodex = useCallback(async (agentId: string): Promise<RemovalFeedback> => {
    const snapshot = observed.current;
    if (!snapshot || writing.current || snapshot.agents.find(agent => agent.id === agentId)?.kind !== 'codex') return {removed: false, warning: '', error: '请等待当前操作完成并重新读取 Codex 接入。'};
    writing.current = true; ++serial.current; setRemoving(agentId); setError('');
    try {
      const result = await agentOperationsApi.removeCodex(agentId, snapshot.revision);
      if (result?.removedAgentId !== agentId || typeof result.registry?.revision !== 'string' || !Array.isArray(result.registry.agents) || result.registry.agents.some(agent => agent.id === agentId)) throw new Error('无法确认移除响应。');
      if (mounted.current) {observed.current = result.registry; setRegistry(result.registry); setLoading(false);}
      return {removed: true, error: '', warning: result.desktopWarning?.message || ''};
    } catch (failure) {
      // A lost response can follow a successful removal. Reconcile the registry;
      // never issue another POST from recovery or the drawer refresh.
      writing.current = false;
      const current = await refresh();
      if (current && !current.agents.some(agent => agent.id === agentId)) return {removed: true, error: '', warning: '已重新读取并确认接入已移除；已有任务与聊天关联已保留。'};
      const knownFailure = failure instanceof Error && Boolean((failure as ApiError).code);
      return {removed: false, warning: '', error: knownFailure ? (failure as Error).message : '移除结果尚未确认。已尝试刷新智能体列表，请核对后再决定是否重试；不会自动再次发送。'};
    } finally {writing.current = false; if (mounted.current) setRemoving(null);}
  }, [refresh]);
  useEffect(() => { mounted.current = true; void readRegistry(true); return () => {mounted.current = false; ++serial.current;}; }, [readRegistry]);
  useEffect(() => {
    if (!open) return;
    void readRegistry();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !writing.current) void readRegistry(); }, 4000);
    return () => window.clearInterval(timer);
  }, [open, readRegistry]);
  useEffect(() => {const observe = () => { if (document.visibilityState === 'visible' && !writing.current) void readRegistry(); }; window.addEventListener('focus', observe); return () => window.removeEventListener('focus', observe);}, [readRegistry]);
  return <AgentRuntimeContext.Provider value={{registry, loading, selecting, connecting, removing, error, open, setOpen, refresh, select, connectCodex, removeCodex}}>{children}</AgentRuntimeContext.Provider>;
}
export function useAgentRuntime() {
  const context = useContext(AgentRuntimeContext);
  if (!context) throw new Error('AgentRuntimeProvider 未提供。');
  return context;
}
