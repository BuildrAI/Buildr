import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { ConversationExecutionStats, type ExecutionFilter } from './ConversationExecutionStats';
import type { ConversationPage } from './api/agent-conversations-api';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityEntry, type ActivityPopupControl } from './ConversationActivityEntry';
import { activityState, conversationMetadata } from './conversation-activity';
import type { ConversationWorkspace } from './ConversationHistory';

export function ConversationActivity({workspaces,...popup}:{workspaces:ConversationWorkspace[]}&ActivityPopupControl) {
  const context=useAgentConversations();
  const [filter,setFilter]=useState<ExecutionFilter>(null),[page,setPage]=useState<ConversationPage>(),[error,setError]=useState('');
  const generation=useRef(0),loadingMore=useRef(false);
  const agent=filter?.kind==='agent'?filter.value:undefined,model=filter?.kind==='model'?filter.value:undefined;
  useEffect(()=>{
    const current=++generation.current,controller=new AbortController();setPage(undefined);setError('');
    if(!filter)return()=>controller.abort();
    const refresh=async()=>{try{
      const result=await context.api.listAll({activeOnly:true,agent,model,limit:100,signal:controller.signal});
      if(!controller.signal.aborted&&current===generation.current){setPage(result);setError('');}
    }catch(failure){if(!controller.signal.aborted&&current===generation.current)setError(failure instanceof Error?failure.message:'无法读取筛选结果');}};
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[context.api,agent,model]);
  const more=async()=>{
    if(!filter){await context.loadMoreActivity();return;}
    if(!page?.nextCursor||loadingMore.current)return;
    const current=generation.current;loadingMore.current=true;
    try{const result=await context.api.listAll({activeOnly:true,agent,model,limit:100,cursor:page.nextCursor});
      if(current===generation.current)setPage(previous=>({...result,conversations:[...(previous?.conversations??[]),...result.conversations.filter(row=>!previous?.conversations.some(item=>item.workspaceId===row.workspaceId&&item.id===row.id))]}));
    }catch(failure){if(current===generation.current)setError(failure instanceof Error?failure.message:'列表顺序已变化，请清除筛选后重试');}
    finally{loadingMore.current=false;}
  };
  const rows=filter?page?.conversations??[]:context.activityRows;
  const summary=<><ConversationExecutionStats compact stats={context.activityStats} status={context.activityError?'error':context.activityStats?'ready':'unknown'} filter={filter} onFilter={setFilter}/>{filter&&<div className="ac-execution-filter"><span>执行中 · {filter.value}</span><Button size="small" type="link" onClick={()=>setFilter(null)}>清除筛选</Button></div>}</>;
  return <ConversationActivityEntry {...popup} summary={summary} emptyDescription={filter&&!page&&!error?'正在读取筛选结果…':filter?'没有匹配的执行中对话':undefined} items={rows.map(row=>({id:row.id,workspaceId:row.workspaceId,title:row.title,meta:conversationMetadata(row),state:activityState(row)}))} total={context.activityTotal} error={error||context.activityError} hasMore={Boolean(filter?page?.nextCursor:context.activityCursor)} onMore={()=>void more()} workspaces={workspaces} selectedId={context.scope?.conversationId} active={context.open&&context.view==='history'} side={context.side} onOpen={item=>void context.openConversation(item.workspaceId,item.id)} onHistory={()=>context.openHistory(null)} onToggleHistory={()=>context.toggleView('history')}/>;
}
