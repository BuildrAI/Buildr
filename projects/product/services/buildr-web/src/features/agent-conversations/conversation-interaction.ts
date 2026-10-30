import type { ConversationRequest, ConversationRun } from './types';

/** Waiting is a run fact; an unanswered card alone does not prove a global wait. */
export function questionStatus(request: ConversationRequest, run?: ConversationRun): string {
  if (request.kind === 'approval') return '需要你的授权';
  if (!run || run.status === 'unknown') return '待回答，执行状态待确认';
  if (run.status === 'running') return '待回答，执行仍在进行';
  if (run.status === 'waiting-question') return '等待必要信息';
  if (run.status === 'waiting-approval') return '待回答，执行等待授权';
  if (run.status === 'stopping') return '正在结束原轮等待';
  return '待回答，请核对执行状态';
}

export function hasBlockingQuestions(requests: ConversationRequest[]): boolean {
  return requests.some(request => request.kind === 'question' && request.blocking !== false);
}
