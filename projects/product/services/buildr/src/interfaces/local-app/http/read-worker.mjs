import { parentPort } from 'node:worker_threads';

import { createRuntime } from '../../../bootstrap/runtime.mjs';

const runtime = createRuntime();
const operations = Object.freeze({
  overview: 'inspectTaskOverview',
  development: 'inspectTaskDevelopmentView',
  reviews: 'inspectTaskReviewView',
  verification: 'inspectTaskVerificationView',
  coordination: 'inspectParentCoordination',
  'execution-records': 'listTaskExecutionRecordView',
  'execution-record-detail': 'inspectTaskExecutionRecordView',
  'execution-record-body': 'readTaskExecutionRecordBodyFileView',
});

function validMessage(message) {
  const method = operations[message?.operation];
  if (!method || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId']);
  if (message.operation === 'execution-records') allowed.add('view');
  if (message.operation === 'execution-record-detail' || message.operation === 'execution-record-body') allowed.add('recordId');
  if (message.operation === 'execution-record-body') allowed.add('filename');
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
    if (message.operation === 'execution-records') value = runtime[method](message.targetRoot, message.taskId, { view: message.view ?? 'all' });
    else if (message.operation === 'execution-record-detail') value = runtime[method](message.targetRoot, message.taskId, message.recordId);
    else if (message.operation === 'execution-record-body') value = runtime[method](message.targetRoot, message.taskId, message.recordId, message.filename);
    else value = runtime[method](message.targetRoot, message.taskId);
    parentPort.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    parentPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
