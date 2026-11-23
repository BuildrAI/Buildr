import { useEffect, useRef } from 'react';
import { createVisiblePoller } from '../../lib/visible-poller.ts';
import { isPageVisible } from './page-visibility.ts';
import type { AgentConversationsClient } from './api/agent-conversations-api.ts';
import { createGoogleAccountRefresh, GOOGLE_ACCOUNT, GOOGLE_VISIBLE_REFRESH_MS } from './google-account-refresh.ts';

const schedulers = new WeakMap<AgentConversationsClient, ReturnType<typeof createGoogleAccountRefresh>>();

export function useGoogleAccountRefresh(active: boolean, api: AgentConversationsClient, settled: () => void, failed: () => void) {
  const callbacks = useRef({ settled, failed });
  callbacks.current = { settled, failed };
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let check = schedulers.get(api);
    if (!check) { check = createGoogleAccountRefresh(api.modelAccountAction); schedulers.set(api, check); }
    const currentCheck = check;
    const read = async () => {
      try {
        const { accounts } = await api.modelAccounts();
        if (disposed || !isPageVisible()) return;
        const account = accounts.find(item => item.id === GOOGLE_ACCOUNT);
        if (!account) return;
        const pending = currentCheck(account);
        if (!pending) return;
        await pending;
        if (!disposed && isPageVisible()) callbacks.current.settled();
      } catch {
        if (!disposed && isPageVisible()) callbacks.current.failed();
      }
    };
    const poller = createVisiblePoller({ read, interval: () => GOOGLE_VISIBLE_REFRESH_MS, document, window });
    void poller.request();
    return () => { disposed = true; poller.dispose(); };
  }, [active, api]);
}
