import { createHash } from 'node:crypto';
import type { ConversationView } from '../contracts.ts';
export type WebhookEnvelope = { eventId: string; conversationId: string; workspaceId: string; eventType: NotificationType; summary: string; timestamp: string; agent: { name: string; id: string }; machine: string; [key: string]: unknown };

export const NOTIFICATION_TYPES = ['task_started','status_changed','reply','pending_question','pending_approval','completed','error'] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
const summaries: Record<NotificationType,string> = { task_started:'对话执行已开始',status_changed:'对话状态已更新',reply:'有新回复，请使用 agent read 获取正文',pending_question:'对话等待问题回答',pending_approval:'对话等待审批',completed:'对话执行已完成',error:'对话执行出错' };
export type NotificationSnapshot = { sequence:number; state:string; runs:Record<string,string>; requests:Record<string,string>; replies:Record<string,string> };
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** All providers share one lightweight contract; message text never enters its state or events. */
export function conversationNotifications(view: ConversationView, agent: {name:string;id:string}, machine: string, prior?: NotificationSnapshot): {snapshot:NotificationSnapshot;events:WebhookEnvelope[]} {
  const snapshot:NotificationSnapshot={sequence:prior?.sequence??0,state:'',runs:{...prior?.runs},requests:{},replies:{...prior?.replies}};
  const events:WebhookEnvelope[]=[];
  const emit=(eventType:NotificationType, identity:unknown, fields:Record<string,unknown>={})=>{
    const sequence=++snapshot.sequence;
    events.push({eventId:digest([agent.id,view.workspaceId,view.id,eventType,identity,sequence]),conversationId:view.id,workspaceId:view.workspaceId,agent,machine,eventType,summary:summaries[eventType],timestamp:view.updatedAt,sequence,revision:view.revision,...fields});
  };
  const runs=[view.run,...(view.retainedRuns??[])].filter((run):run is NonNullable<typeof run>=>Boolean(run));
  const safeRuns=runs.map(run=>({id:run.id,participantId:run.participantId,generation:run.generation,status:run.status,accepted:run.accepted,stopRequested:run.stopRequested,resourcesReleased:run.resourcesReleased,executionState:run.executionState,supersededBy:run.supersededBy,tools:run.tools?.map(tool=>({id:tool.id,status:tool.status}))}));
  for (const run of runs) {
    const previous=prior?.runs[run.id];
    if (!previous && !['completed','failed','stopped'].includes(run.status)) emit('task_started',run.id,{runId:run.id});
    if (run.status!==previous && ['completed','failed'].includes(run.status)) emit(run.status==='completed'?'completed':'error',[run.id,run.status],{runId:run.id,...(run.status==='failed'?{diagnostic:run.diagnostic?.slice(0,1024)}: {})});
    snapshot.runs[run.id]=run.status;
  }
  for (const request of view.requests) {
    const key=JSON.stringify([request.runId,request.id]);
    const safe={id:request.id,runId:request.runId,participantId:request.participantId,generation:request.generation,kind:request.kind,blocking:request.blocking,...(request.kind==='question'?{title:request.title,description:request.description,options:request.options,questions:request.questions}:{})};
    const signature=digest(safe);snapshot.requests[key]=signature;
    if (prior?.requests[key]!==signature) emit(request.kind==='approval'?'pending_approval':'pending_question',[key,signature],{request:safe});
  }
  const closedRequests=Object.keys(prior?.requests??{}).filter(key=>!snapshot.requests[key]).map(key=>{const [runId,requestId]=JSON.parse(key);return{runId,requestId,status:'closed'};});
  const state={runs:safeRuns,requests:snapshot.requests,pendingSend:view.pendingSend?{id:view.pendingSend.id,state:view.pendingSend.state,revision:view.pendingSend.revision}:null,hidden:view.hidden,title:view.title};
  snapshot.state=digest(state);
  if (snapshot.state!==prior?.state) emit('status_changed',snapshot.state,{...state,...(closedRequests.length?{closedRequests}: {})});
  for (const entry of view.entries) {
    if (entry.kind!=='message'||entry.role!=='assistant'||entry.thinking) continue;
    const owner=runs.find(run=>run.id===entry.runId)??(!entry.runId?view.run:undefined);
    if (!['completed','failed'].includes(entry.status??'')&&!['completed','failed','stopped'].includes(owner?.status??'')) continue;
    const safe={entryId:entry.id,runId:entry.runId,entrySequence:entry.sequence,status:entry.status};
    const signature=digest([entry.id,entry.runId,entry.sequence]);snapshot.replies[entry.id]=signature;
    if (prior?.replies[entry.id]!==signature) emit('reply',[entry.id,signature],safe);
  }
  return{snapshot,events};
}
