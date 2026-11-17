import {createContext,useContext,useState,useRef,useCallback,type ReactNode} from 'react';
import {readOptionalPreference,writeOptionalPreference} from '../../lib/optional-preferences';
import {agentConversationsApi} from './api/agent-conversations-api';
import type {CatalogModel,ConversationView} from './types';
export type TextConversationActionInput={workspaceId:string;cwd:string;text:string};
export type TextConversationActionResult={status:'started';conversation:ConversationView}|{status:'recovering';reason:'existing-submission'|'submission-unknown';conversation?:ConversationView;message:string}|{status:'unavailable'|'failed'|'busy';message:string};
export type FrameCommand={action:'new'|'open'|'history'|'settings'|'configure'|'start-text';workspaceId?:string;conversationId?:string;taskId?:string;workspaces?:{id:string;name:string;rootPath:string}[];input?:TextConversationActionInput;requestId?:string};
type PanelView = 'conversation' | 'history';
type PanelState = { open: boolean; full: boolean; view: PanelView };
type SessionPanelState = { open?: boolean; full?: boolean; view?: PanelView };

const PANEL_OPEN_KEY = 'buildr.harness-panel-open';
const PANEL_FULL_KEY = 'buildr.harness-panel-full';
const PANEL_VIEW_KEY = 'buildr.harness-panel-view';

const panelProfile = () => (typeof document === 'undefined' ? 'local' : document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local');
const panelSessionStateKey = () => `buildr.harness-panel-session:${panelProfile()}`;

function readSessionPanelState(): SessionPanelState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(panelSessionStateKey()) || 'null');
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      ...(typeof parsed.open === 'boolean' ? { open: parsed.open } : {}),
      ...(typeof parsed.full === 'boolean' ? { full: parsed.full } : {}),
      ...(parsed.view === 'conversation' || parsed.view === 'history' ? { view: parsed.view } : {}),
    };
  } catch {
    return {};
  }
}

function writeSessionPanelState(state: PanelState): void {
  try {
    sessionStorage.setItem(panelSessionStateKey(), JSON.stringify(state));
  } catch { /* In-memory state stays intact if sessionStorage is unavailable. */ }
}

function readInitialPanelState(): PanelState {
  const session = readSessionPanelState();
  const profile = panelProfile();
  const openRaw = readOptionalPreference(PANEL_OPEN_KEY);
  const fullRaw = readOptionalPreference(PANEL_FULL_KEY);
  const viewRaw = readOptionalPreference(PANEL_VIEW_KEY);
  const catalogEntry = window.location.pathname === '/' && new URLSearchParams(window.location.search).get('catalog') === '1';
  const conversationEntry = window.location.pathname === '/' && !catalogEntry;
  const legacyFull = readOptionalPreference(`buildr.agent-conversation.full:${profile}`);
  const explicitOpen = session.open ?? (openRaw === 'true' ? true : openRaw === 'false' ? false : undefined);
  const rawFull = session.full ?? (fullRaw === 'true' ? true : fullRaw === 'false' ? false : legacyFull === null ? conversationEntry : legacyFull === 'true');
  const full = !catalogEntry && explicitOpen !== false && rawFull;
  const open = explicitOpen ?? full;
  const candidateView: PanelView = session.view ?? (viewRaw === 'history' || (viewRaw === null && readOptionalPreference(`buildr.agent-conversation.focus-history:${profile}`) === 'true') ? 'history' : 'conversation');
  return { open, full, view: open && full && candidateView === 'history' ? 'history' : 'conversation' };
}

function useIntegration(){
 const initialPanel=useRef<PanelState|null>(null);
 if(!initialPanel.current)initialPanel.current=readInitialPanelState();
 const [open,setOpenState]=useState(initialPanel.current.open);
 const [full,setFullState]=useState(initialPanel.current.full);
 const [view,setViewState]=useState<PanelView>(initialPanel.current.view);
 const openRef=useRef(open);
 const fullRef=useRef(full);
 const viewRef=useRef<PanelView>(view);
 const persistPanel=useCallback((next:PanelState)=>{
  writeOptionalPreference(PANEL_OPEN_KEY,String(next.open));
  writeOptionalPreference(PANEL_FULL_KEY,String(next.full));
  writeOptionalPreference(PANEL_VIEW_KEY,next.view);
  writeSessionPanelState(next);
 },[]);
 const setView=useCallback((value:PanelView|((current:PanelView)=>PanelView))=>{
  const resolved=typeof value==='function'?value(viewRef.current):value;
  const next:PanelView=openRef.current&&fullRef.current&&resolved==='history'?'history':'conversation';
  viewRef.current=next;
  setViewState(next);
  persistPanel({open:openRef.current,full:fullRef.current,view:next});
 },[persistPanel]);
 const setFull=useCallback((value:boolean|((current:boolean)=>boolean))=>{
  const nextFull=typeof value==='function'?value(fullRef.current):value;
  const nextOpen=nextFull?true:openRef.current;
  const nextView:PanelView=nextFull&&nextOpen?viewRef.current:'conversation';
  openRef.current=nextOpen;
  fullRef.current=nextFull;
  viewRef.current=nextView;
  setOpenState(nextOpen);
  setFullState(nextFull);
  setViewState(nextView);
  persistPanel({open:nextOpen,full:nextFull,view:nextView});
 },[persistPanel]);
 const setOpen=useCallback((value:boolean|((current:boolean)=>boolean))=>{
  const nextOpen=typeof value==='function'?value(openRef.current):value;
  const nextFull=nextOpen?fullRef.current:false;
  const nextView:PanelView=nextOpen&&nextFull?viewRef.current:'conversation';
  openRef.current=nextOpen;
  fullRef.current=nextFull;
  viewRef.current=nextView;
  setOpenState(nextOpen);
  setFullState(nextFull);
  setViewState(nextView);
  persistPanel({open:nextOpen,full:nextFull,view:nextView});
 },[persistPanel]);
 const [settings,setSettingsState]=useState(false);
 const [conversation,setConversation]=useState<ConversationView|null>(null),[command,setCommand]=useState<FrameCommand|null>(null),[sequence,setSequence]=useState(0);
 const [modelCatalog,setModelCatalog]=useState<CatalogModel[]>([]),[modelCatalogReady,setModelCatalogReady]=useState(false),[modelCatalogError,setModelCatalogError]=useState('');
 const pending=useRef(new Map<string,{resolve:(result:TextConversationActionResult)=>void;timer:ReturnType<typeof setTimeout>}>());
 const issue=useCallback((value:FrameCommand)=>{setCommand(value);setSequence(value=>value+1);setOpen(true);},[setOpen]);
 const refreshModelCatalog=useCallback(async()=>{try{const result=await agentConversationsApi.modelCatalog();setModelCatalog(result.models);setModelCatalogReady(result.hasSnapshot??true);setModelCatalogError(result.diagnostic??'');}catch(error){setModelCatalogError(error instanceof Error?error.message:'模型读取失败。');}},[]);
 const openConversation=useCallback(async(workspaceId:string,conversationId:string,_options?:unknown)=>{if(!fullRef.current)setView('conversation');issue({action:'open',workspaceId,conversationId});},[issue,setView]);
 const newConversation=useCallback((options?:{scope?:{workspaceId:string;taskId?:string}|null})=>{if(!fullRef.current)setView('conversation');setOpen(true);if(options?.scope?.workspaceId)issue({action:'new',...options.scope});else issue({action:'new'});},[issue,setOpen,setView]);
 const startTextConversation=useCallback((input:TextConversationActionInput)=>new Promise<TextConversationActionResult>(resolve=>{
   if(pending.current.size){resolve({status:'busy',message:'原工程操作尚未确认，请勿重复提交。'});return;}
   const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pending.current.delete(requestId);resolve({status:'recovering',reason:'submission-unknown',message:'Harness 的处理结果尚未确认，请到原对话核对，不要重复提交。'});},60000);pending.current.set(requestId,{resolve,timer});issue({action:'start-text',input,requestId});
 }),[issue]);
 const reply=useCallback((id:string,result:TextConversationActionResult)=>{const request=pending.current.get(id);if(!request)return;clearTimeout(request.timer);pending.current.delete(id);request.resolve(result);},[]);
 const apply=useCallback((value:ConversationView,_revision?:string)=>setConversation(current=>current?.id===value.id&&current.workspaceId===value.workspaceId?value:current),[]);
 const openHistory=useCallback((_workspaceId?:string|null)=>{setView('history');issue({action:'history'});},[issue,setView]);
 return {side:'right' as 'left'|'right',connections:[] as {provider:string;label?:string}[],locateParticipation:async(workspaceId:string,conversationId:string,_runId:string)=>openConversation(workspaceId,conversationId),api:agentConversationsApi,open,setOpen,full,setFull,view,setView,settings,setSettings:(value:boolean)=>{setSettingsState(value);if(value)issue({action:'settings'});},conversation,setConversation,scope:conversation?{workspaceId:conversation.workspaceId,conversationId:conversation.id}:null,command,sequence,issue,reply,newConversation,openConversation,openHistory,openGlobal:()=>{setOpen(true);},toggle:()=>setOpen(value=>!value),toggleView:(next:'conversation'|'history')=>{if(next==='history')openHistory();else{setView(next);setOpen(value=>!value);}},apply,modelCatalog,modelCatalogReady,modelCatalogError,refreshModelCatalog,startTextConversation};
}
export type AgentConversationsContextValue=ReturnType<typeof useIntegration>;
const Context=createContext<AgentConversationsContextValue|null>(null);
export function AgentConversationsProvider({children}:{children:ReactNode}){const value=useIntegration();return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useOptionalAgentConversations(){return useContext(Context);}
export function useAgentConversations(){const value=useOptionalAgentConversations();if(!value)throw new Error('Development Harness integration is not mounted');return value;}
export const useAgentConversationShell=useAgentConversations;
