import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createVerificationResourceCoordinator } from '../../src/application/verification/resource-coordinator.mjs';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-coordinator-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const coordinated = { browser: { id: 'browser', strategy: 'coordinated', capacity: 1, authorization: 'implicit' } };

test('不同 verification runs 对容量一资源排队且精确释放', async (context) => {
  const root = fixture(context);
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5 });
  const firstHandle = await first.acquire(['browser']);
  let secondReady = false;
  const secondPromise = second.acquire(['browser']).then((handle) => { secondReady = true; return handle; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(secondReady, false);
  assert.deepEqual(await firstHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
  const secondHandle = await secondPromise;
  assert.equal(secondHandle.claims[0].owner.taskId, 'task-b');
  assert.ok(secondHandle.waitDurationMs >= 15);
  assert.deepEqual(await secondHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
});

test('external 资源要求逐项显式授权', async (context) => {
  const root = fixture(context);
  const resources = {
    staging: { id: 'staging', strategy: 'external', authorization: 'explicit' },
  };
  const first = createVerificationResourceCoordinator({ root, resources, owner: { taskId: 'task-a', runId: 'run-a' } });
  await assert.rejects(first.acquire(['staging']), /Explicit authorization is required/);
  const authorized = await first.acquire(['staging'], { authorizedResources: ['staging'] });
  assert.equal(authorized.claims[0].status, 'authorized');
});

test('过期租约可原子接管，旧 owner 不能删除新租约', async (context) => {
  const root = fixture(context);
  let timestamp = 1000;
  const timers = { setInterval: () => ({ unref() {} }), clearInterval() {} };
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, ttlMs: 20, now: () => timestamp, timers });
  const firstHandle = await first.acquire(['browser']);
  timestamp = 1021;
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, ttlMs: 20, now: () => timestamp, timers });
  const secondHandle = await second.acquire(['browser']);
  assert.equal(secondHandle.claims[0].recovered, true);
  assert.deepEqual(await firstHandle.release(), [{ resource: 'browser', slot: 0, status: 'ownership-mismatch' }]);
  assert.deepEqual(await secondHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
});

test('容量耗尽时超时且不会删除当前 owner 租约', async (context) => {
  const root = fixture(context);
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5, waitTimeoutMs: 20 });
  const firstHandle = await first.acquire(['browser']);
  await assert.rejects(second.acquire(['browser']), /wait timed out/);
  assert.deepEqual(await firstHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
});
