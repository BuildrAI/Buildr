import {taskApi} from '../task/api/task-api';
import {workspaceApi} from '../workspace/api/workspace-api';
import {associationPages,exactAssociationMatches,associationKey,conversationAssociationItem,type AssociationItem,type AssociationResult} from './conversation-associations';
import type {ConversationTaskLink} from './types';
import type {AgentConversationsClient} from './api/agent-conversations-api';

export const ASSOCIATIONS_CHANGED='buildr-conversation-associations-changed';
export type AssociationWorkspace={id:string;name:string};
export async function associationWorkspaces(signal:AbortSignal):Promise<AssociationWorkspace[]>{
  const registry=await workspaceApi.listRegistered({signal});
  return registry.workspaces.flatMap(entry=>entry.workspace?.id&&entry.status!=='identity_conflict'?[{id:entry.workspace.id,name:entry.workspace.name}]:[]);
}
export async function linkedTaskItems(links:ConversationTaskLink[],signal:AbortSignal):Promise<AssociationItem[]>{
  return Promise.all(links.map(async link=>{
    try{const value=await taskApi.detail(link.taskId,{signal},link.workspaceId);return {workspaceId:link.workspaceId,id:link.taskId,title:value.record.title};}
    catch(failure){signal.throwIfAborted();return {workspaceId:link.workspaceId,id:link.taskId,title:link.taskId,error:failure instanceof Error?failure.message:'任务暂时无法读取。'};}
  }));
}
export async function searchTaskAssociations(workspaces:AssociationWorkspace[],query:string,signal:AbortSignal):Promise<AssociationResult>{
  const result:AssociationResult={items:[],errors:[]};
  for(const workspace of workspaces){
    try{
      await associationPages(async cursor=>{const page=await taskApi.list({status:'all',pageSize:'100',cursor},{signal},workspace.id);return {items:page.tasks,nextCursor:page.nextCursor};},signal,rows=>result.items.push(...exactAssociationMatches(rows.map(({record})=>({workspaceId:workspace.id,id:record.taskId,title:record.title})),query)));
    }catch(failure){signal.throwIfAborted();result.errors.push(`${workspace.name}：${failure instanceof Error?failure.message:'读取失败。'}`);}
  }
  return {...result,items:[...new Map(result.items.map(item=>[associationKey(item),item])).values()]};
}
export async function searchConversationAssociations(api:AgentConversationsClient,query:string,signal:AbortSignal):Promise<AssociationResult>{
  const rows:AssociationItem[]=[],errors:string[]=[];
  for(const hidden of [false,true]){
    try{await associationPages(async cursor=>{const page=await api.listAll({hidden,cursor,limit:100,signal});return {items:page.conversations,nextCursor:page.nextCursor};},signal,page=>rows.push(...page.map(conversationAssociationItem)));}
    catch(failure){signal.throwIfAborted();errors.push(`${hidden?'隐藏':'普通'}对话：${failure instanceof Error?failure.message:'读取失败。'}`);}
  }
  return {items:[...new Map(exactAssociationMatches(rows,query).map(item=>[associationKey(item),item])).values()],errors};
}
