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
export const ASSOCIATION_SEARCH_MIN_LENGTH=2;
export const ASSOCIATION_SEARCH_LIMIT=5;
export function associationQueryReady(query:string):boolean{return Array.from(query.trim()).length>=ASSOCIATION_SEARCH_MIN_LENGTH;}
export function prefixAssociationMatches(items:AssociationItem[],query:string):AssociationItem[]{
  const text=query.trim();return associationQueryReady(text)?items.filter(item=>item.id.startsWith(text)||item.title.startsWith(text)):[];
}
export function conversationAssociationItem(row:ConversationSummary):AssociationItem{return {workspaceId:row.workspaceId,id:row.id,title:row.title};}

/** Keep the same ordering and cap across both association endpoints. */
export function associationCandidates(items:AssociationItem[]):AssociationItem[]{
  return [...new Map(items.map(item=>[associationKey(item),item])).values()].slice(0,ASSOCIATION_SEARCH_LIMIT);
}
