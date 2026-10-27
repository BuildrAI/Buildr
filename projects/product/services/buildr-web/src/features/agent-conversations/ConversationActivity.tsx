import { useAgentConversations } from './AgentConversationsContext';
import { ConversationActivityEntry, type ActivityPopupControl } from './ConversationActivityEntry';
import { activityState, conversationMetadata } from './conversation-activity';
import type { ConversationWorkspace } from './ConversationHistory';

export function ConversationActivity({workspaces,...popup}:{workspaces:ConversationWorkspace[]}&ActivityPopupControl) {
  const context=useAgentConversations();
  return <ConversationActivityEntry {...popup} items={context.activityRows.map(row=>({id:row.id,workspaceId:row.workspaceId,title:row.title,meta:conversationMetadata(row),state:activityState(row)}))} total={context.activityTotal} error={context.activityError} hasMore={Boolean(context.activityCursor)} onMore={()=>void context.loadMoreActivity()} workspaces={workspaces} selectedId={context.scope?.conversationId} active={context.open&&context.view==='history'} side={context.side} onOpen={item=>void context.openConversation(item.workspaceId,item.id)} onHistory={()=>context.openHistory(null)} onToggleHistory={()=>context.toggleView('history')}/>;
}
