import { useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { useConversationHistoryPage } from './useConversationHistoryPage';
import { HISTORY_GROUP_LIMIT } from './conversation-history-groups';
import type { ConversationSummary } from './types';

type Props = {
  workspaceId: string; name: string; query: string; hidden: boolean; agent?: string; model?: string;
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>; className: string; onDragOver: HTMLAttributes<HTMLElement>['onDragOver']; onDrop: HTMLAttributes<HTMLElement>['onDrop'];
  renderRow(row: ConversationSummary): ReactNode;
};
export function ConversationHistoryGroup({workspaceId, name, query, hidden, agent, model, headerProps, renderRow, ...section}: Props) {
  const {api} = useAgentConversations();
  const [expanded, setExpanded] = useState(true), dragged = useRef(false), contentId = useId();
  const {page, busy, error, retry, retryLabel, loadMore} = useConversationHistoryPage(api, {workspaceId, query, hidden, agent, model}, HISTORY_GROUP_LIMIT, expanded);
  const rows = page?.conversations ?? [];
  const total = page?.total ?? rows.length;
  const visible = rows;
  if (page && !total && !error) return null;
  return <section {...section} data-history-workspace={workspaceId} aria-label={name} aria-busy={busy}>
    <h3><button {...headerProps} type="button" className="ac-history-group-toggle" aria-label={name} aria-expanded={expanded} aria-controls={contentId}
      onPointerDown={event=>{dragged.current=false;headerProps?.onPointerDown?.(event);}}
      onDragStart={event=>{dragged.current=true;headerProps?.onDragStart?.(event);}}
      onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')dragged.current=false;headerProps?.onKeyDown?.(event);}}
      onClick={()=>{if(dragged.current){dragged.current=false;return;}setExpanded(value=>!value);}}>
      <span className="ac-history-group-name" title={name}>{name}</span><small>{page ? total : '…'}</small><RightOutlined aria-hidden="true" rotate={expanded?90:0}/>
    </button></h3>
    {expanded&&<div id={contentId}>
      <div className="ac-history-list">{visible.map(renderRow)}</div>
      {error && <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>{retryLabel}</Button>}/>}
      {busy && !page && <Spin size="small"/>}
      {page?.nextCursor&&<div className="ac-history-group-actions"><Button type="text" size="small" className="ac-history-expand" disabled={busy} loading={busy} onClick={loadMore}>加载更多</Button></div>}
    </div>}
  </section>;
}
