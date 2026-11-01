import type { ConversationView } from './types';

/** Only final replies, not commentary or an in-flight current turn. */
export function forkableReplyIds(conversation: ConversationView | null | undefined): Set<string> {
  const replies = new Map<string, string>();
  if (!conversation || conversation.forkState && conversation.forkState.status !== 'ready') return new Set();
  for (const entry of conversation.entries) {
    if (entry.role !== 'assistant' || entry.kind !== 'message' || entry.parentToolId || !entry.runId) continue;
    if (entry.runId === conversation.run?.id && !['completed','stopped','failed'].includes(conversation.run.status)) continue;
    replies.set(entry.runId, entry.status === 'running' ? '' : entry.id);
  }
  return new Set([...replies.values()].filter(Boolean));
}
