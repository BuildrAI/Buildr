import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalAppScheduledMaintenance,
  millisecondsUntilNextLocalHour,
} from '../../src/web/application/scheduled-maintenance.mjs';

function fakeTimers() {
  const scheduled = [];
  const cleared = [];
  return {
    scheduled,
    cleared,
    api: {
      setTimeout(callback, delay) {
        const handle = { callback, delay, unref() {} };
        scheduled.push(handle);
        return handle;
      },
      clearTimeout(handle) { cleared.push(handle); },
    },
  };
}

test('scheduler从下一本地整点运行并隔离Workspace失败', async () => {
  const timers = fakeTimers();
  const calls = [];
  const runtime = {
    listRegisteredWorkspaces: () => ({ workspaces: [
      { rootPath: '/workspace/a', status: 'ready', workspace: { id: 'a' } },
      { rootPath: '/workspace/b', status: 'ready', workspace: { id: 'b' } },
      { rootPath: '/workspace/c', status: 'unavailable', workspace: { id: 'c' } },
    ] }),
    gcTaskExecutionRecords: (root) => {
      calls.push(root);
      if (root.endsWith('/a')) throw Object.assign(new Error('injected'), { code: 'injected_gc_failure' });
      return { status: 'completed', counts: { selected: 1, cleaned: 1, purged: 0, skipped: 0, failed: 0 } };
    },
  };
  const clock = () => new Date('2026-08-10T10:30:00.000+08:00');
  const scheduler = createLocalAppScheduledMaintenance(runtime, { clock, timers: timers.api });
  scheduler.start();
  assert.equal(timers.scheduled[0].delay, 30 * 60 * 1000);
  await timers.scheduled[0].callback();
  assert.deepEqual(calls, ['/workspace/a', '/workspace/b']);
  assert.equal(scheduler.inspect().lastResult.status, 'partial');
  assert.equal(scheduler.inspect().lastResult.workspaces[0].diagnostic.code, 'injected_gc_failure');
  assert.equal(timers.scheduled.length, 2, '每轮后按新的本地整点重新调度');
  scheduler.stop();
  assert.equal(timers.cleared.length, 1);
});

test('scheduler防止同一进程内GC重入', async () => {
  const timers = fakeTimers();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const runtime = {
    listRegisteredWorkspaces: () => ({ workspaces: [{ rootPath: '/workspace/a', status: 'ready', workspace: { id: 'a' } }] }),
    gcTaskExecutionRecords: () => pending.then(() => ({ status: 'completed', counts: {} })),
  };
  const scheduler = createLocalAppScheduledMaintenance(runtime, { timers: timers.api });
  scheduler.start();
  const first = scheduler.runNow();
  const second = await scheduler.runNow();
  assert.equal(second.status, 'skipped');
  assert.equal(second.reason, 'in-flight');
  release();
  assert.equal((await first).status, 'completed');
  scheduler.stop();
});

test('本地整点延迟不使用固定interval漂移', () => {
  assert.equal(millisecondsUntilNextLocalHour(new Date('2026-08-10T10:00:00.000+08:00')), 60 * 60 * 1000);
  assert.equal(millisecondsUntilNextLocalHour(new Date('2026-08-10T10:59:59.500+08:00')), 500);
});
