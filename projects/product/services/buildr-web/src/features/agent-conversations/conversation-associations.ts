import type {ConversationTaskLink,ConversationView,ConversationSummary} from './types';

export type AssociationItem={workspaceId:string;id:string;title:string;error?:string};
export type AssociationResult={items:AssociationItem[];errors:string[]};
export const associationKey=(item:{workspaceId:string;id:string})=>JSON.stringify([item.workspaceId,item.id]);
export const taskLinkKey=(link:ConversationTaskLink)=>associationKey({workspaceId:link.workspaceId,id:link.taskId});
export function conversationTaskLinks(view:Pick<ConversationView,'workspaceId'|'taskId'|'taskIds'|'taskLinks'>):ConversationTaskLink[]{
  return view.taskLinks??(view.taskIds??(view.taskId?[view.taskId]:[])).map(taskId=>({workspaceId:view.workspaceId,taskId}));
}
/** Traverse bounded pages, never silently accept a repeated cursor as a complete search. */
export async function associationPages<T>(load:(cursor?:string)=>Promise<{items:T[];nextCursor?:string|null}>,signal:AbortSignal,onPage?:(items:T[])=>void):Promise<T[]>{
  const items:T[]=[],seen=new Set<string>();let cursor:string|undefined;
  do{
    signal.throwIfAborted();const page=await load(cursor);signal.throwIfAborted();items.push(...page.items);onPage?.(page.items);
    cursor=page.nextCursor??undefined;
    if(cursor){if(seen.has(cursor))throw new Error('分页位置重复，结果尚未完整读取。');seen.add(cursor);}
  }while(cursor);
  return items;
}
export function exactAssociationMatches(items:AssociationItem[],query:string):AssociationItem[]{
  const text=query.trim();return text?items.filter(item=>item.id===text||item.title===text):[];
}
export function conversationAssociationItem(row:ConversationSummary):AssociationItem{return {workspaceId:row.workspaceId,id:row.id,title:row.title};}
