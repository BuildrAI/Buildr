import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createBoundedBuildrWebReadExecutor } from '../../src/web/http/read-executor.ts';

function fakeWorkerFactory({ delayMs = 20, failFirst = false, metrics }: any): any  {
  let created: any = 0;
  return () => {
    const worker: any = new EventEmitter();
    const workerId: any = ++created;
    let timer: any = null;
    let running: any = false;
    worker.postMessage = (message: any) => {
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

const input: any = (taskId: any, signal: any) => ({ targetRoot: '/tmp/buildr-read-executor', taskId, signal });

test('固定容量与 FIFO 队列限制并发且不重复派发', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 2, queueLimit: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  try {
    const first: any = executor.run('coordination', input('task-a'));
    const second: any = executor.run('reviews', input('task-b'));
    const third: any = executor.run('verification', input('task-c'));
    await assert.rejects(executor.run('coordination', input('task-d')), (error: any) => error.code === 'local_app_read_queue_full');
    const results: any = await Promise.all([first, second, third]);
    assert.deepEqual(results.map((item: any) => item.taskId), ['task-a', 'task-b', 'task-c']);
    assert.equal(metrics.calls, 3);
    assert.equal(metrics.maxActive, 2);
    assert.deepEqual(metrics.started, [1, 2, 3]);
  } finally {
    await executor.close();
  }
});

test('取消排队和运行中的读取都不重试，运行中取消会回收 Worker 并立即恢复容量', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [], terminated: 0 };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ delayMs: (workerId: any) => workerId === 1 ? 1000 : 20, metrics }) });
  try {
    const runningController: any = new AbortController();
    const running: any = executor.run('coordination', input('task-running', runningController.signal));
    const queuedController: any = new AbortController();
    const queued: any = executor.run('reviews', input('task-queued', queuedController.signal));
    queuedController.abort();
    await assert.rejects(queued, (error: any) => error.code === 'local_app_read_cancelled');
    runningController.abort();
    await assert.rejects(running, (error: any) => error.code === 'local_app_read_cancelled');
    const next: any = executor.run('verification', input('task-next'));
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
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ failFirst: true, metrics }) });
  try {
    await assert.rejects(executor.run('coordination', input('task-failed')), (error: any) => error.code === 'worker_crashed');
    const recovered: any = await executor.run('reviews', input('task-recovered'));
    assert.equal(recovered.taskId, 'task-recovered');
    assert.equal(metrics.calls, 2);
    assert.equal(metrics.maxActive, 1);
  } finally {
    await executor.close();
  }
});
