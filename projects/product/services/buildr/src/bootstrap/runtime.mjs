import * as platform from '../infrastructure/platform.mjs';
import {
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_RUNTIME,
  createAgentAssetsModule,
  createAgentAssetsRuntimeModule,
} from '../agent-assets/module.ts';
import {
  TASK_RECORD_RUNTIME_PORT,
  TASK_RECORD_MODULE,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_REVIEW_MODULE,
  TASK_VERIFICATION_RUNTIME_PORT,
  PARENT_COORDINATION_RUNTIME_PORT,
  createWorktreeProviderModule,
  createTaskVerificationModule,
  createParentCoordinationModule,
} from '../task/module.ts';
import { createModuleRegistry } from './module-registry.mjs';
import { createWebModule } from '../web/module.ts';
import { createWorkspaceModule, WORKSPACE_QUERY } from '../workspace/module.ts';
import { createSystemInstallationModule, readCurrentProductIdentity } from '../system/installation/module.ts';
import { createSystemDoctorModule, SYSTEM_DOCTOR_APPLICATION } from '../system/doctor/module.ts';
import { registerInfrastructure } from '../infrastructure/index.mjs';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.mjs';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.mjs';
import { createPublicationModule } from '../system/publication/module.ts';
import { createOpenSpecModule } from '../task/openspec/module.ts';
import { createChangeModule } from '../task/change/module.ts';
import { VERIFICATION_DECLARATION, createVerificationModule } from '../verification/module.ts';
import * as webProfileContract from '../system/installation/contracts/web-profile.ts';

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
  };
}

function installTaskRecordModule(runtime, registry) {
  const descriptor = registry.install(TASK_RECORD_MODULE);
  const runtimePort = registry.provide(TASK_RECORD_RUNTIME_PORT);
  Object.assign(runtime, runtimePort.methods);
  return descriptor;
}

function installTaskReviewModule(runtime, registry) {
  const descriptor = registry.install(TASK_REVIEW_MODULE);
  const runtimePort = registry.provide(TASK_REVIEW_RUNTIME_PORT);
  Object.assign(runtime, runtimePort.methods);
  for (const [name, bridge] of Object.entries(runtimePort.testSupportProperties)) {
    Object.defineProperty(runtime, name, {
      configurable: true,
      enumerable: false,
      get: bridge.get,
      set: bridge.set,
    });
  }
  return descriptor;
}

function installTaskRuntimeModule(runtime, registry, definition, capability) {
  const descriptor = registry.install(definition);
  const runtimePort = registry.provide(capability);
  Object.assign(runtime, runtimePort.methods);
  for (const [name, bridge] of Object.entries(runtimePort.testSupportProperties || {})) {
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
  registerInfrastructure(runtime);
  registerProductInvocation(runtime);
  registry.install(createAgentAssetsRuntimeModule(runtime));
  registry.install(createWorkspaceModule(runtime, {
    readProductIdentity: readCurrentProductIdentity,
    webProfileContract,
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
  }));
  registry.install(createAgentAssetsModule(runtime));
  registerProjectGitObserver(runtime);
  registry.install(createPublicationModule(runtime));
  registry.install(createOpenSpecModule(runtime));
  registry.install(createWorktreeProviderModule(runtime));
  registry.install(createChangeModule(runtime));
  installTaskRecordModule(runtime, registry);
  registry.install(createVerificationModule(runtime));
  installTaskReviewModule(runtime, registry);
  installTaskRuntimeModule(runtime, registry, createTaskVerificationModule(runtime, { verificationDeclaration: VERIFICATION_DECLARATION }), TASK_VERIFICATION_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createParentCoordinationModule(runtime), PARENT_COORDINATION_RUNTIME_PORT);
  registry.install(createSystemInstallationModule(runtime));
  registry.install(createWebModule(runtime, { httpContributions: registry.contributions('http') }));
  registry.install(createSystemDoctorModule(runtime, {
    diagnosticContributions: registry.contributions('diagnostics'),
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
    agentCapabilityQuery: AGENT_ASSETS_CAPABILITY_QUERY,
    verificationDeclaration: VERIFICATION_DECLARATION,
    workspaceQuery: WORKSPACE_QUERY,
  }));
  const doctorApplication = registry.provide(SYSTEM_DOCTOR_APPLICATION);
  Object.assign(runtime, {
    doctor: doctorApplication.doctor,
    diagnoseWorkspaceStructuredStore: doctorApplication.diagnoseWorkspaceStructuredStore,
    gitignoreLines: doctorApplication.gitignoreLines,
    readGitRemote: doctorApplication.readGitRemote,
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
