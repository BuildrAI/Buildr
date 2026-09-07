import * as platform from '../infrastructure/platform.ts';
import {
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_DIAGNOSTICS_BINDER,
  AGENT_ASSETS_INTERNAL,
  AGENT_ASSETS_RUNTIME,
  createAgentAssetsModule,
  createAgentAssetsRuntimeModule,
} from '../modules/agent-assets/module.ts';
import {
  TASK_RUNTIME_PORT,
  TASK_CHANGE_BINDER,
  TASK_QUERY_APPLICATION,
  TASK_MODULE,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_REVIEW_MODULE,
  TASK_VERIFICATION_RUNTIME_PORT,
  PARENT_COORDINATION_RUNTIME_PORT,
  createWorktreeProviderModule,
  createTaskVerificationModule,
  createParentCoordinationModule,
} from '../modules/task/module.ts';
import { createModuleRegistry } from './module-registry.ts';
import { createWebModule } from '../web/module.ts';
import { createWorkspaceModule, WORKSPACE_AGENT_ASSETS_BINDER, WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_BINDER } from '../modules/workspace/module.ts';
import { createSystemInstallationModule, readCurrentProductIdentity, SYSTEM_INSTALLATION_APPLICATION } from '../modules/installation/module.ts';
import { createSystemDoctorModule, SYSTEM_DOCTOR_APPLICATION } from '../modules/diagnostics/module.ts';
import { registerInfrastructure } from '../infrastructure/index.ts';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.ts';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.ts';
import { createPublicationModule } from '../modules/publication/module.ts';
import { createOpenSpecModule } from '../modules/openspec/module.ts';
import { CHANGE_APPLICATION, createChangeModule } from '../modules/task/change/module.ts';
import { VERIFICATION_DECLARATION, createVerificationModule } from '../modules/project-testing/module.ts';
import * as webProfileContract from '../modules/installation/contracts/web-profile.ts';

const RUNTIME_CONTEXT = new WeakMap();

export function createRuntime(): any  {
  const runtime: any = { ...platform };
  registerInfrastructure(runtime);
  registerProductInvocation(runtime);
  const registry = createModuleRegistry();
  registry.install(createAgentAssetsRuntimeModule());
  registry.install(createWorkspaceModule(runtime, {
    readProductIdentity: readCurrentProductIdentity,
    webProfileContract,
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
  }));
  registry.install(createAgentAssetsModule(runtime));
  registry.provide(WORKSPACE_AGENT_ASSETS_BINDER).bindAgentAssets(registry.provide(AGENT_ASSETS_INTERNAL));
  registerProjectGitObserver(runtime);
  registry.install(createPublicationModule(runtime));
  registry.install(createOpenSpecModule(runtime));
  registry.install(TASK_MODULE);
  registry.provide(WORKSPACE_TASK_BINDER).bindTaskQuery(registry.provide(TASK_QUERY_APPLICATION));
  registry.install(createWorktreeProviderModule(runtime));
  registry.install(createChangeModule(runtime));
  registry.provide(TASK_CHANGE_BINDER).bindChangeResolver(registry.provide(CHANGE_APPLICATION));
  registry.install(createVerificationModule(runtime));
  registry.install(TASK_REVIEW_MODULE);
  registry.install(createTaskVerificationModule(runtime, { verificationDeclaration: VERIFICATION_DECLARATION }));
  registry.install(createParentCoordinationModule(runtime));
  registry.install(createSystemInstallationModule(runtime));
  registry.install(createWebModule(runtime, { httpContributions: registry.contributions('http') }));
  registry.install(createSystemDoctorModule(runtime, {
    diagnosticContributions: registry.contributions('diagnostics'),
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
    agentCapabilityQuery: AGENT_ASSETS_CAPABILITY_QUERY,
    agentAssetsInternal: AGENT_ASSETS_INTERNAL,
    verificationDeclaration: VERIFICATION_DECLARATION,
    workspaceQuery: WORKSPACE_QUERY,
    installationApplication: SYSTEM_INSTALLATION_APPLICATION,
    workspaceApplication: WORKSPACE_APPLICATION,
  }));
  registry.provide(AGENT_ASSETS_DIAGNOSTICS_BINDER).bindDiagnostics(registry.provide(SYSTEM_DOCTOR_APPLICATION));
  RUNTIME_CONTEXT.set(runtime, Object.freeze({ registry }));
  Object.defineProperty(runtime, '__bootstrapContributions', {
    enumerable: false,
    configurable: false,
    value: (type: any) => registry.contributions(type),
  });
  return runtime;
}

function context(runtime: any): any  {
  const value = RUNTIME_CONTEXT.get(runtime);
  if (!value) {
    const error: Error & Record<string, any> = new Error('Runtime is not owned by the Buildr Bootstrap.');
    error.code = 'bootstrap_runtime_not_owned';
    throw error;
  }
  return value;
}

export function runtimeProvide(runtime: any, capability: any): any  {
  return context(runtime).registry.provide(capability);
}

export function runtimeContributions(runtime: any, type: any): any  {
  return context(runtime).registry.contributions(type);
}

export function runtimeModuleSnapshot(runtime: any): any  {
  return context(runtime).registry.snapshot();
}

export function startRuntime(runtime: any): any  {
  return context(runtime).registry.start();
}

export function stopRuntime(runtime: any): any  {
  return context(runtime).registry.stop();
}
