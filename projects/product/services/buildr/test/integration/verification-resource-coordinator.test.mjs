import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createVerificationResourceCoordinator } from '../../src/verification/infrastructure/resource-coordinator.ts';
import { executePlan, FULL_PLAN_RESOURCE_ID } from '../../test/verification/plan-runner.mjs';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-coordinator-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function filesNamed(root, name) {
  const found = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.name === name) found.push(current);
    }
  };
  visit(root);
  return found;
}

async function waitFor(context, predicate, message) {
  const startedAt = Date.now();
  while (!predicate()) {
    assert.ok(Date.now() - startedAt < 1_000, message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  context?.signal?.throwIfAborted?.();
}

function order(value) {
  return () => String(value).padStart(6, '0');
}

const coordinated = { browser: { id: 'browser', strategy: 'coordinated', capacity: 1, authorization: 'implicit' } };

test('不同 Task 的 Full plan 共享容量且不重叠执行 DAG', async (context) => {
  const root = fixture(context);
  const resources = {
    [FULL_PLAN_RESOURCE_ID]: { id: FULL_PLAN_RESOURCE_ID, strategy: 'coordinated', capacity: 1, authorization: 'implicit' },
  };
  const plan = {
    scope: { mode: 'full' }, paths: [], delegated: [],
    steps: [{ id: 'full-step', name: 'full step', dependsOn: [], resources: [], concurrencyClass: 'default' }],
  };
  let active = 0;
  let peak = 0;
  const execute = (taskId) => executePlan(plan, {
    productRoot: root,
    concurrency: { global: 1, classes: { default: 1 }, resources: {}, innerConcurrency: {} },
    resourceCoordinator: createVerificationResourceCoordinator({ root, resources, owner: { taskId, runId: `run-${taskId}` }, pollMs: 5 }),
    executorFactory: () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
      return { status: 'passed', exitCode: 0, durationMs: 30 };
    },
    stream: { write() {} },
    errorStream: { write() {} },
  });

  const results = await Promise.all([execute('task-a'), execute('task-b')]);
  assert.equal(peak, 1);
  assert.ok(results.some((result) => result.fullPlanCoordination.waitDurationMs >= 20));
  assert.ok(results.every((result) => result.fullPlanCoordination.release[0].status === 'released'));
});

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

test('容量一资源严格按 ticket 顺序授予且后来 waiter 不能抢占', async (context) => {
  const root = fixture(context);
  const acquired = [];
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5, ticketOrder: order(1) });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5, ticketOrder: order(2) });
  const third = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-c', runId: 'run-c' }, pollMs: 5, ticketOrder: order(3) });
  const fourth = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-d', runId: 'run-d' }, pollMs: 5, ticketOrder: order(4) });
  const firstHandle = await first.acquire(['browser']);
  const secondPromise = second.acquire(['browser']).then((handle) => { acquired.push('task-b'); return handle; });
  const thirdPromise = third.acquire(['browser']).then((handle) => { acquired.push('task-c'); return handle; });
  const fourthPromise = fourth.acquire(['browser']).then((handle) => { acquired.push('task-d'); return handle; });
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 3, 'three waiters should register tickets');

  await firstHandle.release();
  const secondHandle = await secondPromise;
  assert.deepEqual(acquired, ['task-b']);
  await secondHandle.release();
  const thirdHandle = await thirdPromise;
  assert.deepEqual(acquired, ['task-b', 'task-c']);
  await thirdHandle.release();
  const fourthHandle = await fourthPromise;
  assert.deepEqual(acquired, ['task-b', 'task-c', 'task-d']);
  await fourthHandle.release();
  assert.equal(filesNamed(root, 'ticket.json').length, 0);
});

test('容量范围内最早 waiter 可并发取得释放的 slot', async (context) => {
  const root = fixture(context);
  const capacityTwo = { browser: { ...coordinated.browser, capacity: 2 } };
  const coordinator = (taskId, value) => createVerificationResourceCoordinator({ root, resources: capacityTwo, owner: { taskId, runId: `run-${taskId}` }, pollMs: 5, ticketOrder: order(value) });
  const firstHandle = await coordinator('task-a', 1).acquire(['browser']);
  const secondHandle = await coordinator('task-b', 2).acquire(['browser']);
  const thirdPromise = coordinator('task-c', 3).acquire(['browser']);
  const fourthPromise = coordinator('task-d', 4).acquire(['browser']);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 2, 'two waiters should register tickets');

  await firstHandle.release();
  const thirdHandle = await thirdPromise;
  assert.equal(thirdHandle.claims[0].owner.taskId, 'task-c');
  await secondHandle.release();
  const fourthHandle = await fourthPromise;
  assert.equal(fourthHandle.claims[0].owner.taskId, 'task-d');
  await thirdHandle.release();
  await fourthHandle.release();
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
  assert.equal(filesNamed(root, 'ticket.json').length, 0);
  assert.deepEqual(await firstHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
});

test('取消等待只清理自己的 ticket', async (context) => {
  const root = fixture(context);
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5 });
  const firstHandle = await first.acquire(['browser']);
  const controller = new AbortController();
  const secondPromise = second.acquire(['browser'], { signal: controller.signal });
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 1, 'cancelled waiter should first register a ticket');
  controller.abort();
  await assert.rejects(secondPromise, /wait cancelled/);
  assert.equal(filesNamed(root, 'ticket.json').length, 0);
  assert.deepEqual(await firstHandle.release(), [{ resource: 'browser', slot: 0, status: 'released' }]);
});

test('崩溃 waiter 的过期 ticket 可恢复且不会阻塞后续 waiter', async (context) => {
  const root = fixture(context);
  let timestamp = 1_000;
  const silentTimers = { setInterval: () => ({ unref() {} }), clearInterval() {} };
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const crashed = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5, ttlMs: 20, now: () => timestamp, timers: silentTimers, ticketOrder: order(2) });
  const later = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-c', runId: 'run-c' }, pollMs: 5, ttlMs: 20, now: () => timestamp, timers: silentTimers, ticketOrder: order(3) });
  const firstHandle = await first.acquire(['browser']);
  const crashedResult = crashed.acquire(['browser']).then((handle) => handle, (error) => error);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 1, 'crashed waiter should leave a ticket');
  timestamp = 1_021;
  const laterPromise = later.acquire(['browser']);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 1, 'later waiter should replace the expired queue head');
  await firstHandle.release();
  const laterHandle = await laterPromise;
  assert.equal(laterHandle.claims[0].owner.taskId, 'task-c');
  assert.match((await crashedResult).message, /ownership lost/);
  await laterHandle.release();
});

test('活跃 waiter 的 heartbeat 防止 ticket 被后续 waiter 误清理', async (context) => {
  const root = fixture(context);
  let timestamp = 1_000;
  const heartbeats = [];
  const controlledTimers = {
    setInterval(callback) {
      heartbeats.push(callback);
      return { unref() {} };
    },
    clearInterval() {},
  };
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5, ttlMs: 30, now: () => timestamp, timers: controlledTimers, ticketOrder: order(2) });
  const third = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-c', runId: 'run-c' }, pollMs: 5, ttlMs: 30, now: () => timestamp, timers: controlledTimers, ticketOrder: order(3) });
  const firstHandle = await first.acquire(['browser']);
  const secondPromise = second.acquire(['browser']);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 1, 'active waiter should register a ticket');
  timestamp = 1_031;
  heartbeats[0]();
  timestamp = 1_050;
  const thirdPromise = third.acquire(['browser']);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 2, 'later waiter should not expire an active ticket');
  await firstHandle.release();
  const secondHandle = await secondPromise;
  assert.equal(secondHandle.claims[0].owner.taskId, 'task-b');
  await secondHandle.release();
  const thirdHandle = await thirdPromise;
  assert.equal(thirdHandle.claims[0].owner.taskId, 'task-c');
  await thirdHandle.release();
});

test('owner token 不匹配时取消不能删除其他 ticket', async (context) => {
  const root = fixture(context);
  const first = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-a', runId: 'run-a' }, pollMs: 5 });
  const second = createVerificationResourceCoordinator({ root, resources: coordinated, owner: { taskId: 'task-b', runId: 'run-b' }, pollMs: 5 });
  const firstHandle = await first.acquire(['browser']);
  const controller = new AbortController();
  const secondResult = second.acquire(['browser'], { signal: controller.signal }).then((handle) => handle, (error) => error);
  await waitFor(context, () => filesNamed(root, 'ticket.json').length === 1, 'waiting ticket should exist');
  const [ticketFile] = filesNamed(root, 'ticket.json');
  const ticket = JSON.parse(fs.readFileSync(ticketFile, 'utf8'));
  fs.writeFileSync(ticketFile, `${JSON.stringify({ ...ticket, token: crypto.randomUUID() }, null, 2)}\n`);
  controller.abort();
  assert.match((await secondResult).message, /cancelled|ownership lost/);
  assert.equal(fs.existsSync(ticketFile), true);
  await firstHandle.release();
});
