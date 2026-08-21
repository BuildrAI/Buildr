import * as platform from '../infrastructure/platform.mjs';
import {
  TASK_RECORD_COMPATIBILITY,
  TASK_RECORD_MODULE,
  TASK_RETROSPECTIVE_COMPATIBILITY,
  TASK_RETROSPECTIVE_MODULE,
  TASK_REVIEW_COMPATIBILITY,
  TASK_REVIEW_MODULE,
} from '../task/module.mjs';
import { registerLegacyRuntime } from './legacy-runtime-module.mjs';
import { createModuleRegistry } from './module-registry.mjs';
import { createWebModule } from '../web/module.mjs';
import { createWorkspaceModule } from '../workspace/module.mjs';

const RUNTIME_CONTEXT = new WeakMap();

function methodPort(runtime, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (...args) => runtime[method](...args)])));
}

function taskRecordDependencies(runtime) {
  return {
    'workspace.structured-store': methodPort(runtime, ['assertCanonicalStructuredWorkspace', 'openWorkspaceStructuredStore']),
    'project-service.reader': methodPort(runtime, ['readProjectRegistryRecord', 'readServiceRegistryRecord']),
    'change.resolver': methodPort(runtime, ['resolveTaskScopedChange']),
    'workspace.operation-memoizer': Object.freeze({
      memoizeWorkspaceOperation: (...args) => runtime.memoizeWorkspaceOperation?.(...args),
    }),
    'task.parent-coordination-reader': Object.freeze({
      inspectParentCoordination: (...args) => runtime.inspectParentCoordination?.(...args) ?? null,
    }),
  };
}

function installTaskRecordModule(runtime, registry) {
  const descriptor = registry.install(TASK_RECORD_MODULE);
  const compatibility = registry.provide(TASK_RECORD_COMPATIBILITY);
  Object.assign(runtime, compatibility.methods);
  return descriptor;
}

function installTaskReviewModule(runtime, registry) {
  const descriptor = registry.install(TASK_REVIEW_MODULE);
  const compatibility = registry.provide(TASK_REVIEW_COMPATIBILITY);
  Object.assign(runtime, compatibility.methods);
  for (const [name, bridge] of Object.entries(compatibility.testSupportProperties)) {
    Object.defineProperty(runtime, name, {
      configurable: true,
      enumerable: false,
      get: bridge.get,
      set: bridge.set,
    });
  }
  return descriptor;
}

function installTaskRetrospectiveModule(runtime, registry) {
  const descriptor = registry.install(TASK_RETROSPECTIVE_MODULE);
  const compatibility = registry.provide(TASK_RETROSPECTIVE_COMPATIBILITY);
  Object.assign(runtime, compatibility.methods);
  for (const [name, bridge] of Object.entries(compatibility.testSupportProperties)) {
    Object.defineProperty(runtime, name, {
      configurable: true,
      enumerable: false,
      get: bridge.get,
      set: bridge.set,
    });
  }
  return descriptor;
}

export function createRuntime() {
  const runtime = { ...platform };
  const registry = createModuleRegistry({ capabilities: taskRecordDependencies(runtime) });
  registerLegacyRuntime(runtime, {
    installWorkspaceModule: () => registry.install(createWorkspaceModule(runtime)),
    installTaskRecordModule: () => installTaskRecordModule(runtime, registry),
    installTaskReviewModule: () => installTaskReviewModule(runtime, registry),
    installTaskRetrospectiveModule: () => installTaskRetrospectiveModule(runtime, registry),
  });
  registry.install(createWebModule(runtime, { httpContributions: registry.contributions('http') }));
  RUNTIME_CONTEXT.set(runtime, Object.freeze({ registry }));
  Object.defineProperty(runtime, '__bootstrapContributions', {
    enumerable: false,
    configurable: false,
    value: (type) => registry.contributions(type),
  });
  return runtime;
}

function context(runtime) {
  const value = RUNTIME_CONTEXT.get(runtime);
  if (!value) {
    const error = new Error('Runtime is not owned by the Buildr Bootstrap.');
    error.code = 'bootstrap_runtime_not_owned';
    throw error;
  }
  return value;
}

export function runtimeProvide(runtime, capability) {
  return context(runtime).registry.provide(capability);
}

export function runtimeContributions(runtime, type) {
  return context(runtime).registry.contributions(type);
}

export function runtimeModuleSnapshot(runtime) {
  return context(runtime).registry.snapshot();
}

export function startRuntime(runtime) {
  return context(runtime).registry.start();
}

export function stopRuntime(runtime) {
  return context(runtime).registry.stop();
}
