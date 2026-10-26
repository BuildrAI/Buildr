import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopNavigation, validateDesktopTaskUrl } from '../../plugin/desktop-navigation.ts';
import { createDesktopClientNavigation } from '../../plugin/src/desktop-client.ts';

test('Host navigation selects exactly one Client and only accepts observed target acknowledgement', async () => {
  let activations = 0;
  const host = new DesktopNavigation(100, async () => { activations++; }), lifetime = new AbortController();
  const first = host.watch({ clientId: 'first', sessionId: 'old', desktop: true }, lifetime.signal);
  const command = first.next();
  const navigation = host.navigate('openSession', { sessionId: 'new' }, new AbortController().signal);
  const item = (await command).value!;
  host.update({ clientId: 'first', sessionId: 'new', desktop: true });
  host.acknowledge({ commandId: item.commandId, clientId: 'wrong', sessionId: 'new', ok: true });
  assert.equal(host.current('first').sessionId, 'new');
  host.acknowledge({ commandId: item.commandId, clientId: 'first', sessionId: 'new', ok: true });
  assert.deepEqual(await navigation, { clientId: 'first', sessionId: 'new', opened: true });
  assert.equal(activations, 1);
  const second = host.watch({ clientId: 'second', sessionId: 'other', desktop: true }, lifetime.signal);
  const secondWait = second.next();
  assert.throws(() => host.current(), (error: any) => error.code === 'agent_dsh_client_ambiguous');
  await assert.rejects(host.navigate('openSession', { sessionId: 'new' }, new AbortController().signal), (error: any) => error.code === 'agent_dsh_client_ambiguous');
  await assert.rejects(host.navigate('openSession', { sessionId: 'new', clientId: 'first' }, new AbortController().signal),
    (error: any) => error.code === 'agent_dsh_window_ambiguous');
  assert.equal(activations, 1, 'an explicit Client cannot map the native primary window when several Clients exist');
  lifetime.abort(); host.dispose(); await secondWait; await first.return(undefined); await second.return(undefined);
});
test('Host rejects guessed acknowledgement, bounds timeout and retires disconnected Client leases', async () => {
  const host = new DesktopNavigation(20, async () => {}), lifetime = new AbortController();
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
test('Host raises the already selected desktop before dispatch, then still requires an observed acknowledgement', async () => {
  let release!: () => void, delivered = false;
  const host = new DesktopNavigation(100, () => new Promise<void>(resolve => { release = resolve; }));
  const lifetime = new AbortController();
  const stream = host.watch({ clientId: 'window', sessionId: 'wanted', desktop: true }, lifetime.signal);
  const next = stream.next().then(row => { delivered = true; return row; });
  const pending = host.navigate('openSession', { sessionId: 'wanted' }, new AbortController().signal);
  await Promise.resolve(); assert.equal(delivered, false, 'native activation must succeed before Client navigation');
  release(); const command = (await next).value!;
  host.acknowledge({ clientId: 'window', commandId: command.commandId, sessionId: 'wanted', ok: true });
  assert.deepEqual(await pending, { clientId: 'window', sessionId: 'wanted', opened: true });
  lifetime.abort(); await stream.return(undefined); host.dispose();
});
test('Host activation failure cannot dispatch or claim successful navigation', async () => {
  for (const missing of [false, true]) {
    const host = new DesktopNavigation(100, missing ? undefined : async () => { throw new Error('private-native-output'); });
    const lifetime = new AbortController();
    const stream = host.watch({ clientId: 'window', sessionId: 'wanted', desktop: true }, lifetime.signal), next = stream.next();
    await assert.rejects(host.navigate('openSession', { sessionId: 'wanted' }, new AbortController().signal), (error: any) => {
      assert.equal(error.message.includes('private-native-output'), false);
      return error.code === (missing ? 'agent_dsh_window_activation_unavailable' : 'agent_dsh_window_activation_failed');
    });
    lifetime.abort(); assert.equal((await next).done, true); await stream.return(undefined); host.dispose();
  }
});
test('Host cancellation, timeout, disposal and Client retirement prevent late activation delivery', async () => {
  for (const end of ['cancel', 'timeout', 'dispose', 'disconnect']) {
    let release!: () => void, activationSignal!: AbortSignal;
    const host = new DesktopNavigation(end === 'timeout' ? 5 : 100, signal => {
      activationSignal = signal; return new Promise<void>(resolve => { release = resolve; });
    });
    const lifetime = new AbortController(), request = new AbortController();
    const stream = host.watch({ clientId: 'window', sessionId: 'old', desktop: true }, lifetime.signal), next = stream.next();
    const pending = host.navigate('openSession', { sessionId: 'wanted' }, request.signal);
    const rejected = assert.rejects(pending, (error: any) => error.code === ({ cancel: 'agent_dsh_navigation_cancelled',
      timeout: 'agent_dsh_navigation_timeout', dispose: 'agent_dsh_disposed', disconnect: 'agent_dsh_client_disconnected' } as any)[end]);
    if (end === 'cancel') request.abort();
    if (end === 'dispose') host.dispose();
    if (end === 'disconnect') lifetime.abort();
    await rejected; assert.equal(activationSignal.aborted, true);
    release(); await Promise.resolve(); await Promise.resolve();
    lifetime.abort(); assert.equal((await next).done, true, 'late native completion must not enqueue a command');
    await stream.return(undefined); host.dispose();
  }
});
test('Host refuses a newly ambiguous primary window while activation is pending', async () => {
  let release!: () => void;
  const host = new DesktopNavigation(100, () => new Promise<void>(resolve => { release = resolve; })), lifetime = new AbortController();
  const first = host.watch({ clientId: 'first', sessionId: 'old', desktop: true }, lifetime.signal), next = first.next();
  const pending = host.navigate('openSession', { sessionId: 'wanted' }, new AbortController().signal);
  const rejected = assert.rejects(pending, (error: any) => error.code === 'agent_dsh_window_ambiguous');
  const second = host.watch({ clientId: 'second', sessionId: 'other', desktop: true }, lifetime.signal), secondNext = second.next();
  release(); await rejected;
  lifetime.abort(); assert.equal((await next).done, true); assert.equal((await secondNext).done, true);
  await first.return(undefined); await second.return(undefined); host.dispose();
});
test('task URL admission binds exact channel origin and rejects arbitrary destinations', () => {
  const origin = 'http://127.0.0.1:49100', good = origin + '/workspaces/work/tasks/task';
  assert.equal(validateDesktopTaskUrl(good, origin), good);
  for (const address of [good.replace('49100', '49101'), origin + '/tasks/task', good + '?key=secret', good + '#fragment',
    origin + '/workspaces/work/tasks/x%2fy', 'https://example.com/workspaces/work/tasks/task']) {
    assert.throws(() => validateDesktopTaskUrl(address, origin));
  }
});

function clientFixture(autoMount = true, observeUrl = true, restoreGuestFocus = false) {
  let mounted = 'old', active: any;
  let opened = 0, focused = 0;
  let visible = true, windowFocused = true;
  const inputFocusTargets: string[] = [];
  const foregroundListeners = new Set<() => void>();
  const setForeground = (isVisible: boolean, isFocused: boolean) => {
    visible = isVisible; windowFocused = isFocused;
    for (const listener of foregroundListeners) listener();
  };
  const listeners = new Set<() => void>(), tabs: any[] = [];
  const set = (value: string) => { mounted = value; for (const listener of listeners) listener(); };
  const sidebar = { mounted: { getSnapshot: () => mounted, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    openTabs: { getSnapshot: () => tabs }, active: () => active, focus: () => { focused++; }, isExpanded: () => true, toggleExpanded: () => {},
    openTab: (_kind: string, options: any) => { opened++; active = { id: 'tab-' + opened, kind: 'browser' };
      tabs.push({ sessionId: mounted, tabId: active.id, kind: 'browser', url: options.params.url }); } };
  const workspace = { openSession: (id: string) => { if (autoMount) set(id); } };
  const navigation = createDesktopClientNavigation(sidebar as any, workspace as any, 'buildr', { timeoutMs: 20,
    focusSession: sessionId => { inputFocusTargets.push(sessionId); if (restoreGuestFocus) setForeground(true, true); },
    foreground: { visible: () => visible, focused: () => windowFocused,
      subscribe: listener => { foregroundListeners.add(listener); return () => { foregroundListeners.delete(listener); }; } },
    ...(observeUrl ? { probeTaskPage: async (pageId: string) => {
      const row = tabs.find(row => new URL(row.url).searchParams.get('buildrDshPage') === pageId);
      if (!row) return null;
      const url = new URL(row.url); return url.origin + url.pathname;
    } } : {}) });
  return { navigation, set, setForeground, opened: () => opened, focused: () => focused,
    listenerCount: () => listeners.size + foregroundListeners.size, inputFocusTargets, tabs };
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
test('already selected background chat waits for visible focused window before success', async () => {
  const f = clientFixture(); f.set('wanted'); f.setForeground(true, false);
  let settled = false;
  const pending = f.navigation.execute({ commandId: 'background', method: 'openSession', sessionId: 'wanted' })
    .then(ack => { settled = true; return ack; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'a background selection must not claim opened');
  f.setForeground(false, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'a hidden document must not claim opened');
  f.setForeground(true, true);
  assert.equal((await pending).ok, true); assert.equal(f.listenerCount(), 0); f.navigation.dispose();
});
test('native composer focus restores the exact chat from guest browser without reopening its Task page', async () => {
  const f = clientFixture(true, true, true), taskUrl = 'http://127.0.0.1:49100/workspaces/w/tasks/t';
  const command = { commandId: 'guest', method: 'openTask' as const, sessionId: 'wanted', taskUrl };
  f.setForeground(true, false);
  assert.equal((await f.navigation.execute(command)).ok, true);
  f.setForeground(true, false);
  assert.equal((await f.navigation.execute({ ...command, commandId: 'repeat' })).ok, true);
  assert.deepEqual(f.inputFocusTargets, ['wanted', 'wanted']);
  assert.equal(f.opened(), 1); assert.equal(f.focused(), 1); f.navigation.dispose();
});
test('foreground timeout, changed chat and disposal cannot confirm an invisible or wrong target', async () => {
  const command = { commandId: 'focus', method: 'openSession' as const, sessionId: 'wanted' };
  for (const state of [[false, true], [true, false]] as const) {
    const f = clientFixture(); f.setForeground(state[0], state[1]);
    assert.equal((await f.navigation.execute(command)).ok, false);
    assert.equal(f.listenerCount(), 0); f.navigation.dispose();
  }
  const changed = clientFixture(); changed.setForeground(true, false);
  const pending = changed.navigation.execute(command);
  await new Promise(resolve => setImmediate(resolve)); changed.set('different'); changed.setForeground(true, true);
  assert.equal((await pending).ok, false); assert.equal(changed.listenerCount(), 0); changed.navigation.dispose();
  const disposed = clientFixture(); disposed.setForeground(true, false);
  const waiting = disposed.navigation.execute(command);
  await new Promise(resolve => setImmediate(resolve)); disposed.navigation.dispose(); disposed.setForeground(true, true);
  assert.equal((await waiting).ok, false); assert.equal(disposed.listenerCount(), 0);
});
