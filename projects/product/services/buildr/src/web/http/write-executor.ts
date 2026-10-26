import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { resolveProductResource } from '../../infrastructure/product-resources/index.ts';

const OPERATIONS = new Set(['code-discard-changes', 'code-branch-switch', 'code-commit-changes', 'code-push', 'code-sync', 'code-fetch', 'service-runtime-prepare']);
const DEFAULT_WORKER_COUNT = 1;
const DEFAULT_QUEUE_LIMIT = 16;
const WORKER_PATH = resolveProductResource('runtime/write-worker.cjs', {
  developmentFallback: 'src/web/http/write-worker.ts',
});

function writeExecutorError(code: any, message: any, status: any = 503, details: any = undefined) {
  const error: Error & Record<string, any> = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  error.localAppWriteExecution = true;
  return error;
}

function workerError(message: any, fallbackCode: any = 'local_app_write_worker_failed') {
  const error: Error & Record<string, any> = new Error(message?.message || 'Buildr Web write Worker failed.');
  error.code = message?.code || fallbackCode;
  error.status = Number.isInteger(message?.status) ? message.status : 500;
  if (message?.details !== undefined) error.details = message.details;
  return error;
}

function validateRequest(operation: any, input: any) {
  if (!OPERATIONS.has(operation)) throw writeExecutorError('local_app_write_operation_forbidden', `Buildr Web write operation 不受支持：${operation}。`, 400);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw writeExecutorError('local_app_write_input_invalid', 'Buildr Web write executor input 必须是对象。', 400);
  if (typeof input.targetRoot !== 'string' || !path.isAbsolute(input.targetRoot)) throw writeExecutorError('local_app_write_root_invalid', 'Buildr Web write executor 只接受已解析的绝对 Workspace root。', 400);
  const extra = ['input', ...(operation === 'service-runtime-prepare' ? ['serviceCode'] : [])];
  for (const field of extra) {
    if (typeof input[field] !== 'string' || !input[field]) throw writeExecutorError('local_app_write_input_invalid', `Buildr Web write ${field} 无效。`, 400);
  }
  const allowed = new Set(['targetRoot', 'signal', ...extra]);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw writeExecutorError('local_app_write_field_forbidden', `Buildr Web write executor 不支持字段：${field}。`, 400, { field });
  }
}

function defaultWorkerFactory() {
  return new Worker(WORKER_PATH);
}

/** Bounded executor for blocking Git writes. Writes already dispatched to the
 * Worker always run to completion; only queued requests may be cancelled. */
export function createBoundedBuildrWebWriteExecutor({ workerCount = DEFAULT_WORKER_COUNT, queueLimit = DEFAULT_QUEUE_LIMIT, workerFactory = defaultWorkerFactory, warm = false }: any = {}) {
  if (!Number.isInteger(workerCount) || workerCount < 1) throw new TypeError('workerCount must be a positive integer.');
  if (!Number.isInteger(queueLimit) || queueLimit < 0) throw new TypeError('queueLimit must be a non-negative integer.');
  const warmCount = warm === true ? workerCount : warm === false ? 0 : warm;
  if (!Number.isInteger(warmCount) || warmCount < 0 || warmCount > workerCount) throw new TypeError('warm must be a boolean or a count within workerCount.');

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
      else settle(item, workerError(message?.error, 'local_app_write_application_failed'));
      pump();
    });
    worker.on('error', (error: any) => {
      if (state.worker !== worker) return;
      state.failed = true;
      const item = state.item;
      state.item = null;
      if (item) {
        item.workerState = null;
        settle(item, workerError({ code: error.code, message: error.message }, 'local_app_write_worker_failed'));
      }
    });
    worker.on('exit', (code: any) => {
      if (state.worker !== worker) return;
      const item = state.item;
      state.worker = null;
      state.item = null;
      if (item) {
        item.workerState = null;
        settle(item, writeExecutorError('local_app_write_worker_failed', `Buildr Web write Worker exited unexpectedly (${code}); the dispatched write outcome is unknown.`, 500));
      }
      if (closed) return;
      try {
        spawn(state);
        pump();
      } catch (error: any) {
        state.worker = null;
        rejectQueued(writeExecutorError('local_app_write_executor_unavailable', `Buildr Web write executor 无法补充 Worker：${error.message}`, 503));
      }
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
          // Leave the slot available so a later item can retry spawning; only
          // the current item fails fast here.
          settle(item, writeExecutorError('local_app_write_executor_unavailable', `Buildr Web write executor 无法启动 Worker：${error.message}`, 503));
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
          ...(item.input === undefined ? {} : { input: item.input }),
          ...(item.serviceCode === undefined ? {} : { serviceCode: item.serviceCode }),
        });
      } catch (error: any) {
        state.item = null;
        item.workerState = null;
        settle(item, workerError({ code: error.code, message: error.message }));
      }
    }
  }

  for (let index = 0; index < workerCount; index += 1) workers.push({ id: index, worker: null, item: null, failed: false });
  if (warmCount) for (const state of workers.slice(0, warmCount)) {
    try { spawn(state); } catch { state.worker = null; state.failed = false; }
  }

  function run(operation: any, input: any = {}) {
    validateRequest(operation, input);
    if (closed) return Promise.reject(writeExecutorError('local_app_write_executor_closed', 'Buildr Web write executor 已关闭。', 503));
    if (input.signal?.aborted) return Promise.reject(writeExecutorError('local_app_write_cancelled', 'Buildr Web write request 已取消。', 499));
    if (queue.length >= queueLimit && workers.every((state: any) => state.item)) {
      return Promise.reject(writeExecutorError('local_app_write_queue_full', 'Buildr Web write executor 当前已达到并发与队列上限。', 503, { workerCount, queueLimit }));
    }
    return new Promise((resolve: any, reject: any) => {
      const item: any = {
        id: ++sequence,
        operation,
        targetRoot: input.targetRoot,
        input: input.input,
        serviceCode: input.serviceCode,
        state: 'queued',
        settled: false,
        workerState: null,
        resolve,
        reject,
        cleanup: null,
      };
      const onAbort = () => {
        if (item.settled) return;
        // Queued writes are removed and settled; a dispatched write keeps
        // running inside the Worker because interrupting a Git mutation would
        // leave an ambiguous repository state.
        item.state = 'cancelled';
        const index = queue.indexOf(item);
        if (index >= 0) queue.splice(index, 1);
        const state = item.workerState;
        if (state?.item === item) {
          item.workerState = null;
          settle(item, writeExecutorError('local_app_write_cancelled', 'Buildr Web write request 已取消；已派发的写入仍会继续完成。', 499));
          return;
        }
        settle(item, writeExecutorError('local_app_write_cancelled', 'Buildr Web write request 已取消。', 499));
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
    rejectQueued(writeExecutorError('local_app_write_executor_closed', 'Buildr Web write executor 已关闭。', 503));
    const terminations: any[] = [];
    for (const state of workers) {
      if (state.item) {
        state.item.workerState = null;
        settle(state.item, writeExecutorError('local_app_write_executor_closed', 'Buildr Web write executor 已关闭；已派发写入的结果未知。', 503));
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

export const LOCAL_APP_WRITE_EXECUTOR_DEFAULTS = Object.freeze({ workerCount: DEFAULT_WORKER_COUNT, queueLimit: DEFAULT_QUEUE_LIMIT });
