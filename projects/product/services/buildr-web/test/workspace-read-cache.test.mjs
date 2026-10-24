import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceReadCache } from '../src/lib/workspace-read-cache.ts';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('duplicate readers share one request; warm reads and background failure preserve the observation', async () => {
  let time = 10000, requests = 0;
  const cache = createWorkspaceReadCache(() => time), pending = deferred();
  const load = () => { requests++; return pending.promise; };
  const first = cache.read('workspace-a:front', load, 3000), second = cache.read('workspace-a:front', load, 3000);
  assert.equal(first, second); await Promise.resolve(); assert.equal(requests, 1);
  pending.resolve({ branch: 'qa' }); await first;
  assert.deepEqual(await cache.read('workspace-a:front', load, 3000), { branch: 'qa' }); assert.equal(requests, 1);
  time += 4000;
  const next = deferred(), refresh = cache.read('workspace-a:front', () => next.promise, 3000);
  assert.deepEqual(cache.snapshot('workspace-a:front').data, { branch: 'qa' }); assert.equal(cache.snapshot('workspace-a:front').loading, true);
  next.reject(new Error('network unavailable')); await assert.rejects(refresh, /network unavailable/);
  assert.deepEqual(cache.snapshot('workspace-a:front').data, { branch: 'qa' }); assert.equal(cache.snapshot('workspace-a:front').error, 'network unavailable');
  cache.dispose();
});

test('a write invalidates in-flight observations; the previous response cannot replace the new checkout', async () => {
  const cache = createWorkspaceReadCache(), old = deferred(); let oldSignal;
  const first = cache.read('workspace-a:front', signal => { oldSignal = signal; return old.promise; }); await Promise.resolve();
  cache.invalidate('workspace-a:front'); assert.equal(oldSignal.aborted, true);
  await cache.read('workspace-a:front', async () => ({ branch: 'new' }));
  old.resolve({ branch: 'old' }); await first;
  assert.deepEqual(cache.snapshot('workspace-a:front').data, { branch: 'new' });
  cache.dispose();
});

test('a silent refresh keeps the displayed observation and never publishes loading', async () => {
  const cache = createWorkspaceReadCache(), pending = deferred();
  await cache.read('workspace-a:front', async () => ({ branch: 'qa' }));
  let notices = 0;
  cache.subscribe('workspace-a:front', () => notices++);
  const refresh = cache.read('workspace-a:front', () => pending.promise, 0, true);
  await Promise.resolve();
  assert.equal(cache.snapshot('workspace-a:front').loading, false);
  assert.equal(notices, 0);
  pending.resolve({ branch: 'main' }); await refresh;
  assert.equal(notices, 1);
  assert.deepEqual(cache.snapshot('workspace-a:front').data, { branch: 'main' });
  cache.dispose();
});

test('a silent first read still publishes loading so mount spinners keep working', async () => {
  const cache = createWorkspaceReadCache(), pending = deferred();
  const first = cache.read('workspace-a:front', () => pending.promise, 0, true);
  await Promise.resolve();
  assert.equal(cache.snapshot('workspace-a:front').loading, true);
  pending.resolve({ branch: 'qa' }); await first;
  cache.dispose();
});

test('different workspaces and tasks never share an observation; disposing aborts pending work', async () => {
  const cache = createWorkspaceReadCache(), old = deferred(); let signal;
  await cache.read('workspace-a:front:task', async () => ({ path: '/task' }));
  assert.equal(cache.snapshot('workspace-b:front:task').data, null);
  assert.equal(cache.snapshot('workspace-a:front:standalone').data, null);
  const pending = cache.read('workspace-b:front:task', observed => { signal = observed; return old.promise; }); await Promise.resolve();
  cache.dispose(); assert.equal(signal.aborted, true); old.resolve({ path: '/old-workspace' }); await pending;
  assert.equal(cache.snapshot('workspace-b:front:task').data, null);
});
