import { createRegistryMaintenance } from './application/registry-maintenance.ts';
import { registerWorkspaceQueryApplication, type WorkspaceQueryApplicationRuntime } from './application/workspace-query-application.ts';
import { ensureRegisteredTarget, registerWorkspaceCommandApplication, type WorkspaceCommandApplicationRuntime } from './application/workspace-command-application.ts';
import { registerWorkspaceOperations, type WorkspaceOperationsRuntime } from './application/workspace-operations.ts';
import { registerProjectApplication, type ProjectApplicationRuntime } from './application/project-application.ts';
import { registerServiceApplication, type ServiceApplicationRuntime } from './application/service-application.ts';
import { createWorkspaceManifestRepository, type WorkspaceManifestRepositoryRuntime } from './persistence/workspace-manifest-repository.ts';
import { createProjectManifestRepository, type ProjectManifestRepositoryRuntime } from './persistence/project-manifest-repository.ts';
import { createServiceManifestRepository, type ServiceManifestRepositoryRuntime } from './persistence/service-manifest-repository.ts';
import { createWorkspaceRegistryRepository, type WorkspaceRegistryRepositoryRuntime } from './persistence/workspace-registry-repository.ts';
import { projectCreateCommand } from './interfaces/cli/project.ts';
import { serviceCreateCommand } from './interfaces/cli/service.ts';
import { workspaceCommand } from './interfaces/cli/workspace.ts';
import { createWorkspaceHttpContribution } from './interfaces/http/workspace-http.ts';
import { defaultAssetDescription, sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
import { createWorkspaceSourceFilesystem, resolveSourceRoot } from './infrastructure/workspace-source-filesystem.ts';
import { registerWorkspaceManagementFence } from './infrastructure/workspace-management-fence.ts';
import type { WorkspaceManagementFenceRuntime } from './infrastructure/workspace-management-fence.ts';
import { registerWorkspaceSourceGit, type WorkspaceSourceGitRuntime } from './infrastructure/workspace-source-git.ts';
import { createWorkspaceDiagnostics } from './application/diagnostics/index.ts';
import { createProject as createProjectEntity } from './domain/project.ts';
import { createService as createServiceEntity } from './domain/service.ts';

type DynamicRuntime = Record<string, any>;
type WorkspacePrivateComposition = DynamicRuntime
  & WorkspaceManifestRepositoryRuntime
  & WorkspaceRegistryRepositoryRuntime
  & ProjectManifestRepositoryRuntime
  & ServiceManifestRepositoryRuntime
  & WorkspaceQueryApplicationRuntime
  & WorkspaceCommandApplicationRuntime
  & WorkspaceOperationsRuntime
  & ProjectApplicationRuntime
  & ServiceApplicationRuntime
  & WorkspaceManagementFenceRuntime
  & WorkspaceSourceGitRuntime;

export { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from './application/workspace-operations.ts';
export { createProject, createProjectSource, isProjectCode, isProjectId } from './domain/project.ts';
export { createService, createServiceSource, isServiceCode, isServiceId } from './domain/service.ts';
export { createWorkspace, isWorkspaceId } from './domain/workspace.ts';
export { sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
export { resolveSourceRoot } from './infrastructure/workspace-source-filesystem.ts';
export { parseProjectsManifest, renderProjectsManifest } from './persistence/project-manifest-repository.ts';
export { parseServicesManifest, renderServicesDomainManifest } from './persistence/service-manifest-repository.ts';
export { parseWorkspaceManifest } from './persistence/workspace-manifest-repository.ts';
export { buildrWebDataRoot, readWorkspaceRegistryFile } from './persistence/workspace-registry-repository.ts';
export { ensureRegisteredTarget } from './application/workspace-command-application.ts';
export const WORKSPACE_MODULE_ID = 'workspace-core';
export const WORKSPACE_APPLICATION = 'workspace.application';
export const PROJECT_APPLICATION = 'project.application';
export const SERVICE_APPLICATION = 'service.application';
export const WORKSPACE_QUERY = 'workspace.query';
export const WORKSPACE_RUNTIME_PORT = 'workspace.runtime-port';
export const WORKSPACE_ASSET_SUPPORT = 'workspace.asset-support';
export const WORKSPACE_DOMAIN = 'workspace.domain';
export const WORKSPACE_TASK_SUPPORT = 'workspace.task-support';
export const WORKSPACE_AGENT_ASSETS_BINDER = 'workspace.agent-assets-binder';
export const WORKSPACE_DIAGNOSTICS = 'workspace.diagnostics';

const WORKSPACE_METHODS = Object.freeze([
  'getWorkspace', 'listRegisteredWorkspaces', 'registerLocalWorkspace', 'removeRegisteredWorkspace',
  'resolveRegisteredWorkspace', 'workspaceMigrationPlan', 'migrateWorkspaceMetadata', 'updateWorkspaceMetadata',
  'generateWorkspaceCreatePrompt', 'inspectLocalWorkspaceCandidate', 'getWorkspaceGettingStarted',
  'generateStartWorkPrompt', 'diagnoseWorkspaceMetadata', 'initializeWorkspace', 'readBootstrapGuide', 'recoverWorkspaceMutation',
]);
const PROJECT_METHODS = Object.freeze([
  'readProjectRegistryRecord', 'listProjects', 'projectDetail', 'projectDocument', 'projectMigrationPlan',
  'migrateProjectRegistry', 'updateProjectMetadata', 'generateProjectCreatePrompt', 'createProjectAsset',
]);
const SERVICE_METHODS = Object.freeze([
  'readServiceRegistryRecord', 'listServices', 'serviceDetail', 'serviceDocument', 'serviceMigrationPlan',
  'migrateServiceRegistry', 'updateServiceMetadata', 'generateServiceCreatePrompt', 'createServiceAsset',
]);
const WORKSPACE_QUERY_METHODS = Object.freeze([
  'getWorkspace', 'readProjectRegistryRecord', 'readServiceRegistryRecord',
  'listProjects', 'listServices', 'projectDetail', 'serviceDetail',
  'resolveSourceRoot', 'resolveProjectRoot', 'resolveServiceRoot',
]);

// 兼容现有资产同步、Doctor、存储保护调用；每项必须有真实消费者。
const LEGACY_RUNTIME_METHODS = Object.freeze([
  'parseWorkspaceManifest', 'readWorkspaceRegistryFile', 'projectsManifestPath', 'readProjectRegistryPersistence',
  'writeProjectRegistry', 'renderProjectsManifest', 'parseProjectsYaml', 'renderProjectsYaml',
  'validateProjectsRegistry', 'writeProjectsRegistry', 'readServiceRegistryPersistence', 'writeServiceRegistry',
  'parseServicesManifest', 'renderServicesDomainManifest', 'parseServicesYaml', 'parseServicesManifestYaml',
  'renderServicesManifestYaml', 'validateServicesManifest', 'servicesManifestPath', 'writeServicesManifest',
  'defaultAssetDescription', 'sourceIdentity', 'assertWorkspaceManagementAccess', 'ensureWorkspaceManagementClaim',
  'diagnoseMutations', 'gitOutput', 'isGitUrl', 'gitCurrentBranch',
  'gitDefaultBranch', 'inferRepoKind', 'gitBoundaryFor', 'ensureGitBoundaries',
  'gitBoundaryIgnored', 'ensureRegisteredTarget', 'createProject', 'createService',
  'initBuildr', 'bootstrapGuide', 'mutationRecover',
]);
const TEST_SUPPORT_METHODS = Object.freeze([
  'readWorkspaceRegistryPersistence', 'withWorkspaceRegistryMutation',
]);

const WORKSPACE_ASSET_METHODS = ["convergeRegistryManifests","workspaceMigrationPlan","migrateWorkspaceMetadata","readProjectRegistryRecord","projectMigrationPlan","migrateProjectRegistry","projectsManifestPath","writeProjectRegistry","renderProjectsManifest","parseProjectsYaml","renderProjectsYaml","validateProjectsRegistry","writeProjectsRegistry","writeServiceRegistry","parseServicesManifest","renderServicesDomainManifest","parseServicesYaml","parseServicesManifestYaml","renderServicesManifestYaml","servicesManifestPath","writeServicesManifest","defaultAssetDescription","sourceIdentity","gitDefaultBranch","inferRepoKind","gitBoundaryFor","ensureGitBoundaries"] as const;
export type WorkspaceAssetSupport = Pick<WorkspacePrivateComposition, Exclude<typeof WORKSPACE_ASSET_METHODS[number], 'convergeRegistryManifests'>> & ReturnType<typeof createRegistryMaintenance>;

function pick(source: WorkspacePrivateComposition, methods: readonly string[]) {
  for (const method of methods) {
    if (typeof source[method] !== 'function') throw new TypeError(`Workspace dependency is missing: ${method}`);
  }
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => source[method](...args)])));
}

export function createWorkspaceCliContributions(applications: { workspace?: any; project?: any; service?: any } = {}) {
  return Object.freeze([
    Object.freeze({
      key: 'init', surface: 'primary',
      summary: '首次 onboarding 推荐传入 --agent：初始化源资产后复用完整 sync，并以最终 doctor 通过作为技术完成条件；随后由 Agent 根据真实 Project/Service 状态完成简短首次使用交接并邀请第一项工作。',
      help: [
        'Usage: buildr init [--agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy>] [--target <dir>] [--name <name>] [--description <text>] [--profile <personal|team|company>]', '',
        '首次 onboarding 推荐传入 --agent：初始化源资产后复用完整 sync，并以最终 doctor 通过作为技术完成条件；随后由 Agent 根据真实 Project/Service 状态完成简短首次使用交接并邀请第一项工作。',
        '不传 --agent 时只初始化源资产；已有 workspace 的日常更新继续使用 buildr sync <agent>。',
        '未提供 --description 时写入明确 TODO，并由 doctor 提示补全。',
        '--help 只输出帮助，不会写入文件。',
      ],
      match: ({ domain }: any) => domain === 'init',
      run: (runtime: any, context: any) => workspaceCommand(applications.workspace || runtime, 'init', context.argv.slice(3)),
    }),
    Object.freeze({
      key: 'bootstrap guide', surface: 'primary', summary: '输出最小 bootstrap 指南。',
      help: ['Usage: buildr bootstrap guide', '', '输出最小 bootstrap 指南。'],
      match: ({ domain, action }: any) => domain === 'bootstrap' && action === 'guide',
      run: (runtime: any) => workspaceCommand(applications.workspace || runtime, 'bootstrap-guide'),
    }),
    Object.freeze({
      key: 'mutation recover', surface: 'agent-machine',
      summary: '从完整 transaction journal 和 backup 恢复操作前源资产；不会猜测或接受半完成新状态。',
      help: ['Usage: buildr mutation recover <transaction-id> [--target <dir>]', '', '从完整 transaction journal 和 backup 恢复操作前源资产；不会猜测或接受半完成新状态。'],
      match: ({ domain, action }: any) => domain === 'mutation' && action === 'recover',
      run: (runtime: any, context: any) => workspaceCommand(applications.workspace || runtime, 'mutation-recover', context.argv.slice(4)),
    }),
    Object.freeze({
      key: 'project create', surface: 'primary',
      summary: '创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。',
      help: [
        'Usage: buildr project create <code> [--target <dir>] [--name <text>] [--description <text>] [--repo <git-url> | --attach <absolute-git-root>] [--remote <name>] [--integration-branch <branch>]',
        '',
        '创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。',
        '不传 --repo 时 Project 跟随 root Workspace Git；传入 --repo 时 remote 与 integration branch 是稳定声明，不是当前 checkout 状态。',
        '--attach 只登记已存在的独立 Git root；不会 clone、copy、move、repair、checkout 或取得外部内容 ownership。',
        '--title 继续作为 --name 的 legacy compatibility 输入，但 canonical help 和输出统一使用 --name。',
        'Project baseline 包含 commands.yml；它只引用 workspace Command catalog，不复制 executable、probe 或 install hint。',
      ],
      match: ({ domain, action }: any) => domain === 'project' && action === 'create',
      run: (runtime: any, context: any) => projectCreateCommand(applications.project || runtime, context.argv.slice(4)),
    }),
    Object.freeze({
      key: 'service create', surface: 'primary',
      summary: '创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。',
      help: [
        'Usage: buildr service create <project>/<service> [<repo-ref> | --attach <absolute-git-root>] [--target <dir>] [--name <text>] [--description <text>] [--type <type>] [--remote <name>] [--integration-branch <branch>] [--json]',
        '',
        '创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。',
        'Git remote 与 integration branch 是稳定声明；current branch、HEAD、dirty 和 upstream 状态只实时观察。',
        '--attach 只登记已存在的独立 Git root，不复制或修改外部 repository 内容。',
        '--title 和 --branch 继续作为 --name、--integration-branch 的 legacy compatibility 输入。',
        'Service 规则入口是 Service 目录中的 AGENTS.md，不在 Service registry 中记录规则路径。',
      ],
      match: ({ domain, action }: any) => domain === 'service' && action === 'create',
      run: (runtime: any, context: any) => serviceCreateCommand(applications.service || runtime, context.argv.slice(4)),
    }),
  ]);
}

export function createWorkspaceModule(runtime: DynamicRuntime, { readProductIdentity, webProfileContract, agentRuntimeCapability = null }: any = {}) {
  return Object.freeze({
    id: WORKSPACE_MODULE_ID,
    requires: Object.freeze(agentRuntimeCapability ? [agentRuntimeCapability] : []),
    create(requires: any) {
      const agentRuntime = agentRuntimeCapability ? requires[agentRuntimeCapability] : {};
      const privateComposition = Object.assign(Object.create(runtime), agentRuntime) as WorkspacePrivateComposition;
      const workspaceRepository = createWorkspaceManifestRepository(privateComposition);
      Object.assign(privateComposition, { workspaceRepository }, workspaceRepository);
      const registryRepository = createWorkspaceRegistryRepository(privateComposition, { readProductIdentity, resolveWebProfile: webProfileContract?.resolveWebProfile });
      Object.assign(privateComposition, { registryRepository }, registryRepository);
      const projectRepository = createProjectManifestRepository(privateComposition);
      Object.assign(privateComposition, { projectRepository }, projectRepository);
      const serviceRepository = createServiceManifestRepository(privateComposition);
      Object.assign(privateComposition, { serviceRepository }, serviceRepository);
      Object.assign(privateComposition, {
        sourceFiles: createWorkspaceSourceFilesystem(),
        defaultAssetDescription,
        resolveSourceRoot,
        resolveProjectRoot: (targetRoot: any, project: any) => resolveSourceRoot(targetRoot, project.source),
        resolveServiceRoot: (targetRoot: any, service: any) => resolveSourceRoot(targetRoot, service.source),
        sourceIdentity,
        sourceOwnership,
        sourceRootKind,
      });
      registerWorkspaceQueryApplication(privateComposition);
      registerWorkspaceManagementFence(privateComposition, { oppositeWebProfile: webProfileContract?.oppositeWebProfile });
      registerWorkspaceCommandApplication(privateComposition);
      registerWorkspaceOperations(privateComposition);
      registerWorkspaceSourceGit(privateComposition);
      registerProjectApplication(privateComposition);
      registerServiceApplication(privateComposition);

      const registryMaintenance = createRegistryMaintenance({
        readGitRemote: privateComposition.readGitRemote,
        isPlainObject: privateComposition.isPlainObject,
        gitDefaultBranch: privateComposition.gitDefaultBranch,
        defaultAssetDescription, inferRepoKind: privateComposition.inferRepoKind,
        existsDirectory: privateComposition.existsDirectory, existsFile: privateComposition.existsFile,
        parseServicesYaml: privateComposition.parseServicesYaml, parseServicesManifestYaml: privateComposition.parseServicesManifestYaml,
        servicesManifestPath: privateComposition.servicesManifestPath, ensureDirectory: privateComposition.ensureDirectory,
        toPosixRelative: privateComposition.toPosixRelative, projectsManifestPath: privateComposition.projectsManifestPath,
        ensureGitBoundaries: privateComposition.ensureGitBoundaries,
        parseServicesManifest: privateComposition.parseServicesManifest, createServiceEntity, createProjectEntity,
        observeProjectGit: (...args: any[]) => runtime.observeProjectGit(...args),
        renderServicesDomainManifest: privateComposition.renderServicesDomainManifest,
        writeServiceRegistry: privateComposition.writeServiceRegistry,
        readProjectRegistryRecord: privateComposition.readProjectRegistryRecord,
        renderProjectsManifest: privateComposition.renderProjectsManifest, writeProjectRegistry: privateComposition.writeProjectRegistry,
      });
      privateComposition.convergeRegistryManifests = registryMaintenance.convergeRegistryManifests;

      privateComposition.ensureRegisteredTarget = (targetRoot: any) => ensureRegisteredTarget(privateComposition, targetRoot);

      const workspace = Object.freeze({
        ...pick(privateComposition, WORKSPACE_METHODS),
        ensureRegisteredTarget: privateComposition.ensureRegisteredTarget,
      });
      const project = pick(privateComposition, PROJECT_METHODS);
      const service = pick(privateComposition, SERVICE_METHODS);
      const query = pick(privateComposition, WORKSPACE_QUERY_METHODS);
      const domain = Object.freeze({ createProjectEntity, createServiceEntity });
      const taskSupport = pick(privateComposition, [
        'assertCanonicalStructuredWorkspace',
        'openWorkspaceStructuredStore',
        'prepareWorkspaceStructuredStore',
        'runWorkspaceSqliteRead',
        'runWorkspaceTransaction',
        'readProjectRegistryPersistence',
        'readServiceRegistryPersistence',
        'readProjectRegistryRecord',
        'readServiceRegistryRecord',
        'memoizeWorkspaceOperation',
      ]);
      privateComposition.initBuildr = (args: string[]) => workspaceCommand(workspace as any, 'init', args);
      privateComposition.bootstrapGuide = () => workspaceCommand(workspace as any, 'bootstrap-guide');
      privateComposition.mutationRecover = (args: string[]) => workspaceCommand(workspace as any, 'mutation-recover', args);
      privateComposition.createProject = (args: string[]) => projectCreateCommand(project as any, args);
      privateComposition.createService = (args: string[]) => serviceCreateCommand(service as any, args);
      const runtimeMethods = Object.freeze({
        ...workspace, ...project, ...service, ...query,
        ...pick(privateComposition, LEGACY_RUNTIME_METHODS),
        ...pick(privateComposition, TEST_SUPPORT_METHODS),
      });
      const workspaceDiagnostics = createWorkspaceDiagnostics(privateComposition);
      let agentAssetsBound = false;
      const agentAssetsBinder = Object.freeze({
        bindAgentAssets(port: Record<string, unknown>) {
          if (agentAssetsBound) throw new Error('Workspace Agent Assets dependency is already bound.');
          Object.assign(privateComposition, port);
          agentAssetsBound = true;
        },
      });
      return Object.freeze({
        provides: {
          [WORKSPACE_APPLICATION]: workspace,
          [PROJECT_APPLICATION]: project,
          [SERVICE_APPLICATION]: service,
          [WORKSPACE_QUERY]: query,
          [WORKSPACE_RUNTIME_PORT]: Object.freeze({ methods: runtimeMethods, testSupportMethods: TEST_SUPPORT_METHODS }),
          [WORKSPACE_ASSET_SUPPORT]: pick(privateComposition, WORKSPACE_ASSET_METHODS),
          [WORKSPACE_DOMAIN]: domain,
          [WORKSPACE_TASK_SUPPORT]: taskSupport,
          [WORKSPACE_AGENT_ASSETS_BINDER]: agentAssetsBinder,
          [WORKSPACE_DIAGNOSTICS]: workspaceDiagnostics,
        },
        contributions: {
          cli: createWorkspaceCliContributions({ workspace, project, service }),
          http: [createWorkspaceHttpContribution(Object.freeze({ ...workspace, ...project, ...service }))],
          diagnostics: [Object.freeze({ id: 'workspace.diagnostics', readModel: workspaceDiagnostics })],
        },
      });
    },
  });
}
