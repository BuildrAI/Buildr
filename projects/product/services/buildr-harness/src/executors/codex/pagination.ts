export interface CodexRpc {
  call(method: string, params?: unknown, timeoutMs?: number): Promise<any>;
}

const TURN_PAGE_LIMIT = 100;
const ITEM_PAGE_LIMIT = 20;
const MAX_PAGES = 10_000;

function nextCursor(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !value) throw new Error('codex_history_pagination_invalid');
  return value;
}

function pageData(value: unknown): any[] {
  if (!Array.isArray(value)) throw new Error('codex_history_pagination_invalid');
  return value;
}

/** Metadata is the only thread-level read permitted before paging history. */
export async function codexThreadMetadata(rpc: CodexRpc, threadId: string, cwd?: string): Promise<any> {
  const result = await rpc.call('thread/read', { threadId, includeTurns: false });
  const thread = result?.thread;
  if (thread?.id !== threadId || cwd !== undefined && thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
  return thread;
}

async function codexTurnPage(rpc: CodexRpc, threadId: string, direction: 'asc' | 'desc', cursor: string | undefined, limit = TURN_PAGE_LIMIT): Promise<{ data: any[]; nextCursor?: string }> {
  const response = await rpc.call('thread/turns/list', {
    threadId,
    limit,
    sortDirection: direction,
    itemsView: 'notLoaded',
    ...(cursor === undefined ? {} : { cursor }),
  });
  return { data: pageData(response?.data), nextCursor: nextCursor(response?.nextCursor) };
}

export async function codexTurns(rpc: CodexRpc, threadId: string): Promise<any[]> {
  const turns: any[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await codexTurnPage(rpc, threadId, 'asc', cursor);
    turns.push(...result.data);
    if (result.nextCursor === undefined) return turns;
    if (seen.has(result.nextCursor)) throw new Error('codex_history_pagination_invalid');
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error('codex_history_pagination_invalid');
}

export async function codexLatestTurn(rpc: CodexRpc, threadId: string): Promise<any | undefined> {
  const result = await codexTurnPage(rpc, threadId, 'desc', undefined, 1);
  return result.data[0];
}

export async function codexFindTurn(rpc: CodexRpc, threadId: string, turnId: string): Promise<any | undefined> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await codexTurnPage(rpc, threadId, 'desc', cursor);
    const found = result.data.find(turn => turn?.id === turnId);
    if (found) return found;
    if (result.nextCursor === undefined) return undefined;
    if (seen.has(result.nextCursor)) throw new Error('codex_history_pagination_invalid');
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error('codex_history_pagination_invalid');
}

export async function codexTurnItems(rpc: CodexRpc, threadId: string, turnId: string): Promise<any[]> {
  const items: any[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await rpc.call('thread/items/list', {
      threadId,
      turnId,
      limit: ITEM_PAGE_LIMIT,
      sortDirection: 'asc',
      ...(cursor === undefined ? {} : { cursor }),
    });
    for (const entry of pageData(response?.data)) {
      if (entry?.turnId !== turnId || !entry.item || typeof entry.item !== 'object') throw new Error('codex_history_identity_mismatch');
      items.push(entry.item);
    }
    const next = nextCursor(response?.nextCursor);
    if (next === undefined) return items;
    if (seen.has(next)) throw new Error('codex_history_pagination_invalid');
    seen.add(next);
    cursor = next;
  }
  throw new Error('codex_history_pagination_invalid');
}
