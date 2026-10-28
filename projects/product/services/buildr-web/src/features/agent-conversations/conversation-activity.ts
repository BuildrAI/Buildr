import type { ConversationSummary } from './types';
export type ActivityState = 'running'|'waiting'|'unknown'|'unseen'|null;
export type ActivityFilter = Exclude<ActivityState,null>|'attention'|null;
export type ActivityCounts = {active:number;running:number;waiting:number;unseen:number;unknown:number;attention:number};
export const activityFilterLabels = {active:'全部活动',attention:'需关注',waiting:'待处理',unseen:'待查看',running:'执行中',unknown:'状态待确认'} as const;
export function activityReminder(counts:ActivityCounts|undefined,stale=false):string {
  if(!counts)return '活动分类尚未读取';
  return `活动 ${counts.active}，需关注 ${counts.attention}：待处理 ${counts.waiting}、待查看 ${counts.unseen}、状态待确认 ${counts.unknown}、执行中 ${counts.running}${stale?'（未更新，保留上次结果）':''}`;
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
  return [workspaceName, row.run?(names[row.run.provider]||row.run.provider):undefined,modelLabel??row.run?.model,new Date(row.activity?.updatedAt??row.updatedAt).toLocaleString()].filter(Boolean).join(' · ');
}
