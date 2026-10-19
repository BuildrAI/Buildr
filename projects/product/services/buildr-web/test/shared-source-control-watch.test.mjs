import assert from 'node:assert/strict';
import test from 'node:test';
import { locks } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { createSharedSourceControlWatch } from '../src/features/code/api/shared-source-control-watch.ts';

const ports = { locks, channel: name => new BroadcastChannel(name) };
const result = cursor => ({ cursor, repositoryIds: ['changed'], refreshAll: false });
const until = async condition => {
  const limit = Date.now() + 2000;
  while (!condition()) { assert.ok(Date.now() < limit, 'watch must progress'); await new Promise(resolve => setTimeout(resolve, 5)); }
};
function fixture() {
  const requests = [];
  const load = (workspace, cursor, signal) => new Promise((resolve, reject) => {
    requests.push({workspace, cursor, signal, resolve, reject});
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });
  return { requests, watch: createSharedSourceControlWatch(load, ports), workspace: randomUUID() };
}

test('eight documents share one pending HTTP watch and all receive the same invalidation', async () => {
  const f = fixture();
  const pending = Array.from({length: 8}, () => f.watch(f.workspace, 'epoch:1'));
  await until(() => f.requests.length === 1);
  f.requests[0].resolve(result('epoch:2'));
  assert.deepEqual(await Promise.all(pending), Array(8).fill(result('epoch:2')));
  assert.equal(f.requests.length, 1);
});

test('cancelling a follower does not cancel the active watch; cancelling its owner lets a follower take over', async () => {
  const f = fixture(), owner = new AbortController(), cancelled = new AbortController(), follower = new AbortController();
  const first = f.watch(f.workspace, 'epoch:1', owner.signal);
  const firstRejected = assert.rejects(first, {name: 'AbortError'});
  await until(() => f.requests.length === 1);
  const second = f.watch(f.workspace, 'epoch:1', cancelled.signal);
  const secondRejected = assert.rejects(second, {name: 'AbortError'});
  const third = f.watch(f.workspace, 'epoch:1', follower.signal);
  cancelled.abort(); await secondRejected;
  assert.equal(f.requests[0].signal.aborted, false);
  owner.abort(); await firstRejected;
  await until(() => f.requests.length === 2);
  f.requests[1].resolve(result('epoch:2'));
  assert.deepEqual(await third, result('epoch:2'));
});

test('a newer cursor cannot consume a reply covering a different observation range', async () => {
  const f = fixture();
  const first = f.watch(f.workspace, 'epoch:1');
  await until(() => f.requests.length === 1);
  const second = f.watch(f.workspace, 'epoch:0');
  f.requests[0].resolve(result('epoch:2')); await first;
  await until(() => f.requests.length === 2);
  assert.equal(f.requests[1].cursor, 'epoch:0');
  f.requests[1].resolve({...result('epoch:2'), repositoryIds: ['older', 'changed']});
  assert.deepEqual((await second).repositoryIds, ['older', 'changed']);
});

test('workspaces are isolated and a failed owner releases the lock for the next reader', async () => {
  const f = fixture();
  const first = f.watch(f.workspace, 'epoch:1');
  const rejected = assert.rejects(first, /offline/);
  const other = f.watch(randomUUID(), 'epoch:1');
  await until(() => f.requests.length === 2);
  const follower = f.watch(f.workspace, 'epoch:1');
  f.requests.find(r => r.workspace !== f.workspace).resolve(result('other:2'));
  assert.equal((await other).cursor, 'other:2');
  f.requests.find(r => r.workspace === f.workspace).reject(Error('offline'));
  await rejected;
  await until(() => f.requests.length === 3);
  f.requests[2].resolve(result('epoch:2'));
  assert.equal((await follower).cursor, 'epoch:2');
});

test('unsupported coordination falls back to the same cancellable HTTP read and already aborted reads never start', async () => {
  const requests = [];
  const watch = createSharedSourceControlWatch(async (...args) => { requests.push(args); return result('epoch:1'); }, {});
  const controller = new AbortController();
  await watch('ws', undefined, controller.signal);
  assert.equal(requests[0][2], controller.signal);
  controller.abort();
  await assert.rejects(watch('ws', undefined, controller.signal), {name: 'AbortError'});
  assert.equal(requests.length, 1);
});
