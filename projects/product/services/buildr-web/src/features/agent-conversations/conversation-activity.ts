import type { ConversationSummary } from './types';
export type ActivityState = 'running'|'waiting'|'unknown'|'unseen'|'send-waiting'|'send-failed'|null;
export type ActivityFilter = Exclude<ActivityState,null>|'attention'|null;
export type ActivityCounts = {pendingSend?:number;active:number;running:number;waiting:number;unseen:number;unknown:number;attention:number};
export function activityBadge(counts:ActivityCounts|undefined) {
  if(!counts)return null;
  const pending=counts.waiting+counts.unseen;
  return pending>0?{kind:'attention' as const,count:pending,label:'待处理'}:counts.running>0?{kind:'running' as const,count:counts.running,label:'执行中'}:counts.pendingSend?{kind:'active' as const,count:counts.pendingSend,label:'活动中'}:null;
}
export function activityReminder(counts:ActivityCounts|undefined,stale=false):string {
  if(!counts)return '对话提醒尚未读取';
  return `待处理 ${counts.waiting+counts.unseen}（待决策 ${counts.waiting}、待查看 ${counts.unseen}），执行中 ${counts.running}${counts.pendingSend?`，待发送 ${counts.pendingSend}`:''}${counts.unknown?`；${counts.unknown} 个执行状态需确认`:''}${stale?'（未更新，保留上次结果）':''}`;
}
export const isExecuting = (row:ConversationSummary) => ['starting','running','stopping'].includes(row.run?.status??'');
function pendingDecisions(row:ConversationSummary):number {
  if(row.activity?.pendingDecisionCount!==undefined)return row.activity.pendingDecisionCount;
  const runs=[row.run,...row.retainedRuns??[]];
  return (row.requests??[]).filter(request=>{
    const run=runs.find(run=>run&&run.id===request.runId);
    return !run || !run.supersededBy&&!run.resourcesReleased&&!['completed','failed','stopped'].includes(run.status)&&
      (!request.participantId||request.participantId===run.participantId)&&(!request.generation||request.generation===run.generation);
  }).length;
}
export function pendingSendReason(pending:{state:string;reason:string}):string {
  return pending.state==='dispatching'?'正在投递，尚未确认受理。':pending.reason;
}
export function sendActivity(row:ConversationSummary) {
  const pending=row.pendingSend;
  return pending?{state:pending.state==='failed'?'failed' as const:'waiting' as const,reason:pendingSendReason(pending),updatedAt:pending.updatedAt}:row.activity?.pendingSend;
}
export function activityState(row:ConversationSummary):ActivityState {
  const submitted=sendActivity(row);
  if(submitted)return submitted.state==='failed'?'send-failed':'send-waiting';
  if(pendingDecisions(row)>0)return 'waiting';
  if(row.run?.status==='unknown')return 'unknown';
  if(['waiting-approval','waiting-question'].includes(row.run?.status??''))return 'waiting';
  if(isExecuting(row))return 'running';
  if(row.activity&&row.activity.version>row.activity.seenThrough)return 'unseen';
  return null;
}
/** The global activity snapshot keeps rows that are active only for an old unknown run; they belong to no reminder group. */
export function reminderFallbackRows<T extends ConversationSummary>(rows:readonly T[]) {
  const pending:T[]=[],running:T[]=[];
  for(const row of rows){
    if(isExecuting(row))running.push(row);
    const state=activityState(row);
    if(state==='waiting'||state==='unseen'||state==='unknown'||state==='send-waiting'||state==='send-failed')pending.push(row);
  }
  return {pending,running};
}
export const isActiveConversation=(row:ConversationSummary)=>Boolean(row.activity?.active||activityState(row));
export function orderActivityItems<T extends {id:string;state:ActivityState;updatedAt?:string;userInputAt?:string}>(items:readonly T[]):T[] {
  const priority=(item:T)=>item.state==='waiting'||item.state==='unseen'||item.state==='send-failed'?0:1;
  const at=(item:T)=>item.userInputAt??item.updatedAt;
  return [...items].sort((a,b)=>priority(a)-priority(b)||(at(a)&&at(b)?at(b)!.localeCompare(at(a)!)||b.id.localeCompare(a.id):0));
}
export function conversationMetadata(row:ConversationSummary,workspaceName?:string,modelLabel?:string) {
  const names:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
  const background=[row.run,...row.retainedRuns??[]].some(run=>run&&!run.supersededBy&&run.status==='tools-active');
  return [background?'后台作业运行中':undefined,workspaceName, row.run?(names[row.run.provider]||row.run.provider):undefined,modelLabel??row.run?.model].filter(Boolean).join(' · ');
}

/** Preserve the caller's priority order without splitting a workspace by status. */
export function groupConversationWorkspaces<T extends {workspaceId:string}>(items:readonly T[]):Map<string,T[]> {
  const groups=new Map<string,T[]>();
  for(const item of items){const group=groups.get(item.workspaceId);if(group)group.push(item);else groups.set(item.workspaceId,[item]);}
  return groups;
}

/** A complete global snapshot already contains both reminder groups. Never infer completeness from a page count alone. */
export function completeActivitySnapshot(rows:readonly ConversationSummary[],total:number,cursor:string|undefined,counts:ActivityCounts|undefined,error:string):boolean {
  return Boolean(counts&&!error&&!cursor&&rows.length===total&&new Set(rows.map(row=>row.workspaceId+':'+row.id)).size===total);
}
