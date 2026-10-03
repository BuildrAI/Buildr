import { parentPort } from 'node:worker_threads';

import { createRuntime, runtimeProvide } from '../../bootstrap/runtime.ts';
import {
  PARENT_COORDINATION_APPLICATION,
  TASK_REVIEW_APPLICATION,
  TASK_VERIFICATION_APPLICATION,
} from '../../modules/task/module.ts';

import { CHANGE_APPLICATION } from '../../modules/task/change/module.ts';
import { TASK_COMMITS_APPLICATION } from '../../modules/task/commits/module.ts';
import { TASK_CHANGED_FILES_APPLICATION } from '../../modules/task/changed-files/module.ts';
import { TASK_MATERIALS_APPLICATION } from '../../modules/task/materials/module.ts';
import { CODE_APPLICATION } from '../../modules/code/module.ts';

const runtime = createRuntime();
const operations: Readonly<Record<string, Readonly<{ capability: string; method: string; fields?: readonly string[] }>>> = Object.freeze({
  'code-repositories': Object.freeze({capability:CODE_APPLICATION,method:'repositories',fields:['input']}),
  'code-directory': Object.freeze({capability:CODE_APPLICATION,method:'directory',fields:['input']}),
  'code-file': Object.freeze({capability:CODE_APPLICATION,method:'file',fields:['input']}),
  'code-search': Object.freeze({capability:CODE_APPLICATION,method:'search',fields:['input']}),
  'code-source-control': Object.freeze({capability:CODE_APPLICATION,method:'sourceControl',fields:['input']}),
  'code-history': Object.freeze({capability:CODE_APPLICATION,method:'history',fields:['input']}),
  'code-commit': Object.freeze({capability:CODE_APPLICATION,method:'commit',fields:['input']}),
  'code-diff': Object.freeze({capability:CODE_APPLICATION,method:'diff',fields:['input']}),
  'code-source-file': Object.freeze({capability:CODE_APPLICATION,method:'sourceFile',fields:['input']}),
  commits: Object.freeze({ capability: TASK_COMMITS_APPLICATION, method: 'inspectTaskCommits' }),
  'file-diff': Object.freeze({ capability: TASK_CHANGED_FILES_APPLICATION, method: 'inspectTaskFileDiff', fields: ['repositoryId', 'filePath', 'commitHash'] }),
  'changed-file-count': Object.freeze({ capability: TASK_CHANGED_FILES_APPLICATION, method: 'inspectTaskChangedFileCount' }),
  'changed-files': Object.freeze({ capability: TASK_CHANGED_FILES_APPLICATION, method: 'inspectTaskChangedFiles' }),
  reviews: Object.freeze({ capability: TASK_REVIEW_APPLICATION, method: 'inspectTaskReview' }),
  verification: Object.freeze({ capability: TASK_VERIFICATION_APPLICATION, method: 'inspectTaskVerificationView' }),
  coordination: Object.freeze({ capability: PARENT_COORDINATION_APPLICATION, method: 'inspectParentCoordination' }),
  change: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskScopedChangeDetail', fields: ['project', 'change'] }),
  materials: Object.freeze({ capability: TASK_MATERIALS_APPLICATION, method: 'inspectTaskMaterials' }),
  documents: Object.freeze({ capability: TASK_MATERIALS_APPLICATION, method: 'taskProjectDocument', fields: ['project', 'documentPath'] }),
  prototypes: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskUiPrototypes' }),
  prototype: Object.freeze({ capability: CHANGE_APPLICATION, method: 'taskUiPrototype', fields: ['prototypeId'] }),
});

function validMessage(message: any) {
  const operation = operations[message?.operation];
  if (!operation || typeof message?.targetRoot !== 'string' || typeof message?.taskId !== 'string') return false;
  if (operation.fields?.some(field => typeof message[field] !== 'string' || !message[field])) return false;
  if (message.operation === 'file-diff' && message.checkoutId !== undefined && (typeof message.checkoutId !== 'string' || !/^checkout-[a-f0-9]{64}$/.test(message.checkoutId))) return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId', ...(operation.fields || []), ...(message.operation === 'file-diff' ? ['checkoutId'] : [])]);
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

workerPort.on('message', async (message: any) => {
  const operation = operations[message?.operation];
  if (!validMessage(message)) {
    workerPort.postMessage({ id: message?.id ?? null, ok: false, error: { code: 'local_app_read_input_invalid', status: 400, message: 'Buildr Web read Worker input invalid.' } });
    return;
  }
  try {
    let value;
    const application = runtimeProvide(runtime, operation.capability);
    if(message.operation.startsWith('code-')) {
      const input=JSON.parse(message.input);
      value=await application[operation.method](message.targetRoot,operation.method==='repositories'?input.taskId:input);
    } else value = await application[operation.method](message.targetRoot, message.taskId, ...(operation.fields || []).map(field => message[field]), ...(message.operation === 'file-diff' ? [message.checkoutId] : []));
    workerPort.postMessage({ id: message.id, ok: true, value });
  } catch (error: any) {
    workerPort.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  }
});
