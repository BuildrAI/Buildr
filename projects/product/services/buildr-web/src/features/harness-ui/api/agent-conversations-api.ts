import {api} from '../../../api';
import type {ConversationView,ConversationSummary,CatalogModel} from '../types';
import type {AgentParticipationParticipation,AgentParticipationSummaryParticipationSummary,AgentParticipationSummaryQueryParticipationSummaryQuery} from '../../../../build/generated/agent-service-http-dto';
const app='/api/v1/app/agent-service';
const path=(workspaceId:string,id?:string)=>workspaceId.startsWith('scope:')?'/api/v2/agent-service/scopes/'+encodeURIComponent(workspaceId)+'/conversations'+(id?'/'+encodeURIComponent(id):''):'/api/v1/workspaces/'+encodeURIComponent(workspaceId)+'/agent-service/conversations'+(id?'/'+encodeURIComponent(id):'');
const query=(input:Record<string,unknown>)=>new URLSearchParams(Object.entries(input).filter(([key,value])=>key!=='signal'&&value!==undefined&&value!=='').map(([key,value])=>[key,String(value)]));
const get=<T,>(url:string,signal?:AbortSignal)=>api(url,{signal,headers:{'x-buildr-session':''}}) as Promise<T>;
export const agentConversationsApi={
 entryReference(workspaceId:string,id:string,entryId:string,revision:string,signal?:AbortSignal){return get<ConversationView['entries'][number]>(path(workspaceId,id)+'/entry-detail/'+encodeURIComponent(entryId)+'?'+new URLSearchParams({revision}),signal);},
 list(workspaceId:string,options:{taskId?:string;cursor?:string;hidden?:boolean;query?:string;signal?:AbortSignal}={}){return get<{conversations:ConversationSummary[];nextCursor?:string}>(path(workspaceId)+'?'+query(options),options.signal);},
 listAll(options:{hidden?:boolean;cursor?:string;limit?:number;signal?:AbortSignal}={}){return get<{conversations:ConversationView[];nextCursor?:string}>(app+'/conversations?'+query(options),options.signal);},
 read(workspaceId:string,id:string,signal?:AbortSignal){return get<ConversationView>(path(workspaceId,id),signal);},
 update(view:ConversationView,input:{taskLinks:{workspaceId:string;taskId:string}[]}){return api(path(view.workspaceId,view.id),{method:'PATCH',body:JSON.stringify({...input,expectedRevision:view.revision})}) as Promise<ConversationView>;},
 modelCatalog(signal?:AbortSignal){return get<{models:CatalogModel[];hasSnapshot?:boolean;diagnostic?:string}>(app+'/model-catalog',signal);},
 participation(workspaceId:string,id:string,runId:string,signal?:AbortSignal){return get<AgentParticipationParticipation>(path(workspaceId,id)+'/participation?runId='+encodeURIComponent(runId),signal);},
 participationSummary(workspaceId:string,input:AgentParticipationSummaryQueryParticipationSummaryQuery={},signal?:AbortSignal){return get<AgentParticipationSummaryParticipationSummary>(path(workspaceId)+'/participation-summary?'+query({...input}),signal);},
};
export type AgentConversationsClient=typeof agentConversationsApi;
