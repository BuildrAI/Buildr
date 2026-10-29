import type { ConversationPage } from './api/agent-conversations-api';

/** One explicit read, continuing from the server's exact last-item cursor. Never drain history. */
export async function readConversationHistoryPage(
  read: (options: {limit: number; cursor?: string; signal: AbortSignal}) => Promise<ConversationPage>,
  limit: number,
  signal: AbortSignal,
  previous?: ConversationPage,
): Promise<ConversationPage> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('对话展示条数无效。');
  signal.throwIfAborted();
  if (previous && !previous.nextCursor) return previous;
  const result = await read({limit, cursor: previous?.nextCursor, signal});
  signal.throwIfAborted();
  const known = new Set(previous?.conversations.map(row => row.workspaceId+':'+row.id));
  const added = result.conversations.filter(row => { const key=row.workspaceId+':'+row.id; if(known.has(key))return false;known.add(key);return true; });
  if (result.nextCursor && (!added.length || result.nextCursor === previous?.nextCursor)) throw new Error('对话列表续读位置未前进，请重试。');
  return {...result, conversations: [...(previous?.conversations ?? []), ...added]};
}
