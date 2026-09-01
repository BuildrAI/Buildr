import { parentPort } from 'node:worker_threads';

import { createRuntime } from '../../bootstrap/runtime.mjs';

const runtime = createRuntime();
const operations = Object.freeze({
  overview: 'inspectTaskOverview',
  development: 'inspectTaskDevelopmentView',
  reviews: 'inspectTaskReviewView',
  verification: 'inspectTaskVerificationView',
  coordination: 'inspectParentCoordination',
});

function validMessage(message) {
  const method = operations[message?.operation];
  if (!method || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId']);
  return Object.keys(message).every((field) => allowed.has(field));
}

function serializeError(error) {
  return {
    code: error?.code || 'local_app_read_application_failed',
    status: Number.isInteger(error?.status) ? error.status : 500,
    message: error?.message || 'Buildr Web read Application failed.',
    ...(error?.details === undefined ? {} : { details: error.details }),
  };
}

parentPort.on('message', (message) => {
  const method = operations[message?.operation];
  if (!validMessage(message)) {
    parentPort.postMessage({ id: message?.id ?? null, ok: false, error: { code: 'local_app_read_input_invalid', status: 400, message: 'Buildr Web read Worker input invalid.' } });
    return;
  }
  try {
    let value;
    value = runtime[method](message.targetRoot, message.taskId);
    parentPort.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    parentPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
