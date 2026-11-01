import type { ConversationView } from './types';
import { finalConversationReplyIds } from './conversation-state.ts';

/** Footer actions belong to settled replies, never an interim progress message. */
export function finalReplyIds(conversation:ConversationView|null|undefined):Set<string>{
  if(!conversation)return new Set();
  const pending=new Set(conversation.requests.map(request=>request.runId));
  return finalConversationReplyIds(conversation.entries.filter(entry=>!entry.runId||!pending.has(entry.runId)),[
    ...(conversation.retainedRuns??[]),...(conversation.run?[conversation.run]:[]),
  ]);
}

/** Only final replies, not commentary or an in-flight current turn. */
export function forkableReplyIds(conversation: ConversationView | null | undefined): Set<string> {
  if (!conversation || conversation.forkState && conversation.forkState.status !== 'ready') return new Set();
  const finals=finalReplyIds(conversation);
  return new Set(conversation.entries.filter(entry=>entry.runId&&finals.has(entry.id)).map(entry=>entry.id));
}
