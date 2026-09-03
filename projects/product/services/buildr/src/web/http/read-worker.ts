import { parentPort } from 'node:worker_threads';

import { createRuntime } from '../../bootstrap/runtime.mjs';

const runtime = createRuntime();
const operations: Readonly<Record<string, string>> = Object.freeze({
  reviews: 'inspectTaskReview',
  verification: 'inspectTaskVerificationView',
  coordination: 'inspectParentCoordination',
});

function validMessage(message: any) {
  const method = operations[message?.operation];
  if (!method || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId']);
  return Object.keys(message).every((field: any) => allowed.has(field));
}

function serializeError(error: any) {
  return {
    code: error?.code || 'local_app_read_application_failed',
    status: Number.isInteger(error?.status) ? error.status : 500,
    message: error?.message || 'Buildr Web read Application failed.',
    ...(error?.details === undefined ? {} : { details: error.details }),
  };
}

if (!parentPort) throw new Error('Buildr Web read Worker requires a parent port.');
const workerPort = parentPort;

workerPort.on('message', (message: any) => {
  const method = operations[message?.operation];
  if (!validMessage(message)) {
    workerPort.postMessage({ id: message?.id ?? null, ok: false, error: { code: 'local_app_read_input_invalid', status: 400, message: 'Buildr Web read Worker input invalid.' } });
    return;
  }
  try {
    let value;
    value = (runtime as Record<string, any>)[method](message.targetRoot, message.taskId);
    workerPort.postMessage({ id: message.id, ok: true, value });
  } catch (error: any) {
    workerPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
