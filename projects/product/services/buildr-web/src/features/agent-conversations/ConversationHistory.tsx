import { ConversationExecutionSummary } from './ConversationExecutionSummary';
import { conversationModelSourceLabel, conversationModelLabel } from './conversation-model-label';
import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import { activityState, conversationMetadata } from './conversation-activity';
import type { ExecutionFilter } from './ConversationExecutionStats';
import { CopyButton } from '../../components/CopyButton';
import { DEFAULT_HISTORY_GROUP, historyGroupOrder, moveHistoryGroup, readHistoryGroupPreference, writeHistoryGroupPreference } from './conversation-history-groups';
import type { ConversationSummary } from './types';
import { ConversationHistoryGroup } from './ConversationHistoryGroup';
import { useConversationHistoryPage } from './useConversationHistoryPage';
import './conversation-activity.css';
export type ConversationWorkspace = {id:string;name:string;rootPath:string};
export function ConversationHistory({workspaces,defaultWorkspaceId}:{workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null}) {
  const context=useAgentConversations();
  const initial=context.historyWorkspaceId===undefined?defaultWorkspaceId??'':context.historyWorkspaceId??'';
  const [workspaceId,setWorkspaceId]=useState(initial),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[filter,setFilter]=useState<ExecutionFilter>(null);
  const [groupOrder,setGroupOrder]=useState<string[]>(readHistoryGroupPreference);
  const [preferenceError,setPreferenceError]=useState('');
  const [draggingGroup,setDraggingGroup]=useState(''),[dropGroup,setDropGroup]=useState(''),[dropAfter,setDropAfter]=useState(false);
  useEffect(()=>{if(context.historyWorkspaceId!==undefined){setWorkspaceId(context.historyWorkspaceId??'');setFilter(null);}},[context.historyWorkspaceId]);
  const agent=filter?.kind==='agent'?filter.value:undefined,model=filter?.kind==='model'?filter.value:undefined;
  const {page, busy, error, retry}=useConversationHistoryPage(context.api,{workspaceId:workspaceId||undefined,query,hidden,agent,model},1);
  const stats=page?.stats;
  const scopeKey=JSON.stringify([workspaceId,query,hidden,agent,model]);
  const modelName=(id:string)=>conversationModelLabel(id,context.connections,context.modelCatalog);
  const workspaceName=(id:string)=>id===DEFAULT_HISTORY_GROUP?'默认':workspaces.find(item=>item.id===id)?.name||id;
  const renderRow=(row:ConversationSummary)=><div key={row.workspaceId+':'+row.id} className={'ac-history-row'+(context.scope?.workspaceId===row.workspaceId&&context.scope.conversationId===row.id?' is-selected':'')}>
    <button type="button" className="ac-history-row-main" data-conversation-id={row.id} onClick={()=>void context.openConversation(row.workspaceId,row.id,{preserveVisibility:true})}>
      <span className="ac-history-row-title"><strong title={row.title}>{row.title}</strong><ConversationActivityStatus state={activityState(row)}/></span>
      <small><span className="ac-history-id" title={row.id}>{row.id}</span><span className="ac-history-meta">{conversationMetadata(row,undefined,row.run?.model?conversationModelLabel(row.run.model,context.connections,context.modelCatalog,{modelAccountId:row.run.modelAccountId}):undefined)}</span></small>
    </button>
    <CopyButton type="text" className="ac-history-row-copy" text={row.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/>
  </div>;
  const order=historyGroupOrder([...workspaces.map(item=>item.id),DEFAULT_HISTORY_GROUP],groupOrder);
  const movable=order.filter(id=>id!==DEFAULT_HISTORY_GROUP);
  const reorder=(moved:string,target:string|'end')=>{const next=moveHistoryGroup(order,moved,target);setGroupOrder(next);setPreferenceError(writeHistoryGroupPreference(next)?'':'顺序已调整，但无法保存；刷新后可能恢复原顺序。');};
  const keyboardMove=(id:string,step:number)=>{
    const index=movable.indexOf(id);if(index<0)return;
    if(step<0){if(index>0)reorder(id,movable[index-1]);return;}
    if(index>=movable.length-1)return;
    reorder(id,movable[index+2]??'end');
  };
  const sortGroup=(id:string)=><ConversationHistoryGroup key={id+scopeKey} workspaceId={id} name={workspaceName(id)} query={query} hidden={hidden} agent={agent} model={model} renderRow={renderRow}
    className={'ac-history-group ac-history-workspace'+(draggingGroup===id?' is-dragging':'')+(dropGroup===id&&draggingGroup&&draggingGroup!==id?' is-drop-target'+(dropAfter?' is-drop-after':''):'')}
    onDragOver={event=>{if(!draggingGroup||draggingGroup===id||id===DEFAULT_HISTORY_GROUP)return;event.preventDefault();setDropGroup(id);const header=event.currentTarget.querySelector('h3')?.getBoundingClientRect();setDropAfter(Boolean(header&&event.clientY>header.top+header.height/2));}}
    onDrop={event=>{if(!draggingGroup)return;event.preventDefault();if(id!==DEFAULT_HISTORY_GROUP){const header=event.currentTarget.querySelector('h3')?.getBoundingClientRect();const after=Boolean(header&&event.clientY>header.top+header.height/2);const target=after?order[order.indexOf(id)+1]??'end':id;reorder(draggingGroup,target===DEFAULT_HISTORY_GROUP?'end':target);}setDraggingGroup('');setDropGroup('');}}
    headerProps={{draggable:id!==DEFAULT_HISTORY_GROUP&&movable.length>1,title:"单击折叠或展开；拖动调整顺序；Alt+上下方向键移动分组",
        onDragStart:event=>{setDraggingGroup(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);},
        onDragEnd:()=>{setDraggingGroup('');setDropGroup('');},
        onKeyDown:event=>{if(!event.altKey||(event.key!=='ArrowUp'&&event.key!=='ArrowDown'))return;event.preventDefault();keyboardMove(id,event.key==='ArrowUp'?-1:1);}}}
  />;
  return <section className="ac-history" aria-label="对话列表">
    <header className="ac-thread-header"><Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" onClick={()=>context.setView('conversation')}/><strong>对话列表</strong><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/></header>
    <div className="ac-history-body">
      <div className="ac-history-toolbar"><Input allowClear prefix={<SearchOutlined/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>setQuery(event.target.value)}/><Select aria-label="对话列表工作空间" value={workspaceId} options={[{value:'',label:'全部工作空间'},...workspaces.map(item=>({value:item.id,label:item.name}))]} onChange={value=>{setWorkspaceId(value);setFilter(null);}}/></div>
      <ConversationExecutionSummary stats={stats} stale={!!error} sourceLabel={id=>conversationModelSourceLabel(id,context.modelCatalog)} modelLabel={(id,accountId)=>conversationModelLabel(id,context.connections,context.modelCatalog,{modelAccountId:accountId})}/>
      {filter&&<div className="ac-execution-filter"><span>执行中 · {filter.kind==='model'?modelName(filter.value):filter.value}</span><Button type="link" size="small" onClick={()=>setFilter(null)}>清除筛选</Button></div>}
      {error&&<Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>重试</Button>}/>}
      <div className="ac-history-groups-heading"><strong>对话</strong><Button type="text" size="small" onClick={()=>setHidden(value=>!value)}>{hidden?'返回最近':'查看隐藏'}</Button></div>
      {preferenceError&&<Alert type="warning" showIcon message={preferenceError}/>}
      {order.filter(id=>!workspaceId||workspaceId===id).map(sortGroup)}
      {busy&&!page&&<Spin/>}{!busy&&page?.total===0&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话"/>}
    </div>
  </section>;
}
