import {taskApi} from '../task/api/task-api';
import {workspaceApi} from '../workspace/api/workspace-api';
import {associationCandidates,associationKey,associationQueryReady,associationPages,prefixAssociationMatches,conversationAssociationItem,taskLinkKey,type AssociationItem,type AssociationResult} from './conversation-associations';
import type {ConversationTaskLink} from './types';
import type {AgentConversationsClient} from './api/agent-conversations-api';

export const ASSOCIATIONS_CHANGED='buildr-conversation-associations-changed';
export type AssociationWorkspace={id:string;name:string};
export async function associationWorkspaces(signal:AbortSignal):Promise<AssociationWorkspace[]>{
  const registry=await workspaceApi.listRegistered({signal});
  return registry.workspaces.flatMap(entry=>entry.workspace?.id&&entry.status!=='identity_conflict'?[{id:entry.workspace.id,name:entry.workspace.name}]:[]);
}
export async function linkedTaskItems(links:ConversationTaskLink[],signal:AbortSignal):Promise<AssociationItem[]>{
  signal.throwIfAborted();
  const groups=new Map<string,ConversationTaskLink[]>();
  for(const link of links)groups.set(link.workspaceId,[...(groups.get(link.workspaceId)??[]),link]);
  const rows=await Promise.all([...groups].map(async([workspaceId,group])=>{
    try{
      const result=await taskApi.titleSummaries(workspaceId,group.map(link=>link.taskId),{signal});
      const titles=new Map(result.items.map(item=>[item.taskId,item.title])),missing=new Set(result.missingTaskIds);
      return group.map(link=>({workspaceId,id:link.taskId,title:titles.get(link.taskId)??link.taskId,...(missing.has(link.taskId)?{error:'任务不存在。'}:{})}));
    }catch(failure){
      signal.throwIfAborted();
      return group.map(link=>({workspaceId,id:link.taskId,title:link.taskId,error:failure instanceof Error?failure.message:'任务暂时无法读取。'}));
    }
  }));
  const byKey=new Map(rows.flat().map(row=>[associationKey(row),row]));
  return links.map(link=>byKey.get(taskLinkKey(link))).filter((row):row is AssociationItem=>Boolean(row));
}
export async function searchTaskAssociations(workspaces:AssociationWorkspace[],query:string,signal:AbortSignal):Promise<AssociationResult>{
  const result:AssociationResult={items:[],errors:[]};
  if(!associationQueryReady(query))return result;
  for(const workspace of workspaces){
    try{
      await associationPages(async cursor=>{const page=await taskApi.list({status:'all',pageSize:'100',cursor},{signal},workspace.id);return {items:page.tasks,nextCursor:page.nextCursor};},signal,rows=>result.items.push(...prefixAssociationMatches(rows.map(({record})=>({workspaceId:workspace.id,id:record.taskId,title:record.title})),query)));
    }catch(failure){signal.throwIfAborted();result.errors.push(`${workspace.name}：${failure instanceof Error?failure.message:'读取失败。'}`);}
  }
  return {...result,items:associationCandidates(result.items)};
}
export async function searchConversationAssociations(api:AgentConversationsClient,query:string,signal:AbortSignal):Promise<AssociationResult>{
  const rows:AssociationItem[]=[],errors:string[]=[];
  if(!associationQueryReady(query))return {items:[],errors:[]};
  for(const hidden of [false,true]){
    try{await associationPages(async cursor=>{const page=await api.listAll({hidden,cursor,limit:100,signal});return {items:page.conversations,nextCursor:page.nextCursor};},signal,page=>rows.push(...page.map(conversationAssociationItem)));}
    catch(failure){signal.throwIfAborted();errors.push(`${hidden?'隐藏':'普通'}对话：${failure instanceof Error?failure.message:'读取失败。'}`);}
  }
  return {items:associationCandidates(prefixAssociationMatches(rows,query)),errors};
}
