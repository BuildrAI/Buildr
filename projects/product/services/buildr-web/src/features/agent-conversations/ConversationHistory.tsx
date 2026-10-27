import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationAttention } from './ConversationAttention';
import { needsAttention } from './conversation-state';
import type { ConversationSummary } from './types';
export type ConversationWorkspace = {id: string; name: string; rootPath: string};
export function ConversationHistory({workspaces,defaultWorkspaceId}: {workspaces: ConversationWorkspace[]; defaultWorkspaceId: string | null}) {
  const context=useAgentConversations();
  const [workspaceId,setWorkspaceId]=useState(defaultWorkspaceId || context.scope?.workspaceId || workspaces[0]?.id || ''),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[rows,setRows]=useState<ConversationSummary[]>([]),[cursor,setCursor]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(defaultWorkspaceId)setWorkspaceId(defaultWorkspaceId);},[defaultWorkspaceId]);
  const historyScope=useRef('');historyScope.current=JSON.stringify([workspaceId,hidden,query]);
  useEffect(() => { if (!workspaceId) return; const controller=new AbortController();setBusy(true);setError('');void context.api.list(workspaceId,{hidden,query,signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setRows(result.conversations);setCursor(result.nextCursor);}}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'无法读取历史。');}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[workspaceId,hidden,query,context.api]);
  const more=async()=>{if(!cursor||busy)return;setBusy(true);const observedScope=historyScope.current;try{const result=await context.api.list(workspaceId,{cursor,hidden,query});if(historyScope.current!==observedScope)return;setRows(previous=>[...previous,...result.conversations.filter(item=>!previous.some(existing=>existing.id===item.id))]);setCursor(result.nextCursor);}catch(failure){if(historyScope.current===observedScope)setError(failure instanceof Error?failure.message:'读取失败。');}finally{if(historyScope.current===observedScope)setBusy(false);}};
  const select=(wid:string,id:string)=>void context.openConversation(wid,id,{preserveVisibility:true});
  const create=()=>context.newConversation({preserveVisibility:true});
  return <section className="ac-history" aria-label="对话历史"><header className="ac-thread-header"><Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" onClick={()=>context.setView('conversation')}/>{context.open&&<ConversationAttention className="ac-dock-attention"/>}<strong>对话历史</strong><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={create}/></header>
    <div className="ac-history-body"><div className="ac-history-toolbar"><Input allowClear prefix={<SearchOutlined aria-hidden/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>setQuery(event.target.value)}/><Select classNames={{popup:{root:'ac-panel-popup'}}} aria-label="对话历史工作空间" value={workspaceId||undefined} placeholder="工作空间" options={workspaces.map(item=>({value:item.id,label:item.name}))} onChange={setWorkspaceId}/></div>
      {context.pending.length>0&&<section className="ac-pending-history"><h3>等待你的回应</h3>{context.pending.map(item=><button key={item.workspaceId+':'+item.conversationId} onClick={()=>select(item.workspaceId,item.conversationId)}><strong title={item.title}>{item.title}</strong><small><span className="ac-history-id" title={item.conversationId}>ID {item.conversationId}</span><span className="ac-history-meta">{item.status==='unknown'?'执行状态待确认':item.status==='tools-active'?'仍有命令运行':'需要你的回应'} · {workspaces.find(w=>w.id===item.workspaceId)?.name||item.workspaceId}</span></small></button>)}</section>}
      <div className="ac-history-heading"><span>{hidden?'已隐藏的对话':'最近对话'}</span><Button size="small" type="text" onClick={()=>setHidden(value=>!value)}>{hidden?'返回最近':'查看隐藏'}</Button></div>
      {error&&<Alert type="warning" showIcon message={error}/>}
      <div className="ac-history-list">{[...rows].sort((a,b)=>Number(needsAttention(b.run))-Number(needsAttention(a.run))).map(item=><button key={item.id} data-conversation-id={item.id} className={context.scope?.conversationId===item.id?'is-selected':''} onClick={()=>select(item.workspaceId,item.id)}><strong title={item.title}>{item.title}</strong><small><span className="ac-history-id" title={item.id}>ID {item.id}</span><span className="ac-history-meta">{item.taskId?'任务对话':'普通对话'} · {new Date(item.updatedAt).toLocaleString()} · {item.participants.length} 位参与者{needsAttention(item.run)?' · 等待你的回应':''}</span></small></button>)}{busy&&<Spin/>}{!busy&&!rows.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话"/>}{cursor&&<Button loading={busy} onClick={()=>void more()}>加载更多</Button>}</div>
      <Button type="text" icon={<SettingOutlined/>} onClick={()=>context.setSettings(true)}>账号与配置</Button>
    </div>
  </section>;
}
