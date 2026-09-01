import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createBoundedBuildrWebReadExecutor } from '../../src/web/http/read-executor.mjs';

function fakeWorkerFactory({ delayMs = 20, failFirst = false, metrics }) {
  let created = 0;
  return () => {
    const worker = new EventEmitter();
    const workerId = ++created;
    let timer = null;
    let running = false;
    worker.postMessage = (message) => {
      metrics.calls += 1;
      metrics.started.push(message.id);
      metrics.messages?.push(message);
      metrics.active += 1;
      running = true;
      metrics.maxActive = Math.max(metrics.maxActive, metrics.active);
      timer = setTimeout(() => {
        timer = null;
        running = false;
        metrics.active -= 1;
        if (failFirst && workerId === 1) {
          worker.emit('error', Object.assign(new Error('worker crashed'), { code: 'worker_crashed' }));
          worker.emit('exit', 1);
          return;
        }
        worker.emit('message', { id: message.id, ok: true, value: { operation: message.operation, taskId: message.taskId } });
      }, typeof delayMs === 'function' ? delayMs(workerId, message) : delayMs);
    };
    worker.terminate = () => {
      metrics.terminated = (metrics.terminated ?? 0) + 1;
      if (timer) clearTimeout(timer);
      timer = null;
      if (running) metrics.active -= 1;
      running = false;
      return Promise.resolve();
    };
    return worker;
  };
}

const input = (taskId, signal) => ({ targetRoot: '/tmp/buildr-read-executor', taskId, signal });

test('固定容量与 FIFO 队列限制并发且不重复派发', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 2, queueLimit: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  try {
    const first = executor.run('development', input('task-a'));
    const second = executor.run('reviews', input('task-b'));
    const third = executor.run('verification', input('task-c'));
    await assert.rejects(executor.run('development', input('task-d')), (error) => error.code === 'local_app_read_queue_full');
    const results = await Promise.all([first, second, third]);
    assert.deepEqual(results.map((item) => item.taskId), ['task-a', 'task-b', 'task-c']);
    assert.equal(metrics.calls, 3);
    assert.equal(metrics.maxActive, 2);
    assert.deepEqual(metrics.started, [1, 2, 3]);
  } finally {
    await executor.close();
  }
});

test('取消排队和运行中的读取都不重试，运行中取消会回收 Worker 并立即恢复容量', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [], terminated: 0 };
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ delayMs: (workerId) => workerId === 1 ? 1000 : 20, metrics }) });
  try {
    const runningController = new AbortController();
    const running = executor.run('development', input('task-running', runningController.signal));
    const queuedController = new AbortController();
    const queued = executor.run('reviews', input('task-queued', queuedController.signal));
    queuedController.abort();
    await assert.rejects(queued, (error) => error.code === 'local_app_read_cancelled');
    runningController.abort();
    await assert.rejects(running, (error) => error.code === 'local_app_read_cancelled');
    const next = executor.run('verification', input('task-next'));
    await next;
    assert.equal(metrics.calls, 2);
    assert.deepEqual(metrics.started, [1, 3], '取消的 queued request 不得派发，后续请求使用新的 sequence id');
    assert.equal(metrics.terminated, 1, '运行中的取消必须终止占用容量的 Worker');
    assert.equal(metrics.maxActive, 1);
  } finally {
    await executor.close();
  }
});

test('Worker failure 只结算当前请求并恢复固定容量', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ failFirst: true, metrics }) });
  try {
    await assert.rejects(executor.run('development', input('task-failed')), (error) => error.code === 'worker_crashed');
    const recovered = await executor.run('reviews', input('task-recovered'));
    assert.equal(recovered.taskId, 'task-recovered');
    assert.equal(metrics.calls, 2);
    assert.equal(metrics.maxActive, 1);
  } finally {
    await executor.close();
  }
});
