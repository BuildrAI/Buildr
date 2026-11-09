import { createHash } from 'node:crypto';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, conversationRuns, type StoredConversation } from './agent-state.ts';

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
/** Final visible assistant reply of the latest completed, non-superseded run. */
export function finalReplyActivityAt(record: StoredConversation): string | undefined {
  const run = record.view.run;
  if (!run || run.status !== 'completed' || run.supersededBy) return undefined;
  let latest: string | undefined;
  for (const entry of record.view.entries ?? []) {
    if (entry.kind !== 'message' || entry.role !== 'assistant') continue;
    if (entry.parentToolId || entry.thinking || entry.status === 'failed') continue;
    // Current entries carry the run identity; legacy entries fall back to the
    // run's start time rather than any later retained-round output.
    if (entry.runId ? entry.runId !== run.id : entry.createdAt < run.startedAt) continue;
    if (!latest || entry.createdAt > latest) latest = entry.createdAt;
  }
  return latest;
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
/** Closing attention preserves unknown outcomes; it never hides a live owner. */
export function hiddenReleasedOutcome(view: Pick<ConversationView, 'hidden'|'requests'|'run'|'retainedRuns'|'pendingSend'>): boolean {
  return Boolean(view.hidden && !view.pendingSend && conversationRuns(view).some(run => !run.supersededBy && run.status === 'unknown' && run.resourcesReleased) && !pendingDecisionCount(view) &&
    conversationRuns(view).every(run => run.supersededBy || run.executionState !== 'active' && !run.tools.some(tool => tool.status === 'running') &&
      (run.status === 'unknown' ? run.resourcesReleased : !BUSY_STATES.has(run.status) && (run.resourcesReleased || run.tools.every(tool => tool.status === 'completed')))));
}
/** A stop requested before acceptance is settled attention once no in-flight work remains. */
function unacceptedStopSettled(run: NonNullable<ConversationView['run']>): boolean {
  return run.status === 'unknown' && run.stopRequested === true && run.accepted === false &&
    run.executionState !== 'active' && (run.tools ?? []).every(tool => tool.status === 'completed');
}
/** Historical uncertainty is evidence, not proof of currently running work. */
export function conversationActive(view: ConversationView, version: number, seenThrough: number): boolean {
  const pending=(run:NonNullable<ConversationView['run']>, historical=false)=>{
    if(run.supersededBy)return false;
    if(unacceptedStopSettled(run))return false;
    if(run.status==='tools-active')return run.tools.some(tool=>tool.status==='unknown'); // Model ended; retain job controls without claiming model activity.
    // Historical uncertainty without any in-flight work is evidence, not a
    // reason to keep the conversation at the top of the list. Running or
    // unknown tools and an active execution state still protect real work.
    if(historical && run.status==='unknown' && run.executionState!=='active' && !run.tools.some(tool=>tool.status==='running'||tool.status==='unknown'))return false;
    if(historical && run.resourcesReleased && run.executionState!=='active' && !run.tools.some(tool=>tool.status==='running'))return false;
    return run.executionState==='active' || (!run.resourcesReleased&&BUSY_STATES.has(run.status)) || run.tools.some(tool=>tool.status!=='completed');
  };
  return pendingDecisionCount(view)>0 || !hiddenReleasedOutcome(view) &&
    (Boolean(view.run&&pending(view.run)) || Boolean(view.retainedRuns?.some(run=>pending(run,true))) || version>seenThrough);
}
export function summaryView(record: StoredConversation, version: number, seenThrough: number, updatedAt: string): ConversationView {
  const view = record.view;
  const decisions=pendingDecisionCount(view);
  return {
    ...view, titleState:view.titleState??{status:'unknown'}, entries: [], requests: [], nextEntryCursor: undefined,
    retainedRuns:view.retainedRuns?.map(run=>({...run,tools:[]})),
    run: view.run ? {...view.run, tools: []} : undefined,
    participants: record.participants.map(p => ({id:p.id,provider:p.provider as ConversationView['participants'][number]['provider'],connectionId:p.connectionId,label:p.label,model:p.modelId,modelAccountId:p.modelAccountId,deliveredThrough:p.deliveredThrough,contextId:''})),
    activity: {version, seenThrough, updatedAt, finalReplyAt: finalReplyActivityAt(record), pendingDecisionCount:decisions, active: conversationActive(view,version,seenThrough)},
  };
}
