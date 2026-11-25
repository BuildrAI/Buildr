import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationPriority, panelId } from '../src/channel.ts';
import { createPanelController, type Observable, type PanelHostContext } from '../src/panel-controller.ts';

function createObservable<T>(initial: T): Observable<T> & { set(next: T): void } {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

test('development controller manages single-slot registration, deferred alignment, and leave restoration cleanly', async t => {
  const activeSlots = new Map<number, unknown>();
  const panelInfo = createObservable<{ activePanelId: string | null }>({ activePanelId: null });
  const sessionsList = createObservable({
    phase: 'ready' as const,
    ids: ['sess-1', 'sess-other'],
    byId: {
      'sess-1': { cwd: '/fixtures/repo', updatedAt: 200 },
      'sess-other': { cwd: '/fixtures/other', updatedAt: 100 },
    },
  });
  const workspacesList = createObservable<{ archivedSessionIds: readonly string[] }>({ archivedSessionIds: [] });
  const currentSession = createObservable<{ key?: string }>({ key: 'sess-other' });
  const sidebarMounted = createObservable<string | undefined>('sess-other');
  const openTabs = createObservable<readonly { sessionId: string; tabId: string; kind: string }[]>([]);
  const linkForm = createObservable<{ value?: { linkOpening?: string } }>({ value: { linkOpening: 'sidebar' } });

  const ctx: PanelHostContext = {
    slots: {
      inject: (_name, mount) => mount() as () => void,
      register(reg: { name: string; priority?: number }, component: unknown) {
        if (reg.name === 'main.conversation') {
          const priority = reg.priority ?? 0;
          if (activeSlots.has(priority)) throw new Error(`duplicate priority ${priority}`);
          activeSlots.set(priority, component);
          return () => { activeSlots.delete(priority); };
        }
        return () => {};
      },
    },
    layout: {
      selectPanel: id => panelInfo.set({ activePanelId: id }),
      panelInfo,
    },
    sessions: { list: sessionsList },
    workspaces: { list: workspacesList },
    uiWorkspace: {
      openSession(id) {
        currentSession.set({ key: id });
        sidebarMounted.set(id);
        panelInfo.set({ activePanelId: null });
      },
    },
    uiSession: { adapter: { current: currentSession } },
    sidebarRight: {
      mounted: sidebarMounted,
      openTabs,
      openTab() {},
      focus() {},
      toggleExpanded() {},
      isExpanded: () => false,
    },
    sidebarRightTabs: { get: () => ({}), register: () => () => {} },
    configForms: { get: () => linkForm },
  };

  let visible = false;
  const controller = createPanelController({
    ctx,
    panelId,
    conversationPriority,
    storageKey: 'test.dev.panel',
    anchor: 'DevAnchor',
    onSyncToolEntries: value => { visible = value; },
  });
  const stop = controller.connect();
  t.after(stop);

  ctx.layout.selectPanel(panelId);
  // Before microtask runs, activePanelId stays at panelId so peer plugins see the transition.
  assert.equal(panelInfo.getSnapshot().activePanelId, panelId);
  assert.equal(controller.store.getSnapshot().active, true);
  assert.deepEqual([...activeSlots.keys()], [conversationPriority]);

  await new Promise<void>(resolve => setTimeout(resolve, 0));
  controller.accept({ kind: 'workspace', scope: { id: 'ws-1', path: '/fixtures/repo', name: 'Repo' } });
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  assert.equal(currentSession.getSnapshot().key, 'sess-1');
  assert.equal(panelInfo.getSnapshot().activePanelId, null);
  assert.equal(controller.mountAvailable(), true);
  assert.equal(visible, true);

  controller.accept({ kind: 'shell', action: 'leave' });
  assert.equal(controller.store.getSnapshot().active, false);
  assert.equal(currentSession.getSnapshot().key, 'sess-other');
  assert.equal(activeSlots.size, 0);
  assert.equal(visible, false);
});
