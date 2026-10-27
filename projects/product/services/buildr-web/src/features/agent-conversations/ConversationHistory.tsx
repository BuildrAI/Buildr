import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import { activityState, conversationMetadata, isActiveConversation } from './conversation-activity';
import { ConversationExecutionStats, type ExecutionFilter } from './ConversationExecutionStats';
import type { ConversationSummary } from './types';
import type { ConversationPage } from './api/agent-conversations-api';
import './conversation-activity.css';
export type ConversationWorkspace = {id:string;name:string;rootPath:string};
export function ConversationHistory({workspaces,defaultWorkspaceId}:{workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null}) {
  const context=useAgentConversations();
  const initial=context.historyWorkspaceId===undefined?defaultWorkspaceId??'':context.historyWorkspaceId??'';
  const [workspaceId,setWorkspaceId]=useState(initial),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[filter,setFilter]=useState<ExecutionFilter>(null);
  const [rows,setRows]=useState<ConversationSummary[]>([]),[cursor,setCursor]=useState<string>(),[stats,setStats]=useState<ConversationPage['stats']>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const generation=useRef(0),firstPage=useRef(''),scope=useRef(''),reading=useRef(false),readSequence=useRef(0);
  useEffect(()=>{if(context.historyWorkspaceId!==undefined){setWorkspaceId(context.historyWorkspaceId??'');setFilter(null);}},[context.historyWorkspaceId]);
  const agent=filter?.kind==='agent'?filter.value:undefined,model=filter?.kind==='model'?filter.value:undefined;
  useEffect(()=>{
    const current=++generation.current,controller=new AbortController();reading.current=false;
    const key=JSON.stringify([workspaceId,query,hidden,agent,model]);
    if(scope.current!==key){scope.current=key;firstPage.current='';setRows([]);setCursor(undefined);}
    const refresh=async()=>{if(reading.current)return;reading.current=true;const sequence=++readSequence.current;setBusy(true);try{
      const result=await context.api.listAll({workspaceId:workspaceId||undefined,query,hidden,agent,model,signal:controller.signal});
      if(controller.signal.aborted||generation.current!==current||sequence!==readSequence.current)return;
      const signature=JSON.stringify([result.nextCursor,result.conversations.map(row=>[row.workspaceId,row.id,row.title,row.activity,row.run?.status,row.run?.provider,row.run?.model,row.hidden])]);
      if(signature!==firstPage.current){firstPage.current=signature;setRows(result.conversations);setCursor(result.nextCursor);}
      setStats(result.stats);setError('');
    }catch(failure){if(!controller.signal.aborted&&generation.current===current)setError(failure instanceof Error?failure.message:'无法更新对话列表，保留上次结果。');}
    finally{if(!controller.signal.aborted&&generation.current===current){reading.current=false;setBusy(false);}}};
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);window.addEventListener('focus',refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[context.api,workspaceId,query,hidden,agent,model,reload]);
  const more=async()=>{if(!cursor||busy||reading.current)return;const current=generation.current;reading.current=true;setBusy(true);try{
    const result=await context.api.listAll({workspaceId:workspaceId||undefined,query,hidden,agent,model,cursor});if(generation.current!==current)return;
    setRows(previous=>[...previous,...result.conversations.filter(row=>!previous.some(item=>item.id===row.id&&item.workspaceId===row.workspaceId))]);setCursor(result.nextCursor);
  }catch(failure){if(generation.current===current){firstPage.current='';setReload(value=>value+1);setError(failure instanceof Error?failure.message:'列表顺序已变化，重新读取中。');}}finally{if(generation.current===current){reading.current=false;setBusy(false);}}};
  const renderRow=(row:ConversationSummary)=><button key={row.workspaceId+':'+row.id} data-conversation-id={row.id} className={context.scope?.workspaceId===row.workspaceId&&context.scope.conversationId===row.id?'is-selected':''} onClick={()=>void context.openConversation(row.workspaceId,row.id,{preserveVisibility:true})}>
    <span className="ac-history-row-title"><strong title={row.title}>{row.title}</strong><ConversationActivityStatus state={activityState(row)}/></span>
    <small><span className="ac-history-id" title={row.id}>ID {row.id}</span><span className="ac-history-meta">{conversationMetadata(row,workspaces.find(item=>item.id===row.workspaceId)?.name??row.workspaceId)}</span></small>
  </button>;
  const active=rows.filter(isActiveConversation),recent=rows.filter(row=>!isActiveConversation(row));
  return <section className="ac-history" aria-label="对话历史">
    <header className="ac-thread-header"><Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" onClick={()=>context.setView('conversation')}/><strong>对话历史</strong><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/></header>
    <div className="ac-history-body">
      <div className="ac-history-toolbar"><Input allowClear prefix={<SearchOutlined/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>setQuery(event.target.value)}/><Select aria-label="对话历史工作空间" value={workspaceId} options={[{value:'',label:'全部工作空间'},...workspaces.map(item=>({value:item.id,label:item.name}))]} onChange={value=>{setWorkspaceId(value);setFilter(null);}}/></div>
      <ConversationExecutionStats stats={stats} filter={filter} onFilter={setFilter}/>
      {filter&&<div className="ac-execution-filter"><span>执行中 · {filter.value}</span><Button type="link" size="small" onClick={()=>setFilter(null)}>清除筛选</Button></div>}
      {error&&<Alert type="warning" showIcon message={error} action={<Button size="small" onClick={()=>{firstPage.current='';setReload(value=>value+1);}}>重试</Button>}/>}
      {active.length>0&&<section className="ac-history-group" aria-label="活动中的对话"><h3>活动中的对话 <small>{active.length}{cursor?' +':''}</small></h3><div className="ac-history-list">{active.map(renderRow)}</div></section>}
      <section className="ac-history-group" aria-label="其他对话"><h3>{hidden?'已隐藏的对话':'其他对话'}<Button type="text" size="small" onClick={()=>setHidden(value=>!value)}>{hidden?'返回最近':'查看隐藏'}</Button></h3><div className="ac-history-list">{recent.map(renderRow)}</div></section>
      {busy&&<Spin/>}{!busy&&!rows.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话"/>}{cursor&&<Button loading={busy} onClick={()=>void more()}>加载更多</Button>}
      <Button type="text" icon={<SettingOutlined/>} onClick={()=>context.setSettings(true)}>账号与配置</Button>
    </div>
  </section>;
}
