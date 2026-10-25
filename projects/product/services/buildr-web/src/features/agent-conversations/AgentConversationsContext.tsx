import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agentConversationsApi, type AgentConversationsClient } from './api/agent-conversations-api';
import { applyConversationEvent, createdConversationVisibility, isCurrentConversationEvent, mergeConversationView, prependConversationEntries, sameConversationSelection, type ConversationSelection } from './conversation-state';
import { readOptionalPreference, writeOptionalPreference } from '../../lib/optional-preferences';
import type { CatalogModel, ConnectionView, ConversationView, PendingConversation } from './types';

type Scope = {workspaceId: string; conversationId: string};
type VisibilityOptions={preserveVisibility?:boolean};
type ContextValue = {
  api: AgentConversationsClient; open: boolean; side: 'left' | 'right'; full: boolean; view: 'conversation' | 'history';
  scope: Scope | null; conversation: ConversationView | null; connections: ConnectionView[]; pending: PendingConversation[];
  modelCatalog:CatalogModel[]; refreshModelCatalog():Promise<void>;
  loading: boolean; error: string; streamError: string; settings: boolean;
  setSettings(value: boolean): void; setOpen(value: boolean): void; setFull(value: boolean): void; setView(value: 'conversation' | 'history'): void; move(): void;
  openGlobal(): void; toggle(): void; openConversation(workspaceId: string, conversationId: string,options?:VisibilityOptions): Promise<void>; newConversation(options?:VisibilityOptions): void;
  refresh(): Promise<void>; refreshConnections(): Promise<void>; refreshPending(): Promise<void>; apply(value: ConversationView, observedRevision?:string): void; prependEntries(value: ConversationView): void; updateConnection(value: ConnectionView): void;
  selectionGeneration:number; getSelection():ConversationSelection; isSelectionCurrent(selection:ConversationSelection):boolean;
  create(input: {workspaceId: string; cwd: string; taskId?: string},selection?:ConversationSelection): Promise<ConversationView>;
};
const Context = createContext<ContextValue | null>(null);
type ShellValue=Pick<ContextValue,'open'|'full'|'pending'|'openGlobal'|'toggle'|'setSettings'>;
const ShellContext=createContext<ShellValue|null>(null);
const panelStateKey = () => 'buildr.agent-conversation.panel:' + (document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local');
function savedPanel(): {open: boolean; scope: Scope | null} {
  try { const parsed = JSON.parse(sessionStorage.getItem(panelStateKey()) || 'null'); return {open: parsed?.open === true, scope: typeof parsed?.scope?.workspaceId === 'string' && typeof parsed?.scope?.conversationId === 'string' ? parsed.scope : null}; } catch { return {open:false,scope:null}; }
}
function savePanel(open: boolean, scope: Scope | null) {try {sessionStorage.setItem(panelStateKey(),JSON.stringify({open,scope}));} catch { /* Input remains usable when browser storage is denied. */ }}

export function AgentConversationsProvider({children, client = agentConversationsApi}: {children: ReactNode; client?: AgentConversationsClient}) {
  const [initialPanel] = useState(savedPanel);
  const [open, setOpenState] = useState(initialPanel.open), [full, setFull] = useState(false), [view, setView] = useState<'conversation' | 'history'>('conversation');
  const visibility=useRef({open:initialPanel.open,version:0});
  const setVisibility=useCallback((value:boolean,explicit=true)=>{visibility.current={open:value,version:visibility.current.version+(explicit?1:0)};setOpenState(value);},[]);
  const [side, setSide] = useState<'left' | 'right'>(() => readOptionalPreference('buildr.agent-conversation-side') === 'left' ? 'left' : 'right');
  const [settings, setSettings] = useState(false), [scope, setScope] = useState<Scope | null>(null), [conversation, setConversation] = useState<ConversationView | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]), [pending, setPending] = useState<PendingConversation[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [streamError, setStreamError] = useState('');
  const [modelCatalog,setModelCatalog]=useState<CatalogModel[]>([]);
  const modelReadGeneration=useRef(0);
  const refreshModelCatalog=useCallback(async()=>{const generation=++modelReadGeneration.current;const result=await client.modelCatalog();if(generation===modelReadGeneration.current)setModelCatalog(result.models);},[client]);
  useEffect(()=>{void refreshModelCatalog().catch(()=>{});},[refreshModelCatalog,settings]);
  const scopeRef = useRef(scope);
  const conversationRef=useRef(conversation);conversationRef.current=conversation;
  const attentionSignature=useRef('');
  const [selectionGeneration,setSelectionGeneration]=useState(0);
  const serial = useRef(0), eventCursor = useRef<number | undefined>(undefined), [observation, setObservation] = useState(0);
  const getSelection=useCallback(()=>({generation:serial.current,scope:scopeRef.current}),[]);
  const isSelectionCurrent=useCallback((selection:ConversationSelection)=>sameConversationSelection(getSelection(),selection),[getSelection]);
  const advanceSelection=useCallback(()=>{const generation=++serial.current;setSelectionGeneration(generation);return generation;},[]);
  const apply = useCallback((next: ConversationView, observedRevision?:string) => { const current = scopeRef.current; if (current?.workspaceId === next.workspaceId && current.conversationId === next.id) { setConversation(previous => mergeConversationView(previous,next,observedRevision)); setError(''); } }, []);
  const prependEntries = useCallback((page:ConversationView) => setConversation(current => current ? prependConversationEntries(current,page) : current),[]);
  const connectionReadGeneration=useRef(0);
  const refreshConnections = useCallback(async () => {const generation=++connectionReadGeneration.current;const result=await client.connections();if(connectionReadGeneration.current===generation)setConnections(result.connections);},[client]);
  const refreshPending = useCallback(async () => { const result = await client.pending(); setPending(result.conversations); }, [client]);
  const updateConnection = useCallback((value: ConnectionView) => {++connectionReadGeneration.current;setConnections(previous=>[...previous.filter(item=>item.id!==value.id),value]);},[]);
  useEffect(() => { let active = true; const refresh = () => { void refreshModelCatalog().catch(()=>{});void refreshConnections().catch(() => {}); void refreshPending().catch(() => {}); }; refresh(); const interval = setInterval(() => {if (active && document.visibilityState === 'visible') void refreshPending().catch(() => {});}, 5000); window.addEventListener('focus', refresh); return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); }; }, [refreshConnections, refreshPending,refreshModelCatalog]);
  const openConversation = useCallback(async (workspaceId: string, conversationId: string,options:VisibilityOptions={}) => {
    const request = advanceSelection(); const nextScope = {workspaceId, conversationId}; scopeRef.current = nextScope; setScope(nextScope); setConversation(null); setView('conversation'); if(!options.preserveVisibility)setVisibility(true); setLoading(true); setError(''); setStreamError(''); eventCursor.current = undefined; savePanel(visibility.current.open,nextScope);
    try { const next = await client.read(workspaceId, conversationId); if (request === serial.current && scopeRef.current?.conversationId === conversationId && scopeRef.current.workspaceId === workspaceId) setConversation(next); } catch (failure) { if (request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取对话。'); } finally { if (request === serial.current) setLoading(false); }
  }, [client,advanceSelection,setVisibility]);
  useEffect(() => {const saved=initialPanel;if(saved.scope)void openConversation(saved.scope.workspaceId,saved.scope.conversationId,{preserveVisibility:true});},[openConversation]);
  const refresh = useCallback(async () => { const current = scopeRef.current; if (!current) return; const observed=conversationRef.current?.revision; const result = await client.read(current.workspaceId, current.conversationId); apply(result,observed); setStreamError(''); setObservation(value => value + 1); void refreshPending().catch(() => {}); }, [client, apply, refreshPending]);
  useEffect(() => {
    if (!scope || !conversation) return;
    const controller = new AbortController(); let generation: string | undefined;
    void client.subscribe(scope.workspaceId, scope.conversationId, controller.signal, event => {
      if (controller.signal.aborted) return;
      const expectedGeneration = generation;
      const previousCursor = eventCursor.current;
      if(!isCurrentConversationEvent(event,scope,expectedGeneration,previousCursor))return;
      if (event.type === 'snapshot') generation = event.generation;
      if(event.type==='connection'&&event.payload.connection)void refreshConnections().catch(()=>{});
      setConversation(current => applyConversationEvent(current, event, scope, expectedGeneration, previousCursor));
      if (!expectedGeneration || event.type === 'snapshot' || event.generation === expectedGeneration) eventCursor.current = event.cursor;
      setStreamError('');
      const snapshot=event.payload.conversation;
      if(snapshot){const signature=[snapshot.workspaceId,snapshot.id,snapshot.run?.status||'',...snapshot.requests.map(request=>request.id)].join(':');if(signature!==attentionSignature.current){attentionSignature.current=signature;void refreshPending().catch(()=>{});}}
    }, eventCursor.current).catch(failure => { if (!controller.signal.aborted) setStreamError(failure instanceof Error ? failure.message : '对话连接已中断；请重新核对执行状态。'); });
    return () => controller.abort();
    // Snapshot updates must not recreate the subscriber or lose its cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, scope?.workspaceId, scope?.conversationId, Boolean(conversation), observation, refreshPending, refreshConnections]);
  const newConversation = useCallback((options:VisibilityOptions={}) => { advanceSelection(); eventCursor.current=undefined; scopeRef.current = null; setScope(null); setConversation(null); setError(''); setStreamError(''); setView('conversation'); if(!options.preserveVisibility)setVisibility(true); setLoading(false); savePanel(visibility.current.open,null); }, [advanceSelection,setVisibility]);
  const create = useCallback(async (input: {workspaceId: string; cwd: string; taskId?: string},selection?:ConversationSelection) => {
    const observed=selection??{generation:advanceSelection(),scope:scopeRef.current};
    if(!isSelectionCurrent(observed))throw new Error('已切换对话，原创建操作已取消。');
    const observedVisibility={...visibility.current};
    let result:ConversationView;
    try{result=await client.create(input);}catch(failure){if(isSelectionCurrent(observed)){setLoading(false);setError(failure instanceof Error?failure.message:'创建对话失败。');}throw failure;}
    if(!isSelectionCurrent(observed))return result;
    setLoading(false);setError('');
    const nextOpen=createdConversationVisibility(observedVisibility,visibility.current,selection===undefined);
    eventCursor.current=undefined;scopeRef.current={workspaceId:result.workspaceId,conversationId:result.id};setScope(scopeRef.current);savePanel(nextOpen,scopeRef.current);setConversation(result);setView('conversation');setVisibility(nextOpen,false);setStreamError('');return result;
  },[client,advanceSelection,isSelectionCurrent,setVisibility]);
  const setOpen = useCallback((value: boolean) => { setVisibility(value); savePanel(value,scopeRef.current); if (!value) setFull(false); }, [setVisibility]);
  const openGlobal = useCallback(() => { if (pending.length === 1) {void openConversation(pending[0].workspaceId, pending[0].conversationId); return;} setVisibility(true); savePanel(true,scopeRef.current); if (pending.length > 1) setView('history'); }, [pending, openConversation,setVisibility]);
  const toggle=useCallback(()=>setOpen(!open),[open,setOpen]);
  const shell=useMemo(()=>({open,full,pending,openGlobal,toggle,setSettings}),[open,full,pending,openGlobal,toggle]);
  return <ShellContext.Provider value={shell}><Context.Provider value={{api:client, modelCatalog,refreshModelCatalog,open,side,full,view,scope,conversation,connections,pending,loading,error,streamError,settings,setSettings,setOpen,setFull,setView,move:() => setSide(current => { const next = current === 'right' ? 'left' : 'right'; writeOptionalPreference('buildr.agent-conversation-side',next); return next; }),openGlobal,toggle,openConversation,newConversation,refresh,refreshConnections,refreshPending,apply,prependEntries,updateConnection,create,selectionGeneration,getSelection,isSelectionCurrent}}>{children}</Context.Provider></ShellContext.Provider>;
}
export function useAgentConversations() { const value = useContext(Context); if (!value) throw new Error('AgentConversationsProvider 未提供。'); return value; }
export function useOptionalAgentConversations() { return useContext(Context); }

export function useAgentConversationShell(){const value=useContext(ShellContext);if(!value)throw new Error('AgentConversationsProvider 未提供。');return value;}
