import type { ConversationPage } from './api/agent-conversations-api';

/** Read only the requested prefix, never drain the remaining conversation history. */
export async function readConversationHistoryPrefix(
  read: (options: {limit: number; cursor?: string; signal: AbortSignal}) => Promise<ConversationPage>,
  count: number,
  signal: AbortSignal,
): Promise<ConversationPage> {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('对话展示条数无效。');
  const conversations: ConversationPage['conversations'] = [];
  let result: ConversationPage = {conversations: []};
  const cursors = new Set<string>();
  do {
    signal.throwIfAborted();
    result = await read({limit: Math.min(100, count - conversations.length), cursor: result.nextCursor, signal});
    signal.throwIfAborted();
    conversations.push(...result.conversations);
    if (!result.nextCursor || conversations.length >= count) break;
    if (!result.conversations.length || cursors.has(result.nextCursor)) throw new Error('对话列表续读位置未前进，请重试。');
    cursors.add(result.nextCursor);
  } while (conversations.length < count);
  return {...result, conversations: conversations.slice(0, count)};
}
