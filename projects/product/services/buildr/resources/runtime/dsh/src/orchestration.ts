/** Session-safe orchestration over the public right-sidebar navigation face. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type { OpenResult } from './types.ts';

export type Status = { kind: 'idle' | 'loading' | 'noSession' | 'desktopOnly' | 'sessionChanged' | 'tabClosed' | 'failed'; detail?: string };
type Sidebar = Pick<Context['sidebarRight'], 'mounted' | 'openTabs' | 'openTab' | 'active' | 'focus' | 'isExpanded' | 'toggleExpanded'>;

/** Own plugin-created tab identities and their last healthy URLs, never infer another tab's ownership. */
export function createOpenAction(sidebar: Sidebar, open: () => Promise<OpenResult>, desktop: boolean, publish: (status: Status) => void, panelInfo: Context['layout']['panelInfo']) {
  type SessionId = Exclude<ReturnType<Sidebar['mounted']['getSnapshot']>, undefined>;
  type TabId = NonNullable<ReturnType<Sidebar['active']>>['id'];
  const tabs = new Map<SessionId, { tabId: TabId; url: string }>();
  const isOpen = (session: SessionId, tabId: TabId): boolean => sidebar.openTabs.getSnapshot()
    .some(tab => tab.sessionId === session && tab.tabId === tabId && tab.kind === 'browser');
  let epoch = 0;
  let disposed = false;
  let pending: Promise<void> | undefined;
  const unsubscribe = sidebar.mounted.subscribe(() => { epoch++; });
  const unsubscribePanel = panelInfo.subscribe(() => { epoch++; });
  const run = async (): Promise<void> => {
    if (!desktop) { publish({ kind: 'desktopOnly' }); return; }
    const session = sidebar.mounted.getSnapshot();
    if (session === undefined || panelInfo.getSnapshot().activePanelId !== null) { publish({ kind: 'noSession' }); return; }
    const owned = tabs.get(session);
    const previous = owned !== undefined && isOpen(session, owned.tabId) ? owned : undefined;
    if (previous === undefined) tabs.delete(session);
    const started = epoch;
    publish({ kind: 'loading' });
    try {
      // Every valid click rechecks health, even while a plugin-owned page exists.
      const result = await open();
      if (disposed) return;
      if (started !== epoch || sidebar.mounted.getSnapshot() !== session || panelInfo.getSnapshot().activePanelId !== null) { publish({ kind: 'sessionChanged' }); return; }
      if (previous !== undefined && !isOpen(session, previous.tabId)) {
        tabs.delete(session);
        publish({ kind: 'tabClosed' });
        return;
      }
      if (!result.ready) { publish({ kind: 'failed', detail: result.message }); return; }
      if (previous !== undefined && previous.url === result.url) {
        sidebar.focus(previous.tabId);
        if (!sidebar.isExpanded()) sidebar.toggleExpanded();
      } else {
        // Address migration must not navigate, refresh or close the old page with unsaved work.
        sidebar.openTab('browser', { params: { url: result.url } });
        const active = sidebar.active();
        if (active?.kind === 'browser') tabs.set(session, { tabId: active.id, url: result.url });
      }
      publish({ kind: 'idle' });
    } catch (_error) {
      if (!disposed) publish({ kind: 'failed' });
    }
  };
  return {
    click(): Promise<void> {
      if (disposed) return Promise.resolve();
      if (pending !== undefined) return pending;
      pending = run().finally(() => { pending = undefined; });
      return pending;
    },
    dispose(): void { disposed = true; epoch++; unsubscribe(); unsubscribePanel(); tabs.clear(); },
  };
}
