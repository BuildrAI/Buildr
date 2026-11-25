import { settleConversationDraftIds, shouldShowConversationDraft, workspaceConversationDraftIds } from './conversation-draft-presence.ts';
import { applyConfirmedSeenActivity, executionStatsSignature } from './conversation-seen-hold.ts';
import { useConversationDraftPresenceDetail, useConversationDraftSubmittedIds } from './useConversationDraftPresence.ts';
import { ConversationExecutionSummary } from './ConversationExecutionSummary.tsx';
import { conversationModelSourceLabel, conversationModelLabel } from './conversation-model-label.ts';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Alert, Button, Empty, Tooltip } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext.tsx';
import { ConversationActivityStatus } from './ConversationActivityStatus.tsx';
import { activityState, sendActivity, conversationMetadata, copyConversationIdTitle } from './conversation-activity.ts';
import type { ExecutionFilter } from './ConversationExecutionStats.tsx';
import { ScopedSearch } from '../../workbench/ui/ScopedSearch.tsx';
import { CopyButton } from '../../components/CopyButton.tsx';
import { DEFAULT_HISTORY_GROUP, historyGroupOrder, moveHistoryGroup, writeHistoryGroupPreference } from './conversation-history-groups.ts';
import { useHistoryGroupPreference } from './useHistoryGroupPreference.ts';
import type { ConversationSummary } from './types.ts';
import { conversationChildIndent, type ConversationHistoryBranch } from './conversation-children.ts';
import { ConversationHistoryGroup } from './ConversationHistoryGroup.tsx';
import { useConversationHistoryPage } from './useConversationHistoryPage.ts';
import { useDebouncedValue } from './useDebouncedValue.ts';
import { isElementFocusVisible, isKeyboardNavigationKey, shouldOpenConversationTooltipOnFocus } from './conversation-row-tooltip.ts';
import { canShowOverlay, createOverlayDelay, createMouseMoveIntent } from '../../lib/overlay-intent.ts';
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

function ConversationHistoryRowTooltip({
  rowId,
  meta,
  hidden,
  dismissNonce,
  keyboardNavRef,
  onOpenRow,
  children,
}: {
  rowId: string;
  meta: string;
  hidden: boolean;
  dismissNonce: number;
  keyboardNavRef: RefObject<boolean>;
  onOpenRow(): void;
  children: ReactNode;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const enter = useMemo(createOverlayDelay, []);
  const mouseMoved = useMemo(createMouseMoveIntent, []);
  const leave = useMemo(createOverlayDelay, []);
  const dismiss = () => {
    enter.cancel();
    leave.cancel();
    setHoverOpen(false);
    setKeyboardOpen(false);
  };

  useLayoutEffect(() => {
    setHoverOpen(false);
    setKeyboardOpen(false);
    return () => { enter.cancel(); leave.cancel(); };
  }, [dismissNonce, enter, hidden, leave, meta]);

  const scheduleHoverClose = () => {
    enter.cancel();
    leave.start(250, () => setHoverOpen(false));
  };

  return (
    <Tooltip
      title={meta ? <span className="ac-history-tooltip-content" onPointerEnter={leave.cancel} onPointerLeave={scheduleHoverClose}>{meta}</span> : null}
      trigger={[]}
      placement="right"
      open={Boolean(meta) && !hidden && (hoverOpen || keyboardOpen)}
      destroyOnHidden
    >
      <div
        className="ac-history-row-main"
        data-conversation-id={rowId}
        onPointerMove={event => {
          if (!mouseMoved(event) || !meta || hidden || !canShowOverlay(document)) return;
          leave.cancel();
          if (!hoverOpen) enter.start(550, () => { if (canShowOverlay(document)) setHoverOpen(true); });
        }}
        onPointerLeave={scheduleHoverClose}
        onPointerDown={() => {
          keyboardNavRef.current = false;
          dismiss();
        }}
        onFocus={event => {
          if (!(event.target instanceof Element) || !event.target.matches('.ac-history-row-open')) return;
          if (canShowOverlay(document) && shouldOpenConversationTooltipOnFocus({
            hasMeta: Boolean(meta),
            hidden,
            keyboardNavActive: keyboardNavRef.current,
            focusVisible: isElementFocusVisible(event.target),
          })) {
            setKeyboardOpen(true);
          }
        }}
        onBlur={event => {
          if (event.target instanceof Element && event.target.matches('.ac-history-row-open')) {
            setKeyboardOpen(false);
          }
        }}
        onClick={event => {
          if (event.target instanceof Element && event.target.closest('button')) return;
          onOpenRow();
        }}
      >
        {children}
      </div>
    </Tooltip>
  );
}

export function ConversationHistory({workspaces,defaultWorkspaceId: _defaultWorkspaceId,keepHistoryOpen=false,hiddenBySettings=false,headerAction}:{workspaces:ConversationWorkspace[];defaultWorkspaceId:string|null;keepHistoryOpen?:boolean;hiddenBySettings?:boolean;headerAction?:import('react').ReactNode}) {
  const context=useAgentConversations();
  const keyboardNavRef = useRef(false);
  const [tooltipDismissNonce, setTooltipDismissNonce] = useState(0);
  const dismissRowTooltips = useCallback(() => {
    keyboardNavRef.current = false;
    setTooltipDismissNonce(value => value + 1);
  }, []);

  useEffect(() => {
    if (hiddenBySettings) dismissRowTooltips();
  }, [hiddenBySettings, dismissRowTooltips]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardNavigationKey(event)) {
        keyboardNavRef.current = true;
      } else if (event.key === 'Escape') {
        dismissRowTooltips();
      }
    };
    const onKeyUp = () => { keyboardNavRef.current = false; };
    const onPointerDown = () => {
      keyboardNavRef.current = false;
    };
    const onBlur = () => {
      dismissRowTooltips();
    };
    const onVisibilityChange = () => {
      if (document.hidden) dismissRowTooltips();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dismissRowTooltips]);
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
  const renderRow=(row:ConversationSummary,depth:number,branch?:ConversationHistoryBranch,toggle?:()=>void)=>{
    const meta=conversationMetadata(row,undefined,row.run?.model?conversationModelLabel(row.run.model,context.connections,context.modelCatalog,{modelAccountId:row.run.modelAccountId}):undefined);
    const openRow=()=>{dismissRowTooltips();context.setSettings(false);void context.openConversation(row.workspaceId,row.id,{preserveVisibility:true,preserveHistoryView:keepHistoryOpen});};
    return <div key={row.workspaceId+':'+row.id} style={conversationChildIndent(depth)} className={'ac-history-row'+(depth?' ac-conversation-child-row':'')+(context.scope?.workspaceId===row.workspaceId&&context.scope.conversationId===row.id?' is-selected':'')}>
      <ConversationHistoryRowTooltip rowId={row.id} meta={meta} hidden={hiddenBySettings} dismissNonce={tooltipDismissNonce} keyboardNavRef={keyboardNavRef} onOpenRow={openRow}>
        <span className="ac-history-row-title">
          <span className="ac-history-row-heading">
            <button type="button" className="ac-history-row-open" aria-description={meta || undefined} onClick={openRow}><strong title={meta ? undefined : row.title}>{row.title}</strong></button>
            {branch&&<button type="button" className="ac-history-child-toggle" aria-expanded={branch.expanded} aria-disabled={branch.forced||undefined}
              aria-label={`${branch.expanded?'收起':'展开'}「${row.title}」的 ${branch.count} 个子对话`} title={branch.forced?'为保留当前对话或搜索结果，暂时保持展开':`${branch.count} 个已加载的子对话`} onClick={toggle}>
              <RightOutlined aria-hidden="true" rotate={branch.expanded?90:0}/><span>{branch.count}</span>
            </button>}
          </span>
          <ConversationActivityStatus state={activityState(row)}/><DraftStatusBadge visible={shouldShowConversationDraft(row,settledDraftIds)} immediateHide={activityState(row)!==null}/>
        </span>
        {sendActivity(row)?.reason&&<span className="ac-send-reason">{sendActivity(row)?.reason}</span>}
        {row.searchSnippet&&<span className="ac-history-row-snippet" title={row.searchSnippet}>{row.searchSnippet}</span>}
      </ConversationHistoryRowTooltip>
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
  const sortGroup=(id:string)=><ConversationHistoryGroup key={id+scopeKey} workspaceId={id} name={workspaceName(id)} query={searchQuery} hidden={hidden} agent={agent} model={model} draftConversationIds={workspaceConversationDraftIds(id,settledDraftIds,presence,activeEditingScope)} activeViewingId={activeEditingScope?.workspaceId===id?activeEditingScope.conversationId:null} selectedId={context.scope?.workspaceId===id?context.scope.conversationId:undefined} renderRow={renderRow} onResult={reportGroup}
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
    <div className="ac-history-body">
      <div className="ac-history-toolbar">
        {showBackToConversation&&<Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回当前对话" title="返回当前对话" onClick={()=>context.setView('conversation')}/>}
        <ScopedSearch label="搜索对话" placeholder="搜索对话" query={query} onQueryChange={setQuery} scopeLabel="对话列表工作空间"
          scope={workspaceId} options={[{value:'',label:'全部工作空间'},...workspaces.map(item=>({value:item.id,label:item.name}))]}
          onScopeChange={value=>{setWorkspaceId(value);setFilter(null);}} />
        {!context.open&&<Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" title="新建对话" onClick={()=>context.newConversation({preserveVisibility:true,preserveHistoryView:keepHistoryOpen})}/>}
        {headerAction}
      </div>
      
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
