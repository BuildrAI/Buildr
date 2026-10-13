import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopNavigation, validateDesktopTaskUrl } from '../../plugin/desktop-navigation.ts';
import { createDesktopClientNavigation } from '../../plugin/src/desktop-client.ts';

test('Host navigation selects exactly one Client and only accepts observed target acknowledgement', async () => {
  const host = new DesktopNavigation(100), lifetime = new AbortController();
  const first = host.watch({ clientId: 'first', sessionId: 'old', desktop: true }, lifetime.signal);
  const command = first.next();
  const navigation = host.navigate('openSession', { sessionId: 'new' }, new AbortController().signal);
  const item = (await command).value!;
  host.update({ clientId: 'first', sessionId: 'new', desktop: true });
  host.acknowledge({ commandId: item.commandId, clientId: 'wrong', sessionId: 'new', ok: true });
  assert.equal(host.current('first').sessionId, 'new');
  host.acknowledge({ commandId: item.commandId, clientId: 'first', sessionId: 'new', ok: true });
  assert.deepEqual(await navigation, { clientId: 'first', sessionId: 'new', opened: true });
  const second = host.watch({ clientId: 'second', sessionId: 'other', desktop: true }, lifetime.signal);
  const secondWait = second.next();
  assert.throws(() => host.current(), (error: any) => error.code === 'agent_dsh_client_ambiguous');
  await assert.rejects(host.navigate('openSession', { sessionId: 'new' }, new AbortController().signal), (error: any) => error.code === 'agent_dsh_client_ambiguous');
  lifetime.abort(); host.dispose(); await secondWait; await first.return(); await second.return();
});
test('Host rejects guessed acknowledgement, bounds timeout and retires disconnected Client leases', async () => {
  const host = new DesktopNavigation(20), lifetime = new AbortController();
  const stream = host.watch({ clientId: 'window', sessionId: 'old', desktop: true }, lifetime.signal);
  const next = stream.next();
  const pending = host.navigate('openSession', { sessionId: 'wanted' }, new AbortController().signal);
  const command = (await next).value!;
  host.acknowledge({ clientId: 'window', commandId: command.commandId, sessionId: 'wanted', ok: true });
  await assert.rejects(pending, (error: any) => error.code === 'agent_dsh_navigation_unconfirmed');
  const nextTimeout = stream.next();
  const timed = host.navigate('openSession', { sessionId: 'wanted' }, new AbortController().signal);
  await nextTimeout; await assert.rejects(timed, (error: any) => error.code === 'agent_dsh_navigation_timeout');
  const waiting = stream.next(); lifetime.abort(); await waiting;
  assert.throws(() => host.current('window'), (error: any) => error.code === 'agent_dsh_client_unavailable');
  host.dispose();
});
test('task URL admission binds exact channel origin and rejects arbitrary destinations', () => {
  const origin = 'http://127.0.0.1:49100', good = origin + '/workspaces/work/tasks/task';
  assert.equal(validateDesktopTaskUrl(good, origin), good);
  for (const address of [good.replace('49100', '49101'), origin + '/tasks/task', good + '?key=secret', good + '#fragment',
    origin + '/workspaces/work/tasks/x%2fy', 'https://example.com/workspaces/work/tasks/task']) {
    assert.throws(() => validateDesktopTaskUrl(address, origin));
  }
});

function clientFixture(autoMount = true, observeUrl = true) {
  let mounted = 'old', active: any;
  let opened = 0, focused = 0;
  const listeners = new Set<() => void>(), tabs: any[] = [];
  const set = (value: string) => { mounted = value; for (const listener of listeners) listener(); };
  const sidebar = { mounted: { getSnapshot: () => mounted, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    openTabs: { getSnapshot: () => tabs }, active: () => active, focus: () => { focused++; }, isExpanded: () => true, toggleExpanded: () => {},
    openTab: (_kind: string, options: any) => { opened++; active = { id: 'tab-' + opened, kind: 'browser' };
      tabs.push({ sessionId: mounted, tabId: active.id, kind: 'browser', url: options.params.url }); } };
  const workspace = { openSession: (id: string) => { if (autoMount) set(id); } };
  const navigation = createDesktopClientNavigation(sidebar as any, workspace as any, 'buildr', { timeoutMs: 20,
    ...(observeUrl ? { probeTaskPage: async (pageId: string) => {
      const row = tabs.find(row => new URL(row.url).searchParams.get('buildrDshPage') === pageId);
      if (!row) return null;
      const url = new URL(row.url); return url.origin + url.pathname;
    } } : {}) });
  return { navigation, set, opened: () => opened, focused: () => focused, listenerCount: () => listeners.size, tabs };
}
test('Client confirms native mounted state and reuses exact Task tab without refreshing drafts', async () => {
  const f = clientFixture(), taskUrl = 'http://127.0.0.1:49100/workspaces/w/tasks/t';
  const command = { commandId: 'one', method: 'openTask' as const, sessionId: 'wanted', taskUrl };
  assert.equal((await f.navigation.execute(command)).ok, true);
  assert.equal(f.opened(), 1);
  assert.equal((await f.navigation.execute({ ...command, commandId: 'repeat' })).ok, true);
  assert.equal(f.opened(), 1); assert.equal(f.focused(), 1);
  assert.equal((await f.navigation.execute({ ...command, commandId: 'different', taskUrl: taskUrl + '2' })).ok, true);
  assert.equal(f.opened(), 2, 'another Task preserves the existing page and its draft');
  assert.equal(f.listenerCount(), 0); f.navigation.dispose();
});
test('saved mapping cannot claim the Task remains open after page navigation or missing URL observation', async () => {
  const f = clientFixture(), taskUrl = 'http://127.0.0.1:49100/workspaces/w/tasks/t';
  const command = { commandId: 'one', method: 'openTask' as const, sessionId: 'wanted', taskUrl };
  await f.navigation.execute(command); f.tabs[0].url = taskUrl + '-changed?buildrDshPage=' + new URL(f.tabs[0].url).searchParams.get('buildrDshPage');
  assert.equal((await f.navigation.execute({ ...command, commandId: 'changed' })).ok, true);
  assert.equal(f.opened(), 2); assert.equal(f.focused(), 0); f.navigation.dispose();
  const unknown = clientFixture(true, false);
  assert.equal((await unknown.navigation.execute(command)).ok, false);
  assert.equal((await unknown.navigation.execute({ ...command, commandId: 'unknown' })).ok, false);
  assert.equal(unknown.opened(), 2, 'unverifiable existing page remains untouched'); unknown.navigation.dispose();
});
test('Client delivery alone is not success and disposal prevents late successful acknowledgement', async () => {
  const f = clientFixture(false), command = { commandId: 'one', method: 'openSession' as const, sessionId: 'wanted' };
  assert.equal((await f.navigation.execute(command)).ok, false);
  const pending = f.navigation.execute({ ...command, commandId: 'two' });
  f.navigation.dispose(); f.set('wanted'); assert.equal((await pending).ok, false);
  assert.equal(f.listenerCount(), 0);
});
