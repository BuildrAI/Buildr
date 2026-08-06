import { parentPort } from 'node:worker_threads';

import { createRuntime } from '../../../application/compose-runtime.mjs';

const runtime = createRuntime();
const operations = Object.freeze({
  development: 'inspectTaskDevelopmentView',
  reviews: 'inspectTaskReviewView',
  verification: 'inspectTaskVerificationView',
});

function serializeError(error) {
  return {
    code: error?.code || 'local_app_read_application_failed',
    status: Number.isInteger(error?.status) ? error.status : 500,
    message: error?.message || 'Local App read Application failed.',
    ...(error?.details === undefined ? {} : { details: error.details }),
  };
}

parentPort.on('message', (message) => {
  const method = operations[message?.operation];
  if (!method || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') {
    parentPort.postMessage({ id: message?.id ?? null, ok: false, error: { code: 'local_app_read_input_invalid', status: 400, message: 'Local App read Worker input invalid.' } });
    return;
  }
  try {
    const value = runtime[method](message.targetRoot, message.taskId);
    parentPort.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    parentPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
