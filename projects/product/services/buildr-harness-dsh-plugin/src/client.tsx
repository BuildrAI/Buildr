import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { attachHarnessGuest, desktopBridge, type DesktopBridge } from './guest.ts';
import { linkDestination, liveCarrier, preferredCarrier, sessionSelection, toolAddress, toolId, type GuestMessage, type Reveal, type Scope, type SessionCatalog, type Tool } from './workspace.ts';

const PANEL = 'buildr-harness-dev';
const ANCHOR = '--buildr-harness-dsh';
const KEY = 'buildr.harness-dsh.carriers.v1';
const titles: Record<Tool, string> = { explorer: 'Buildr 资源管理器', 'source-control': 'Buildr 源代码管理' };
interface Observable<T> { subscribe(listener: () => void): () => void; getSnapshot(): T }
interface Context {
  slots: { inject(name: string, mount: () => unknown): () => void; register(options: Record<string, unknown>, component: unknown): unknown };
  layout: { selectPanel(id: string | null): void; panelInfo: Observable<{ activePanelId: string | null }> };
  sessions: { list: Observable<SessionCatalog> };
  workspaces: { list: Observable<{ archivedSessionIds: readonly string[] }> };
  uiWorkspace: { openSession(id: string): void };
  uiSession: { adapter: { current: Observable<{ key?: string }> } };
  sidebarRight: {
    mounted: Observable<string | undefined>;
    openTabs: Observable<readonly { sessionId: string; tabId: string; kind: string }[]>;
    openTab(kind: string, options?: { params: { url: string } }): void;
    focus(id: string): void;
    toggleExpanded(): void;
    isExpanded(): boolean;
  };
  sidebarRightTabs: { get(kind: string): unknown; register(definition: object): () => void };
  configForms: { get(name: string): Observable<{ value?: { linkOpening?: string } }> };
  effect(callback: () => () => void, name: string): void;
}
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'uiSession', 'sidebarRight', 'sidebarRightTabs', 'configForms'];

function Mark({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <path d="M4 5h16v14H4zM4 9h16M10 9v10m3-6 2 2-2 2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}
type IconProps = { size?: number; className?: string };
function ExplorerIcon({ size = 22, className }: IconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h5l2 2h7A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18ZM4 10.5h16" />
    <path d="M8 14h8m-8 2.7h5" />
  </svg>;
}
function SourceControlIcon({ size = 22, className }: IconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="5" r="2" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="7" r="2" />
    <path d="M7 7v10m0-1.5c0-4.5 10-.5 10-6.5" />
  </svg>;
}
const toolIcons: Record<Tool, ComponentType<IconProps>> = { explorer: ExplorerIcon, 'source-control': SourceControlIcon };
function readBindings() {
  const result = new Map<string, string>();
  try {
    const pairs: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(pairs)) for (const pair of pairs) if (Array.isArray(pair) && pair.length === 2 && pair.every(item => typeof item === 'string')) result.set(pair[0], pair[1]);
  } catch { /* This installation may only support memory preferences. */ }
  return result;
}
const messages: Record<string, string> = {
  'binding-missing': '尚未绑定本机 Harness。请用此开发插件的本机入口重新打开 DSH。',
  'harness-unavailable': '无法连接已绑定的 Harness。请确认安装和运行状态后重试。',
  'harness-timeout': '打开 Harness 超时。请核对当前运行状态后重试。',
  'harness-navigation': 'Harness 网页未能加载。现有对话和执行不受影响。',
};
function Guest({ bridge, tool, onMessage, onControl }: { bridge: DesktopBridge; tool?: { kind: Tool; workspaceId: string }; onMessage?: (m: GuestMessage) => void; onControl?: (send: (d: object) => void) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const latest = useRef({ onMessage, onControl }); latest.current = { onMessage, onControl };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });
  const kind = tool?.kind, workspaceId = tool?.workspaceId;
  useEffect(() => {
    if (!mount.current) return;
    return attachHarnessGuest(mount.current, bridge, error => setState(error ? { ready: false, error } : { ready: true }), {
      tool: kind && workspaceId ? { kind, workspaceId } : undefined,
      onMessage: message => latest.current.onMessage?.(message), onControl: send => latest.current.onControl?.(send),
    });
  }, [attempt, bridge, kind, workspaceId]);
  return <div style={{ minHeight: 0, position: 'relative', flex: 1 }}>
    <div ref={mount} style={{ position: 'absolute', inset: 0 }} />
    {!state.ready && <div role={state.error ? 'alert' : 'status'} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 20, background: 'Canvas', gap: 8 }}>
      {state.error ? messages[state.error] : '正在打开 Buildr Harness…'}
      {state.error && <button type="button" onClick={() => { setState({ ready: false }); setAttempt(n => n + 1); }}>重新打开</button>}
    </div>}
  </div>;
}
function Anchor() { return <div style={{ height: '100%', width: '100%', ...{ anchorName: ANCHOR } }} />; }

export function apply(ctx: Context) {
  const bridge = desktopBridge();
  if (!bridge) return;
  const { layout, slots, sidebarRight, sessions, workspaces, uiSession } = ctx;
  const bindings = readBindings();
  const settings = ctx.configForms.get('ui-chat');
  const listeners = new Set<() => void>();
  let state: { active: boolean; opened: boolean; scope: Scope | null; carrier?: string } = { active: false, opened: false, scope: null };
  let priorSession: string | undefined;
  let expected: string | undefined;
  let registering = false;
  let pendingFile: Reveal | undefined;
  const explorerControls = new Map<string, (data: object) => void>();
  let sendToChat: ((data: object) => void) | undefined;
  let syncToolEntries: (visible: boolean) => void = () => {};
  const currentSession = () => uiSession.adapter.current.getSnapshot().key;
  const archived = () => workspaces.list.getSnapshot().archivedSessionIds;
  const mountAvailable = () => state.active && !!state.carrier && sidebarRight.mounted.getSnapshot() === state.carrier
    && currentSession() === state.carrier && layout.panelInfo.getSnapshot().activePanelId === null
    && liveCarrier(state.scope, bindings, sessions.list.getSnapshot(), archived()) === state.carrier;
  function remember(scope: Scope, carrier: string) {
    if (bindings.get(scope.id) === carrier) return;
    bindings.set(scope.id, carrier);
    try { localStorage.setItem(KEY, JSON.stringify([...bindings])); } catch { /* Keep the window's mapping usable. */ }
  }
  function publish(next = state) {
    state = { ...next };
    for (const listener of [...listeners]) listener();
  }
  const store: Observable<typeof state> = { subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSnapshot: () => state };
  function tellGuest() {
    const native = mountAvailable();
    syncToolEntries(native);
    sendToChat?.({ native });
  }
  function align() {
    if (!state.active) return;
    const carrier = preferredCarrier(state.scope, bindings, sessions.list.getSnapshot(), archived(), currentSession());
    if (carrier && state.scope) remember(state.scope, carrier);
    if (carrier !== state.carrier) {
      pendingFile = undefined;
      publish({ ...state, carrier });
    }
    if (carrier && currentSession() !== carrier) {
      if (layout.panelInfo.getSnapshot().activePanelId !== PANEL) layout.selectPanel(PANEL);
      if (expected !== carrier) { expected = carrier; ctx.uiWorkspace.openSession(carrier); }
    } else {
      expected = undefined;
      const target = carrier ? null : PANEL;
      if (target !== layout.panelInfo.getSnapshot().activePanelId) layout.selectPanel(target);
    }
    tellGuest();
  }
  function leave(restore = true) {
    if (!state.active) return;
    expected = undefined; pendingFile = undefined;
    publish({ ...state, active: false, carrier: undefined });
    if (restore && priorSession && priorSession !== currentSession() && sessions.list.getSnapshot().byId[priorSession]) ctx.uiWorkspace.openSession(priorSession);
    else if (layout.panelInfo.getSnapshot().activePanelId === PANEL) layout.selectPanel(null);
    priorSession = undefined;
  }
  function accept(message: GuestMessage, send = sendToChat) {
    if (!state.active) return;
    if (message.kind === 'tool-ready') return;
    if (message.kind === 'shell') {
      if (message.action === 'leave') leave();
      else if (message.action === 'toggle-right' && mountAvailable()) sidebarRight.toggleExpanded();
      return;
    }
    if (message.kind === 'reveal') {
      if (!mountAvailable() || message.file.workspaceId !== state.scope?.id) return;
      pendingFile = message.file; launchTool('explorer'); flushExplorer(); return;
    }
    if (message.kind === 'workspace') {
      if (state.scope?.id !== message.scope?.id || state.scope?.path !== message.scope?.path) {
        pendingFile = undefined;
        publish({ ...state, scope: message.scope, carrier: undefined }); align();
      } else tellGuest();
      return;
    }
    const native = mountAvailable() && ctx.sidebarRightTabs.get('browser') !== undefined;
    const mode = linkDestination(settings.getSnapshot().value?.linkOpening, message.external, native);
    if (mode === 'external') window.open(message.url, '_blank', 'noopener,noreferrer');
    else if (mode === 'sidebar') sidebarRight.openTab('browser', { params: { url: message.url } });
    else send?.({ fallback: message.url });
  }
  function flushExplorer() {
    if (!pendingFile || !mountAvailable() || pendingFile.workspaceId !== state.scope?.id) return;
    const control = explorerControls.get(state.carrier!);
    if (control) { control({ reveal: pendingFile }); pendingFile = undefined; }
  }
  function launchTool(kind: Tool) {
    if (!mountAvailable()) return;
    const existing = sidebarRight.openTabs.getSnapshot().find(tab => tab.sessionId === state.carrier && tab.kind === toolId(kind));
    if (existing) { sidebarRight.focus(existing.tabId); if (!sidebarRight.isExpanded()) sidebarRight.toggleExpanded(); }
    else sidebarRight.openTab(toolId(kind));
  }
  function ToolPane({ kind, sessionId, useTabInfo }: { kind: Tool; sessionId: string; useTabInfo(): { tab: { id: string; actions: { close(): void } } } }) {
    const observed = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const inventory = useSyncExternalStore(sidebarRight.openTabs.subscribe, sidebarRight.openTabs.getSnapshot);
    const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
    const { tab } = useTabInfo();
    const first = inventory.find(item => item.sessionId === sessionId && item.kind === toolId(kind));
    const duplicate = !!first && first.tabId !== tab.id;
    useEffect(() => { if (duplicate && mounted === sessionId && mountAvailable()) { sidebarRight.focus(first!.tabId); tab.actions.close(); } }, [duplicate, mounted, observed.active, observed.carrier, sessionId, first?.tabId, tab.id]);
    const initial = useRef<string | undefined>(undefined);
    if (observed.active && observed.carrier === sessionId && observed.scope) initial.current = observed.scope.id;
    const id = initial.current;
    const send = useRef<((data: object) => void) | undefined>(undefined);
    useEffect(() => () => { if (kind === 'explorer' && explorerControls.get(sessionId) === send.current) explorerControls.delete(sessionId); }, [kind, sessionId, id]);
    if (duplicate) return null;
    const matching = observed.active && observed.carrier === sessionId && observed.scope?.id === id;
    return <>{!matching && <div role="status" style={{padding:12}}>在绑定此工作空间的 Buildr Harness 中使用此标签。</div>}
      {id && <div hidden={!matching} style={{ height: '100%', display: matching ? 'flex' : 'none', flexDirection: 'column' }}><Guest bridge={bridge!} key={id} tool={{ kind, workspaceId: id }}
      onMessage={message => {
        if (message.kind === 'tool-ready') {
          if (kind === 'explorer' && send.current) { explorerControls.set(sessionId, send.current); flushExplorer(); }
        } else if (mountAvailable() && state.carrier === sessionId && state.scope?.id === id) accept(message, send.current);
      }} onControl={fn => { send.current = fn; }} /></div>}</>;
  }
  function Shell() {
    const observed = useSyncExternalStore(store.subscribe, store.getSnapshot);
    if (!observed.opened) return null;
    return <section aria-label="Buildr Harness" className="buildr-harness-dsh-center" hidden={!observed.active} style={observed.active ? {
      position: 'fixed', ...{ positionAnchor: ANCHOR, top: 'max(anchor(top), var(--dsh-frame-top-clearance, 0px))', bottom: 'anchor(bottom)', left: 'anchor(left)', width: 'anchor-size(width)' },
      pointerEvents: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--dsw-alias-bg-base, Canvas)', color: 'CanvasText',
    } : { display: 'none' }}>
      <Guest bridge={bridge!} onMessage={accept} onControl={fn => { sendToChat = fn; tellGuest(); }} />
    </section>;
  }
  ctx.effect(() => {
    const stable = [
      slots.inject('main', () => slots.register({ name: 'main', key: PANEL }, Anchor)),
      slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: PANEL, order: 10, label: () => 'Buildr Harness' }, Mark)),
      slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: PANEL }, Shell)),
    ];
    const toolKinds = ['explorer', 'source-control'] as const;
    const tools = toolKinds.map(kind => slots.inject('sidebar.right.pane.tab', () => slots.register({ name: 'sidebar.right.pane.tab', key: toolId(kind) },
      (props: Omit<Parameters<typeof ToolPane>[0], 'kind'>) => <ToolPane {...props} kind={kind} />)));
    let visibleEntries: boolean | undefined;
    let disposeTypes: Array<() => void> = [];
    syncToolEntries = visible => {
      if (visible === visibleEntries) return;
      visibleEntries = visible;
      // rc.5 builds both Start and More Tools from the same registry. Swap
      // metadata synchronously, keeping kind/id and the mounted tab slots.
      for (const dispose of disposeTypes) dispose();
      disposeTypes = toolKinds.map(kind => {
        const id = toolId(kind);
        return ctx.sidebarRightTabs.register({ id, kind: id, title: () => titles[kind], patterns: [toolAddress(kind)],
          canOpen: (address: string) => address === toolAddress(kind), keepMounted: true,
          ...(visible ? { guide: [{ id, title: () => titles[kind], icon: toolIcons[kind], order: kind === 'explorer' ? 5 : 6 }] } : {}) });
      });
    };
    syncToolEntries(false);
    const slotDispose: Array<() => void> = [];
    const syncSlots = () => {
      if (registering) return;
      registering = true;
      try {
        if (state.active && !slotDispose.length) {
          slotDispose.push(slots.inject('main.conversation', () => slots.register({ name: 'main.conversation', priority: -100 }, Anchor)));
        } else if (!state.active) for (const dispose of slotDispose.splice(0)) dispose();
      } finally { registering = false; }
    };
    const syncPanel = () => {
      const id = layout.panelInfo.getSnapshot().activePanelId;
      if (!state.active && id === PANEL) {
        priorSession = currentSession(); publish({ ...state, active: true, opened: true }); syncSlots(); align();
      } else if (state.active && id !== PANEL && id !== null) {
        expected = undefined; pendingFile = undefined; priorSession = undefined;
        publish({ ...state, active: false, carrier: undefined }); syncSlots();
      }
    };
    const syncSession = () => {
      if (!state.active) return;
      if (sessionSelection(expected, currentSession()) === 'align') { expected = undefined; tellGuest(); }
      else if (currentSession() !== state.carrier) leave(false);
    };
    // Selecting the already mounted DSH row may not change the Selection key.
    // Let the native row perform the navigation; only release our middle slot.
    const nativeRow = (event: MouseEvent | KeyboardEvent) => {
      if (!state.active || !(event.target instanceof Element) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const row = event.target.closest('[role="treeitem"][data-row-key^="session:"]');
      if (!row || row.getAttribute('aria-description')) return;
      if (event instanceof MouseEvent ? event.button !== 0 || !!event.target.closest('button,a,input,[role="button"]') : event.target !== row || !['Enter',' '].includes(event.key)) return;
      leave(false);
    };
    document.addEventListener('click', nativeRow, true);
    document.addEventListener('keydown', nativeRow, true);
    const stop = [store.subscribe(() => { syncSlots(); tellGuest(); }), layout.panelInfo.subscribe(() => { syncPanel(); tellGuest(); }), sessions.list.subscribe(align), workspaces.list.subscribe(align), uiSession.adapter.current.subscribe(syncSession), sidebarRight.mounted.subscribe(tellGuest),
      () => { document.removeEventListener('click', nativeRow, true); document.removeEventListener('keydown', nativeRow, true); }];
    syncPanel();
    return () => {
      syncToolEntries = () => {};
      for (const call of [...stop, ...slotDispose, ...tools, ...disposeTypes, ...stable].reverse()) call();
    };
  }, 'buildr-harness: workspace sidebar');
}
