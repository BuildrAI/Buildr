import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { resolveProductResource } from '../../infrastructure/product-resources/index.mjs';

const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const OPERATIONS = new Set(['reviews', 'verification', 'coordination']);
const DEFAULT_WORKER_COUNT = 2;
const DEFAULT_QUEUE_LIMIT = 32;
const WORKER_PATH = resolveProductResource('runtime/read-worker.cjs', {
  developmentFallback: 'src/web/http/read-worker.ts',
});

function readExecutorError(code: any, message: any, status: any = 503, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  error.localAppReadExecution = true;
  return error;
}

function workerError(message: any, fallbackCode: any = 'local_app_read_worker_failed') {
  const error: Error & Record<string, any> = new Error(message?.message || 'Buildr Web read Worker failed.');
  error.code = message?.code || fallbackCode;
  error.status = Number.isInteger(message?.status) ? message.status : 500;
  if (message?.details !== undefined) error.details = message.details;
  return error;
}

function validateRequest(operation: any, input: any) {
  if (!OPERATIONS.has(operation)) throw readExecutorError('local_app_read_operation_forbidden', `Buildr Web read operation 不受支持：${operation}。`, 400);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw readExecutorError('local_app_read_input_invalid', 'Buildr Web read executor input 必须是对象。', 400);
  if (typeof input.targetRoot !== 'string' || !path.isAbsolute(input.targetRoot)) throw readExecutorError('local_app_read_root_invalid', 'Buildr Web read executor 只接受已解析的绝对 Workspace root。', 400);
  if (typeof input.taskId !== 'string' || !TASK_ID_PATTERN.test(input.taskId)) throw readExecutorError('local_app_read_task_invalid', 'Buildr Web read executor Task ID 不合法。', 400);
  if (input.signal !== undefined && (typeof input.signal !== 'object' || typeof input.signal.addEventListener !== 'function')) {
    throw readExecutorError('local_app_read_signal_invalid', 'Buildr Web read executor signal 不合法。', 400);
  }
  const allowed = new Set(['targetRoot', 'taskId', 'signal']);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw readExecutorError('local_app_read_field_forbidden', `Buildr Web read executor 不支持字段：${field}。`, 400, { field });
  }
}

function defaultWorkerFactory() {
  return new Worker(WORKER_PATH);
}

export function createBoundedBuildrWebReadExecutor({ workerCount = DEFAULT_WORKER_COUNT, queueLimit = DEFAULT_QUEUE_LIMIT, workerFactory = defaultWorkerFactory }: any = {}) {
  if (!Number.isInteger(workerCount) || workerCount < 1) throw new TypeError('workerCount must be a positive integer.');
  if (!Number.isInteger(queueLimit) || queueLimit < 0) throw new TypeError('queueLimit must be a non-negative integer.');

  const workers: any[] = [];
  const queue: any[] = [];
  let sequence = 0;
  let closed = false;

  function settle(item: any, error: any, value: any = undefined) {
    if (item.settled) return;
    item.settled = true;
    item.cleanup?.();
    if (error) item.reject(error);
    else item.resolve(value);
  }

  function rejectQueued(error: any) {
    while (queue.length) settle(queue.shift(), error);
  }

  function spawn(state: any) {
    const worker = workerFactory();
    state.worker = worker;
    state.item = null;
    state.failed = false;
    worker.on('message', (message: any) => {
      if (state.worker !== worker) return;
      const item = state.item;
      if (!item || message?.id !== item.id) return;
      state.item = null;
      item.workerState = null;
      if (message?.ok === true) settle(item, null, message.value);
      else settle(item, workerError(message?.error, 'local_app_read_application_failed'));
      pump();
    });
    worker.on('error', (error: any) => {
      if (state.worker !== worker) return;
      state.failed = true;
      const item = state.item;
      state.item = null;
      if (item) {
        item.workerState = null;
        settle(item, workerError({ code: error.code, message: error.message }, 'local_app_read_worker_failed'));
      }
    });
    worker.on('exit', (code: any) => {
      if (state.worker !== worker) return;
      const item = state.item;
      state.worker = null;
      state.item = null;
      if (item) {
        item.workerState = null;
        settle(item, readExecutorError('local_app_read_worker_failed', `Buildr Web read Worker exited unexpectedly (${code}).`, 500));
      }
      if (closed) return;
      try {
        spawn(state);
        pump();
      } catch (error: any) {
        state.failed = true;
        state.worker = null;
        rejectQueued(readExecutorError('local_app_read_executor_unavailable', `Buildr Web read executor 无法补充 Worker：${error.message}`, 503));
      }
    });
  }

  function recycle(state: any) {
    const worker = state.worker;
    if (!worker) return;
    state.worker = null;
    state.item = null;
    state.failed = true;
    void Promise.resolve(worker.terminate()).then(() => {
      if (closed || state.worker) return;
      try {
        spawn(state);
        pump();
      } catch (error: any) {
        state.failed = true;
        rejectQueued(readExecutorError('local_app_read_executor_unavailable', `Buildr Web read executor 无法补充 Worker：${error.message}`, 503));
      }
    }, (error: any) => {
      if (closed) return;
      state.failed = true;
      rejectQueued(readExecutorError('local_app_read_executor_unavailable', `Buildr Web read executor 无法回收 Worker：${error.message}`, 503));
    });
  }

  function pump() {
    if (closed) return;
    for (const state of workers) {
      if (state.item || state.failed) continue;
      const item = queue.shift();
      if (!item) break;
      if (!state.worker) {
        try {
          spawn(state);
        } catch (error: any) {
          state.failed = true;
          settle(item, readExecutorError('local_app_read_executor_unavailable', `Buildr Web read executor 无法启动 Worker：${error.message}`, 503));
          continue;
        }
      }
      if (item.settled) continue;
      state.item = item;
      item.workerState = state;
      item.state = 'running';
      try {
        state.worker.postMessage({
          id: item.id,
          operation: item.operation,
          targetRoot: item.targetRoot,
          taskId: item.taskId,
          ...(item.view === undefined ? {} : { view: item.view }),
          ...(item.recordId === undefined ? {} : { recordId: item.recordId }),
          ...(item.filename === undefined ? {} : { filename: item.filename }),
        });
      } catch (error: any) {
        state.item = null;
        item.workerState = null;
        settle(item, workerError({ code: error.code, message: error.message }));
      }
    }
  }

  for (let index = 0; index < workerCount; index += 1) workers.push({ id: index, worker: null, item: null, failed: false });

  function run(operation: any, input: any = {}) {
    validateRequest(operation, input);
    if (closed) return Promise.reject(readExecutorError('local_app_read_executor_closed', 'Buildr Web read executor 已关闭。', 503));
    if (input.signal?.aborted) return Promise.reject(readExecutorError('local_app_read_cancelled', 'Buildr Web read request 已取消。', 499));
    if (queue.length >= queueLimit && workers.every((state: any) => state.item)) {
      return Promise.reject(readExecutorError('local_app_read_queue_full', 'Buildr Web read executor 当前已达到并发与队列上限。', 503, { workerCount, queueLimit }));
    }
    return new Promise((resolve: any, reject: any) => {
      const item: any = {
        id: ++sequence,
        operation,
        targetRoot: input.targetRoot,
        taskId: input.taskId,
        view: input.view,
        recordId: input.recordId,
        filename: input.filename,
        state: 'queued',
        settled: false,
        workerState: null,
        resolve,
        reject,
        cleanup: null,
      };
      const onAbort = () => {
        if (item.settled) return;
        item.state = 'cancelled';
        const index = queue.indexOf(item);
        if (index >= 0) queue.splice(index, 1);
        const state = item.workerState;
        if (state?.item === item) {
          item.workerState = null;
          settle(item, readExecutorError('local_app_read_cancelled', 'Buildr Web read request 已取消。', 499));
          recycle(state);
          return;
        }
        settle(item, readExecutorError('local_app_read_cancelled', 'Buildr Web read request 已取消。', 499));
      };
      if (input.signal) {
        input.signal.addEventListener('abort', onAbort, { once: true });
        item.cleanup = () => input.signal.removeEventListener('abort', onAbort);
      }
      queue.push(item);
      pump();
    });
  }

  async function close() {
    if (closed) return;
    closed = true;
    rejectQueued(readExecutorError('local_app_read_executor_closed', 'Buildr Web read executor 已关闭。', 503));
    const terminations: any[] = [];
    for (const state of workers) {
      if (state.item) {
        state.item.workerState = null;
        settle(state.item, readExecutorError('local_app_read_executor_closed', 'Buildr Web read executor 已关闭。', 503));
      }
      state.item = null;
      if (state.worker) terminations.push(Promise.resolve(state.worker.terminate()).catch(() => {}));
    }
    await Promise.all(terminations);
  }

  function stats() {
    return {
      workerCount,
      queueLimit,
      active: workers.filter((state: any) => state.item).length,
      queued: queue.length,
      closed,
    };
  }

  return { run, close, stats };
}

export const LOCAL_APP_READ_EXECUTOR_DEFAULTS = Object.freeze({ workerCount: DEFAULT_WORKER_COUNT, queueLimit: DEFAULT_QUEUE_LIMIT });
