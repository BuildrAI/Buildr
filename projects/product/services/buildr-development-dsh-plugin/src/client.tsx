import { conversationPriority, label, ORDER, panelId as PANEL, released } from './channel.ts';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { attachDevelopmentGuest, desktopBridge, desktopKeyboard, type DesktopBridge } from './guest.ts';
import { createPanelController, type Observable, type PanelHostContext } from './panel-controller.ts';
import { detectDesktopPlatform, resolveRefreshBinding, shouldRefreshCenterDevelopment, TOOL_LABELS, toolTabTitle, type ShortcutCatalogEntry } from './refresh.ts';
import { shouldNotifyChatActive, toolAddress, toolId, workspaceDisplayName, type GuestMessage, type Tool } from './workspace.ts';

const ANCHOR = '--buildr-development-dsh';
const KEY = released ? 'buildr.development-dsh.released.carriers.v1' : 'buildr.development-dsh.carriers.v1';

interface ShortcutsContext {
  catalog?: Observable<readonly ShortcutCatalogEntry[]>;
  config?: Observable<{ revision?: string }>;
  platform?: 'macos' | 'windows' | 'linux';
}
interface Context extends PanelHostContext {
  inject?(deps: readonly string[], callback: (scope: { shortcuts?: ShortcutsContext; effect(callback: () => () => void, name: string): void }) => void): void;
  effect(callback: () => () => void, name: string): void;
}
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'uiSession', 'sidebarRight', 'sidebarRightTabs', 'configForms'];

function Mark({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" style={{ flexShrink: 0, display: 'block' }}>
    <path d="M6.2 4.9 11.2 2 14.8 4.1 9.8 7v2.6L6.2 7.5Z" fill="#1f92f6" />
    <path d="M10.9 6.36 14.8 4.1 18.3 6.1Q19 6.5 19 7.4V10.5L15.2 12.7V8.8Z" fill="#f8af08" />
    <path d="M10.7 11.4 13.2 10 18.3 12.9Q19 13.3 19 14.2V16.7Q19 17.6 18.3 18L16.3 19.1 13.5 17.5 15.2 16.5V15.3L10.7 12.7Z" fill="#14b3a4" />
    <path d="M6.2 8.7 9.8 10.8V17.2L11.8 18.4 13.5 17.5 16.5 19.2 11.8 22 4.8 18V16.8L6.2 16Z" fill="#1f92f6" />
  </svg>;
}

type IconProps = { size?: number; className?: string };
type ToolIconProps = IconProps & { color?: string };
function ExplorerIcon({ size = 22, className, color }: ToolIconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke={color ?? 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h5l2 2h7A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18ZM4 10.5h16" />
    <path d="M8 14h8m-8 2.7h5" />
  </svg>;
}
function SourceControlIcon({ size = 22, className, color }: ToolIconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke={color ?? 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="5" r="2" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="7" r="2" />
    <path d="M7 7v10m0-1.5c0-4.5 10-.5 10-6.5" />
  </svg>;
}
const toolIcons: Record<Tool, ComponentType<IconProps>> = { explorer: ExplorerIcon, 'source-control': SourceControlIcon };
const guideIcons: Record<Tool, ComponentType<IconProps>> = {
  explorer: props => <ExplorerIcon {...props} color="#d97706" />,
  'source-control': props => <SourceControlIcon {...props} color="#8b5cf6" />,
};

const messages: Record<string, string> = {
  'binding-missing': '尚未绑定本机 Buildr。请使用配置好开发环境变量的入口重新打开 DSH。',
  'development-unavailable': '无法连接已绑定的 Buildr。请确认安装和运行状态后重试。',
  'development-not-installed': '尚未找到正式版 @buildr-ai/buildr。请先全局安装受支持版本的 Buildr，再重新检查。',
  'development-installation-invalid': '无法核对正式版 Buildr 安装或启动器。请修复安装后重试。',
  'development-incompatible': '已安装的 Buildr 版本不在当前插件支持范围内。请升级后重新检查。',
  'development-platform': '当前平台尚无已支持的正式 Buildr 发现入口。',
  'development-timeout': '打开 Buildr 超时。请核对当前运行状态后重试。',
  'development-navigation': 'Buildr 网页未能加载。已有后端服务与会话不受影响。',
};

function Guest({ bridge, tool, onMessage, onControl, onRefresh, canPreviewImage }: {
  bridge: DesktopBridge;
  tool?: { kind: Tool; workspaceId: string };
  onMessage?: (m: GuestMessage) => void;
  canPreviewImage?: () => boolean;
  onControl?: (send: (d: object) => void) => void;
  onRefresh?: (handle: { lease?: string; reload: () => void } | undefined) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const latest = useRef({ onMessage, onControl, onRefresh, canPreviewImage });
  latest.current = { onMessage, onControl, onRefresh, canPreviewImage };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });
  const kind = tool?.kind, workspaceId = tool?.workspaceId;
  const retry = () => { setState({ ready: false }); setAttempt(n => n + 1); };
  useEffect(() => {
    if (!mount.current) return;
    return attachDevelopmentGuest(mount.current, bridge, error => setState(error ? { ready: false, error } : { ready: true }), {
      tool: kind && workspaceId ? { kind, workspaceId } : undefined,
      canPreviewImage: () => latest.current.canPreviewImage?.() === true,
      onMessage: message => latest.current.onMessage?.(message),
      onControl: send => latest.current.onControl?.(send),
      onRefresh: handle => latest.current.onRefresh?.(handle),
    });
  }, [attempt, bridge, kind, workspaceId]);
  useEffect(() => {
    if (!state.ready && state.error) latest.current.onRefresh?.({ reload: retry });
  }, [state.ready, state.error]);
  useEffect(() => () => { latest.current.onRefresh?.(undefined); }, []);
  return <div style={{ minHeight: 0, position: 'relative', flex: 1 }}>
    <div ref={mount} style={{ position: 'absolute', inset: 0 }} />
    {!state.ready && <div role={state.error ? 'alert' : 'status'} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 20, background: 'Canvas', gap: 8 }}>
      {state.error ? (messages[state.error] ?? messages['development-unavailable']) : `正在打开${kind ? toolTabTitle(kind) : ' ' + label}…`}
      {state.error && <button type="button" onClick={retry}>重新检查</button>}
    </div>}
  </div>;
}

export function apply(ctx: Context) {
  const bridge = desktopBridge();
  if (!bridge || typeof ctx.slots?.inject !== 'function' || typeof ctx.slots?.register !== 'function'
      || typeof ctx.layout?.selectPanel !== 'function' || typeof ctx.layout?.panelInfo?.subscribe !== 'function'
      || typeof ctx.sidebarRightTabs?.register !== 'function' || typeof ctx.configForms?.get !== 'function') return;
  const { slots, sidebarRight } = ctx;
  let chatRefresh: { lease?: string; reload: () => void } | undefined;
  let shortcuts: ShortcutsContext | undefined;
  if (typeof ctx.inject === 'function') {
    ctx.inject(['shortcuts'], scope => {
      scope.effect(() => {
        shortcuts = scope.shortcuts;
        return () => { if (shortcuts === scope.shortcuts) shortcuts = undefined; };
      }, 'buildr-development: shortcuts');
    });
  }

  function Anchor() {
    const observed = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
    const darwin = typeof document !== 'undefined' && document.documentElement.dataset.platform === 'darwin';
    const workspaceName = workspaceDisplayName(observed.scope);
    return <div style={{ height: '100%', width: '100%', ...{ anchorName: ANCHOR } }}>
      {darwin && <header className="buildr-development-dsh-topbar" data-window-drag="" style={{
        height: 'var(--dsh-frame-top-clearance, 48px)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 8,
        paddingInlineStart: 'max(16px, var(--dsh-frame-leading-clearance, 0px))', paddingInlineEnd: 16,
        background: 'var(--dsw-alias-bg-base, Canvas)',
        borderBottom: '0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.08))',
        color: 'var(--dsw-alias-label-primary, CanvasText)', fontSize: 13, lineHeight: '20px',
        userSelect: 'none', WebkitUserSelect: 'none', overflow: 'hidden',
      }}>
        <Mark size={16} />
        <span style={{ fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>Buildr</span>
        {!released && <span style={{
          fontSize: 10, lineHeight: '16px', fontWeight: 500, flexShrink: 0,
          padding: '0 5px', borderRadius: 4,
          color: 'var(--dsw-alias-label-secondary, GrayText)',
          background: 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))',
        }}>Dev</span>}
        {workspaceName && <>
          <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-tertiary, GrayText)', flexShrink: 0 }}>/</span>
          <span className="buildr-development-dsh-workspace"
            title={observed.scope?.path ? `${workspaceName} (${observed.scope.path})` : workspaceName}
            style={{
              color: 'var(--dsw-alias-label-secondary, GrayText)', maxWidth: 260, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{workspaceName}</span>
        </>}
      </header>}
    </div>;
  }

  const controller = createPanelController({
    ctx,
    panelId: PANEL,
    conversationPriority,
    storageKey: KEY,
    anchor: Anchor,
  });

  function ToolPane({ kind, sessionId, useTabInfo }: {
    kind: Tool;
    sessionId: string;
    useTabInfo(): { tab: { id: string; visible: boolean; actions: { close(): void; bindCommands?(commands: { refresh?: () => void }): () => void } } };
  }) {
    const observed = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
    const inventory = useSyncExternalStore(sidebarRight.openTabs.subscribe, sidebarRight.openTabs.getSnapshot);
    const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
    const { tab } = useTabInfo();
    const first = inventory.find(item => item.sessionId === sessionId && item.kind === toolId(kind));
    const duplicate = !!first && first.tabId !== tab.id;
    useEffect(() => { if (duplicate && mounted === sessionId && controller.mountAvailable()) { sidebarRight.focus(first!.tabId); tab.actions.close(); } }, [duplicate, mounted, observed.active, observed.carrier, sessionId, first?.tabId, tab.id]);
    const initial = useRef<string | undefined>(undefined);
    if (observed.active && observed.carrier === sessionId && observed.scope) initial.current = observed.scope.id;
    const id = initial.current;
    const send = useRef<((data: object) => void) | undefined>(undefined);
    const refreshRef = useRef<(() => void) | undefined>(undefined);
    const toolActive = !duplicate && tab.visible && observed.active && observed.carrier === sessionId && observed.scope?.id === id;
    useEffect(() => { send.current?.({ active: toolActive }); }, [toolActive]);
    useEffect(() => () => { if (kind === 'explorer') controller.clearExplorerControl(sessionId, send.current); }, [kind, sessionId, id]);
    const matching = observed.active && observed.carrier === sessionId && observed.scope?.id === id;
    useEffect(() => {
      if (!matching || duplicate || typeof tab.actions.bindCommands !== 'function') return;
      return tab.actions.bindCommands({ refresh: () => { refreshRef.current?.(); } });
    }, [matching, duplicate, tab.actions]);
    if (duplicate) return null;
    return <>{!matching && <div role="status" style={{ padding: 12 }}>在绑定此工作空间的 Buildr 中使用此标签。</div>}
      {id && <div hidden={!matching} style={{ height: '100%', display: matching ? 'flex' : 'none', flexDirection: 'column' }}><Guest bridge={bridge!} key={id} tool={{ kind, workspaceId: id }}
      onMessage={message => {
        if (message.kind === 'tool-ready') {
          send.current?.({ active: toolActive });
          if (kind === 'explorer' && send.current) { controller.setExplorerControl(sessionId, send.current); controller.flushExplorer(); }
        } else {
          const current = controller.store.getSnapshot();
          if (controller.mountAvailable() && current.carrier === sessionId && current.scope?.id === id) controller.accept(message, send.current);
        }
      }} onControl={fn => { send.current = fn; fn({ active: toolActive }); }} onRefresh={handle => { refreshRef.current = handle?.reload; }} /></div>}</>;
  }

  function Shell() {
    const observed = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
    useEffect(() => {
      if (observed.opened) controller.sendToChat({ active: observed.active });
    }, [observed.opened, observed.active]);
    if (!observed.opened) return null;
    return <section aria-label={label} className="buildr-development-dsh-center" hidden={!observed.active} style={observed.active ? {
      position: 'fixed', ...{ positionAnchor: ANCHOR, top: 'max(anchor(top), var(--dsh-frame-top-clearance, 0px))', bottom: 'anchor(bottom)', left: 'anchor(left)', width: 'anchor-size(width)' },
      pointerEvents: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--dsw-alias-bg-base, Canvas)', color: 'CanvasText',
    } : { display: 'none' }}>
      <Guest bridge={bridge!} canPreviewImage={() => controller.store.getSnapshot().active} onMessage={controller.accept} onControl={fn => { controller.setChatControl(fn); }} onRefresh={handle => { chatRefresh = handle; }} />
    </section>;
  }

  ctx.effect(() => {
    const stable = [
      slots.inject('main', () => slots.register({ name: 'main', key: PANEL }, Anchor)),
      slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: PANEL, order: ORDER, label: () => label }, Mark)),
      slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: PANEL }, Shell)),
    ];
    const toolKinds = ['explorer', 'source-control'] as const;
    const tools = toolKinds.flatMap(kind => {
      const id = toolId(kind);
      const Icon = toolIcons[kind];
      return [
        slots.inject('sidebar.right.pane.tab', () => slots.register({ name: 'sidebar.right.pane.tab', key: id },
          (props: Omit<Parameters<typeof ToolPane>[0], 'kind'>) => <ToolPane {...props} kind={kind} />)),
        slots.inject('sidebar.right.pane.tab.title', () => slots.register({ name: 'sidebar.right.pane.tab.title', key: id },
          () => <><Icon size={16} />{toolTabTitle(kind)}</>)),
      ];
    });
    let visibleEntries: boolean | undefined;
    let disposeTypes: Array<() => void> = [];
    const syncToolEntries = (visible: boolean) => {
      if (visible === visibleEntries) return;
      visibleEntries = visible;
      for (const dispose of disposeTypes) dispose();
      disposeTypes = toolKinds.map(kind => {
        const id = toolId(kind);
        return ctx.sidebarRightTabs.register({
          id,
          kind: id,
          title: () => toolTabTitle(kind),
          patterns: [toolAddress(kind)],
          canOpen: (address: string) => address === toolAddress(kind),
          keepMounted: true,
          ...(visible ? { guide: [{ id, title: () => TOOL_LABELS[kind], icon: guideIcons[kind], order: kind === 'explorer' ? 5 : 6 }] } : {}),
        });
      });
    };
    controller.setSyncToolEntries(syncToolEntries);
    syncToolEntries(false);
    const nativeRow = (event: MouseEvent | KeyboardEvent) => {
      if (!controller.store.getSnapshot().active || !(event.target instanceof Element) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const row = event.target.closest('[role="treeitem"][data-row-key^="session:"]');
      if (!row || row.getAttribute('aria-description')) return;
      if (event instanceof MouseEvent ? event.button !== 0 || !!event.target.closest('button,a,input,[role="button"]') : event.target !== row || !['Enter', ' '].includes(event.key)) return;
      controller.leave(false);
    };
    document.addEventListener('click', nativeRow, true);
    document.addEventListener('keydown', nativeRow, true);
    const modalSelector = '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]';
    const activeElement = () => {
      let target: Element | null = document.activeElement;
      while (target?.shadowRoot?.activeElement && !target.matches('webview[data-sidebar-browser-frame]')) {
        target = target.shadowRoot.activeElement;
      }
      return target;
    };
    const inRightSidebar = () => Boolean(activeElement()?.closest('[data-sidebar-right-session], [data-dockkit-pane], [data-dockkit-float]'));
    const hasModal = () => Boolean(document.querySelector(modalSelector));
    const refreshBinding = () => resolveRefreshBinding(shortcuts?.catalog?.getSnapshot(), shortcuts?.platform ?? detectDesktopPlatform());
    const keyboard = desktopKeyboard();
    const stopRefresh = keyboard
      ? keyboard.subscribe(event => {
          if (shouldRefreshCenterDevelopment({
            active: controller.store.getSnapshot().active,
            hasModal: hasModal(),
            inRightSidebar: inRightSidebar(),
            chatLease: chatRefresh?.lease,
            expectedRevision: shortcuts?.config?.getSnapshot().revision,
            binding: refreshBinding(),
            event,
          })) chatRefresh?.reload();
        })
      : (() => {
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return;
            if (shouldRefreshCenterDevelopment({
              active: controller.store.getSnapshot().active,
              hasModal: hasModal(),
              inRightSidebar: inRightSidebar(),
              chatLease: chatRefresh?.lease,
              binding: refreshBinding(),
              event: {
                kind: 'keyboard',
                code: event.code,
                repeat: event.repeat,
                control: event.ctrlKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
              },
            })) {
              event.preventDefault();
              chatRefresh?.reload();
            }
          };
          window.addEventListener('keydown', onKeyDown);
          return () => window.removeEventListener('keydown', onKeyDown);
        })();
    const notifyChatActive = () => {
      if (shouldNotifyChatActive(controller.store.getSnapshot().active, document.visibilityState)) controller.sendToChat({ active: true });
    };
    window.addEventListener('focus', notifyChatActive);
    document.addEventListener('visibilitychange', notifyChatActive);
    const disconnectController = controller.connect();
    return () => {
      disconnectController();
      window.removeEventListener('focus', notifyChatActive);
      document.removeEventListener('visibilitychange', notifyChatActive);
      document.removeEventListener('click', nativeRow, true);
      document.removeEventListener('keydown', nativeRow, true);
      stopRefresh();
      for (const call of [...tools, ...disposeTypes, ...stable].reverse()) call();
    };
  }, 'buildr-development: workspace sidebar');
}
