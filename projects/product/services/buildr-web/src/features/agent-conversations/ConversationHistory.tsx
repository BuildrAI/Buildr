import { ConversationActivityFilters } from './ConversationActivityFilters';
import type { ActivityFilter, ActivityCounts } from './conversation-activity';
import { conversationModelLabel } from './conversation-model-label';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined, HolderOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityStatus } from './ConversationActivityStatus';
import { activityState, conversationMetadata, isActiveConversation } from './conversation-activity';
import { ConversationExecutionStats, type ExecutionFilter } from './ConversationExecutionStats';
import { CopyButton } from '../../components/CopyButton';
import { DEFAULT_HISTORY_GROUP, HISTORY_GROUP_LIMIT, historyGroupOrder, moveHistoryGroup, readHistoryGroupPreference, writeHistoryGroupPreference } from './conversation-history-groups';
import type { ConversationSummary } from './types';
import type { ConversationPage } from './api/agent-conversations-api';
import './conversation-activity.css';
export type ConversationWorkspace = {id:string;name:string;rootPath:string};
export function ConversationHistory({workspaces,defaultWorkspaceId}:{workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null}) {
  const context=useAgentConversations();
  const initial=context.historyWorkspaceId===undefined?defaultWorkspaceId??'':context.historyWorkspaceId??'';
  const [workspaceId,setWorkspaceId]=useState(initial),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[filter,setFilter]=useState<ExecutionFilter>(null);
  const [activityFilter,setActivityFilter]=useState<ActivityFilter>(null),[counts,setCounts]=useState<ActivityCounts>();
  const [rows,setRows]=useState<ConversationSummary[]>([]),[cursor,setCursor]=useState<string>(),[stats,setStats]=useState<ConversationPage['stats']>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [groupOrder,setGroupOrder]=useState<string[]>(readHistoryGroupPreference),[expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});
  const [draggingGroup,setDraggingGroup]=useState(''),[dropGroup,setDropGroup]=useState('');
  const generation=useRef(0),firstPage=useRef(''),scope=useRef(''),reading=useRef(false),readSequence=useRef(0);
  useEffect(()=>{if(context.historyWorkspaceId!==undefined){setWorkspaceId(context.historyWorkspaceId??'');setFilter(null);setActivityFilter(null);setCounts(undefined);}},[context.historyWorkspaceId]);
  const agent=filter?.kind==='agent'?filter.value:undefined,model=filter?.kind==='model'?filter.value:undefined;
  useEffect(()=>{
    const current=++generation.current,controller=new AbortController();reading.current=false;
    const key=JSON.stringify([workspaceId,query,hidden,agent,model,activityFilter]);
    if(scope.current!==key){scope.current=key;firstPage.current='';setRows([]);setCursor(undefined);}
    const refresh=async()=>{if(reading.current)return;reading.current=true;const sequence=++readSequence.current;setBusy(true);try{
      const result=await context.api.listAll({workspaceId:workspaceId||undefined,query,hidden,agent,model,activityState:activityFilter??undefined,signal:controller.signal});
      if(controller.signal.aborted||generation.current!==current||sequence!==readSequence.current)return;
      const signature=JSON.stringify([result.nextCursor,result.conversations.map(row=>[row.workspaceId,row.id,row.title,row.activity,row.run?.status,row.run?.provider,row.run?.model,row.hidden])]);
      if(signature!==firstPage.current){firstPage.current=signature;setRows(result.conversations);setCursor(result.nextCursor);}
      setCounts(result.activityCounts);setStats(result.stats);setError('');
    }catch(failure){if(!controller.signal.aborted&&generation.current===current)setError(failure instanceof Error?failure.message:'无法更新对话列表，保留上次结果。');}
    finally{if(!controller.signal.aborted&&generation.current===current){reading.current=false;setBusy(false);}}};
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);window.addEventListener('focus',refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[context.api,workspaceId,query,hidden,agent,model,activityFilter,reload]);
  const more=async()=>{if(!cursor||busy||reading.current)return;const current=generation.current;reading.current=true;setBusy(true);try{
    const result=await context.api.listAll({workspaceId:workspaceId||undefined,query,hidden,agent,model,activityState:activityFilter??undefined,cursor});if(generation.current!==current)return;
    setRows(previous=>[...previous,...result.conversations.filter(row=>!previous.some(item=>item.id===row.id&&item.workspaceId===row.workspaceId))]);setCursor(result.nextCursor);
  }catch(failure){if(generation.current===current){firstPage.current='';setReload(value=>value+1);setError(failure instanceof Error?failure.message:'列表顺序已变化，重新读取中。');}}finally{if(generation.current===current){reading.current=false;setBusy(false);}}};
  const modelName=(id:string)=>conversationModelLabel(id,context.connections,context.modelCatalog);
  const workspaceName=(id:string)=>id===DEFAULT_HISTORY_GROUP?'默认':workspaces.find(item=>item.id===id)?.name||id;
  const renderRow=(row:ConversationSummary,showWorkspace=false)=><div key={row.workspaceId+':'+row.id} className={'ac-history-row'+(context.scope?.workspaceId===row.workspaceId&&context.scope.conversationId===row.id?' is-selected':'')}>
    <button type="button" className="ac-history-row-main" data-conversation-id={row.id} onClick={()=>void context.openConversation(row.workspaceId,row.id,{preserveVisibility:true})}>
      <span className="ac-history-row-title"><strong title={row.title}>{row.title}</strong><ConversationActivityStatus state={activityState(row)}/></span>
      <small><span className="ac-history-id" title={row.id}>ID {row.id}</span><span className="ac-history-meta">{conversationMetadata(row,showWorkspace?workspaceName(row.workspaceId):undefined,row.run?.model?modelName(row.run.model):undefined)}</span></small>
    </button>
    <CopyButton type="text" className="ac-history-row-copy" text={row.id} ariaLabel="复制对话 ID" failureMessage="复制失败，请手动选择对话 ID 复制。"/>
  </div>;
  const active=rows.filter(isActiveConversation),recent=rows.filter(row=>!isActiveConversation(row));
  const grouped=new Map<string,ConversationSummary[]>();
  for(const row of recent){const items=grouped.get(row.workspaceId);if(items)items.push(row);else grouped.set(row.workspaceId,[row]);}
  const order=historyGroupOrder([...grouped.keys()],groupOrder);
  const movable=order.filter(id=>id!==DEFAULT_HISTORY_GROUP);
  const reorder=(moved:string,target:string|'end')=>{const next=moveHistoryGroup(order,moved,target);setGroupOrder(next);writeHistoryGroupPreference(next);};
  const keyboardMove=(id:string,step:number)=>{
    const index=movable.indexOf(id);if(index<0)return;
    if(step<0){if(index>0)reorder(id,movable[index-1]);return;}
    if(index>=movable.length-1)return;
    reorder(id,movable[index+2]??'end');
  };
  const sortGroup=(id:string)=><section key={id} data-history-workspace={id} aria-label={workspaceName(id)}
    className={'ac-history-group ac-history-workspace'+(draggingGroup===id?' is-dragging':'')+(dropGroup===id&&draggingGroup&&draggingGroup!==id?' is-drop-target':'')}
    onDragOver={event=>{if(!draggingGroup||draggingGroup===id||id===DEFAULT_HISTORY_GROUP)return;event.preventDefault();setDropGroup(id);}}
    onDrop={event=>{if(!draggingGroup)return;event.preventDefault();if(id!==DEFAULT_HISTORY_GROUP)reorder(draggingGroup,id);setDraggingGroup('');setDropGroup('');}}>
    <h3>
      <span className="ac-history-group-name" title={workspaceName(id)}>{workspaceName(id)}</span>
      <small>{grouped.get(id)?.length??0}</small>
      {id!==DEFAULT_HISTORY_GROUP&&movable.length>1&&<span role="button" tabIndex={0} draggable className="ac-history-group-handle" aria-label={`调整${workspaceName(id)}分组顺序`} title="拖动调整分组顺序；Alt+上下方向键移动分组"
        onDragStart={event=>{setDraggingGroup(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}}
        onDragEnd={()=>{setDraggingGroup('');setDropGroup('');}}
        onKeyDown={event=>{if(!event.altKey||(event.key!=='ArrowUp'&&event.key!=='ArrowDown'))return;event.preventDefault();keyboardMove(id,event.key==='ArrowUp'?-1:1);}}><HolderOutlined aria-hidden/></span>}
    </h3>
    <div className="ac-history-list">{(expandedGroups[id]?grouped.get(id)??[]:(grouped.get(id)??[]).slice(0,HISTORY_GROUP_LIMIT)).map(row=>renderRow(row))}</div>
    {(grouped.get(id)?.length??0)>HISTORY_GROUP_LIMIT&&<Button type="text" size="small" className="ac-history-expand" aria-expanded={Boolean(expandedGroups[id])} onClick={()=>setExpandedGroups(previous=>({...previous,[id]:!previous[id]}))}>{expandedGroups[id]?'收起':`展开全部 ${grouped.get(id)?.length} 条`}</Button>}
  </section>;
  return <section className="ac-history" aria-label="对话列表">
    <header className="ac-thread-header"><Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" onClick={()=>context.setView('conversation')}/><strong>对话列表</strong><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={()=>context.newConversation({preserveVisibility:true})}/></header>
    <div className="ac-history-body">
      <div className="ac-history-toolbar"><Input allowClear prefix={<SearchOutlined/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>setQuery(event.target.value)}/><Select aria-label="对话列表工作空间" value={workspaceId} options={[{value:'',label:'全部工作空间'},...workspaces.map(item=>({value:item.id,label:item.name}))]} onChange={value=>{setWorkspaceId(value);setStats(undefined);setCounts(undefined);setFilter(null);setActivityFilter(null);}}/></div>
      <ConversationActivityFilters executionFiltered={!!filter} counts={counts} value={activityFilter} stale={!!error} onChange={value=>{setActivityFilter(value);setFilter(null);}}/>
      <ConversationExecutionStats modelLabel={modelName} status={error?'error':stats?'ready':'unknown'} stats={stats} filter={filter} onFilter={value=>{setFilter(value);setActivityFilter(null);}}/>
      {filter&&<div className="ac-execution-filter"><span>执行中 · {filter.kind==='model'?modelName(filter.value):filter.value}</span><Button type="link" size="small" onClick={()=>setFilter(null)}>清除筛选</Button></div>}
      {error&&<Alert type="warning" showIcon message={error} action={<Button size="small" onClick={()=>{firstPage.current='';setReload(value=>value+1);}}>重试</Button>}/>}
      {active.length>0&&<section className="ac-history-group ac-history-active" aria-label="活动中的对话"><h3><span className="ac-history-group-name">活动中的对话</span><small>{active.length}{cursor?' +':''}</small></h3><div className="ac-history-list">{active.map(row=>renderRow(row,!workspaceId))}</div></section>}
      {recent.length>0&&<div className="ac-history-groups-heading"><strong>{hidden?'已隐藏的对话':'其他对话'}</strong><Button type="text" size="small" onClick={()=>setHidden(value=>!value)}>{hidden?'返回最近':'查看隐藏'}</Button></div>}
      {order.map(sortGroup)}
      {busy&&<Spin/>}{!busy&&!rows.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话"/>}{cursor&&<Button loading={busy} onClick={()=>void more()}>加载更多</Button>}
      <Button type="text" icon={<SettingOutlined/>} onClick={()=>context.setSettings(true)}>账号与配置</Button>
    </div>
  </section>;
}
