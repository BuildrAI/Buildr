import { activityState } from './conversation-activity';
import type { ConversationSummary } from './types';

/** Called only after the server acknowledges viewing actual message content. */
export async function refreshSeenActivity(
  viewed: ConversationSummary,
  displayed: ConversationSummary | undefined,
  invalidate: () => void,
  refresh: () => Promise<void>,
): Promise<void> {
  if (activityState(viewed) !== 'unseen' && (!displayed || activityState(displayed) !== 'unseen')) return;
  // A pre-acknowledgement observation cannot prove the resulting counts. Do not
  // wait for it or let it overwrite the fresh read triggered by this action.
  invalidate();
  await refresh();
}
