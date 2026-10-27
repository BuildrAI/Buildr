import type { ConversationSummary } from './types';
export type ActivityState = 'running'|'waiting'|'unknown'|'unseen'|null;
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
