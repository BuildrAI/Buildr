import type { ConversationSummary } from './types';
export type ActivityState = 'running'|'waiting'|'unknown'|'unseen'|null;
export type ActivityFilter = Exclude<ActivityState,null>|'attention'|null;
export type ActivityCounts = {active:number;running:number;waiting:number;unseen:number;unknown:number;attention:number};
export const activityFilterLabels = {active:'全部活动',attention:'需关注',waiting:'待处理',unseen:'待查看',running:'执行中',unknown:'状态待确认'} as const;
export function activityBadge(counts:ActivityCounts|undefined) {
  if(!counts)return null;
  const pending=counts.waiting+counts.unseen;
  return pending>0?{kind:'attention' as const,count:pending,label:'待处理'}:counts.running>0?{kind:'running' as const,count:counts.running,label:'执行中'}:null;
}
export function activityReminder(counts:ActivityCounts|undefined,stale=false):string {
  if(!counts)return '对话提醒尚未读取';
  return `待处理 ${counts.waiting+counts.unseen}（待决策 ${counts.waiting}、待查看 ${counts.unseen}），执行中 ${counts.running}${counts.unknown?`；${counts.unknown} 个执行状态需确认`:''}${stale?'（未更新，保留上次结果）':''}`;
}
export const isExecuting = (row:ConversationSummary) => ['starting','running','stopping','tools-active'].includes(row.run?.status??'');
export function activityState(row:ConversationSummary):ActivityState {
  if(row.run?.status==='unknown')return 'unknown';
  if(['waiting-approval','waiting-question'].includes(row.run?.status??''))return 'waiting';
  if(isExecuting(row))return 'running';
  if(row.activity&&row.activity.version>row.activity.seenThrough)return 'unseen';
  return null;
}
export const isActiveConversation=(row:ConversationSummary)=>Boolean(row.activity?.active||activityState(row));
export function conversationMetadata(row:ConversationSummary,workspaceName?:string,modelLabel?:string) {
  const names:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
  return [workspaceName, row.run?(names[row.run.provider]||row.run.provider):undefined,modelLabel??row.run?.model].filter(Boolean).join(' · ');
}
