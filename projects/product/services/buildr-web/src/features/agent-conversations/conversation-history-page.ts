import type { ConversationPage } from './api/agent-conversations-api';
import type { ConversationView } from './types';
import { HISTORY_GROUP_LIMIT } from './conversation-history-groups.ts';

export type ConversationHistoryCache = {
  pages: Map<string,{page?:ConversationPage;error:string;stale?:boolean;version:number}>;
  collapsed: Set<string>;
};
export const createConversationHistoryCache = ():ConversationHistoryCache => ({pages:new Map(),collapsed:new Set()});

export function collapseConversationHistory(cache:ConversationHistoryCache,workspaceId:string):void {
  cache.collapsed.add(workspaceId);
  for(const [key,value] of cache.pages){
    if(JSON.parse(key)[0]!==workspaceId || !value.page)continue;
    cache.pages.set(key,{...value,page:{...value.page,conversations:value.page.conversations.slice(0,HISTORY_GROUP_LIMIT),nextCursor:undefined},version:-1,error:'',stale:undefined});
  }
}

/** Ignore tool progress, usage and streaming additions when deciding whether list facts changed. */
export function conversationHistorySignature(view:ConversationView):string {
  let last:string|undefined;
  for(let index=view.entries.length-1;index>=0;index--){const entry=view.entries[index];if(!entry.parentToolId&&!entry.thinking&&entry.kind==='message'&&['user','assistant'].includes(entry.role)){last=entry.id;break;}}
  return JSON.stringify([view.title,view.hidden,view.run?.id,view.run?.status,view.run?.model,view.activity?.updatedAt,view.requests.map(request=>request.id),last]);
}

/** Refresh exactly the already-expanded window, including windows larger than one API page. */
export async function readConversationHistoryWindow(read: Parameters<typeof readConversationHistoryPage>[0], count:number, signal:AbortSignal):Promise<ConversationPage> {
  if(!Number.isSafeInteger(count)||count<1)throw new Error('对话展示条数无效。');
  let page=await readConversationHistoryPage(read,Math.min(count,100),signal);
  while(page.nextCursor && page.conversations.length<count)page=await readConversationHistoryPage(read,Math.min(count-page.conversations.length,100),signal,page);
  return page;
}

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
