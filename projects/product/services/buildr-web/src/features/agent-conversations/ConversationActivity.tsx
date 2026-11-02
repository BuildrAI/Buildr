import { ConversationExecutionSummary } from './ConversationExecutionSummary';
import { conversationModelLabel, conversationModelSourceLabel } from './conversation-model-label';
import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityEntry, type ActivityPopupControl } from './ConversationActivityEntry';
import { activityState, conversationMetadata, isExecuting, reminderFallbackRows, completeActivitySnapshot } from './conversation-activity';
import { useConversationReminderPages } from './useConversationReminderPages';
import type { ConversationWorkspace } from './ConversationHistory';

export function ConversationActivity({workspaces,...popup}:{workspaces:ConversationWorkspace[]}&ActivityPopupControl) {
  const context=useAgentConversations();
  const shared=completeActivitySnapshot(context.activityRows,context.activityTotal,context.activityCursor,context.activityCounts,context.activityError);
  const reminder=useConversationReminderPages(context.api,!shared&&Boolean(popup.open)&&!(context.open&&context.view==='history'));
  const fallback=reminderFallbackRows(context.activityRows);
  const pending=shared?fallback.pending:reminder.pages.attention?.conversations??fallback.pending;
  const running=shared?fallback.running:reminder.pages.running?.conversations??fallback.running;
  const rows=[...new Map([...pending,...running].map(row=>[row.workspaceId+':'+row.id,row])).values()];
  const reminderError=shared?'':reminder.error;
  const focusPanel=()=>requestAnimationFrame(()=>{document.querySelector<HTMLElement>('#agent-conversation-panel .ac-thread-header button')?.focus();});
  return <ConversationActivityEntry {...popup} summary={<ConversationExecutionSummary stats={context.activityStats} sourceLabel={id=>conversationModelSourceLabel(id,context.modelCatalog)} stale={Boolean(context.activityError)} modelLabel={(id,accountId)=>conversationModelLabel(id,context.connections,context.modelCatalog,{modelAccountId:accountId})}/>} countsStale={Boolean(context.activityError||reminderError)} counts={context.activityCounts} emptyDescription={reminderError||context.activityError?'读取失败，保留上次结果。':undefined} items={rows.map(row=>({id:row.id,workspaceId:row.workspaceId,title:row.title,userInputAt:row.activity?.userInputAt,updatedAt:row.activity?.updatedAt,executing:isExecuting(row),meta:conversationMetadata(row,undefined,conversationModelLabel(row.run?.model,context.connections,context.modelCatalog,{modelAccountId:row.run?.modelAccountId})),state:activityState(row)}))} total={context.activityTotal} error={reminderError||context.activityError} hasMore={!shared&&reminder.hasMore} onMore={()=>void reminder.more()} workspaces={workspaces} selectedId={context.scope?.conversationId} active={context.open&&context.view==='history'} side={context.full?'left':context.side} onOpen={item=>{focusPanel();void context.openConversation(item.workspaceId,item.id);}} onHistory={()=>{focusPanel();context.openHistory(null);}} onToggleHistory={()=>context.toggleView('history')}/>;
}
