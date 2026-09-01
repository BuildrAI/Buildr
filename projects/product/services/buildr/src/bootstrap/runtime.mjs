import * as platform from '../infrastructure/platform.mjs';
import {
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_RUNTIME,
  createAgentAssetsModule,
  createAgentAssetsRuntimeModule,
} from '../agent-assets/module.mjs';
import {
  TASK_RECORD_RUNTIME_PORT,
  TASK_RECORD_MODULE,
  TASK_RETROSPECTIVE_RUNTIME_PORT,
  TASK_RETROSPECTIVE_MODULE,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_REVIEW_MODULE,
  TASK_ENVIRONMENT_RUNTIME_PORT,
  TASK_ENVIRONMENT_DECLARATION,
  TASK_WORKTREE_PROVIDER,
  TASK_VERIFICATION_RUNTIME_PORT,
  TASK_PLANNING_IDENTITY_RUNTIME_PORT,
  TASK_DEVELOPMENT_RUNTIME_PORT,
  PARENT_COORDINATION_RUNTIME_PORT,
  TASK_OVERVIEW_RUNTIME_PORT,
  TASK_ENTRY_SNAPSHOT_RUNTIME_PORT,
  TASK_FINISH_RUNTIME_PORT,
  TASK_TERMINAL_DELIVERY_RUNTIME_PORT,
  createTaskEnvironmentModule,
  createWorktreeProviderModule,
  createTaskVerificationModule,
  createTaskPlanningIdentityModule,
  createTaskDevelopmentModule,
  createParentCoordinationModule,
  createTaskOverviewModule,
  createTaskEntrySnapshotModule,
  createTaskFinishModule,
  createTaskTerminalDeliveryModule,
} from '../task/module.mjs';
import { createModuleRegistry } from './module-registry.mjs';
import { createWebModule } from '../web/module.mjs';
import { createWorkspaceModule, WORKSPACE_QUERY } from '../workspace/module.mjs';
import { createSystemInstallationModule, readCurrentProductIdentity } from '../system/installation/module.mjs';
import { createSystemDoctorModule, SYSTEM_DOCTOR_APPLICATION } from '../system/doctor/module.mjs';
import { registerInfrastructure } from '../infrastructure/index.mjs';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.mjs';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.mjs';
import { createPublicationModule } from '../system/publication/module.mjs';
import { createOpenSpecModule } from '../task/openspec/module.mjs';
import { createChangeModule } from '../task/change/module.mjs';
import { VERIFICATION_DECLARATION, createVerificationModule } from '../verification/module.ts';
import * as webProfileContract from '../system/installation/contracts/web-profile.mjs';

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

function installTaskRetrospectiveModule(runtime, registry) {
  const descriptor = registry.install(TASK_RETROSPECTIVE_MODULE);
  const runtimePort = registry.provide(TASK_RETROSPECTIVE_RUNTIME_PORT);
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
  registry.install(createChangeModule(runtime));
  registry.install(createWorktreeProviderModule(runtime));
  installTaskRecordModule(runtime, registry);
  installTaskRuntimeModule(runtime, registry, createTaskEnvironmentModule(runtime, {
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
    worktreeProviderCapability: TASK_WORKTREE_PROVIDER,
  }), TASK_ENVIRONMENT_RUNTIME_PORT);
  registry.install(createVerificationModule(runtime));
  installTaskReviewModule(runtime, registry);
  installTaskRetrospectiveModule(runtime, registry);
  installTaskRuntimeModule(runtime, registry, createTaskVerificationModule(runtime, { verificationDeclaration: VERIFICATION_DECLARATION }), TASK_VERIFICATION_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskPlanningIdentityModule(runtime), TASK_PLANNING_IDENTITY_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskDevelopmentModule(runtime), TASK_DEVELOPMENT_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createParentCoordinationModule(runtime), PARENT_COORDINATION_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskOverviewModule(runtime), TASK_OVERVIEW_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskEntrySnapshotModule(runtime, { agentCapabilityQuery: AGENT_ASSETS_CAPABILITY_QUERY }), TASK_ENTRY_SNAPSHOT_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskFinishModule(runtime), TASK_FINISH_RUNTIME_PORT);
  installTaskRuntimeModule(runtime, registry, createTaskTerminalDeliveryModule(runtime), TASK_TERMINAL_DELIVERY_RUNTIME_PORT);
  registry.install(createSystemInstallationModule(runtime));
  registry.install(createWebModule(runtime, { httpContributions: registry.contributions('http') }));
  registry.install(createSystemDoctorModule(runtime, {
    diagnosticContributions: registry.contributions('diagnostics'),
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
    agentCapabilityQuery: AGENT_ASSETS_CAPABILITY_QUERY,
    verificationDeclaration: VERIFICATION_DECLARATION,
    taskEnvironmentDeclaration: TASK_ENVIRONMENT_DECLARATION,
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
