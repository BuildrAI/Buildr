import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenAction, type Status } from '../../resources/runtime/dsh/src/orchestration.ts';
import type { OpenResult } from '../../resources/runtime/dsh/src/types.ts';

type Sidebar = Parameters<typeof createOpenAction>[0];
type Panel = Parameters<typeof createOpenAction>[4];
type SessionId = NonNullable<ReturnType<Sidebar['mounted']['getSnapshot']>>;
type Tab = NonNullable<ReturnType<Sidebar['active']>>;
const sid = (id: string): SessionId => id as SessionId;
function harness({ desktop = true, ready = async (): Promise<OpenResult> => ({ ready: true, url: 'http://127.0.0.1:8123', channel: 'released', ownershipIdentity: 'test' }) }: { desktop?: boolean; ready?: () => Promise<OpenResult> } = {}) {
  let session: SessionId | undefined = sid('a');
  let inventory: ReturnType<Sidebar['openTabs']['getSnapshot']> = [];
  let active: Tab | undefined; let expanded = false;
  let activePanelId: ReturnType<Panel['getSnapshot']>['activePanelId'] = null;
  const listeners = new Set<() => void>(); const panels = new Set<() => void>();
  const calls: [string, ...unknown[]][] = []; const statuses: Status[] = [];
  const sidebar: Sidebar = {
    mounted: { getSnapshot: () => session, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; } },
    openTabs: { getSnapshot: () => inventory, subscribe: () => () => {} }, active: () => active,
    openTab: (kind, options) => { calls.push(['open', session, kind, options]); active = { id: `t${calls.length}`, kind } as Tab; inventory = [...inventory, { sessionId: session!, tabId: active.id, kind, contentId: 'fixture' }]; expanded = true; },
    focus: id => { calls.push(['focus', id]); }, isExpanded: () => expanded,
    toggleExpanded: () => { calls.push(['show']); expanded = !expanded; },
  };
  let queries = 0;
  const action = createOpenAction(sidebar, () => { queries++; return ready(); }, desktop, s => statuses.push(s), {
    getSnapshot: () => ({ activePanelId }), subscribe: fn => { panels.add(fn); return () => { panels.delete(fn); }; },
  });
  return { action, calls, statuses, listeners, panels, get queries() { return queries; }, get tabs() { return inventory; },
    switch(id: string | undefined) { session = id === undefined ? undefined : sid(id); for (const listener of listeners) listener(); },
    panel(id: string | null) { activePanelId = id as typeof activePanelId; for (const listener of panels) listener(); },
    collapse() { expanded = false; }, close() { inventory = []; active = undefined; } };
}
const deferred = () => Promise.withResolvers<OpenResult>();
const result: OpenResult = { ready: true, url: 'http://127.0.0.1:9912', channel: 'development', ownershipIdentity: 'test' };

test('each repeat queries health but an unchanged URL only focuses/shows the existing tab', async () => {
  const h = harness(); await h.action.click(); h.collapse(); await h.action.click();
  assert.deepEqual(h.calls, [['open', 'a', 'browser', { params: { url: 'http://127.0.0.1:8123' } }], ['focus', 't1'], ['show']]);
  assert.equal(h.queries, 2); h.action.dispose();
});
test('successive healthy URL changes preserve old pages and stable repeats reuse the latest tab', async () => {
  let url = 'http://127.0.0.1:1111'; const h = harness({ ready: async () => ({ ...result, url }) });
  await h.action.click(); await h.action.click();
  const first = h.tabs[0].tabId;
  url = 'http://127.0.0.1:2222'; await h.action.click(); await h.action.click();
  const second = h.tabs[1].tabId;
  url = 'http://127.0.0.1:3333'; await h.action.click(); await h.action.click(); await h.action.click();
  const latest = h.tabs[2].tabId;
  assert.equal(h.queries, 7);
  assert.deepEqual(h.calls.filter(call => call[0] === 'open').map(call => (call[3] as { params: { url: string } }).params.url),
    ['http://127.0.0.1:1111', 'http://127.0.0.1:2222', 'http://127.0.0.1:3333']);
  assert.deepEqual(h.tabs.map(tab => tab.tabId), [first, second, latest]);
  assert.deepEqual(h.calls.slice(-2), [['focus', latest], ['focus', latest]]);
  h.action.dispose();
});
test('closing an owned tab during a repeat query cancels reopening even if its healthy URL changes', async () => {
  const d = deferred(); let wait = false;
  const h = harness({ ready: () => wait ? d.promise : Promise.resolve({ ...result, url: 'http://127.0.0.1:1111' }) });
  await h.action.click(); wait = true;
  const pending = h.action.click(); const repeated = h.action.click();
  assert.equal(pending, repeated); assert.equal(h.queries, 2);
  h.close(); d.resolve({ ...result, url: 'http://127.0.0.1:2222' }); await pending;
  assert.equal(h.calls.length, 1); assert.equal(h.tabs.length, 0); assert.equal(h.statuses.at(-1)?.kind, 'tabClosed');
  await h.action.click();
  assert.equal(h.queries, 3); assert.equal(h.calls.length, 2); assert.equal(h.tabs.length, 1);
  assert.equal((h.calls.at(-1)?.[3] as { params: { url: string } }).params.url, 'http://127.0.0.1:2222');
  h.action.dispose();
});
test('a failed repeat health query preserves ownership so retry can reveal the original page', async () => {
  let fail = false;
  const h = harness({ ready: async () => fail ? { ready: false, code: 'timeout', message: '等待超时' } : result });
  await h.action.click(); fail = true; await h.action.click();
  assert.equal(h.calls.length, 1); assert.equal(h.tabs.length, 1); assert.equal(h.statuses.at(-1)?.kind, 'failed');
  fail = false; await h.action.click();
  assert.equal(h.queries, 3); assert.deepEqual(h.calls.at(-1), ['focus', h.tabs[0].tabId]); h.action.dispose();
});
test('closed tab performs a fresh ready query and accepts a changed address', async () => {
  let url = 'http://127.0.0.1:1111'; const h = harness({ ready: async () => ({ ...result, url }) });
  await h.action.click(); h.close(); url = 'http://127.0.0.1:2222'; await h.action.click();
  assert.equal(h.queries, 2); assert.equal((h.calls.at(-1)?.[3] as { params: { url: string } }).params.url, url); h.action.dispose();
});
test('no session is explicit and does not query or navigate', async () => {
  const h = harness(); h.switch(undefined); await h.action.click();
  assert.deepEqual(h.statuses, [{ kind: 'noSession' }]); assert.equal(h.queries, 0); assert.deepEqual(h.calls, []); h.action.dispose();
});
test('global panel with an unreleased sidebar binding is unavailable', async () => {
  const h = harness(); h.panel('plugins'); await h.action.click();
  assert.equal(h.statuses.at(-1)?.kind, 'noSession'); assert.equal(h.queries, 0); h.action.dispose();
});
test('web browser is rejected before Host launch', async () => {
  const h = harness({ desktop: false }); await h.action.click(); assert.equal(h.statuses[0].kind, 'desktopOnly'); assert.equal(h.queries, 0); h.action.dispose();
});
test('concurrent clicks share one operation', async () => {
  const d = deferred(); const h = harness({ ready: () => d.promise }); const a = h.action.click(); const b = h.action.click();
  assert.equal(a, b); assert.equal(h.queries, 1); d.resolve(result); await a; assert.equal(h.calls.length, 1); h.action.dispose();
});
test('switch away and back while awaiting never opens in a changed generation', async () => {
  const d = deferred(); const h = harness({ ready: () => d.promise }); const p = h.action.click(); h.switch('b'); h.switch('a'); d.resolve(result); await p;
  assert.deepEqual(h.calls, []); assert.equal(h.statuses.at(-1)?.kind, 'sessionChanged'); h.action.dispose();
});
test('global panel navigation while awaiting never opens behind that panel', async () => {
  const d = deferred(); const h = harness({ ready: () => d.promise }); const p = h.action.click(); h.panel('plugins'); d.resolve(result); await p;
  assert.deepEqual(h.calls, []); assert.equal(h.statuses.at(-1)?.kind, 'sessionChanged'); h.action.dispose();
});
test('failure is visible and the next click retries', async () => {
  let fail = true; const h = harness({ ready: async () => fail ? { ready: false, code: 'timeout', message: '等待超时' } : result });
  await h.action.click(); assert.deepEqual(h.statuses.at(-1), { kind: 'failed', detail: '等待超时' }); fail = false; await h.action.click(); assert.equal(h.calls.length, 1); h.action.dispose();
});
test('transport exceptions do not expose internal details and remain retryable', async () => {
  const h = harness({ ready: async () => { throw new Error('private transport path'); } }); await h.action.click();
  assert.deepEqual(h.statuses.at(-1), { kind: 'failed' }); await h.action.click(); assert.equal(h.queries, 2); h.action.dispose();
});
test('unload removes listeners and suppresses an in-flight completion', async () => {
  const d = deferred(); const h = harness({ ready: () => d.promise }); const p = h.action.click(); h.action.dispose();
  assert.equal(h.listeners.size, 0); assert.equal(h.panels.size, 0); d.resolve(result); await p;
  assert.deepEqual(h.calls, []); await h.action.click(); assert.equal(h.queries, 1);
});
