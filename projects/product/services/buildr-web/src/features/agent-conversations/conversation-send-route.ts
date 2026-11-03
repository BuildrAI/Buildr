import type { ConversationView } from './types';
import { currentConversationRequests, executionLocked } from './conversation-state.ts';

/** Refusal never becomes an independent new round. */
export function conversationSendRoute(conversation: ConversationView, changed: boolean, preview = false): 'preview' | 'pending' | 'unavailable' | 'supplement' | 'send' {
  if (preview) return 'preview';
  const requests = currentConversationRequests(conversation);
  if (requests.some(request => request.kind === 'question') || changed && requests.length) return 'pending';
  const run = conversation.run;
  if (!changed && executionLocked(run)) {
    return run?.accepted && !run.stopRequested && ['running', 'waiting-approval', 'waiting-question', 'unknown'].includes(run.status) ? 'supplement' : 'unavailable';
  }
  return 'send';
}

/** Refresh stale execution facts once, without replaying input or changing its owner. */
export async function refreshConversationSend(
  before: ConversationView,
  options: {
    observe(conversation: ConversationView): Promise<ConversationView>;
    apply(conversation: ConversationView, revision: string): void;
    isCurrent(): boolean;
  },
): Promise<ConversationView | undefined> {
  if (!options.isCurrent()) return;
  const run = before.run;
  if (run?.status !== 'unknown' || !run.accepted || run.stopRequested) return before;
  const { id, participantId, generation } = run;
  const next = await options.observe(before);
  if (!options.isCurrent()) return;
  options.apply(next, before.revision);
  if (next.run?.id !== id || next.run.participantId !== participantId || next.run.generation !== generation)
    throw new Error('原执行身份已变化，追加内容已保留，不会自动发送给另一轮。');
  return next;
}
