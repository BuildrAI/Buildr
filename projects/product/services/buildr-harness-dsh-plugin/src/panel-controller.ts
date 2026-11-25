import {
  linkDestination,
  liveCarrier,
  preferredCarrier,
  sessionSelection,
  toolId,
  type GuestMessage,
  type Reveal,
  type Scope,
  type SessionCatalog,
  type Tool,
} from './workspace.ts';

export interface Observable<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

export interface PanelHostContext {
  slots: {
    inject(name: string, mount: () => unknown): () => void;
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  layout: {
    selectPanel(id: string | null): void;
    panelInfo: Observable<{ activePanelId: string | null }>;
  };
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
}

export interface PanelState {
  active: boolean;
  opened: boolean;
  scope: Scope | null;
  carrier?: string;
}

function readBindings(storageKey: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    if (typeof localStorage === 'undefined') return result;
    const pairs: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(pairs)) {
      for (const pair of pairs) {
        if (Array.isArray(pair) && pair.length === 2 && pair.every(item => typeof item === 'string')) {
          result.set(pair[0], pair[1]);
        }
      }
    }
  } catch { /* This installation may only support memory preferences. */ }
  return result;
}

export function createPanelController(options: {
  ctx: PanelHostContext;
  panelId: string;
  conversationPriority: number;
  storageKey: string;
  anchor: unknown;
  onSyncToolEntries?: (visible: boolean) => void;
  openExternal?: (url: string) => void;
}) {
  const { ctx, panelId, conversationPriority, storageKey, anchor } = options;
  const { layout, slots, sidebarRight, sessions, workspaces, uiSession } = ctx;
  const bindings = readBindings(storageKey);
  const settings = ctx.configForms.get('ui-chat');
  const listeners = new Set<() => void>();
  let state: PanelState = { active: false, opened: false, scope: null };
  let priorSession: string | undefined;
  let expected: string | undefined;
  let registering = false;
  let alignScheduled = false;
  let disposed = false;
  let pendingFile: Reveal | undefined;
  const explorerControls = new Map<string, (data: object) => void>();
  let sendToChat: ((data: object) => void) | undefined;
  let syncToolEntries: (visible: boolean) => void = options.onSyncToolEntries ?? (() => {});
  const slotDispose: Array<() => void> = [];

  const currentSession = () => uiSession.adapter.current.getSnapshot().key;
  const archived = () => workspaces.list.getSnapshot().archivedSessionIds;

  const mountAvailable = () =>
    state.active &&
    slotDispose.length > 0 &&
    !!state.carrier &&
    sidebarRight.mounted.getSnapshot() === state.carrier &&
    currentSession() === state.carrier &&
    layout.panelInfo.getSnapshot().activePanelId === null &&
    liveCarrier(state.scope, bindings, sessions.list.getSnapshot(), archived()) === state.carrier;

  function remember(scope: Scope, carrier: string) {
    if (bindings.get(scope.id) === carrier) return;
    bindings.set(scope.id, carrier);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify([...bindings]));
    } catch { /* Keep the window's mapping usable. */ }
  }

  function publish(next = state) {
    state = { ...next };
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    }
  }

  const store: Observable<PanelState> = {
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    getSnapshot: () => state,
  };

  function tellGuest() {
    const native = mountAvailable();
    syncToolEntries(native);
    sendToChat?.({ native });
  }

  function syncSlots() {
    if (registering) return;
    registering = true;
    try {
      if (state.active && !slotDispose.length) {
        try {
          slotDispose.push(
            slots.inject('main.conversation', () => slots.register({ name: 'main.conversation', priority: conversationPriority }, anchor)),
          );
        } catch (error) {
          console.error(error);
        }
      } else if (!state.active) {
        for (const dispose of slotDispose.splice(0)) {
          try {
            dispose();
          } catch (error) {
            console.error(error);
          }
        }
      }
    } finally {
      registering = false;
    }
  }

  function align() {
    if (disposed || !state.active) return;
    const activeId = layout.panelInfo.getSnapshot().activePanelId;
    if (activeId !== panelId && activeId !== null) return;
    const carrier = preferredCarrier(state.scope, bindings, sessions.list.getSnapshot(), archived(), currentSession());
    if (carrier && state.scope) remember(state.scope, carrier);
    if (carrier !== state.carrier) {
      pendingFile = undefined;
      publish({ ...state, carrier });
    }
    if (carrier && currentSession() !== carrier) {
      if (layout.panelInfo.getSnapshot().activePanelId !== panelId) layout.selectPanel(panelId);
      if (expected !== carrier) {
        expected = carrier;
        ctx.uiWorkspace.openSession(carrier);
      }
    } else {
      expected = undefined;
      const target = carrier ? null : panelId;
      if (target !== layout.panelInfo.getSnapshot().activePanelId) layout.selectPanel(target);
    }
    tellGuest();
  }

  function scheduleAlign() {
    if (disposed || !state.active || alignScheduled) return;
    alignScheduled = true;
    queueMicrotask(() => {
      alignScheduled = false;
      align();
    });
  }

  function syncPanel() {
    const id = layout.panelInfo.getSnapshot().activePanelId;
    if (!state.active && id === panelId) {
      priorSession = currentSession();
      publish({ ...state, active: true, opened: true });
      syncSlots();
      scheduleAlign();
    } else if (state.active && id === panelId) {
      scheduleAlign();
    } else if (state.active && id !== panelId && id !== null) {
      expected = undefined;
      pendingFile = undefined;
      priorSession = undefined;
      publish({ ...state, active: false, carrier: undefined });
      syncSlots();
    }
  }

  function syncSession() {
    if (!state.active) return;
    if (sessionSelection(expected, currentSession()) === 'align') {
      expected = undefined;
      tellGuest();
    } else if (currentSession() !== state.carrier) {
      leave(false);
    }
  }

  function leave(restore = true) {
    if (!state.active) return;
    expected = undefined;
    pendingFile = undefined;
    publish({ ...state, active: false, carrier: undefined });
    syncSlots();
    if (restore && priorSession && priorSession !== currentSession() && sessions.list.getSnapshot().byId[priorSession]) {
      ctx.uiWorkspace.openSession(priorSession);
    } else if (layout.panelInfo.getSnapshot().activePanelId === panelId) {
      layout.selectPanel(null);
    }
    priorSession = undefined;
  }

  function flushExplorer() {
    if (!pendingFile || !mountAvailable() || pendingFile.workspaceId !== state.scope?.id) return;
    const control = explorerControls.get(state.carrier!);
    if (control) {
      control({ reveal: pendingFile });
      pendingFile = undefined;
    }
  }

  function launchTool(kind: Tool) {
    if (!mountAvailable()) return;
    const existing = sidebarRight.openTabs.getSnapshot().find(tab => tab.sessionId === state.carrier && tab.kind === toolId(kind));
    if (existing) {
      sidebarRight.focus(existing.tabId);
      if (!sidebarRight.isExpanded()) sidebarRight.toggleExpanded();
    } else {
      sidebarRight.openTab(toolId(kind));
    }
  }

  function accept(message: GuestMessage, send = sendToChat) {
    if (!state.active) return;
    if (message.kind === 'tool-ready' || message.kind === 'image-preview') return;
    if (message.kind === 'shell') {
      if (message.action === 'leave') leave();
      else if (message.action === 'toggle-right' && mountAvailable()) sidebarRight.toggleExpanded();
      return;
    }
    if (message.kind === 'reveal') {
      if (!mountAvailable() || message.file.workspaceId !== state.scope?.id) return;
      pendingFile = message.file;
      launchTool('explorer');
      flushExplorer();
      return;
    }
    if (message.kind === 'workspace') {
      if (state.scope?.id !== message.scope?.id || state.scope?.path !== message.scope?.path) {
        pendingFile = undefined;
        publish({ ...state, scope: message.scope, carrier: undefined });
        align();
      } else {
        if (state.scope?.name !== message.scope?.name) publish({ ...state, scope: message.scope });
        tellGuest();
      }
      return;
    }
    const native = mountAvailable() && ctx.sidebarRightTabs.get('browser') !== undefined;
    const mode = linkDestination(settings.getSnapshot().value?.linkOpening, message.external, native);
    if (mode === 'external') {
      if (options.openExternal) options.openExternal(message.url);
      else if (typeof window !== 'undefined') window.open(message.url, '_blank', 'noopener,noreferrer');
    } else if (mode === 'sidebar') {
      sidebarRight.openTab('browser', { params: { url: message.url } });
    } else {
      send?.({ fallback: message.url });
    }
  }

  function connect() {
    const stops = [
      store.subscribe(() => { syncSlots(); tellGuest(); }),
      layout.panelInfo.subscribe(() => { syncPanel(); tellGuest(); }),
      sessions.list.subscribe(align),
      workspaces.list.subscribe(align),
      uiSession.adapter.current.subscribe(syncSession),
      sidebarRight.mounted.subscribe(tellGuest),
    ];
    syncPanel();
    return () => {
      disposed = true;
      syncToolEntries = () => {};
      for (const stop of [...stops, ...slotDispose.splice(0)].reverse()) {
        try {
          stop();
        } catch (error) {
          console.error(error);
        }
      }
    };
  }

  return {
    store,
    mountAvailable,
    tellGuest,
    align,
    leave,
    accept,
    flushExplorer,
    syncPanel,
    connect,
    setSyncToolEntries(fn: (visible: boolean) => void) {
      syncToolEntries = fn;
    },
    setChatControl(fn: ((data: object) => void) | undefined) {
      sendToChat = fn;
      if (fn) {
        tellGuest();
        fn({ active: state.active });
      }
    },
    sendToChat(data: object) {
      sendToChat?.(data);
    },
    setExplorerControl(sessionId: string, fn: (data: object) => void) {
      explorerControls.set(sessionId, fn);
    },
    clearExplorerControl(sessionId: string, fn: ((data: object) => void) | undefined) {
      if (explorerControls.get(sessionId) === fn) explorerControls.delete(sessionId);
    },
  };
}
