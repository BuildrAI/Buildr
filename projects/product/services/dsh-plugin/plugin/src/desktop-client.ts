/** Client-local navigation; confirmation requires the visible, focused native target. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { DSH_DESKTOP_BRIDGE_LIMITS, dshDesktopIdentifier,
  type DshDesktopClientAck, type DshDesktopClientCommand, type DshDesktopClientState, type DshDesktopTaskPageResult,
} from '../../../buildr/src/modules/agent-operations/contracts/dsh-desktop-bridge.ts';

type Sidebar = Pick<Context['sidebarRight'], 'mounted' | 'openTabs' | 'openTab' | 'active' | 'focus' | 'isExpanded' | 'toggleExpanded'>;
type Workspace = Pick<Context['uiWorkspace'], 'openSession'>;
export interface DesktopClientRemote {
  desktopCommands(state: DshDesktopClientState): AsyncIterable<DshDesktopClientCommand> & { dispose(): void };
  desktopState(state: DshDesktopClientState): Promise<{ ok: boolean }>;
  desktopAcknowledge(ack: DshDesktopClientAck): Promise<{ ok: boolean }>;
  desktopTaskPage(request: { pageId: string }): Promise<{ ok: boolean; value: DshDesktopTaskPageResult }>;
}
type StoredTab = { sessionId: string; taskUrl: string; tabId: string; pageId: string };
type StorageFace = Pick<Storage, 'getItem' | 'setItem'>;
export interface DesktopForeground {
  visible(): boolean;
  focused(): boolean;
  subscribe(listener: () => void): () => void;
}
function nativeForeground(): DesktopForeground {
  return {
    visible: () => document.visibilityState === 'visible',
    focused: () => document.hasFocus(),
    subscribe(listener) {
      window.addEventListener('focus', listener);
      window.addEventListener('blur', listener);
      document.addEventListener('visibilitychange', listener);
      return () => {
        window.removeEventListener('focus', listener);
        window.removeEventListener('blur', listener);
        document.removeEventListener('visibilitychange', listener);
      };
    },
  };
}
function optionalStorage(): StorageFace | undefined { try { return localStorage; } catch { return undefined; } }
function untilDeadline<T>(promise: Promise<T>, deadline: number, signal: AbortSignal): Promise<T> {
  if (Date.now() >= deadline) return Promise.reject(new Error('navigation-timeout'));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new Error('navigation-cancelled')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('navigation-timeout')); }, Math.max(1, deadline - Date.now()));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function createDesktopClientNavigation(sidebar: Sidebar, workspace: Workspace, entryId: string,
  options: { timeoutMs?: number; storage?: StorageFace; foreground?: DesktopForeground;
    focusSession?(sessionId: string): void; probeTaskPage?(pageId: string): Promise<string | null> } = {}) {
  const controller = new AbortController(), tabs = new Map<string, StoredTab>();
  const foreground = options.foreground ?? nativeForeground();
  const isForeground = () => foreground.visible() && foreground.focused();
  const storage = options.storage ?? optionalStorage(), key = `buildr.dsh.task-tabs.v1.${entryId}`;
  const tabKey = (sessionId: string, taskUrl: string) => JSON.stringify([sessionId, taskUrl]);
  try {
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
    if (Array.isArray(saved)) for (const row of saved) if (row && typeof row === 'object'
      && dshDesktopIdentifier(row.sessionId) && dshDesktopIdentifier(row.tabId) && dshDesktopIdentifier(row.pageId) && typeof row.taskUrl === 'string')
      tabs.set(tabKey(row.sessionId, row.taskUrl), row as StoredTab);
  } catch { /* Only hints; native inventory always decides reuse. */ }
  const persist = () => { try { storage?.setItem(key, JSON.stringify([...tabs.values()])); } catch { /* optional hint */ } };
  const observe = (sessionId: string, deadline: number) => new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const cleanup = () => { clearTimeout(timer); unsubscribe?.(); controller.signal.removeEventListener('abort', abort); };
    const check = () => { if (sidebar.mounted.getSnapshot() === sessionId) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error('navigation-cancelled')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('navigation-timeout')); }, Math.max(1, deadline - Date.now()));
    if (controller.signal.aborted) { abort(); return; }
    controller.signal.addEventListener('abort', abort, { once: true });
    unsubscribe = sidebar.mounted.subscribe(check);
    try { workspace.openSession(sessionId as SessionId); check(); } catch (error) { cleanup(); reject(error); }
  });
  const observeForeground = (deadline: number) => new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const cleanup = () => { clearTimeout(timer); unsubscribe?.(); controller.signal.removeEventListener('abort', abort); };
    const check = () => { if (isForeground()) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error('navigation-cancelled')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('window-not-foreground')); }, Math.max(1, deadline - Date.now()));
    if (controller.signal.aborted) { abort(); return; }
    controller.signal.addEventListener('abort', abort, { once: true });
    unsubscribe = foreground.subscribe(check);
    check();
  });
  return {
    async execute(command: DshDesktopClientCommand): Promise<DshDesktopClientAck> {
      try {
        const deadline = Date.now() + (options.timeoutMs ?? DSH_DESKTOP_BRIDGE_LIMITS.navigationTimeoutMs);
        const probe = (pageId: string) => untilDeadline(options.probeTaskPage?.(pageId) ?? Promise.resolve(null), deadline, controller.signal);
        if (!dshDesktopIdentifier(command.commandId) || !dshDesktopIdentifier(command.sessionId)) throw new Error('navigation-invalid');
        await observe(command.sessionId, deadline);
        controller.signal.throwIfAborted();
        if (command.method === 'openTask') {
          if (typeof command.taskUrl !== 'string') throw new Error('task-url-invalid');
          const url = new URL(command.taskUrl);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash
            || !/^\/workspaces\/[^/]+\/tasks\/[^/]+$/.test(url.pathname)) throw new Error('task-url-invalid');
          const address = tabKey(command.sessionId, command.taskUrl), previous = tabs.get(address);
          const stillOpen = previous !== undefined && sidebar.openTabs.getSnapshot().some(row => row.sessionId === command.sessionId
            && row.tabId === previous.tabId && row.kind === 'browser');
          // A fresh challenge is answered from the actual Buildr document location. Hints never
          // prove what a browser now displays, and the bridge credential never enters its URL.
          if (previous && stillOpen && await probe(previous.pageId) === command.taskUrl)
            sidebar.focus(previous.tabId as Parameters<Sidebar['focus']>[0]);
          else {
            tabs.delete(address);
            const pageId = crypto.randomUUID();
            // A different Task gets another tab; never refresh a page containing a draft.
            sidebar.openTab('browser', { params: { url: command.taskUrl + '?buildrDshPage=' + encodeURIComponent(pageId) } });
            const active = sidebar.active();
            if (!active || active.kind !== 'browser') throw new Error('task-tab-unconfirmed');
            tabs.set(address, { sessionId: command.sessionId, taskUrl: command.taskUrl, tabId: active.id, pageId }); persist();
            let observed = await probe(pageId);
            if (observed !== command.taskUrl) {
              await untilDeadline(new Promise(resolve => setTimeout(resolve, 150)), deadline, controller.signal);
              controller.signal.throwIfAborted();
              observed = await probe(pageId);
            }
            if (observed !== command.taskUrl) throw new Error('task-page-unconfirmed');
          }
          if (!sidebar.isExpanded()) sidebar.toggleExpanded();
        } else if (command.method !== 'openSession') throw new Error('navigation-invalid');
        // The right-hand native webview owns a separate document. Return its keyboard focus to
        // this exact retained chat without submitting or changing the draft/caret.
        options.focusSession?.(command.sessionId);
        await observeForeground(deadline);
        controller.signal.throwIfAborted();
        if (sidebar.mounted.getSnapshot() !== command.sessionId || !isForeground()) throw new Error('target-not-visible');
        return { clientId: '', commandId: command.commandId, sessionId: command.sessionId, ok: true };
      } catch {
        return { clientId: '', commandId: command.commandId, sessionId: sidebar.mounted.getSnapshot() ?? null,
          ok: false, code: 'agent_dsh_navigation_unconfirmed' };
      }
    },
    dispose() { controller.abort(); tabs.clear(); },
  };
}

export function mountDesktopClient(ctx: Context, remote: DesktopClientRemote, entryId: string): () => void {
  const clientId = crypto.randomUUID(), navigation = createDesktopClientNavigation(ctx.sidebarRight, ctx.uiWorkspace, entryId, {
    focusSession: sessionId => {
      const scope = ctx.sessions.scope(sessionId as SessionId);
      if (!scope) throw new Error('session-scope-unavailable');
      ctx.conversation.input.for(scope).focus();
    },
    probeTaskPage: async pageId => { const reply = await remote.desktopTaskPage({ pageId }); return reply.ok ? reply.value.taskUrl : null; },
  });
  const state = (): DshDesktopClientState => ({ clientId, desktop: true, sessionId: ctx.sidebarRight.mounted.getSnapshot() ?? null });
  let stream: ReturnType<DesktopClientRemote['desktopCommands']> | undefined;
  let disposed = false;
  let wakeRetry: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = ctx.sidebarRight.mounted.subscribe(() => { void remote.desktopState(state()).catch(() => {}); });
  void (async () => {
    while (!disposed) {
      try {
        stream = remote.desktopCommands(state());
        for await (const command of stream) {
          if (disposed) break;
          const ack = await navigation.execute(command);
          if (disposed) break;
          const observed = await remote.desktopState(state());
          if (!observed.ok) ack.ok = false;
          await remote.desktopAcknowledge({ ...ack, clientId });
        }
      } catch { /* Carrier retirement does not take down the existing sidebar entry. */ }
      finally { stream?.dispose(); stream = undefined; }
      if (!disposed) await new Promise<void>(resolve => { wakeRetry = resolve; retryTimer = setTimeout(resolve, 1000); });
    }
  })();
  return () => { disposed = true; clearTimeout(retryTimer); wakeRetry?.(); unsubscribe(); navigation.dispose(); stream?.dispose(); };
}
