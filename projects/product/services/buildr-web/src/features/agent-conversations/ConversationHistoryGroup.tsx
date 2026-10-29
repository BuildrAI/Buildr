import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useAgentConversations } from './AgentConversationsContext';
import { useConversationHistoryPage } from './useConversationHistoryPage';
import { HISTORY_GROUP_BATCH, HISTORY_GROUP_LIMIT } from './conversation-history-groups';
import { activityState } from './conversation-activity';
import type { ConversationSummary } from './types';

type Props = {
  workspaceId: string; name: string; query: string; hidden: boolean; agent?: string; model?: string;
  handle?: ReactNode; className: string; onDragOver: HTMLAttributes<HTMLElement>['onDragOver']; onDrop: HTMLAttributes<HTMLElement>['onDrop'];
  renderRow(row: ConversationSummary): ReactNode;
};
export function ConversationHistoryGroup({workspaceId, name, query, hidden, agent, model, handle, renderRow, ...section}: Props) {
  const {api} = useAgentConversations();
  const [count, setCount] = useState(HISTORY_GROUP_LIMIT);
  const {page, busy, error, retry} = useConversationHistoryPage(api, {workspaceId, query, hidden, agent, model}, count);
  const rows = page?.conversations ?? [];
  const total = page?.total ?? rows.length;
  const priority = (row: ConversationSummary) => { const state = activityState(row); return state === 'waiting' || state === 'unseen' ? 0 : state === 'unknown' ? 1 : state === 'running' ? 2 : 3; };
  const visible = [...rows].sort((a, b) => priority(a) - priority(b)).slice(0, count);
  const remaining = total - visible.length;
  if (page && !total && !error) return null;
  return <section {...section} data-history-workspace={workspaceId} aria-label={name} aria-busy={busy}>
    <h3><span className="ac-history-group-name" title={name}>{name}</span><small>{page ? total : '…'}</small>{handle}</h3>
    <div className="ac-history-list">{visible.map(renderRow)}</div>
    {error && <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={retry}>重试</Button>}/>}
    {busy && !page && <Spin size="small"/>}
    <div className="ac-history-group-actions">
      {remaining > 0 && <Button type="text" size="small" className="ac-history-expand" disabled={busy} loading={busy} aria-expanded={visible.length > HISTORY_GROUP_LIMIT} onClick={() => setCount(visible.length + Math.min(HISTORY_GROUP_BATCH, remaining))}>再展开 {Math.min(HISTORY_GROUP_BATCH, remaining)} 条</Button>}
      {count > HISTORY_GROUP_LIMIT && <Button type="text" size="small" className="ac-history-expand" onClick={() => setCount(HISTORY_GROUP_LIMIT)}>收起</Button>}
    </div>
  </section>;
}
