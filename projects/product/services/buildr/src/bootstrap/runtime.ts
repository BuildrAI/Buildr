import { retireLegacyAgentData } from '../modules/installation/infrastructure/retire-legacy-agent-data.ts';
import { publishPackageResources, ensurePackageResources, observeSharedResourcePublication } from '../infrastructure/product-resources/shared-resources.ts';
import { AGENT_ASSETS_SOURCE_MODULE } from '../modules/agent-assets/source/module.ts';
import { createConnectionSkillsModule, CONNECTION_SKILLS_APPLICATION } from '../modules/connection-skills/module.ts';
import { SERVICE_RUNTIME_MODULE } from '../modules/service-runtime/module.ts';
import { createMySqlQueryModule } from '../modules/mysql-query/module.ts';
import { CODE_MODULE, CODE_GENERATION_APPLICATION, CODE_SOURCE_CONTROL_OBSERVATIONS } from '../modules/code/module.ts';
import { AGENT_SERVICE_APPLICATION, createAgentServiceModule } from '../modules/agent-service/module.ts';
import { WORKBENCH_MODULE } from '../modules/workbench/module.ts';
import { createKnowledgeModule } from '../modules/knowledge/module.ts';
import * as platform from '../infrastructure/platform.ts';
import {
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_DIAGNOSTICS_BINDER,
  AGENT_ASSETS_INTERNAL,
  AGENT_ASSETS_DIAGNOSTICS_READ,
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
import { createWebModule, WEB_INSTANCE_LIFECYCLE } from '../web/module.ts';
import { createWorkspaceModule, WORKSPACE_AGENT_ASSETS_BINDER, WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../modules/workspace/module.ts';
import { createSystemInstallationModule, readCurrentProductIdentity, SYSTEM_INSTALLATION_APPLICATION, SYSTEM_INSTALLATION_WEB_BINDER } from '../modules/installation/module.ts';
import { createSystemDoctorModule, SYSTEM_DOCTOR_APPLICATION } from '../modules/diagnostics/module.ts';
import { registerInfrastructure } from '../infrastructure/index.ts';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.ts';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.ts';
import { createPublicationModule } from '../modules/publication/module.ts';
import { createOpenSpecModule } from '../modules/openspec/module.ts';
import { createArtifactLifecycleModule } from '../modules/artifact-lifecycle/module.ts';
import { CHANGE_APPLICATION, createChangeModule } from '../modules/task/change/module.ts';
import { TASK_COMMITS_MODULE } from '../modules/task/commits/module.ts';
import { TASK_CHANGED_FILES_MODULE } from '../modules/task/changed-files/module.ts';
import { TASK_MATERIALS_MODULE } from '../modules/task/materials/module.ts';
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
  registry.install(createKnowledgeModule());
  registry.install(createOpenSpecModule(runtime));
  registry.install(TASK_MODULE);
  registry.install(WORKBENCH_MODULE);
  registry.install(createWorktreeProviderModule(runtime));
  registry.install(TASK_COMMITS_MODULE);
  registry.install(TASK_CHANGED_FILES_MODULE);
  registry.install(TASK_MATERIALS_MODULE);
  registry.install(createPublicationModule(runtime));
  registry.install(AGENT_ASSETS_SOURCE_MODULE);
  registry.install(createChangeModule(runtime));
  registry.install(createAgentServiceModule({ readProductIdentity: readCurrentProductIdentity, resolveWebProfile: webProfileContract.resolveWebProfile }));
  registry.install(CODE_MODULE);
  registry.install(createConnectionSkillsModule({ readProductIdentity: readCurrentProductIdentity, resolveWebProfile: webProfileContract.resolveWebProfile }));
  registry.install(SERVICE_RUNTIME_MODULE);
  registry.install(createMySqlQueryModule());
  registry.provide(TASK_CHANGE_BINDER).bindChangeResolver(registry.provide(CHANGE_APPLICATION));
  registry.install(createVerificationModule(runtime));
  registry.install(TASK_REVIEW_MODULE);
  registry.install(createTaskVerificationModule(runtime, { verificationDeclaration: VERIFICATION_DECLARATION }));
  registry.install(createParentCoordinationModule(runtime));
  registry.install(createArtifactLifecycleModule(runtime));
  registry.install(createSystemInstallationModule(runtime));
  registry.install(createWebModule(runtime, { httpContributions: registry.contributions('http'), onReady: () => {
    // start() resolves the service lazily; a synchronous throw here must not
    // escape the listen callback and kill the process.
    try { void registry.provide(AGENT_SERVICE_APPLICATION).start().catch(() => { console.warn('中断执行恢复检查未完成，已有工作记录保留。'); }); }
    catch { console.warn('中断执行恢复检查未完成，已有工作记录保留。'); }
    try {
      const profile=webProfileContract.resolveWebProfile(readCurrentProductIdentity());
      const roots=registry.provide(WORKSPACE_APPLICATION).listRegisteredWorkspaces().workspaces.filter((entry:any)=>entry.registryScope!=='shared'&&entry.workspace?.id).map((entry:any)=>entry.rootPath);
      const result=retireLegacyAgentData(profile.dataRoot,roots);
      for(const diagnostic of result.diagnostics)console.warn('旧智能体接入清理未完成：',diagnostic.path,diagnostic.message);
    } catch { console.warn('旧智能体接入清理未完成，其他功能可继续使用。'); }
  }, closeResources: async () => {
    registry.provide(CODE_SOURCE_CONTROL_OBSERVATIONS).close();
    registry.provide(CODE_GENERATION_APPLICATION).close();
    registry.provide(CONNECTION_SKILLS_APPLICATION).close();
    await Promise.all([registry.provide(AGENT_SERVICE_APPLICATION).close()]);
  } }));
  registry.provide(SYSTEM_INSTALLATION_WEB_BINDER).bindWorkspaceUpdates({
    observeResources: observeSharedResourcePublication,
    prepareResources: (expectedId?: string | null) => {try{return expectedId === undefined ? ensurePackageResources() : publishPackageResources(undefined,{expectedId});}catch(error:any){throw Object.assign(new Error('新版工作内容尚未准备好，已安装的软件会保留。请重试。',{cause:error}),{code:'update_resources_failed',diagnostic:error.message});}},
    list: () => registry.provide(WORKSPACE_APPLICATION).listRegisteredWorkspaces().workspaces.filter((entry: any) => entry.registryScope !== 'shared').map((entry: any) => ({ rootPath: entry.rootPath, workspaceId: entry.workspace?.id || null, name: entry.workspace?.name || entry.rootPath, status: 'pending', error: null })),
    prepare: (entry: any,options: any) => registry.provide(WORKSPACE_APPLICATION).prepareRegisteredWorkspace(entry,options),
  });
  registry.provide(SYSTEM_INSTALLATION_WEB_BINDER).bindWebUpdates(registry.provide(WEB_INSTANCE_LIFECYCLE));
  registry.install(createSystemDoctorModule(runtime, {
    diagnosticContributions: registry.contributions('diagnostics'),
    agentRuntimeCapability: AGENT_ASSETS_RUNTIME,
    agentCapabilityQuery: AGENT_ASSETS_CAPABILITY_QUERY,
    agentAssetsInternal: AGENT_ASSETS_DIAGNOSTICS_READ,
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
