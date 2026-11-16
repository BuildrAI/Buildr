import {createContext,useContext,useState,useRef,useCallback,type ReactNode} from 'react';
import {readOptionalPreference,writeOptionalPreference} from '../../lib/optional-preferences';
import {agentConversationsApi} from './api/agent-conversations-api';
import type {CatalogModel,ConversationView} from './types';
export type TextConversationActionInput={workspaceId:string;cwd:string;text:string};
export type TextConversationActionResult={status:'started';conversation:ConversationView}|{status:'recovering';reason:'existing-submission'|'submission-unknown';conversation?:ConversationView;message:string}|{status:'unavailable'|'failed'|'busy';message:string};
export type FrameCommand={action:'new'|'open'|'history'|'settings'|'configure'|'start-text';workspaceId?:string;conversationId?:string;taskId?:string;workspaces?:{id:string;name:string;rootPath:string}[];input?:TextConversationActionInput;requestId?:string};
function useIntegration(){
 const [open,setOpenState]=useState(()=>readOptionalPreference('buildr.harness-panel-open')==='true');
 const setOpen=useCallback((value:boolean|((current:boolean)=>boolean))=>setOpenState(current=>{const next=typeof value==='function'?value(current):value;writeOptionalPreference('buildr.harness-panel-open',String(next));return next;}),[]);
 const [full,setFull]=useState(false),[view,setView]=useState<'conversation'|'history'>('conversation'),[settings,setSettingsState]=useState(false);
 const [conversation,setConversation]=useState<ConversationView|null>(null),[command,setCommand]=useState<FrameCommand|null>(null),[sequence,setSequence]=useState(0);
 const [modelCatalog,setModelCatalog]=useState<CatalogModel[]>([]),[modelCatalogReady,setModelCatalogReady]=useState(false),[modelCatalogError,setModelCatalogError]=useState('');
 const pending=useRef(new Map<string,{resolve:(result:TextConversationActionResult)=>void;timer:ReturnType<typeof setTimeout>}>());
 const issue=useCallback((value:FrameCommand)=>{setCommand(value);setSequence(value=>value+1);setOpen(true);},[]);
 const refreshModelCatalog=useCallback(async()=>{try{const result=await agentConversationsApi.modelCatalog();setModelCatalog(result.models);setModelCatalogReady(result.hasSnapshot??true);setModelCatalogError(result.diagnostic??'');}catch(error){setModelCatalogError(error instanceof Error?error.message:'模型读取失败。');}},[]);
 const openConversation=useCallback(async(workspaceId:string,conversationId:string,_options?:unknown)=>{setView('conversation');issue({action:'open',workspaceId,conversationId});},[issue]);
 const newConversation=useCallback((options?:{scope?:{workspaceId:string;taskId?:string}|null})=>{setView('conversation');setOpen(true);if(options?.scope?.workspaceId)issue({action:'new',...options.scope});else issue({action:'new'});},[issue]);
 const startTextConversation=useCallback((input:TextConversationActionInput)=>new Promise<TextConversationActionResult>(resolve=>{
   if(pending.current.size){resolve({status:'busy',message:'原工程操作尚未确认，请勿重复提交。'});return;}
   const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pending.current.delete(requestId);resolve({status:'recovering',reason:'submission-unknown',message:'Harness 的处理结果尚未确认，请到原对话核对，不要重复提交。'});},60000);pending.current.set(requestId,{resolve,timer});issue({action:'start-text',input,requestId});
 }),[issue]);
 const reply=useCallback((id:string,result:TextConversationActionResult)=>{const request=pending.current.get(id);if(!request)return;clearTimeout(request.timer);pending.current.delete(id);request.resolve(result);},[]);
 const apply=useCallback((value:ConversationView,_revision?:string)=>setConversation(current=>current?.id===value.id&&current.workspaceId===value.workspaceId?value:current),[]);
 const openHistory=useCallback((_workspaceId?:string|null)=>{setView('history');issue({action:'history'});},[issue]);
 return {side:'right' as 'left'|'right',connections:[] as {provider:string;label?:string}[],locateParticipation:async(workspaceId:string,conversationId:string,_runId:string)=>openConversation(workspaceId,conversationId),api:agentConversationsApi,open,setOpen,full,setFull,view,setView,settings,setSettings:(value:boolean)=>{setSettingsState(value);if(value)issue({action:'settings'});},conversation,setConversation,scope:conversation?{workspaceId:conversation.workspaceId,conversationId:conversation.id}:null,command,sequence,issue,reply,newConversation,openConversation,openHistory,openGlobal:()=>{setOpen(true);},toggle:()=>setOpen(value=>!value),toggleView:(next:'conversation'|'history')=>{if(next==='history')openHistory();else{setView(next);setOpen(value=>!value);}},apply,modelCatalog,modelCatalogReady,modelCatalogError,refreshModelCatalog,startTextConversation};
}
export type AgentConversationsContextValue=ReturnType<typeof useIntegration>;
const Context=createContext<AgentConversationsContextValue|null>(null);
export function AgentConversationsProvider({children}:{children:ReactNode}){const value=useIntegration();return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useOptionalAgentConversations(){return useContext(Context);}
export function useAgentConversations(){const value=useOptionalAgentConversations();if(!value)throw new Error('Development Harness integration is not mounted');return value;}
export const useAgentConversationShell=useAgentConversations;
