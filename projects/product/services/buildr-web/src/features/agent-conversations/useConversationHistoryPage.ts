import { useEffect, useRef, useState } from 'react';
import { readConversationHistoryPage } from './conversation-history-page';
import type { ConversationPage, createAgentConversationsClient } from './api/agent-conversations-api';
import { HISTORY_GROUP_BATCH } from './conversation-history-groups';

type Scope = {workspaceId?: string; query: string; hidden: boolean; agent?: string; model?: string};
/** Initial read plus explicit continuation; activity updates have their own lifecycle. */
export function useConversationHistoryPage(api: ReturnType<typeof createAgentConversationsClient>, {workspaceId, query, hidden, agent, model}: Scope, count: number, enabled = true) {
  const [state, setState] = useState<{scope: string; page?: ConversationPage; error: string; busy: boolean; stale?: boolean}>({scope: '', error: '', busy: enabled});
  const controls = useRef({loadMore: () => {}, retry: () => {}});
  const scope = JSON.stringify([workspaceId, query, hidden, agent, model]);
  useEffect(() => {
    const controller = new AbortController();
    let reading = false, current: ConversationPage | undefined, failedMore = false;
    if (!enabled) { controls.current = {loadMore: () => {}, retry: () => {}}; return; }
    setState({scope, error: '', busy: true});
    const read = async (more: boolean) => {
      if (reading || controller.signal.aborted || more && !current?.nextCursor) return;
      reading = true; failedMore = more;
      setState({scope, page: current, error: '', busy: true});
      try {
        const result = await readConversationHistoryPage(options => api.listAll({workspaceId, query, hidden, agent, model, ...options}), more ? HISTORY_GROUP_BATCH : count, controller.signal, more ? current : undefined);
        if (!controller.signal.aborted) { current = result; setState({scope, page: current, error: '', busy: false}); }
      } catch (failure) {
        if (!controller.signal.aborted) {
          const stale = ['agent_cursor_stale','agent_cursor_invalid'].includes((failure as {code?: string})?.code ?? '');
          if(stale)failedMore=false;
          setState({scope, page: current, error: failure instanceof Error ? failure.message : '无法读取对话列表，保留上次结果。', busy: false, stale});
        }
      } finally { reading = false; }
    };
    controls.current = {loadMore: () => {void read(true);}, retry: () => {void read(failedMore);}};
    void read(false);
    return () => { controller.abort(); controls.current = {loadMore: () => {}, retry: () => {}}; };
  }, [api, workspaceId, query, hidden, agent, model, count, enabled, scope]);
  return {page: state.scope === scope ? state.page : undefined, busy: enabled && (state.scope !== scope || state.busy), error: state.scope === scope ? state.error : '', retryLabel: state.scope === scope && state.stale ? '刷新列表' : '重试', loadMore: () => controls.current.loadMore(), retry: () => controls.current.retry()};
}
