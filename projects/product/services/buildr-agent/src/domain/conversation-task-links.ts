import type {ConversationView, ConversationTaskLink} from '../contracts.ts';

/** The complete relation lives on the conversation; legacy fields describe local links only. */
export function conversationTaskLinks(view: Pick<ConversationView,'workspaceId'|'taskId'|'taskIds'|'taskLinks'>): ConversationTaskLink[] {
  return view.taskLinks ?? (view.taskIds ?? (view.taskId ? [view.taskId] : [])).map(taskId=>({workspaceId:view.workspaceId,taskId}));
}
export function setConversationTaskLinks(view: ConversationView, links: ConversationTaskLink[]): void {
  view.taskLinks=links;
  view.taskIds=links.filter(link=>link.workspaceId===view.workspaceId).map(link=>link.taskId);
  view.taskId=view.taskIds[0];
}
export function sameTaskLink(left:ConversationTaskLink,right:ConversationTaskLink):boolean {
  return left.workspaceId===right.workspaceId&&left.taskId===right.taskId;
}
