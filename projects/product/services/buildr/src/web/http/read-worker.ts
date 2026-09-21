import { parentPort } from 'node:worker_threads';

import { createRuntime, runtimeProvide } from '../../bootstrap/runtime.ts';
import {
  PARENT_COORDINATION_APPLICATION,
  TASK_REVIEW_APPLICATION,
  TASK_VERIFICATION_APPLICATION,
} from '../../modules/task/module.ts';

import { CHANGE_APPLICATION } from '../../modules/task/change/module.ts';

const runtime = createRuntime();
const operations: Readonly<Record<string, Readonly<{ capability: string; method: string; fields?: readonly string[] }>>> = Object.freeze({
  reviews: Object.freeze({ capability: TASK_REVIEW_APPLICATION, method: 'inspectTaskReview' }),
  verification: Object.freeze({ capability: TASK_VERIFICATION_APPLICATION, method: 'inspectTaskVerificationView' }),
  coordination: Object.freeze({ capability: PARENT_COORDINATION_APPLICATION, method: 'inspectParentCoordination' }),
  change: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskScopedChangeDetail', fields: ['project', 'change'] }),
  documents: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskProjectDocument', fields: ['project', 'documentPath'] }),
  prototypes: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskUiPrototypes' }),
  prototype: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskUiPrototype', fields: ['prototypeId'] }),
});

function validMessage(message: any) {
  const operation = operations[message?.operation];
  if (!operation || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') return false;
  if (operation.fields?.some(field => typeof message[field] !== 'string' || !message[field])) return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId', ...(operation.fields || [])]);
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
  const operation = operations[message?.operation];
  if (!validMessage(message)) {
    workerPort.postMessage({ id: message?.id ?? null, ok: false, error: { code: 'local_app_read_input_invalid', status: 400, message: 'Buildr Web read Worker input invalid.' } });
    return;
  }
  try {
    let value;
    const application = runtimeProvide(runtime, operation.capability);
    value = application[operation.method](message.targetRoot, message.taskId, ...(operation.fields || []).map(field => message[field]));
    workerPort.postMessage({ id: message.id, ok: true, value });
  } catch (error: any) {
    workerPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
