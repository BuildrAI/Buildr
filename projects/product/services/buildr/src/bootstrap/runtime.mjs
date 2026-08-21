import * as platform from '../infrastructure/platform.mjs';
import {
  TASK_RECORD_COMPATIBILITY,
  TASK_RECORD_MODULE,
} from '../task/module.mjs';
import { registerLegacyRuntime } from './legacy-runtime-module.mjs';
import { createModuleRegistry } from './module-registry.mjs';

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

export function createRuntime() {
  const runtime = { ...platform };
  const registry = createModuleRegistry({ capabilities: taskRecordDependencies(runtime) });
  registerLegacyRuntime(runtime, {
    installTaskRecordModule: () => installTaskRecordModule(runtime, registry),
  });
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
