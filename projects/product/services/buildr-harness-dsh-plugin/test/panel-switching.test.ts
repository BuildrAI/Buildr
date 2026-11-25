import assert from 'node:assert/strict';
import test from 'node:test';
import { ORDER as devOrder, conversationPriority as devConversationPriority, panelId as devPanelId } from '../../buildr-development-dsh-plugin/src/channel.ts';
import { createPanelController as createDevelopmentPanelController, type Observable, type PanelHostContext } from '../../buildr-development-dsh-plugin/src/panel-controller.ts';
import { ORDER as harnessOrder, conversationPriority as harnessConversationPriority, panelId as harnessPanelId } from '../src/channel.ts';
import { createPanelController as createHarnessPanelController } from '../src/panel-controller.ts';

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

function createFakeDshHost(options: { sessionId?: string; cwd?: string } = {}) {
  const sessionId = options.sessionId ?? 'sess-1';
  const cwd = options.cwd ?? '/fixtures/repo';
  const conversationEntries = new Map<number, unknown>();
  const panelInfo = createObservable<{ activePanelId: string | null }>({ activePanelId: null });
  const sessionsList = createObservable({
    phase: 'ready' as const,
    ids: [sessionId],
    byId: { [sessionId]: { cwd, updatedAt: 100 } },
  });
  const workspacesList = createObservable<{ archivedSessionIds: readonly string[] }>({ archivedSessionIds: [] });
  const currentSession = createObservable<{ key?: string }>({ key: sessionId });
  const sidebarMounted = createObservable<string | undefined>(sessionId);
  const openTabs = createObservable<readonly { sessionId: string; tabId: string; kind: string }[]>([]);
  const linkForm = createObservable<{ value?: { linkOpening?: string } }>({ value: { linkOpening: 'sidebar' } });
  const registeredRightTabs = new Map<string, object>();

  const slots = {
    inject(_name: string, mount: () => unknown) {
      return mount() as () => void;
    },
    register(reg: { name: string; priority?: number }, component: unknown) {
      if (reg.name === 'main.conversation') {
        const priority = reg.priority ?? 0;
        if (conversationEntries.has(priority)) {
          throw new Error(`single slot "main.conversation" already has a registration at priority ${priority}`);
        }
        conversationEntries.set(priority, component);
        return () => {
          if (conversationEntries.get(priority) === component) conversationEntries.delete(priority);
        };
      }
      return () => {};
    },
  };

  const ctx: PanelHostContext = {
    slots,
    layout: {
      selectPanel(id) {
        if (panelInfo.getSnapshot().activePanelId === id) return;
        panelInfo.set({ activePanelId: id });
      },
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
    sidebarRightTabs: {
      get: kind => (kind === 'browser' ? {} : registeredRightTabs.get(kind)),
      register(def: { kind?: string; id?: string }) {
        const key = def.kind ?? def.id ?? 'unknown';
        registeredRightTabs.set(key, def);
        return () => { registeredRightTabs.delete(key); };
      },
    },
    configForms: { get: () => linkForm },
  };

  return { ctx, panelInfo, conversationEntries, registeredRightTabs, slots };
}

const flushMicrotasks = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('switching from Development to Harness works in either listener order, including shared workspace carrier sessions', async t => {
  assert.notEqual(harnessConversationPriority, devConversationPriority);

  const host = createFakeDshHost({ sessionId: 'sess-shared', cwd: '/fixtures/shared-repo' });
  let harnessGuideVisible = false;
  let devGuideVisible = false;

  // Register Harness BEFORE Development to reproduce the exact DSH bundle load order.
  const harness = createHarnessPanelController({
    ctx: host.ctx,
    panelId: harnessPanelId,
    conversationPriority: harnessConversationPriority,
    storageKey: 'test.harness.carriers',
    anchor: 'HarnessAnchor',
    onSyncToolEntries: visible => { harnessGuideVisible = visible; },
  });
  const dev = createDevelopmentPanelController({
    ctx: host.ctx,
    panelId: devPanelId,
    conversationPriority: devConversationPriority,
    storageKey: 'test.dev.carriers',
    anchor: 'DevAnchor',
    onSyncToolEntries: visible => { devGuideVisible = visible; },
  });

  // Subscribe Shell-like store listeners before connecting so publish order matches React mount.
  const harnessShellStates: Array<{ active: boolean; opened: boolean }> = [];
  const devShellStates: Array<{ active: boolean; opened: boolean }> = [];
  const stopHarnessShell = harness.store.subscribe(() => {
    const snap = harness.store.getSnapshot();
    harnessShellStates.push({ active: snap.active, opened: snap.opened });
  });
  const stopDevShell = dev.store.subscribe(() => {
    const snap = dev.store.getSnapshot();
    devShellStates.push({ active: snap.active, opened: snap.opened });
  });

  const stopHarness = harness.connect();
  const stopDev = dev.connect();
  t.after(() => {
    stopHarnessShell();
    stopDevShell();
    stopHarness();
    stopDev();
  });

  // 1. Open Buildr Development first and report workspace matching the shared carrier session.
  host.ctx.layout.selectPanel(devPanelId);
  await flushMicrotasks();
  dev.accept({ kind: 'workspace', scope: { id: 'ws-shared', path: '/fixtures/shared-repo', name: 'Buildr' } });
  await flushMicrotasks();

  assert.equal(dev.store.getSnapshot().active, true);
  assert.equal(dev.store.getSnapshot().opened, true);
  assert.equal(dev.mountAvailable(), true);
  assert.equal(devGuideVisible, true);
  assert.equal(harness.store.getSnapshot().active, false);
  assert.deepEqual([...host.conversationEntries.keys()], [devConversationPriority]);

  // 2. Switch from Buildr Development to Buildr Harness (Harness listener runs first!).
  host.ctx.layout.selectPanel(harnessPanelId);
  assert.equal(harness.store.getSnapshot().active, true);
  assert.equal(harness.store.getSnapshot().opened, true);
  assert.equal(dev.store.getSnapshot().active, false);
  assert.equal(devGuideVisible, false);
  assert.deepEqual([...host.conversationEntries.keys()], [harnessConversationPriority]);

  await flushMicrotasks();
  harness.accept({ kind: 'workspace', scope: { id: 'ws-shared', path: '/fixtures/shared-repo', name: 'Buildr' } });
  await flushMicrotasks();

  assert.equal(harness.store.getSnapshot().active, true);
  assert.equal(harness.mountAvailable(), true);
  assert.equal(harnessGuideVisible, true);
  assert.equal(dev.store.getSnapshot().active, false);
  assert.equal(dev.mountAvailable(), false);
  assert.ok(harnessShellStates.some(s => s.active && s.opened));

  // 3. Switch back to Buildr Development and then again to Buildr Harness repeatedly.
  host.ctx.layout.selectPanel(devPanelId);
  await flushMicrotasks();
  assert.equal(dev.store.getSnapshot().active, true);
  assert.equal(dev.mountAvailable(), true);
  assert.equal(harness.store.getSnapshot().active, false);
  assert.equal(harnessGuideVisible, false);
  assert.deepEqual([...host.conversationEntries.keys()], [devConversationPriority]);

  host.ctx.layout.selectPanel(harnessPanelId);
  await flushMicrotasks();
  assert.equal(harness.store.getSnapshot().active, true);
  assert.equal(harness.mountAvailable(), true);
  assert.equal(dev.store.getSnapshot().active, false);
  assert.equal(devGuideVisible, false);
  assert.deepEqual([...host.conversationEntries.keys()], [harnessConversationPriority]);
});

test('a throwing slot registration does not prevent Shell subscribers from receiving panel state updates', async t => {
  const host = createFakeDshHost();
  const blockSlot = host.slots.register({ name: 'main.conversation', priority: harnessConversationPriority }, 'ExternalBlocker') as () => void;
  t.after(blockSlot);

  const harness = createHarnessPanelController({
    ctx: host.ctx,
    panelId: harnessPanelId,
    conversationPriority: harnessConversationPriority,
    storageKey: 'test.harness.collision',
    anchor: 'HarnessAnchor',
  });

  const stopHarness = harness.connect();
  t.after(stopHarness);

  let shellObservedActive = false;
  const stopShell = harness.store.subscribe(() => {
    shellObservedActive = harness.store.getSnapshot().active;
  });
  t.after(stopShell);

  const errors: unknown[] = [];
  t.mock.method(console, 'error', (err: unknown) => { errors.push(err); });

  host.ctx.layout.selectPanel(harnessPanelId);
  await flushMicrotasks();

  assert.equal(harness.store.getSnapshot().opened, true);
  assert.equal(harness.store.getSnapshot().active, true);
  assert.equal(shellObservedActive, true);
  assert.equal(harness.mountAvailable(), false);
  assert.equal(errors.length > 0, true);
});

test('sidebar ORDER keeps Buildr Harness before Buildr Development directly below Plugins and above Schedules', async () => {
  assert.equal(harnessOrder, 5);
  assert.equal(devOrder, 7);
  assert.ok(harnessOrder > 0 && harnessOrder < devOrder && devOrder < 10);

  const globals = globalThis as Record<string, unknown>;
  const prevHarness = globals.__BUILDR_HARNESS_DSH_RELEASED__;
  const prevDev = globals.__BUILDR_DEVELOPMENT_DSH_RELEASED__;
  try {
    globals.__BUILDR_HARNESS_DSH_RELEASED__ = true;
    globals.__BUILDR_DEVELOPMENT_DSH_RELEASED__ = true;
    const releasedHarness = await import(`../src/channel.ts?released-order=${Date.now()}`);
    const releasedDev = await import(`../../buildr-development-dsh-plugin/src/channel.ts?released-order=${Date.now()}`);
    assert.equal(releasedHarness.ORDER, 4);
    assert.equal(releasedDev.ORDER, 6);
    assert.ok(releasedHarness.ORDER > 0 && releasedHarness.ORDER < releasedDev.ORDER && releasedDev.ORDER < 10);
  } finally {
    if (prevHarness === undefined) delete globals.__BUILDR_HARNESS_DSH_RELEASED__;
    else globals.__BUILDR_HARNESS_DSH_RELEASED__ = prevHarness;
    if (prevDev === undefined) delete globals.__BUILDR_DEVELOPMENT_DSH_RELEASED__;
    else globals.__BUILDR_DEVELOPMENT_DSH_RELEASED__ = prevDev;
  }
});
