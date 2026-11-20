import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext.tsx';
import { useConversationHistoryPage } from './useConversationHistoryPage.ts';
import { HISTORY_GROUP_LIMIT } from './conversation-history-groups.ts';
import { advanceWorkspaceSeenHold, applyConfirmedSeenActivity, invalidateWorkspaceHistoryCache, pinHeldConversationRow, type WorkspaceSeenHoldState } from './conversation-seen-hold.ts';
import { collapseConversationHistory, createConversationHistoryCache } from './conversation-history-page.ts';
import { nestVisibleConversations } from './conversation-children.ts';
import type { ConversationSummary } from './types.ts';

type Props = {
  workspaceId: string; name: string; query: string; hidden: boolean; agent?: string; model?: string; draftConversationIds?: readonly string[]; activeViewingId?: string | null;
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>; className: string; onDragOver: HTMLAttributes<HTMLElement>['onDragOver']; onDrop: HTMLAttributes<HTMLElement>['onDrop'];
  renderRow(row: ConversationSummary, depth: number): ReactNode;
  onNew?():void;
  onResult?(workspaceId:string,result:{total?:number;busy:boolean;error:boolean}):void;
};
export function ConversationHistoryGroup({workspaceId, name, query, hidden, agent, model, draftConversationIds, activeViewingId, headerProps, renderRow, onResult, onNew, ...section}: Props) {
  const {api,historyCache:retainedCache,activityTick,activityWorkspaceTicks,seenActivities,conversation,activityRows} = useAgentConversations();
  const [localCache]=useState(createConversationHistoryCache),historyCache=retainedCache??localCache;
  const [expanded, setExpanded] = useState(()=>!historyCache?.collapsed.has(workspaceId)), dragged = useRef(false), contentId = useId();
  const rawVersion=activityWorkspaceTicks?'workspace:'+(activityWorkspaceTicks[workspaceId]??0):'global:'+activityTick;
  const holdRef=useRef<WorkspaceSeenHoldState|null>(null);
  const displayedRef=useRef<{rows:readonly ConversationSummary[];version?:number|string}>({rows:[]});
  const held=advanceWorkspaceSeenHold({previous:holdRef.current,activeViewingId:activeViewingId??null,workspaceId,rawVersion,displayedRows:displayedRef.current.rows,displayedVersion:displayedRef.current.version,activityRows,seenActivities,activeConversation:conversation});
  if(held.invalidateCache)invalidateWorkspaceHistoryCache(historyCache,workspaceId);
  holdRef.current=held.hold;
  useEffect(()=>()=>{if(holdRef.current?.refreshedDuringHold)invalidateWorkspaceHistoryCache(historyCache,workspaceId);},[historyCache,workspaceId]);
  const {page, busy, error, retry, retryLabel, loadMore} = useConversationHistoryPage(api, {workspaceId, query, hidden, agent, model, draftConversationIds}, HISTORY_GROUP_LIMIT, expanded,historyCache,held.effectiveVersion);
  useEffect(()=>{onResult?.(workspaceId,{total:page?.total,busy,error:Boolean(error)});},[onResult,workspaceId,page?.total,busy,error]);
  const rows = page?.conversations ?? [];
  displayedRef.current={rows,version:page?held.effectiveVersion:undefined};
  const total = page?.total ?? rows.length;
  // The group already knows how many rows exist, so a reset window can show the
  // entry immediately; only the continuation cursor still needs the fresh read.
  const more = Boolean(page && (page.nextCursor || total > rows.length));
  const pinned=pinHeldConversationRow(rows,holdRef.current);
  if(pinned.displaced&&holdRef.current)holdRef.current={...holdRef.current,refreshedDuringHold:true};
  const visible = pinned.rows.map(row=>applyConfirmedSeenActivity(row,seenActivities,conversation,activityRows));
  if (page && !total && !error && (!onNew || query || agent || model)) return null;
  return <section {...section} data-history-workspace={workspaceId} aria-label={name} aria-busy={busy}>
    <h3 className={onNew?'ac-workspace-group-actions':undefined}><button {...headerProps} type="button" className="ac-history-group-toggle" aria-label={name} aria-expanded={expanded} aria-controls={contentId}
      onPointerDown={event=>{dragged.current=false;headerProps?.onPointerDown?.(event);}}
      onDragStart={event=>{dragged.current=true;headerProps?.onDragStart?.(event);}}
      onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')dragged.current=false;headerProps?.onKeyDown?.(event);}}
      onClick={()=>{if(dragged.current){dragged.current=false;return;}if(expanded&&historyCache)collapseConversationHistory(historyCache,workspaceId);else historyCache?.collapsed.delete(workspaceId);setExpanded(value=>!value);}}>
      {onNew&&<RightOutlined aria-hidden="true" rotate={expanded?90:0}/>}
      <span className="ac-history-group-name" title={name}>{name}</span><small>{page ? total : '…'}</small>{!onNew&&<RightOutlined aria-hidden="true" rotate={expanded?90:0}/>}
    </button>{onNew&&<Button type="text" size="small" icon={<PlusOutlined aria-hidden/>} aria-label={`在${name}新建对话`} title={`在「${name}」新建对话`} onClick={onNew}/>}</h3>
    {expanded&&<div id={contentId}>
      <div className="ac-history-list">{nestVisibleConversations(visible).map(({row,depth})=>renderRow(row,depth))}</div>
      {error && <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>{retryLabel}</Button>}/>}
      {busy && !page && <Spin size="small"/>}
      {more&&<div className="ac-history-group-actions"><Button type="text" size="small" className="ac-history-expand" disabled={busy||!page?.nextCursor} loading={busy} onClick={loadMore}>加载更多</Button></div>}
    </div>}
  </section>;
}
