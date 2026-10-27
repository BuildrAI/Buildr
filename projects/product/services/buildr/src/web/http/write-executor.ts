import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { resolveProductResource } from '../../infrastructure/product-resources/index.ts';
import { reclaimCodeGitOperationFile, runCodeGitMutation } from '../../modules/code/module.ts';

const OPERATIONS = new Set(['code-discard-changes', 'code-branch-switch', 'code-commit-changes', 'code-push', 'code-sync', 'code-fetch', 'service-runtime-prepare']);
const DEFAULT_WORKER_COUNT = 2;
const DEFAULT_QUEUE_LIMIT = 64;
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

function defaultWorkerFactory(registry: string) {
  return new Worker(WORKER_PATH, { env: { ...process.env, BUILDR_GIT_OPERATION_LOG: registry }, workerData: { buildrGitMutationBroker: true } });
}

/** Lock events noted by one write Worker, in order. */
function readRegistry(registry: string): Array<{ event: string; lockFile: string; token: string }> {
  const events: Array<{ event: string; lockFile: string; token: string }> = [];
  try {
    for (const line of fs.readFileSync(registry, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (typeof event?.lockFile === 'string' && event.lockFile) events.push({ event: event.event, lockFile: event.lockFile, token: typeof event.token === 'string' ? event.token : '' });
      } catch { /* A torn final line still leaves earlier events valid. */ }
    }
  } catch { /* Missing evidence cannot authorize reclaiming a lock. */ }
  return events;
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
  let closePromise: Promise<void> | undefined;

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

  /** Preregistered tokens cover publication even if the acquire note is missing. */
  function reclaimWorkerLocks(state: any) {
    const registry = state.registry;
    if (!registry) return;
    state.registry = null;
    const open = new Map<string, string>();
    for (const event of readRegistry(registry)) {
      if (!/^[a-f0-9]{32}$/.test(event.token)) continue;
      if (event.event === 'release') {
        if (open.get(event.lockFile) === event.token) open.delete(event.lockFile);
      } else if (event.event === 'intent' || event.event === 'acquire') open.set(event.lockFile, event.token);
    }
    try { fs.rmSync(registry, { force: true }); } catch { /* Bookkeeping only. */ }
    for (const [lockFile, token] of open) {
      try { reclaimCodeGitOperationFile(lockFile, token); } catch { /* Never infer a different owner. */ }
    }
  }

  function recover(state: any, worker: any, code: any): Promise<void> {
    if (state.worker !== worker) return state.recovery ?? Promise.resolve();
    state.worker = null;
    state.failed = true;
    const item = state.item;
    state.item = null;
    if (item) {
      item.workerState = null;
      settle(item, writeExecutorError('local_app_write_worker_failed', `Buildr Web write Worker exited unexpectedly (${code}); the dispatched write outcome is unknown.`, 500));
    }
    state.recovery = (async () => {
      // Parent-owned process promises settle only after their streams close.
      await Promise.allSettled([...state.mutations]);
      reclaimWorkerLocks(state);
      if (closed) return;
      try { spawn(state); pump(); }
      catch (error: any) {
        state.worker = null;
        state.failed = false;
        rejectQueued(writeExecutorError('local_app_write_executor_unavailable', `Buildr Web write executor 无法补充 Worker：${error.message}`, 503));
      }
    })();
    return state.recovery;
  }

  function spawn(state: any) {
    state.registry = path.join(os.tmpdir(), `buildr-write-locks-${process.pid}-${state.id}-${crypto.randomBytes(6).toString('hex')}.jsonl`);
    const worker = workerFactory(state.registry);
    state.worker = worker;
    state.item = null;
    state.failed = false;
    state.mutations = new Set<Promise<unknown>>();
    worker.on('message', (message: any) => {
      if (state.worker !== worker) return;
      if (message?.type === 'git-mutation') {
        if (!state.item || state.failed || !Number.isInteger(message.requestId) ||
          typeof message.location !== 'string' || !path.isAbsolute(message.location) ||
          !Array.isArray(message.args) || !message.args.every((arg: unknown) => typeof arg === 'string')) return;
        const mutation = runCodeGitMutation({ location: message.location } as any, message.args, message.options);
        state.mutations.add(mutation);
        void mutation.then(result => {
          if (state.worker === worker && !state.failed) {
            try { worker.postMessage({ type: 'git-mutation-result', requestId: message.requestId, result }); } catch { /* Exit recovery still waits for close. */ }
          }
        }).finally(() => state.mutations.delete(mutation));
        return;
      }
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
      if (item) {
        item.workerState = null;
        settle(item, workerError({ code: error.code, message: error.message }, 'local_app_write_worker_failed'));
      }
    });
    worker.on('exit', (code: any) => { void recover(state, worker, code); });
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
    if (queue.length >= queueLimit && workers.every((state: any) => state.item || state.failed)) {
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

  function close(): Promise<void> {
    if (closePromise) return closePromise;
    closed = true;
    rejectQueued(writeExecutorError('local_app_write_executor_closed', 'Buildr Web write executor 已关闭。', 503));
    closePromise = (async () => {
      await Promise.all(workers.map(async state => {
        const worker = state.worker;
        if (state.item) settle(state.item, writeExecutorError('local_app_write_executor_closed', 'Buildr Web write executor 已关闭；已派发写入的结果未知。', 503));
        if (worker) {
          await Promise.resolve(worker.terminate());
          await recover(state, worker, 'closed');
        } else await state.recovery;
      }));
    })();
    return closePromise;
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
