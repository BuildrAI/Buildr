import { createHash } from 'node:crypto';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, type StoredConversation } from './agent-state.ts';

/** Only meaningful visible message changes advance activity, including streamed additions. */
export function messageSignature(record: StoredConversation): string {
  const messages = record.view.entries.filter(entry => !entry.parentToolId && !entry.thinking && (entry.kind === 'message' && ['user','assistant'].includes(entry.role) || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-')) && entry.status !== 'failed')
    .map(entry => [entry.id, entry.text, entry.attachments ?? []]);
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}
/** A new visible message moves the row; streaming the same message keeps its position stable. */
export function messageActivityAt(record: StoredConversation): string | undefined {
  return record.view.entries.filter(entry => !entry.parentToolId && !entry.thinking && entry.status !== 'failed' &&
    (entry.kind === 'message' && ['user','assistant'].includes(entry.role) || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-')))
    .reduce<string|undefined>((latest,entry) => !latest || entry.createdAt > latest ? entry.createdAt : latest,undefined);
}
/** 保留独立的用户输入时间：用户消息与对问题的答复。 */
export function userActivityAt(record: StoredConversation): string | undefined {
  let latest: string | undefined = record.view.forkedFrom?.forkedAt;
  for (const entry of record.view.entries) {
    const fromUser = entry.kind === 'message' && entry.role === 'user' || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-');
    if (!fromUser || entry.parentToolId || entry.status === 'failed') continue;
    if (!latest || entry.createdAt > latest) latest = entry.createdAt;
  }
  return latest;
}
/** Attention is independent of whether a native question blocks execution. */
export function pendingDecisionCount(view: Pick<ConversationView, 'requests'|'run'|'retainedRuns'>): number {
  const runs = [view.run, ...view.retainedRuns ?? []];
  return view.requests.filter(request => {
    const run = runs.find(run => run && run.id === request.runId);
    if (!run) return true; // Legacy requests may lack an execution identity.
    return !run.supersededBy && !run.resourcesReleased && !['completed','failed','stopped'].includes(run.status) &&
      (!request.participantId || request.participantId === run.participantId) &&
      (!request.generation || request.generation === run.generation);
  }).length;
}
export function summaryView(record: StoredConversation, version: number, seenThrough: number, updatedAt: string): ConversationView {
  const view = record.view;
  const pending=(run:NonNullable<ConversationView['run']>)=>!run.supersededBy&&((!run.resourcesReleased&&BUSY_STATES.has(run.status))||run.tools.some(tool=>tool.status!=='completed'));
  const decisions=pendingDecisionCount(view);
  return {
    ...view, titleState:view.titleState??{status:'unknown'}, entries: [], requests: [], nextEntryCursor: undefined,
    retainedRuns:view.retainedRuns?.map(run=>({...run,tools:[]})),
    run: view.run ? {...view.run, tools: []} : undefined,
    participants: record.participants.map(p => ({id:p.id,provider:p.provider as ConversationView['participants'][number]['provider'],connectionId:p.connectionId,label:p.label,model:p.modelId,modelAccountId:p.modelAccountId,deliveredThrough:p.deliveredThrough,contextId:''})),
    activity: {version, seenThrough, updatedAt, pendingDecisionCount:decisions, active: decisions > 0 || (Boolean(view.retainedRuns?.some(pending)) || !(view.hidden && view.run?.executionState === 'ended' && view.run.resourcesReleased && view.run.status === 'unknown')) && (Boolean(view.run&&pending(view.run)) || view.retainedRuns?.some(pending) || version > seenThrough)},
  };
}
