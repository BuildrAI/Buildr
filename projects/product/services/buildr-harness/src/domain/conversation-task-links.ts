import type {ConversationView, ConversationTaskLink, ConversationWorkObjectLink} from '../contracts.ts';
import {executionScopeKey, executionScopeRef} from '../execution-contracts.ts';

type Relations = Pick<ConversationView, 'workspaceId'|'taskId'|'taskIds'|'taskLinks'|'workObjectLinks'>;
/** Old records are read without rewriting or reinterpreting their original source. */
export function conversationWorkObjectLinks(view: Relations, legacySourceId = 'buildr'): ConversationWorkObjectLink[] {
  return view.workObjectLinks ?? conversationTaskLinks(view).map(link => {
    const scope = executionScopeRef(link.workspaceId, legacySourceId);
    return {sourceId: scope.sourceId, scopeId: scope.id, kind: 'work-item', id: link.taskId};
  });
}
export function conversationTaskLinks(view: Relations): ConversationTaskLink[] {
  return view.taskLinks ?? (view.taskIds ?? (view.taskId ? [view.taskId] : [])).map(taskId=>({workspaceId:view.workspaceId,taskId}));
}
export function sameWorkObject(left: ConversationWorkObjectLink, right: ConversationWorkObjectLink): boolean {
  return left.sourceId === right.sourceId && left.scopeId === right.scopeId && left.kind === right.kind && left.id === right.id;
}
export function setConversationWorkObjectLinks(view: ConversationView, links: ConversationWorkObjectLink[], legacySourceId = 'buildr'): void {
  view.workObjectLinks = links;
  view.taskLinks = links.filter(link => link.kind === 'work-item').map(link => {
    const scope = {sourceId: link.sourceId, id: link.scopeId};
    return {workspaceId: scope.sourceId === legacySourceId ? scope.id : executionScopeKey(scope), taskId: link.id};
  });
  view.taskIds = view.taskLinks.filter(link => link.workspaceId === view.workspaceId).map(link=>link.taskId);
  view.taskId = view.taskIds[0];
}
/** A legacy write only replaces the subset it can express, never unknown kinds. */
export function setConversationTaskLinks(view: ConversationView, links: ConversationTaskLink[], legacySourceId = 'buildr'): void {
  const unknown = conversationWorkObjectLinks(view, legacySourceId).filter(link=>link.kind !== 'work-item');
  const mapped = links.map(link => {
    const scope = executionScopeRef(link.workspaceId, legacySourceId);
    const ref = {sourceId: scope.sourceId, scopeId: scope.id, kind: 'work-item', id: link.taskId};
    return conversationWorkObjectLinks(view, legacySourceId).find(previous=>sameWorkObject(previous,ref)) ?? ref;
  });
  setConversationWorkObjectLinks(view, [...unknown, ...mapped], legacySourceId);
}
export function sameTaskLink(left:ConversationTaskLink,right:ConversationTaskLink):boolean {
  return left.workspaceId===right.workspaceId&&left.taskId===right.taskId;
}
export function sameTaskLinks(left:ConversationTaskLink[],right:ConversationTaskLink[]):boolean {
  return left.length===right.length&&left.every((link,index)=>sameTaskLink(link,right[index]!));
}
