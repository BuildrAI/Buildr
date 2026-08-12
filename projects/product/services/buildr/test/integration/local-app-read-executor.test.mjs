import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createBoundedLocalAppReadExecutor } from '../../src/interfaces/local-app/http/read-executor.mjs';

function fakeWorkerFactory({ delayMs = 20, failFirst = false, metrics }) {
  let created = 0;
  return () => {
    const worker = new EventEmitter();
    const workerId = ++created;
    worker.postMessage = (message) => {
      metrics.calls += 1;
      metrics.started.push(message.id);
      metrics.messages?.push(message);
      metrics.active += 1;
      metrics.maxActive = Math.max(metrics.maxActive, metrics.active);
      setTimeout(() => {
        metrics.active -= 1;
        if (failFirst && workerId === 1) {
          worker.emit('error', Object.assign(new Error('worker crashed'), { code: 'worker_crashed' }));
          worker.emit('exit', 1);
          return;
        }
        worker.emit('message', { id: message.id, ok: true, value: { operation: message.operation, taskId: message.taskId } });
      }, delayMs);
    };
    worker.terminate = () => Promise.resolve();
    return worker;
  };
}

const input = (taskId, signal) => ({ targetRoot: '/tmp/buildr-read-executor', taskId, signal });

test('固定容量与 FIFO 队列限制并发且不重复派发', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedLocalAppReadExecutor({ workerCount: 2, queueLimit: 1, workerFactory: fakeWorkerFactory({ metrics }) });
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

test('取消排队和运行中的读取都不重试且释放后续容量', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedLocalAppReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ delayMs: 35, metrics }) });
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
  } finally {
    await executor.close();
  }
});

test('Worker failure 只结算当前请求并恢复固定容量', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedLocalAppReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ failFirst: true, metrics }) });
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

test('Execution Record读取只转发closed参数并拒绝任意path', async () => {
  const metrics = { calls: 0, active: 0, maxActive: 0, started: [], messages: [] };
  const executor = createBoundedLocalAppReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  try {
    await executor.run('execution-records', { ...input('task-a'), view: 'finish' });
    await executor.run('execution-record-detail', { ...input('task-a'), recordId: 'task-exec-1' });
    await executor.run('execution-record-body', { ...input('task-a'), recordId: 'task-exec-1', filename: 'stdout.txt' });
    assert.deepEqual(metrics.messages.map(({ id: _id, ...message }) => message), [
      { operation: 'execution-records', targetRoot: '/tmp/buildr-read-executor', taskId: 'task-a', view: 'finish' },
      { operation: 'execution-record-detail', targetRoot: '/tmp/buildr-read-executor', taskId: 'task-a', recordId: 'task-exec-1' },
      { operation: 'execution-record-body', targetRoot: '/tmp/buildr-read-executor', taskId: 'task-a', recordId: 'task-exec-1', filename: 'stdout.txt' },
    ]);
    assert.throws(() => executor.run('execution-records', { ...input('task-a'), view: 'resources' }), (error) => error.code === 'task_execution_record_view_invalid');
    assert.throws(() => executor.run('execution-record-body', { ...input('task-a'), recordId: 'task-exec-1', filename: '../secret' }), (error) => error.code === 'task_execution_record_body_name_forbidden');
    assert.throws(() => executor.run('execution-record-detail', { ...input('task-a'), recordId: 'task-exec-1', path: '/tmp/private' }), (error) => error.code === 'local_app_read_field_forbidden');
  } finally {
    await executor.close();
  }
});
