import type { ConversationView } from './types';
import { currentConversationRequests, executionLocked } from './conversation-state.ts';

/** Refusal never becomes an independent new round. */
export function conversationSendRoute(conversation: ConversationView, changed: boolean, preview = false): 'preview' | 'pending' | 'unavailable' | 'supplement' | 'send' {
  if (preview) return 'preview';
  const requests = currentConversationRequests(conversation);
  if (requests.some(request => request.kind === 'question') || changed && requests.length) return 'pending';
  const run = conversation.run;
  if (!changed && executionLocked(run)) {
    return run?.accepted && ['running', 'waiting-approval', 'waiting-question'].includes(run.status) ? 'supplement' : 'unavailable';
  }
  return 'send';
}
