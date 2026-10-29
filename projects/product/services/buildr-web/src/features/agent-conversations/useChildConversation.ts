import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AgentConversationsContextValue} from './AgentConversationsContext';
import {conversationObservationKey,isCurrentConversationEvent,mergeConversationView,needsConversationObservation,prependConversationEntries,type ConversationSelection} from './conversation-state';
import type {ConversationView} from './types';

/** Fixed data binding; only explicit navigation may ask the host to open another conversation. */
export function useChildConversation(host:AgentConversationsContextValue,summary:ConversationView,visible:boolean,onClose:()=>void,onUpdate:(chat:ConversationView)=>void):AgentConversationsContextValue {
  const {api}=host;
  const scope=useMemo(()=>({workspaceId:summary.workspaceId,conversationId:summary.id}),[summary.workspaceId,summary.id]);
  const selection=useMemo<ConversationSelection>(()=>({generation:0,scope}),[scope]);
  const [chat,setChat]=useState<ConversationView|null>(null),current=useRef(chat);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[streamError,setStreamError]=useState('');
  const [reconnecting,setReconnecting]=useState(false);
  const mounted=useRef(true),visibleRef=useRef(visible);visibleRef.current=visible;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const apply=useCallback((value:ConversationView,observedRevision?:string)=>{
    if(!mounted.current||value.id!==scope.conversationId||value.workspaceId!==scope.workspaceId)return;
    current.current=mergeConversationView(current.current,value,observedRevision);
    setChat(current.current);setError('');
  },[scope]);
  const refresh=useCallback(async()=>{
    const observed=current.current?.revision;
    const value=await api.read(scope.workspaceId,scope.conversationId);
    apply(value,observed);setStreamError('');
  },[api,scope,apply]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    void api.read(scope.workspaceId,scope.conversationId,controller.signal).then(value=>{if(!controller.signal.aborted)apply(value);})
      .catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'子对话读取失败。');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[api,scope,apply]);
  useEffect(()=>{if(chat)onUpdate(chat);},[chat,onUpdate]);
  useEffect(()=>{
    if(!current.current||summary.revision===current.current.revision||needsConversationObservation(current.current))return;
    void refresh().catch(()=>{});
  },[summary.revision,refresh]);
  const observationKey=conversationObservationKey(chat);
  useEffect(()=>{
    if(!observationKey)return;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined,generation:string|undefined,cursor:number|undefined;
    const connect=async()=>{
      generation=undefined;
      try{
        await api.subscribe(scope.workspaceId,scope.conversationId,controller.signal,event=>{
          if(controller.signal.aborted||!isCurrentConversationEvent(event,scope,generation,cursor))return;
          if(event.type==='snapshot')generation=event.generation;
          cursor=event.cursor;
          if(event.payload.conversation)apply(event.payload.conversation);
          setReconnecting(false);setStreamError('');
          if(!needsConversationObservation(current.current))controller.abort();
        },cursor);
      }catch(failure){
        if(controller.signal.aborted)return;
        setReconnecting(true);
        setStreamError(failure instanceof Error?failure.message:'子对话连接中断，正在核对。');
        try{await refresh();}catch{/* Preserve the last facts, never resend work. */}
        if(controller.signal.aborted||!needsConversationObservation(current.current))return;
        timer=setTimeout(()=>void connect(),1500);
      }
    };
    void connect();
    return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[observationKey,api,scope,apply,refresh]);
  const markSeen=useCallback(async(value:ConversationView)=>{
    const version=value.activity?.version;
    if(version===undefined||version<=(value.activity?.seenThrough??0))return;
    const result=await api.seen(value,version);
    if(current.current?.id===value.id){
      const next={...current.current,activity:{...current.current.activity!,seenThrough:result.activity.seenThrough}};
      current.current=next;setChat(next);
    }
    void host.refreshPending().catch(()=>{});
  },[api,host.refreshPending]);
  useEffect(()=>{if(visible&&chat?.activity&&chat.activity.version>chat.activity.seenThrough)void markSeen(chat).catch(()=>{});},[visible,chat?.activity?.version,markSeen]);
  return {...host,scope,conversation:chat,draftScope:null,view:'conversation',full:false,side:'right',open:visible,
    loading,error,streamError,reconnecting,recovering:false,contextReport:undefined,selectionGeneration:0,
    productActionPending:false,productActionError:undefined,
    getSelection:useCallback(()=>selection,[selection]),
    isSelectionCurrent:useCallback(value=>mounted.current&&value.generation===0&&value.scope?.workspaceId===scope.workspaceId&&value.scope?.conversationId===scope.conversationId,[scope]),
    apply,refresh,markSeen,prependEntries:useCallback(page=>{if(current.current){current.current=prependConversationEntries(current.current,page);setChat(current.current);}},[]),
    setOpen:value=>{if(!value)onClose();},toggle:onClose,toggleView:onClose,setView:()=>{},setFull:()=>{},move:()=>{},newConversation:()=>{},
    create:async()=>{throw new Error('请从主对话创建子对话。');},
    openConversation:useCallback(async(workspaceId,conversationId,options)=>{
      if(mounted.current&&visibleRef.current)await host.openConversation(workspaceId,conversationId,options);
    },[host.openConversation]),
  };
}
