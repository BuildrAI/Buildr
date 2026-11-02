import type { StoredConversation } from './agent-state.ts';

/** Accepted handoffs are durable user decisions, unlike a preview or a newer message. */
export function reconcileLegacySupersededRuns(record: StoredConversation): boolean {
  const switches = record.view.entries.filter(entry => entry.kind === 'handoff' && entry.status === 'accepted' && entry.handoff?.changes.length &&
    record.attempts.some(attempt => attempt.runId === entry.runId && attempt.participantId === entry.participantId && attempt.accepted && attempt.through > entry.sequence));
  let changed = false;
  for (const run of record.view.retainedRuns ?? []) {
    if (run.supersededBy || run.id === record.view.run?.id) continue;
    const attempts = record.attempts.filter(attempt => attempt.runId === run.id && attempt.participantId === run.participantId);
    if (!attempts.length) continue;
    const through = Math.max(...attempts.map(attempt => attempt.through));
    const handoff = switches.find(entry => entry.runId !== run.id && entry.sequence > through);
    if (handoff?.runId) { run.supersededBy = handoff.runId; changed = true; }
  }
  return changed;
}
