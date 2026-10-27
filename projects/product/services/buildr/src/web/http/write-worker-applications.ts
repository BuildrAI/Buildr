import { createRuntime, runtimeProvide } from '../../bootstrap/runtime.ts';
import { CODE_APPLICATION } from '../../modules/code/module.ts';
import { SERVICE_RUNTIME_SOURCES } from '../../modules/service-runtime/module.ts';

const runtime = createRuntime();
const operations: Readonly<Record<string, Readonly<{ capability: string; method: string; fields?: readonly string[] }>>> = Object.freeze({
  'code-discard-changes': Object.freeze({ capability: CODE_APPLICATION, method: 'discardChanges', fields: ['input'] }),
  'code-branch-switch': Object.freeze({ capability: CODE_APPLICATION, method: 'switchBranch', fields: ['input'] }),
  'code-commit-changes': Object.freeze({ capability: CODE_APPLICATION, method: 'commitChanges', fields: ['input'] }),
  'code-push': Object.freeze({ capability: CODE_APPLICATION, method: 'push', fields: ['input'] }),
  'code-sync': Object.freeze({ capability: CODE_APPLICATION, method: 'sync', fields: ['input'] }),
  'code-fetch': Object.freeze({ capability: CODE_APPLICATION, method: 'fetch', fields: ['input'] }),
  'service-runtime-prepare': Object.freeze({ capability: SERVICE_RUNTIME_SOURCES, method: 'prepare', fields: ['serviceCode', 'input'] }),
});

function validMessage(message: any) {
  const operation = operations[message?.operation];
  if (!operation || typeof message?.targetRoot !== 'string') return false;
  if (operation.fields?.some(field => typeof message[field] !== 'string' || !message[field])) return false;
  const allowed = new Set(['id', 'operation', 'targetRoot', ...(operation.fields || [])]);
  return Object.keys(message).every(field => allowed.has(field));
}

export async function runApplicationWrite(message: any) {
  if (!validMessage(message)) throw Object.assign(new Error('Buildr Web write Worker input invalid.'), { code: 'local_app_write_input_invalid', status: 400 });
  const operation = operations[message.operation]!;
  const application = runtimeProvide(runtime, operation.capability);
  if (message.operation === 'service-runtime-prepare') return application[operation.method](message.targetRoot, message.serviceCode, JSON.parse(message.input));
  return application[operation.method](message.targetRoot, JSON.parse(message.input));
}
