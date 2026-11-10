import { useConversationDraftPresence } from './useConversationDraftPresence';
import { useEffect, useRef, useState } from 'react';
import { createConversationHistoryCache, readConversationHistoryPage, readConversationHistoryWindow, type ConversationHistoryCache } from './conversation-history-page';
import type { ConversationPage, AgentConversationsClient } from './api/agent-conversations-api';
import { HISTORY_GROUP_BATCH } from './conversation-history-groups';

type Scope = {workspaceId?: string; query: string; hidden: boolean; agent?: string; model?: string};
/** Initial read plus explicit continuation; activity updates have their own lifecycle. */
export function useConversationHistoryPage(api: AgentConversationsClient, {workspaceId, query, hidden, agent, model}: Scope, count: number, enabled = true, retained?:ConversationHistoryCache, version:number|string=0) {
  const draftConversationIds=useConversationDraftPresence();
  const draftScope=JSON.stringify(draftConversationIds);
  const localCache=useRef<ConversationHistoryCache|undefined>(undefined);
  if(!localCache.current)localCache.current=createConversationHistoryCache();
  const cache=retained??localCache.current;
  const scope = JSON.stringify([workspaceId, query, hidden, agent, model,draftScope]);
  const key=JSON.stringify([workspaceId,query,hidden,agent,model,count,draftScope]);
  const [state, setState] = useState<{scope: string; page?: ConversationPage; error: string; busy: boolean; stale?: boolean}>(()=>({scope,...cache.pages.get(key),error:cache.pages.get(key)?.error??'',busy:enabled&&!cache.pages.has(key)}));
  const controls = useRef({loadMore: () => {}, retry: () => {}});
  useEffect(() => {
    const controller = new AbortController();
    const saved=cache.pages.get(key);
    let reading = false, current: ConversationPage | undefined=saved?.page, failedMore = false;
    if (!enabled) { controls.current = {loadMore: () => {}, retry: () => {}}; return; }
    setState({scope,...saved,error:saved?.error??'',busy:!saved});
    const read = async (more: boolean) => {
      if (reading || controller.signal.aborted || more && !current?.nextCursor) return;
      reading = true; failedMore = more;
      const admitted=cache.pages.get(key);
      setState({scope, page: current, error: '', busy: true});
      try {
        const fetch=(options:{limit:number;cursor?:string;signal:AbortSignal})=>api.listAll({workspaceId,query,hidden,agent,model,draftConversationIds,...options});
        const result = more ? await readConversationHistoryPage(fetch,HISTORY_GROUP_BATCH,controller.signal,current) : await readConversationHistoryWindow(fetch,Math.max(count,current?.conversations.length??0),controller.signal);
        if (!controller.signal.aborted && cache.pages.get(key)===admitted) { current = result; cache.pages.set(key,{page:current,error:'',version});setState({scope, page: current, error: '', busy: false}); }
      } catch (failure) {
        if (!controller.signal.aborted && cache.pages.get(key)===admitted) {
          const stale = ['agent_cursor_stale','agent_cursor_invalid'].includes((failure as {code?: string})?.code ?? '');
          if(stale)failedMore=false;
          const error=failure instanceof Error ? failure.message : '无法读取对话列表，保留上次结果。';
          cache.pages.set(key,{page:current,error,stale,version});
          setState({scope, page: current, error, busy: false, stale});
        }
      } finally { reading = false; }
    };
    controls.current = {loadMore: () => {void read(true);}, retry: () => {void read(failedMore);}};
    if(!saved||saved.version!==version)void read(false);
    return () => { controller.abort(); controls.current = {loadMore: () => {}, retry: () => {}}; };
  }, [api, workspaceId, query, hidden, agent, model, count, enabled, scope, key, cache, version,draftScope]);
  return {page: state.scope === scope ? state.page : undefined, busy: enabled && (state.scope !== scope || state.busy), error: state.scope === scope ? state.error : '', retryLabel: state.scope === scope && state.stale ? '刷新列表' : '重试', loadMore: () => controls.current.loadMore(), retry: () => controls.current.retry()};
}
