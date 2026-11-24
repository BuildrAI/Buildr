/** Offline entry: real UI, no real session, API or persistent preferences. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AgentConversationsViewProvider, type AgentConversationsContextValue } from '@h/features/agent-conversations/AgentConversationsContext';
import { ConversationPanel } from '@h/features/agent-conversations/ConversationPanel';
import type { AgentConversationsClient } from '@h/features/agent-conversations/api/agent-conversations-api';
import type { ConversationView } from '@h/features/agent-conversations/types';
import { ConversationHostProvider } from '@h/integration/ConversationHost';
import { HarnessShell } from '@h/shell/HarnessShell';
import { softProductTheme } from '@h/theme';
import { connectPrototype } from '@notes/feature-notes.js';
import { connectionFor, conversationFor, modelFor, workspace, type Scene } from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '@h/shared.css';
import '@h/styles.css';
import '@notes/feature-notes.css';

const noWrite = async () => { throw new Error('交互原型：此操作不会发送或修改真实对话。'); };
const noEffect = () => {};
const noRefresh = async () => {};
const counts = {pending:0, decisions:0, unread:0, running:1};
const workspaces = [workspace];
const host = {standalone:true};
function Preview() {
  const [scene, setScene] = useState<Scene>({page:'claude',state:''});
  const [observedAt] = useState(Date.now), [settings, setSettings] = useState(false);
  const [view, setView] = useState<'conversation'|'history'>('conversation');
  const {message} = App.useApp();
  const banner = () => {void message.info('原型只演示本轮主对话和子智能体，不创建或执行新会话。');};
  const sceneRef = useRef(scene); sceneRef.current = scene;
  useEffect(()=>{
    const bridge = connectPrototype({pages: scenes.pages, getSelection:()=>sceneRef.current, onSelect:(page:string,state:string)=>{
      setScene({page:page as Scene['page'],state:state as Scene['state']});
    }});
    const mark = () => {
      document.querySelector('.ac-subagent-entry')?.setAttribute('data-prototype-position','entry');
      document.querySelector('.ac-conversation-view [data-subagent-dispatch]')?.setAttribute('data-prototype-position','dispatch');
      document.querySelector('.ac-subagent-stream')?.setAttribute('data-prototype-position','flow');
      document.querySelector('.ac-subagent-overview')?.setAttribute('data-prototype-position','overview');
      document.querySelector('.ac-turn:last-child .ac-turn-subagents')?.setAttribute('data-prototype-position','summary');
    };
    const observer=new MutationObserver(mark);
    observer.observe(document.getElementById('root')!,{subtree:true,childList:true});
    mark();return ()=>{observer.disconnect();bridge.destroy();};
  },[]);
  const conversation = useMemo(()=>conversationFor(scene,observedAt),[scene,observedAt]);
  const ref = useRef(conversation);ref.current=conversation;
  const connections = useMemo(()=>[connectionFor(scene.page)],[scene.page]);
  const modelCatalog = useMemo(()=>[modelFor(scene.page)],[scene.page]);
  const api = useMemo(()=>{
    const locations = async(options?:{query?:string})=> {
      const current = ref.current;
      const conversations = !options?.query || current.title.includes(options.query) ? [current] : [];
      return {conversations,total:conversations.length,activityCounts:counts,pending:[],revision:current.revision,stats:{agents:[],models:[]}};
    };
    const methods: Partial<AgentConversationsClient> = {
      read:async()=>ref.current, listAll:locations, list:async(_id,options)=>locations(options), pending:async()=>({conversations:[]}),
      connections:async()=>({connections}), modelCatalog:async()=>({models:modelCatalog,hasSnapshot:true}),
      activitySummary: async()=>({ ...await locations() }),
      modelAccounts:async()=>({accounts:[],providers:[]}),
      entry:async(_workspaceId,_conversationId,entry)=>entry,
    };
    return new Proxy(methods,{get(target,key){return Reflect.get(target,key)??noWrite;}}) as AgentConversationsClient;
  },[connections,modelCatalog]);
  const selection = useMemo(()=>({generation:scene.page==='codex'?2:1,workspaceId:workspace.id,conversationId:conversation.id}),[scene.page,conversation.id]);
  const chooseConversation = async (_workspaceId:string, id:string) => {if(id===ref.current.id)setView('conversation');else banner();};
  const values: AgentConversationsContextValue = {
    activityCounts: counts as AgentConversationsContextValue['activityCounts'], activityStats:{agents:[],models:[]}, activityRows:[conversation], activityTotal:1, activityError:'',activityTick:1,
    historyWorkspaceId:null,openHistory:()=>{setSettings(false);setView('history');}, refreshActivity:noRefresh,loadMoreActivity:noRefresh,markSeen:noRefresh,
    api,reconnecting:false,recovering:false,open:true,side:'right',full:true,view, scope:{workspaceId:workspace.id,conversationId:conversation.id},draftScope:null,conversation,
    connections,connectionsReady:true,pending:[],modelCatalog,modelCatalogReady:true,modelCatalogError:'',refreshModelCatalog:noRefresh,
    loading:false,error:'',streamError:'',settings,setSettings,setOpen:noEffect,setFull:noEffect,setView,move:noEffect,openGlobal:()=>setView('conversation'),toggle:()=>setView('conversation'),toggleView:setView,
    openConversation:chooseConversation,newConversation:banner,refresh:noRefresh,refreshConnections:noRefresh,refreshPending:noRefresh,apply:(_value:ConversationView)=>{},prependEntries:noEffect,updateConnection:noEffect,
    selectionGeneration:selection.generation,getSelection:()=>selection,isSelectionCurrent:value=>value.generation===selection.generation&&value.conversationId===selection.conversationId,create:noWrite,
  };
  return <ConversationHostProvider host={host}><AgentConversationsViewProvider value={values}>
    <HarnessShell><main className="harness-main"><ConversationPanel workspaces={workspaces} defaultWorkspaceId={workspace.id}/></main></HarnessShell>
  </AgentConversationsViewProvider></ConversationHostProvider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><Preview/></App></ConfigProvider>);
