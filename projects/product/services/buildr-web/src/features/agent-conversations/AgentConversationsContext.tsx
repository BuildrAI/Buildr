import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agentConversationsApi, type ConversationPage, type AgentConversationsClient } from './api/agent-conversations-api';
import { conversationObservationKey, needsConversationObservation, nextConversationPanel, createdConversationVisibility, isCurrentConversationEvent, mergeConversationView, prependConversationEntries, rememberContextReport, sameConversationSelection, type ConversationContextReport, type ConversationSelection } from './conversation-state';
import { readOptionalPreference, writeOptionalPreference } from '../../lib/optional-preferences';
import type { CatalogModel, ConnectionView, ConversationEvent, ConversationView, PendingConversation } from './types';
import { conversationProductActionSelection, recoverConversationProductAction, startConversationProductAction } from './conversation-product-action';
import { firstConversationSubmissions } from './conversation-first-submission';
import { readConversationModelPreference, readConversationModulePreference } from './conversation-preferences';

type Scope = {workspaceId: string; conversationId: string};
export type DraftScope = {workspaceId: string; taskId?: string};
type VisibilityOptions={preserveVisibility?:boolean};
export type TextConversationActionInput = {workspaceId: string; cwd: string; text: string};
export type TextConversationActionResult =
  | {status: 'started'; conversation: ConversationView}
  | {status: 'recovering'; reason: 'existing-submission' | 'submission-unknown'; conversation?: ConversationView; message: string}
  | {status: 'unavailable' | 'failed' | 'busy'; message: string};
export type AgentConversationsContextValue = {
  activityCounts:ConversationPage['activityCounts'];activityStats:ConversationPage['stats'];activityRows:ConversationView[];activityTotal:number;activityCursor?:string;activityError:string;activityTick:number;
  historyWorkspaceId:string|null|undefined;openHistory(workspaceId?:string|null):void;
  refreshActivity():Promise<void>;loadMoreActivity():Promise<void>;markSeen(value:ConversationView):Promise<void>;

  api: AgentConversationsClient; reconnecting:boolean; recovering:boolean; open: boolean; side: 'left' | 'right'; full: boolean; view: 'conversation' | 'history';
  scope: Scope | null; draftScope: DraftScope | null; conversation: ConversationView | null; connections: ConnectionView[]; pending: PendingConversation[];
  /** Latest real context-usage report retained for the open conversation; optional for isolated view providers. */
  contextReport?: ConversationContextReport | null;
  modelCatalog:CatalogModel[]; modelCatalogReady:boolean; modelCatalogError:string; refreshModelCatalog():Promise<void>;
  loading: boolean; error: string; streamError: string; settings: boolean;
  setSettings(value: boolean): void; setOpen(value: boolean): void; setFull(value: boolean): void; setView(value: 'conversation' | 'history'): void; move(): void;
  openGlobal(): void; toggle(): void; toggleView(view:'conversation'|'history'):void; openConversation(workspaceId: string, conversationId: string,options?:VisibilityOptions): Promise<void>; newConversation(options?:VisibilityOptions&{scope?:DraftScope|null}): void;
  refresh(): Promise<void>; refreshConnections(): Promise<void>; refreshPending(): Promise<void>; apply(value: ConversationView, observedRevision?:string): void; prependEntries(value: ConversationView): void; updateConnection(value: ConnectionView): void;
  selectionGeneration:number; getSelection():ConversationSelection; isSelectionCurrent(selection:ConversationSelection):boolean;
  create(input: {workspaceId: string; cwd?: string; taskId?: string},selection?:ConversationSelection): Promise<ConversationView>;
  /** 产品动作入口在纯展示宿主中可选；真实宿主复用首条提交与恢复记录。 */
  productActionPending?: boolean; productActionError?: string;
  firstSubmissionStore?: ReturnType<typeof firstConversationSubmissions>;
  startTextConversation?(input: TextConversationActionInput): Promise<TextConversationActionResult>;
};
const Context = createContext<AgentConversationsContextValue | null>(null);
type ShellValue=Pick<AgentConversationsContextValue,'open'|'view'|'full'|'pending'|'openGlobal'|'toggle'|'toggleView'|'setSettings'>;
const ShellContext=createContext<ShellValue|null>(null);

/** A pure view binding allows isolated callers to supply data and operations without host initialization. */
export function AgentConversationsViewProvider({value,children}:{value:AgentConversationsContextValue;children:ReactNode}) {
  return <ShellContext.Provider value={value}><Context.Provider value={value}>{children}</Context.Provider></ShellContext.Provider>;
}
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
  const [settings, setSettings] = useState(false), [scope, setScope] = useState<Scope | null>(null), [draftScope, setDraftScope] = useState<DraftScope | null>(null), [conversation, setConversation] = useState<ConversationView | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]), [pending, setPending] = useState<PendingConversation[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [streamError, setStreamError] = useState('');
  const [reconnecting,setReconnecting]=useState(false),[recovering,setRecovering]=useState(false);
  const [productActionPending,setProductActionPending]=useState(false),[productActionError,setProductActionError]=useState('');
  const productActionBusy=useRef(false);
  const [firstSubmissionStore]=useState(()=>{
    const profile=document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
    try{return firstConversationSubmissions(sessionStorage,'buildr.conversation-first:'+profile);}catch{return firstConversationSubmissions();}
  });
  const [activityCounts,setActivityCounts]=useState<ConversationPage['activityCounts']>();
  const [activityStats,setActivityStats]=useState<ConversationPage['stats']>();
  const [activityRows,setActivityRows]=useState<ConversationView[]>([]),[activityTotal,setActivityTotal]=useState(0),[activityCursor,setActivityCursor]=useState<string>(),[activityError,setActivityError]=useState(''),[activityTick,setActivityTick]=useState(0),[historyWorkspaceId,setHistoryWorkspaceId]=useState<string|null|undefined>(undefined);
  const activityGeneration=useRef(0),activitySignature=useRef('');
  const refreshActivity=useCallback(async()=>{if(!client.listAll)return;const generation=++activityGeneration.current;try{const result=await client.listAll({activeOnly:true,limit:100});if(generation!==activityGeneration.current)return;const signature=JSON.stringify([result.nextCursor,result.conversations.map(row=>[row.workspaceId,row.id,row.revision,row.title,row.run?.id,row.run?.status,row.run?.model,row.activity])]);if(signature!==activitySignature.current){setActivityRows(result.conversations);setActivityCursor(result.nextCursor);}setActivityCounts(result.activityCounts);setActivityStats(result.stats);setActivityTotal(result.total??result.conversations.length);setActivityError('');if(signature!==activitySignature.current){activitySignature.current=signature;setActivityTick(value=>value+1);}}catch(error){if(generation===activityGeneration.current)setActivityError(error instanceof Error?error.message:'活动对话尚未更新，保留上次结果。');}},[client]);
  const loadMoreActivity=useCallback(async()=>{if(!activityCursor)return;const generation=activityGeneration.current;try{const result=await client.listAll({activeOnly:true,limit:100,cursor:activityCursor});if(generation!==activityGeneration.current)return;setActivityRows(previous=>[...previous,...result.conversations.filter(row=>!previous.some(item=>item.id===row.id&&item.workspaceId===row.workspaceId))]);setActivityCursor(result.nextCursor);}catch{await refreshActivity();}},[client,activityCursor,refreshActivity]);
  const [modelCatalog,setModelCatalog]=useState<CatalogModel[]>([]);
  const [modelCatalogReady,setModelCatalogReady]=useState(false),[modelCatalogError,setModelCatalogError]=useState('');
  const modelReadGeneration=useRef(0);
  const refreshModelCatalog=useCallback(async()=>{
    const generation=++modelReadGeneration.current;
    try{const result=await client.modelCatalog();if(generation===modelReadGeneration.current){setModelCatalog(result.models);setModelCatalogReady(result.hasSnapshot??true);setModelCatalogError(result.diagnostic||'');}}
    catch(error){if(generation===modelReadGeneration.current)setModelCatalogError('模型列表读取失败，已保留已有结果。');throw error;}
  },[client]);
  useEffect(()=>{
    if(!open&&!settings)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refreshModelCatalog().catch(()=>{});},5000);
    return()=>clearInterval(timer);
  },[open,settings,refreshModelCatalog]);
  const previousSettings=useRef(settings);
  useEffect(()=>{if(previousSettings.current===settings)return;previousSettings.current=settings;void refreshModelCatalog().catch(()=>{});},[refreshModelCatalog,settings]);
  const scopeRef = useRef(scope);
  const conversationRef=useRef(conversation);conversationRef.current=conversation;
  const [contextReport,setContextReport]=useState<ConversationContextReport|null>(null);
  useEffect(()=>{setContextReport(current=>rememberContextReport(current,conversation));},[conversation]);
  const attentionSignature=useRef('');
  const [selectionGeneration,setSelectionGeneration]=useState(0);
  const serial = useRef(0), eventCursor = useRef<number | undefined>(undefined), [observation, setObservation] = useState(0);
  const getSelection=useCallback(()=>({generation:serial.current,scope:scopeRef.current}),[]);
  const isSelectionCurrent=useCallback((selection:ConversationSelection)=>sameConversationSelection(getSelection(),selection),[getSelection]);
  const advanceSelection=useCallback(()=>{const generation=++serial.current;setSelectionGeneration(generation);return generation;},[]);
  const apply = useCallback((next: ConversationView, observedRevision?:string) => { const current = scopeRef.current; if (current?.workspaceId === next.workspaceId && current.conversationId === next.id) {
    // Keep the observed fact synchronous: a stream can end in the same tick as
    // its completion event, before React commits the corresponding render.
    const merged=mergeConversationView(conversationRef.current,next,observedRevision);
    conversationRef.current=merged;setConversation(merged);setError('');
  } }, []);
  const prependEntries = useCallback((page:ConversationView) => {
    if(!conversationRef.current)return;
    const next=prependConversationEntries(conversationRef.current,page);
    conversationRef.current=next;setConversation(next);
  },[]);
  const connectionReadGeneration=useRef(0);
  const refreshConnections = useCallback(async () => {const generation=++connectionReadGeneration.current;const result=await client.connections();if(connectionReadGeneration.current===generation)setConnections(result.connections);},[client]);
  const refreshPending = useCallback(async () => { void refreshActivity(); const result = await client.pending(); setPending(result.conversations); }, [client,refreshActivity]);
  const updateConnection = useCallback((value: ConnectionView) => {++connectionReadGeneration.current;setConnections(previous=>previous.some(item=>item.id===value.id)?previous.map(item=>item.id===value.id?value:item):[...previous,value]);},[]);
  useEffect(() => { let active = true; const refresh = () => { void refreshModelCatalog().catch(()=>{});void refreshConnections().catch(() => {}); void refreshPending().catch(() => {}); }; refresh(); const interval = setInterval(() => {if (active && document.visibilityState === 'visible') void refreshPending().catch(() => {});}, 5000); window.addEventListener('focus', refresh); return () => { active = false; ++activityGeneration.current; clearInterval(interval); window.removeEventListener('focus', refresh); }; }, [refreshConnections, refreshPending,refreshModelCatalog]);
  const openConversation = useCallback(async (workspaceId: string, conversationId: string,options:VisibilityOptions={}) => {
    const request = advanceSelection(); const nextScope = {workspaceId, conversationId}; scopeRef.current = nextScope; setScope(nextScope); setDraftScope(null); conversationRef.current=null; setConversation(null); setView('conversation'); if(!options.preserveVisibility)setVisibility(true); setLoading(true); setError(''); setStreamError(''); eventCursor.current = undefined; savePanel(visibility.current.open,nextScope);
    try { const next = await client.read(workspaceId, conversationId); if (request === serial.current && scopeRef.current?.conversationId === conversationId && scopeRef.current.workspaceId === workspaceId) apply(next); } catch (failure) { if (request === serial.current) setError(failure instanceof Error ? failure.message : '无法读取对话。'); } finally { if (request === serial.current) setLoading(false); }
  }, [client,advanceSelection,setVisibility,apply]);
  useEffect(() => {const saved=initialPanel;if(saved.scope)void openConversation(saved.scope.workspaceId,saved.scope.conversationId,{preserveVisibility:true});},[openConversation]);
  const refresh = useCallback(async () => { const current = scopeRef.current; if (!current) return; const selection=getSelection(),observed=conversationRef.current?.revision; const result = await client.read(current.workspaceId, current.conversationId); if(!isSelectionCurrent(selection))return; apply(result,observed); setStreamError(''); setObservation(value => value + 1); void refreshPending().catch(() => {}); }, [client, apply, refreshPending,getSelection,isSelectionCurrent]);
  // Reuse global activity discovery instead of polling a finished run. List rows
  // are only a change signal; reread the authoritative conversation by identity.
  useEffect(()=>{
    const before=conversationRef.current;
    if(!before||needsConversationObservation(before)&&!streamError)return;
    const changed=activityRows.find(row=>row.id===before.id&&row.workspaceId===before.workspaceId);
    // A completed, already-seen run can disappear from the active list without
    // another message. Absence is only a reason to reread, never proof of ending.
    if(changed?changed.revision===before.revision:!streamError)return;
    const selection=getSelection(),controller=new AbortController();
    void client.read(before.workspaceId,before.id,controller.signal).then(next=>{
      if(!controller.signal.aborted&&isSelectionCurrent(selection))apply(next,before.revision);
    }).catch(()=>{ /* A global refresh will retry discovery; do not alarm an ended run. */ });
    return()=>controller.abort();
  },[activityRows,streamError,client,apply,getSelection,isSelectionCurrent]);
  useEffect(()=>{
    const readCurrent=()=>{
      const before=conversationRef.current;if(!before)return;
      const selection=getSelection();
      void client.read(before.workspaceId,before.id).then(next=>{if(isSelectionCurrent(selection))apply(next,before.revision);}).catch(()=>{});
    };
    window.addEventListener('focus',readCurrent);return()=>window.removeEventListener('focus',readCurrent);
  },[client,apply,getSelection,isSelectionCurrent]);
  const observationKey=conversationObservationKey(conversation);
  const previousObservationKey=useRef<string|null>(null);
  useEffect(() => {
    setStreamError('');setReconnecting(false);
    if(previousObservationKey.current!==observationKey)eventCursor.current=undefined;
    previousObservationKey.current=observationKey;
    if (!scope || !observationKey) return;
    const selection=getSelection();
    const controller = new AbortController(); let generation: string | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined, failures = 0;
    const current=()=>!controller.signal.aborted&&isSelectionCurrent(selection)&&conversationObservationKey(conversationRef.current)===observationKey;
    const finish=()=>{controller.abort();if(retryTimer)clearTimeout(retryTimer);setStreamError('');setReconnecting(false);};
    const reconcile=async()=>{
      const observed=conversationRef.current?.revision;
      try{
        const next=await client.read(scope.workspaceId,scope.conversationId,controller.signal);
        if(!current())return false;
        apply(next,observed);
        if(!needsConversationObservation(conversationRef.current)){finish();return false;}
      }catch{ /* The subscription may recover even when this read failed. */ }
      return current();
    };
    const handle = (event: ConversationEvent) => {
      if (!current()) return;
      const expectedGeneration = generation;
      const previousCursor = eventCursor.current;
      if(!isCurrentConversationEvent(event,scope,expectedGeneration,previousCursor))return;
      if (event.type === 'snapshot') generation = event.generation;
      if(event.type==='connection'&&event.payload.connection)void refreshConnections().catch(()=>{});
      const next=event.payload.conversation;
      if(next&&next.id===scope.conversationId&&next.workspaceId===scope.workspaceId)apply(next);
      if (!expectedGeneration || event.type === 'snapshot' || event.generation === expectedGeneration) eventCursor.current = event.cursor;
      setStreamError('');
      // Only live changes prove the subscription healthy; a lone snapshot on a
      // connection that closes again must not loop the silent retry.
      if (event.type !== 'snapshot') failures = 0;
      setReconnecting(false);
      const snapshot=event.payload.conversation;
      if(snapshot){const signature=[snapshot.workspaceId,snapshot.id,snapshot.run?.status||'',...snapshot.requests.map(request=>request.id)].join(':');if(signature!==attentionSignature.current){attentionSignature.current=signature;void refreshPending().catch(()=>{});}}
      if(!needsConversationObservation(conversationRef.current))finish();
    };
    // Every dropped connection first reconciles current facts. A missed final
    // event must not cause retries or an alarm after the run actually ended.
    const connect = async (retry=false): Promise<void> => {
      if(!current())return;
      if(retry&&!await reconcile())return;
      generation = undefined;
      try { await client.subscribe(scope.workspaceId, scope.conversationId, controller.signal, handle, eventCursor.current); }
      catch (failure) {
        if (!current()) return;
        if (failures<5) {const delay=Math.min(5000,500*2**failures++);setReconnecting(true);retryTimer=setTimeout(()=>{void connect(true);},delay);return;}
        if(!await reconcile())return;
        setReconnecting(false);
        setStreamError(failure instanceof Error ? failure.message : '暂时无法同步最新进展；已保留收到的消息，请重新连接。');
      }
    };
    void connect();
    return () => { controller.abort(); if (retryTimer) clearTimeout(retryTimer);setReconnecting(false); };
    // Ordinary snapshot changes must not recreate the subscriber or lose its cursor.
  }, [client, scope?.workspaceId, scope?.conversationId, observationKey, observation, refreshPending, refreshConnections,apply,getSelection,isSelectionCurrent]);
  useEffect(()=>{
    if(!scope||conversation?.run?.status!=='unknown')return;
    const selection=getSelection(),key=conversationObservationKey(conversation);
    let active=true,attempts=0,timer:ReturnType<typeof setTimeout>|undefined;setRecovering(true);
    const current=()=>active&&isSelectionCurrent(selection)&&conversationObservationKey(conversationRef.current)===key;
    const recover=async()=>{
      try{const before=conversationRef.current;if(!before||!current())return;const result=await client.observe(before);if(!current())return;apply(result,before.revision);if(result.run?.status!=='unknown'){setRecovering(false);return;}}
      catch(failure){if(!current())return;if(attempts>=2)setStreamError(failure instanceof Error?failure.message:'原执行状态仍未确认。');}
      if(!current())return;if(++attempts<3)timer=setTimeout(()=>{void recover();},1500*attempts);else setRecovering(false);
    };
    void recover();return()=>{active=false;if(timer)clearTimeout(timer);setRecovering(false);};
  },[client,scope?.workspaceId,scope?.conversationId,conversation?.run?.id,conversation?.run?.generation,conversation?.run?.participantId,conversation?.run?.status,apply,getSelection,isSelectionCurrent]);
  const newConversation = useCallback((options:VisibilityOptions&{scope?:DraftScope|null}={}) => { advanceSelection(); eventCursor.current=undefined; scopeRef.current = null; setScope(null); setDraftScope(options.scope??null); conversationRef.current=null; setConversation(null); setError(''); setStreamError(''); setView('conversation'); if(!options.preserveVisibility)setVisibility(true); setLoading(false); savePanel(visibility.current.open,null); }, [advanceSelection,setVisibility]);
  const startTextConversation = useCallback(async (input: TextConversationActionInput): Promise<TextConversationActionResult> => {
    if(productActionBusy.current)return {status:'busy',message:'已有一项操作正在提交，请先等待原操作完成。'};
    productActionBusy.current=true;setProductActionPending(true);setProductActionError('');
    try{
      const originalSubmission=firstSubmissionStore.read();
      let result=await recoverConversationProductAction(client,firstSubmissionStore);
      if(!result){
        const connectionGeneration=++connectionReadGeneration.current,modelGeneration=++modelReadGeneration.current;
        const [connectionResult,catalogResult]=await Promise.all([client.connections(),client.modelCatalog()]);
        if(connectionGeneration===connectionReadGeneration.current)setConnections(connectionResult.connections);
        if(modelGeneration===modelReadGeneration.current){setModelCatalog(catalogResult.models);setModelCatalogReady(catalogResult.hasSnapshot??true);setModelCatalogError(catalogResult.diagnostic||'');}
        const selection=conversationProductActionSelection(input.workspaceId,readConversationModulePreference(),readConversationModelPreference(),connectionResult.connections,catalogResult.models);
        if(!selection){
          const message='当前没有已启用并就绪的智能体，或所选执行权限不受支持。';
          setProductActionError(message);return {status:'unavailable',message};
        }
        result=await startConversationProductAction({client,input,selection,submissions:firstSubmissionStore});
      }
      if(result.status==='started'){
        await openConversation(result.conversation.workspaceId,result.conversation.id);
        return result;
      }
      const message=result.reason==='existing-submission'
        ?'还有一条首次提交需要核对，已恢复原提交；核对完成后再发起新操作。'
        :'本次提交结果待核对，已保留原提交，不会自动重复发送。';
      setProductActionError(message);
      if(result.conversation)await openConversation(result.conversation.workspaceId,result.conversation.id);
      else newConversation({scope:{workspaceId:originalSubmission?.workspaceId??input.workspaceId}});
      return {...result,message};
    }catch(failure){
      const message=failure instanceof Error?failure.message:'操作提交失败，尚未确认执行。';
      setProductActionError(message);return {status:'failed',message};
    }finally{productActionBusy.current=false;setProductActionPending(false);}
  },[client,newConversation,openConversation,firstSubmissionStore]);
  const create = useCallback(async (input: {workspaceId: string; cwd?: string; taskId?: string},selection?:ConversationSelection) => {
    const observed=selection??{generation:advanceSelection(),scope:scopeRef.current};
    if(!isSelectionCurrent(observed))throw new Error('已切换对话，原创建操作已取消。');
    const observedVisibility={...visibility.current};
    let result:ConversationView;
    try{result=await client.create(input);}catch(failure){if(isSelectionCurrent(observed)){setLoading(false);setError(failure instanceof Error?failure.message:'创建对话失败。');}throw failure;}
    if(!isSelectionCurrent(observed))return result;
    setLoading(false);setError('');
    const nextOpen=createdConversationVisibility(observedVisibility,visibility.current,selection===undefined);
    eventCursor.current=undefined;scopeRef.current={workspaceId:result.workspaceId,conversationId:result.id};setScope(scopeRef.current);setDraftScope(null);savePanel(nextOpen,scopeRef.current);conversationRef.current=result;setConversation(result);setView('conversation');setVisibility(nextOpen,false);setStreamError('');return result;
  },[client,advanceSelection,isSelectionCurrent,setVisibility]);
  const setOpen = useCallback((value: boolean) => { setVisibility(value); savePanel(value,scopeRef.current); if (!value) setFull(false); }, [setVisibility]);
  const openHistory=useCallback((workspaceId:string|null=null)=>{setHistoryWorkspaceId(workspaceId);setView('history');setVisibility(true);savePanel(true,scopeRef.current);},[setVisibility]);
  const openGlobal=useCallback(()=>openHistory(null),[openHistory]);
  const seenInFlight=useRef(new Set<string>());
  const markSeen=useCallback(async(value:ConversationView)=>{
    const version=value.activity?.version;if(version===undefined||version<=(value.activity?.seenThrough??0)||!client.seen)return;
    const key=value.workspaceId+':'+value.id+':'+version;if(seenInFlight.current.has(key))return;seenInFlight.current.add(key);
    try{
      const result=await client.seen(value,version),previous=conversationRef.current;
      if(previous?.id===value.id&&previous.workspaceId===value.workspaceId){
        const next={...previous,activity:previous.activity&&previous.activity.version>result.activity.version?{...previous.activity,seenThrough:Math.max(previous.activity.seenThrough,result.activity.seenThrough)}:result.activity};
        conversationRef.current=next;setConversation(next);
      }
      await refreshActivity();
    }catch(error){setActivityError(error instanceof Error?error.message:'查看状态尚未保存。');}finally{seenInFlight.current.delete(key);}
  },[client,refreshActivity]);
  const toggleView=useCallback((target:'conversation'|'history')=>{const next=nextConversationPanel(open,view,target);if(target==='history'&&next.open)setHistoryWorkspaceId(null);setView(next.view);setOpen(next.open);},[open,view,setOpen]);
  const toggle=useCallback(()=>setOpen(!open),[open,setOpen]);
  const shell=useMemo(()=>({open,view,full,pending,openGlobal,toggle,toggleView,setSettings}),[open,view,full,pending,openGlobal,toggle,toggleView]);
  return <ShellContext.Provider value={shell}><Context.Provider value={{activityCounts,activityStats,activityRows,activityTotal,activityCursor,activityError,activityTick,historyWorkspaceId,openHistory,refreshActivity,loadMoreActivity,markSeen,api:client,reconnecting,recovering, modelCatalog,modelCatalogReady,modelCatalogError,refreshModelCatalog,open,side,full,view,scope,draftScope,conversation,contextReport,connections,pending,loading,error,streamError,settings,setSettings,setOpen,setFull,setView,move:() => setSide(current => { const next = current === 'right' ? 'left' : 'right'; writeOptionalPreference('buildr.agent-conversation-side',next); return next; }),openGlobal,toggle,toggleView,openConversation,newConversation,refresh,refreshConnections,refreshPending,apply,prependEntries,updateConnection,create,selectionGeneration,getSelection,isSelectionCurrent,productActionPending,productActionError,firstSubmissionStore,startTextConversation}}>{children}</Context.Provider></ShellContext.Provider>;
}
export function useAgentConversations() { const value = useContext(Context); if (!value) throw new Error('AgentConversationsProvider 未提供。'); return value; }
export function useOptionalAgentConversations() { return useContext(Context); }

export function useAgentConversationShell(){const value=useContext(ShellContext);if(!value)throw new Error('AgentConversationsProvider 未提供。');return value;}
