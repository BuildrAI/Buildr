import type { ConversationView } from '../contracts.ts';

/** Preserve the legacy pending member set, without native details or user content. */
export function pendingConversationSummary(view: ConversationView) {
  return { conversationId: view.id, workspaceId: view.workspaceId, title: view.title,
    status: view.run?.status ?? 'unknown' as const, count: view.requests.filter(request => request.kind !== 'question' || ![view.run, ...view.retainedRuns ?? []].some(run => run?.id === request.runId && run.questionsEndedBy)).length };
}
