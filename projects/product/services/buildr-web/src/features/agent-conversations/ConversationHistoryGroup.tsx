import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { useConversationHistoryPage } from './useConversationHistoryPage';
import { HISTORY_GROUP_LIMIT } from './conversation-history-groups';
import { collapseConversationHistory, createConversationHistoryCache } from './conversation-history-page';
import type { ConversationSummary } from './types';

type Props = {
  workspaceId: string; name: string; query: string; hidden: boolean; agent?: string; model?: string;
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>; className: string; onDragOver: HTMLAttributes<HTMLElement>['onDragOver']; onDrop: HTMLAttributes<HTMLElement>['onDrop'];
  renderRow(row: ConversationSummary): ReactNode;
  onResult?(workspaceId:string,result:{total?:number;busy:boolean;error:boolean}):void;
};
export function ConversationHistoryGroup({workspaceId, name, query, hidden, agent, model, headerProps, renderRow, onResult, ...section}: Props) {
  const {api,historyCache:retainedCache,activityTick,activityWorkspaceTicks} = useAgentConversations();
  const [localCache]=useState(createConversationHistoryCache),historyCache=retainedCache??localCache;
  const [expanded, setExpanded] = useState(()=>!historyCache?.collapsed.has(workspaceId)), dragged = useRef(false), contentId = useId();
  const {page, busy, error, retry, retryLabel, loadMore} = useConversationHistoryPage(api, {workspaceId, query, hidden, agent, model}, HISTORY_GROUP_LIMIT, expanded,historyCache,activityWorkspaceTicks?'workspace:'+(activityWorkspaceTicks[workspaceId]??0):'global:'+activityTick);
  useEffect(()=>{onResult?.(workspaceId,{total:page?.total,busy,error:Boolean(error)});},[onResult,workspaceId,page?.total,busy,error]);
  const rows = page?.conversations ?? [];
  const total = page?.total ?? rows.length;
  // The group already knows how many rows exist, so a reset window can show the
  // entry immediately; only the continuation cursor still needs the fresh read.
  const more = Boolean(page && (page.nextCursor || total > rows.length));
  const visible = rows;
  if (page && !total && !error) return null;
  return <section {...section} data-history-workspace={workspaceId} aria-label={name} aria-busy={busy}>
    <h3><button {...headerProps} type="button" className="ac-history-group-toggle" aria-label={name} aria-expanded={expanded} aria-controls={contentId}
      onPointerDown={event=>{dragged.current=false;headerProps?.onPointerDown?.(event);}}
      onDragStart={event=>{dragged.current=true;headerProps?.onDragStart?.(event);}}
      onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')dragged.current=false;headerProps?.onKeyDown?.(event);}}
      onClick={()=>{if(dragged.current){dragged.current=false;return;}if(expanded&&historyCache)collapseConversationHistory(historyCache,workspaceId);else historyCache?.collapsed.delete(workspaceId);setExpanded(value=>!value);}}>
      <span className="ac-history-group-name" title={name}>{name}</span><small>{page ? total : '…'}</small><RightOutlined aria-hidden="true" rotate={expanded?90:0}/>
    </button></h3>
    {expanded&&<div id={contentId}>
      <div className="ac-history-list">{visible.map(renderRow)}</div>
      {error && <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>{retryLabel}</Button>}/>}
      {busy && !page && <Spin size="small"/>}
      {more&&<div className="ac-history-group-actions"><Button type="text" size="small" className="ac-history-expand" disabled={busy||!page?.nextCursor} loading={busy} onClick={loadMore}>加载更多</Button></div>}
    </div>}
  </section>;
}
