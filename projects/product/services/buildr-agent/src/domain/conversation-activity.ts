import { createHash } from 'node:crypto';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, unfinishedRun, type StoredConversation } from './agent-state.ts';

/** Only meaningful visible message changes advance activity, including streamed additions. */
export function messageSignature(record: StoredConversation): string {
  const messages = record.view.entries.filter(entry => !entry.parentToolId && (entry.kind === 'message' && ['user','assistant'].includes(entry.role) || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-')) && entry.status !== 'failed')
    .map(entry => [entry.id, entry.text, entry.attachments ?? []]);
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}
/** 列表顺序只跟随用户输入：用户消息与对问题的答复。 */
export function userActivityAt(record: StoredConversation): string | undefined {
  let latest: string | undefined = record.view.forkedFrom?.forkedAt;
  for (const entry of record.view.entries) {
    const fromUser = entry.kind === 'message' && entry.role === 'user' || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-');
    if (!fromUser || entry.parentToolId || entry.status === 'failed') continue;
    if (!latest || entry.createdAt > latest) latest = entry.createdAt;
  }
  return latest;
}
export function summaryView(record: StoredConversation, version: number, seenThrough: number, updatedAt: string): ConversationView {
  const view = record.view;
  return {
    ...view, titleState:view.titleState??{status:'unknown'}, entries: [], requests: [], nextEntryCursor: undefined,
    retainedRuns:view.retainedRuns?.map(run=>({...run,tools:[]})),
    run: view.run ? {...view.run, tools: []} : undefined,
    participants: record.participants.map(p => ({id:p.id,provider:p.provider as ConversationView['participants'][number]['provider'],connectionId:p.connectionId,label:p.label,model:p.modelId,modelAccountId:p.modelAccountId,deliveredThrough:p.deliveredThrough,contextId:''})),
    activity: {version, seenThrough, updatedAt, active: (Boolean(view.retainedRuns?.some(unfinishedRun)) || !(view.hidden && view.run?.executionState === 'ended' && view.run.resourcesReleased && view.run.status === 'unknown')) && (BUSY_STATES.has(view.run?.status as never) || view.retainedRuns?.some(unfinishedRun) || view.requests.length > 0 || version > seenThrough)},
  };
}
