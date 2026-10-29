import { useEffect, useState } from 'react';
import { readConversationHistoryPrefix } from './conversation-history-page';
import type { ConversationPage, createAgentConversationsClient } from './api/agent-conversations-api';

type Scope = {workspaceId?: string; query: string; hidden: boolean; agent?: string; model?: string};
/** A group's visible prefix and refresh lifecycle stay independent from other groups. */
export function useConversationHistoryPage(api: ReturnType<typeof createAgentConversationsClient>, {workspaceId, query, hidden, agent, model}: Scope, count: number) {
  const [state, setState] = useState<{scope: string; page?: ConversationPage; error: string}>({scope: '', error: ''});
  const [busy, setBusy] = useState(true), [reload, setReload] = useState(0);
  const scope = JSON.stringify([workspaceId, query, hidden, agent, model]);
  useEffect(() => {
    const controller = new AbortController();
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true; setBusy(true);
      try {
        const result = await readConversationHistoryPrefix(options => api.listAll({workspaceId, query, hidden, agent, model, ...options}), count, controller.signal);
        if (!controller.signal.aborted) { setState({scope, page: result, error: ''}); }
      } catch (failure) {
        if (!controller.signal.aborted) setState(previous => ({scope, page: previous.scope === scope ? previous.page : undefined, error: failure instanceof Error ? failure.message : '无法更新对话列表，保留上次结果。'}));
      } finally {
        if (!controller.signal.aborted) { reading = false; setBusy(false); }
      }
    };
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [api, workspaceId, query, hidden, agent, model, count, reload, scope]);
  return {page: state.scope === scope ? state.page : undefined, busy, error: state.scope === scope ? state.error : '', retry: () => setReload(value => value + 1)};
}
