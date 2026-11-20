import { settleConversationDraftIds, shouldShowConversationDraft, workspaceConversationDraftIds } from './conversation-draft-presence.ts';
import { applyConfirmedSeenActivity, executionStatsSignature } from './conversation-seen-hold.ts';
import { useConversationDraftPresenceDetail, useConversationDraftSubmittedIds } from './useConversationDraftPresence.ts';
import { ConversationExecutionSummary } from './ConversationExecutionSummary.tsx';
import { conversationModelSourceLabel, conversationModelLabel } from './conversation-model-label.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext.tsx';
import { ConversationActivityStatus } from './ConversationActivityStatus.tsx';
import { activityState, sendActivity, conversationMetadata, copyConversationIdTitle } from './conversation-activity.ts';
import type { ExecutionFilter } from './ConversationExecutionStats.tsx';
import { CopyButton } from '../../components/CopyButton.tsx';
import { DEFAULT_HISTORY_GROUP, historyGroupOrder, moveHistoryGroup, writeHistoryGroupPreference } from './conversation-history-groups.ts';
import { useHistoryGroupPreference } from './useHistoryGroupPreference.ts';
import type { ConversationSummary } from './types.ts';
import { ConversationHistoryGroup } from './ConversationHistoryGroup.tsx';
import { useConversationHistoryPage } from './useConversationHistoryPage.ts';
import { useDebouncedValue } from './useDebouncedValue.ts';
import './conversation-activity.css';
export type ConversationWorkspace = {id:string;name:string;rootPath:string};
type HistoryGroupResult = {total?:number;busy:boolean;error:boolean};
function DraftStatusBadge({visible,immediateHide}:{visible:boolean;immediateHide:boolean}) {
  const [leaving,setLeaving]=useState(false);
  const prevVisible=useRef(visible);
  useEffect(()=>{
    const wasVisible=prevVisible.current;
    prevVisible.current=visible;
    if(visible){setLeaving(false);return;}
    if(!wasVisible||immediateHide||(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)){
      setLeaving(false);return;
    }
    setLeaving(true);
    const timer=setTimeout(()=>setLeaving(false),150);
    return()=>clearTimeout(timer);
  },[visible,immediateHide]);
  if(!visible&&!leaving)return null;
  return <span className={'ac-draft-status'+(leaving&&!visible?' is-leaving':'')} aria-hidden={leaving&&!visible?true:undefined}>有草稿</span>;
}
export function ConversationHistory({workspaces,defaultWorkspaceId: _defaultWorkspaceId,keepHistoryOpen=false,hiddenBySettings=false}:{workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;keepHistoryOpen?:boolean;hiddenBySettings?:boolean}) {
  const context=useAgentConversations();
  const showBackToConversation=!keepHistoryOpen;
  const presence=useConversationDraftPresenceDetail();
  const activeEditingScope=keepHistoryOpen&&context.scope?context.scope:null;
  const activeEditingId=activeEditingScope?.conversationId??null;
  const submittedIds=useConversationDraftSubmittedIds();
  const submittedSet=useMemo(()=>new Set(submittedIds),[submittedIds]);
  const {activeStatusIds,pendingSendIds}=useMemo(()=>{
    const activeStatus=new Set<string>(),pendingSend=new Set<string>();
    for(const row of context.activityRows){
      const effective=applyConfirmedSeenActivity(row,context.seenActivities,context.conversation,context.activityRows);
      if(activityState(effective)!==null)activeStatus.add(row.id);
      if(sendActivity(effective))pendingSend.add(row.id);
    }
    if(context.conversation){
      const effective=applyConfirmedSeenActivity(context.conversation,context.seenActivities,context.conversation,context.activityRows);
      if(activityState(effective)!==null)activeStatus.add(context.conversation.id);
      if(sendActivity(effective))pendingSend.add(context.conversation.id);
    }
    return {activeStatusIds:activeStatus,pendingSendIds:pendingSend};
  },[context.activityRows,context.conversation,context.seenActivities]);
  const settledRef=useRef<string[]|null>(null);
  if(settledRef.current===null)settledRef.current=presence.ids.filter(id=>!activeStatusIds.has(id));
  const settledDraftIds=settleConversationDraftIds({liveIds:presence.ids,previousIds:settledRef.current,activeEditingId,activeStatusIds,pendingSendIds,submittedIds:submittedSet});
  settledRef.current=settledDraftIds;
  const initial=context.historyWorkspaceId??'';
  const [workspaceId,setWorkspaceId]=useState(initial),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[filter,setFilter]=useState<ExecutionFilter>(null);
  const searchQuery=useDebouncedValue(query,250);
  const groupOrder=useHistoryGroupPreference();
  const [preferenceError,setPreferenceError]=useState('');
  const [draggingGroup,setDraggingGroup]=useState(''),[dropGroup,setDropGroup]=useState(''),[dropAfter,setDropAfter]=useState(false);
  const [groupResults,setGroupResults]=useState<{scope:string;values:Record<string,HistoryGroupResult>}>({scope:'',values:{}});
  useEffect(()=>{if(context.historyWorkspaceId!==undefined){setWorkspaceId(context.historyWorkspaceId??'');setFilter(null);}},[context.historyWorkspaceId]);
  const agent=filter?.kind==='agent'?filter.value:undefined,model=filter?.kind==='model'?filter.value:undefined;
  const statsStateRef=useRef<{sig:string|null;tick:number}>({sig:null,tick:context.activityTick});
  const nextStatsSig=executionStatsSignature(context.activityStats,context.activityRows,context.activityCursor,context.activityTick);
  if(nextStatsSig===null){
    statsStateRef.current={sig:null,tick:context.activityTick};
  }else if(statsStateRef.current.sig===null){
    statsStateRef.current={sig:nextStatsSig,tick:statsStateRef.current.tick};
  }else if(statsStateRef.current.sig!==nextStatsSig){
    statsStateRef.current={sig:nextStatsSig,tick:statsStateRef.current.tick+1};
  }
  // 统计不受搜索、执行筛选、草稿或纯已读确认波动影响，独立于逐键查询读取。
  const {page, error, retry}=useConversationHistoryPage(context.api,{workspaceId:workspaceId||undefined,query:'',hidden:false},1,true,context.historyCache,statsStateRef.current.tick);
  const stats=page?.stats;
  const scopeKey=JSON.stringify([workspaceId,searchQuery,hidden,agent,model]);
  const reportGroup=useCallback((id:string,result:HistoryGroupResult)=>{
    setGroupResults(previous=>{
      const values=previous.scope===scopeKey?previous.values:{};
      const current=values[id];
      if(current&&current.total===result.total&&current.busy===result.busy&&current.error===result.error)return previous;
      return {scope:scopeKey,values:{...values,[id]:result}};
    });
  },[scopeKey]);
  const modelName=(id:string)=>conversationModelLabel(id,context.connections,context.modelCatalog);
  const workspaceName=(id:string)=>id===DEFAULT_HISTORY_GROUP?'默认':workspaces.find(item=>item.id===id)?.name||id;
  const renderRow=(row:ConversationSummary,depth:number)=>{
    const meta=conversationMetadata(row,undefined,row.run?.model?conversationModelLabel(row.run.model,context.connections,context.modelCatalog,{modelAccountId:row.run.modelAccountId}):undefined);
    return <div key={row.workspaceId+':'+row.id} className={'ac-history-row'+(context.scope?.workspaceId===row.workspaceId&&context.scope.conversationId===row.id?' is-selected':'')}>
      <button type="button" className="ac-history-row-main" style={depth?{paddingInlineStart:`calc(11px + min(25%, ${depth*12}px))`}:undefined} data-conversation-id={row.id} onClick={()=>{context.setSettings(false);void context.openConversation(row.workspaceId,row.id,{preserveVisibility:true,preserveHistoryView:keepHistoryOpen});}}>
        <span className="ac-history-row-title"><strong title={row.title}>{row.title}</strong><ConversationActivityStatus state={activityState(row)}/><DraftStatusBadge visible={shouldShowConversationDraft(row,settledDraftIds)} immediateHide={activityState(row)!==null}/></span>
        {sendActivity(row)?.reason&&<span className="ac-send-reason">{sendActivity(row)?.reason}</span>}
        {row.searchSnippet&&<span className="ac-history-row-snippet" title={row.searchSnippet}>{row.searchSnippet}</span>}
        {meta&&<small><span className="ac-history-meta" title={meta}>{meta}</span></small>}
      </button>
      <CopyButton type="text" className="ac-history-row-copy" text={row.id} ariaLabel="复制对话 ID" title={copyConversationIdTitle(row.id)} failureMessage="复制失败，请手动选择对话 ID 复制。"/>
    </div>;
  };
  const order=historyGroupOrder([...workspaces.map(item=>item.id),DEFAULT_HISTORY_GROUP],groupOrder);
  const movable=order.filter(id=>id!==DEFAULT_HISTORY_GROUP);
  const reorder=(moved:string,target:string|'end')=>{const next=moveHistoryGroup(order,moved,target);setPreferenceError(writeHistoryGroupPreference(next)?'':'顺序已调整，但无法保存；刷新后可能恢复原顺序。');};
  const keyboardMove=(id:string,step:number)=>{
    const index=movable.indexOf(id);if(index<0)return;
    if(step<0){if(index>0)reorder(id,movable[index-1]);return;}
    if(index>=movable.length-1)return;
    reorder(id,movable[index+2]??'end');
  };
  const sortGroup=(id:string)=><ConversationHistoryGroup key={id+scopeKey} workspaceId={id} name={workspaceName(id)} query={searchQuery} hidden={hidden} agent={agent} model={model} draftConversationIds={workspaceConversationDraftIds(id,settledDraftIds,presence,activeEditingScope)} activeViewingId={activeEditingScope?.workspaceId===id?activeEditingScope.conversationId:null} renderRow={renderRow} onResult={reportGroup}
    onNew={!hidden?()=>{
      context.setSettings(false);
      context.newConversation({scope:{workspaceId:id},preserveVisibility:true,preserveHistoryView:keepHistoryOpen});
      requestAnimationFrame(()=>document.getElementById('agent-conversation-input')?.focus());
    }:undefined}
    className={'ac-history-group ac-history-workspace'+(draggingGroup===id?' is-dragging':'')+(dropGroup===id&&draggingGroup&&draggingGroup!==id?' is-drop-target'+(dropAfter?' is-drop-after':''):'')}
    onDragOver={event=>{if(!draggingGroup||draggingGroup===id||id===DEFAULT_HISTORY_GROUP)return;event.preventDefault();setDropGroup(id);const header=event.currentTarget.querySelector('h3')?.getBoundingClientRect();setDropAfter(Boolean(header&&event.clientY>header.top+header.height/2));}}
    onDrop={event=>{if(!draggingGroup)return;event.preventDefault();if(id!==DEFAULT_HISTORY_GROUP){const header=event.currentTarget.querySelector('h3')?.getBoundingClientRect();const after=Boolean(header&&event.clientY>header.top+header.height/2);const target=after?order[order.indexOf(id)+1]??'end':id;reorder(draggingGroup,target===DEFAULT_HISTORY_GROUP?'end':target);}setDraggingGroup('');setDropGroup('');}}
    headerProps={{draggable:id!==DEFAULT_HISTORY_GROUP&&movable.length>1,title:"单击折叠或展开；拖动调整顺序；Alt+上下方向键移动分组",
        onDragStart:event=>{setDraggingGroup(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);},
        onDragEnd:()=>{setDraggingGroup('');setDropGroup('');},
        onKeyDown:event=>{if(!event.altKey||(event.key!=='ArrowUp'&&event.key!=='ArrowDown'))return;event.preventDefault();keyboardMove(id,event.key==='ArrowUp'?-1:1);}}}
  />;
  const visibleGroups=order.filter(id=>!workspaceId||workspaceId===id);
  const groupsSettled=visibleGroups.length>0&&visibleGroups.every(id=>{
    const result=groupResults.scope===scopeKey?groupResults.values[id]:undefined;
    return Boolean(result&&!result.busy&&!result.error&&result.total!==undefined);
  });
  const empty=groupsSettled&&visibleGroups.every(id=>groupResults.values[id]?.total===0);
  return <section className="ac-history" aria-label="对话列表" hidden={hiddenBySettings}>
    <header className="ac-thread-header">{showBackToConversation&&<Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" title="返回当前对话" onClick={()=>context.setView('conversation')}/>}<strong>对话列表</strong>{!context.open&&<Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true,preserveHistoryView:keepHistoryOpen})}/>}</header>
    <div className="ac-history-body">
      <div className="ac-history-toolbar"><Input allowClear prefix={<SearchOutlined/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>setQuery(event.target.value)}/><Select aria-label="对话列表工作空间" value={workspaceId} options={[{value:'',label:'全部工作空间'},...workspaces.map(item=>({value:item.id,label:item.name}))]} onChange={value=>{setWorkspaceId(value);setFilter(null);}}/></div>
      
      <ConversationExecutionSummary stats={stats} stale={!!error} filter={filter} onFilter={setFilter} sourceLabel={id=>conversationModelSourceLabel(id,context.modelCatalog)} modelLabel={(id,accountId)=>conversationModelLabel(id,context.connections,context.modelCatalog,{modelAccountId:accountId})}/>
      {filter&&<div className="ac-execution-filter"><span>执行中 · {filter.kind==='model'?modelName(filter.value):filter.value}</span><Button type="link" size="small" onClick={()=>setFilter(null)}>清除筛选</Button></div>}
      {error&&<Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>重试</Button>}/>}
      <div className="ac-history-groups-heading"><strong>对话</strong><Button type="text" size="small" onClick={()=>setHidden(value=>!value)}>{hidden?'返回最近':'查看隐藏'}</Button></div>
      {preferenceError&&<Alert type="warning" showIcon message={preferenceError}/>}
      {visibleGroups.map(sortGroup)}
      {empty&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的对话"/>}
    </div>
  </section>;
}
