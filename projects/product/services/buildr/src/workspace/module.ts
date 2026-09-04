import { registerWorkspaceQueryApplication, type WorkspaceQueryApplicationRuntime } from './application/workspace-query-application.ts';
import { ensureRegisteredTarget, registerWorkspaceCommandApplication, type WorkspaceCommandApplicationRuntime } from './application/workspace-command-application.ts';
import { registerWorkspaceOperations, type WorkspaceOperationsRuntime } from './application/workspace-operations.ts';
import { registerProjectApplication, type ProjectApplicationRuntime } from './application/project-application.ts';
import { registerServiceApplication, type ServiceApplicationRuntime } from './application/service-application.ts';
import { registerProjectDailyProgressApplication, type ProjectDailyProgressApplicationRuntime } from './application/project-daily-progress-application.ts';
import { registerWorkspaceManifestRepository, type WorkspaceManifestRepositoryRuntime } from './persistence/workspace-manifest-repository.ts';
import { registerProjectManifestRepository, type ProjectManifestRepositoryRuntime } from './persistence/project-manifest-repository.ts';
import { registerServiceManifestRepository, type ServiceManifestRepositoryRuntime } from './persistence/service-manifest-repository.ts';
import { registerWorkspaceRegistryRepository, type WorkspaceRegistryRepositoryRuntime } from './persistence/workspace-registry-repository.ts';
import { registerProjectDailyProgressRepository, type ProjectDailyProgressRepositoryRuntime } from './persistence/project-daily-progress-repository.ts';
import { projectCreateCommand } from './interfaces/cli/project.ts';
import { serviceCreateCommand } from './interfaces/cli/service.ts';
import { workspaceCommand } from './interfaces/cli/workspace.ts';
import { projectDailyProgressCommand } from './interfaces/cli/project-daily-progress.ts';
import { createWorkspaceHttpContribution } from './interfaces/http/workspace-http.ts';
import { resolveSourceRoot, sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
import { registerWorkspaceManagementFence } from './infrastructure/workspace-management-fence.ts';
import type { WorkspaceManagementFenceRuntime } from './infrastructure/workspace-management-fence.ts';
import { registerSourceCreationPolicy, type SourceCreationPolicyRuntime } from './application/source-creation-policy.ts';
import { registerProjectCreationApplication, type ProjectCreationRuntime } from './application/project-creation-application.ts';
import { registerServiceCreationApplication, type ServiceCreationRuntime } from './application/service-creation-application.ts';
import { registerWorkspaceSourceGit, type WorkspaceSourceGitRuntime } from './infrastructure/workspace-source-git.ts';

type DynamicRuntime = Record<string, any>;
type WorkspacePrivateComposition = DynamicRuntime
  & WorkspaceManifestRepositoryRuntime
  & WorkspaceRegistryRepositoryRuntime
  & ProjectManifestRepositoryRuntime
  & ServiceManifestRepositoryRuntime
  & ProjectDailyProgressRepositoryRuntime
  & WorkspaceQueryApplicationRuntime
  & WorkspaceCommandApplicationRuntime
  & WorkspaceOperationsRuntime
  & ProjectApplicationRuntime
  & ServiceApplicationRuntime
  & ProjectDailyProgressApplicationRuntime
  & WorkspaceManagementFenceRuntime
  & SourceCreationPolicyRuntime
  & WorkspaceSourceGitRuntime
  & ProjectCreationRuntime
  & ServiceCreationRuntime;

export { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from './application/workspace-root-gitignore-entries.ts';
export { createProject, createProjectSource, isProjectCode, isProjectId } from './domain/project.ts';
export { createService, createServiceSource, isServiceCode, isServiceId } from './domain/service.ts';
export { createWorkspace, isWorkspaceId } from './domain/workspace.ts';
export { resolveSourceRoot, sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
export { parseProjectsManifest, renderProjectsManifest } from './persistence/project-manifest-repository.ts';
export { parseServicesManifest, renderServicesDomainManifest } from './persistence/service-manifest-repository.ts';
export { parseWorkspaceManifest } from './persistence/workspace-manifest-repository.ts';
export { buildrWebDataRoot, readWorkspaceRegistryFile } from './persistence/workspace-registry-repository.ts';
export { ensureRegisteredTarget } from './application/workspace-command-application.ts';
export {
  PROJECT_DAILY_PROGRESS_SCHEMA,
  PROJECT_DAILY_PROGRESS_SCHEMA_V1,
  createDailyProgressDocument,
  dailyProgressError,
  groupDailyProgressCommits,
  isDailyProgressDate,
  isLegacyDailyProgressDocument,
  localCalendarDate,
  normalizeDailyProgressDate,
  normalizeDailyProgressDocument,
  normalizeDailyProgressGroup,
  normalizeDailyProgressPayload,
} from './domain/project-daily-progress.ts';

export const WORKSPACE_MODULE_ID = 'workspace-core';
export const WORKSPACE_APPLICATION = 'workspace.application';
export const PROJECT_APPLICATION = 'project.application';
export const SERVICE_APPLICATION = 'service.application';
export const WORKSPACE_QUERY = 'workspace.query';
export const WORKSPACE_RUNTIME_PORT = 'workspace.runtime-port';
export const PROJECT_DAILY_PROGRESS_APPLICATION = 'workspace.project-daily-progress-application';

const WORKSPACE_METHODS = Object.freeze([
  'getWorkspace', 'listRegisteredWorkspaces', 'registerLocalWorkspace', 'removeRegisteredWorkspace',
  'resolveRegisteredWorkspace', 'workspaceMigrationPlan', 'migrateWorkspaceMetadata', 'updateWorkspaceMetadata',
  'generateWorkspaceCreatePrompt', 'inspectLocalWorkspaceCandidate', 'getWorkspaceGettingStarted',
  'generateStartWorkPrompt', 'diagnoseWorkspaceMetadata', 'initBuildr', 'bootstrapGuide', 'mutationRecover',
]);
const PROJECT_METHODS = Object.freeze([
  'readProjectRegistryRecord', 'listProjects', 'projectDetail', 'projectDocument', 'projectMigrationPlan',
  'migrateProjectRegistry', 'updateProjectMetadata', 'generateProjectCreatePrompt', 'createProjectAsset',
]);
const SERVICE_METHODS = Object.freeze([
  'readServiceRegistryRecord', 'listServices', 'serviceDetail', 'serviceDocument', 'serviceMigrationPlan',
  'migrateServiceRegistry', 'updateServiceMetadata', 'generateServiceCreatePrompt', 'createServiceAsset',
]);
const PROJECT_DAILY_PROGRESS_METHODS = Object.freeze([
  'recordProjectDailyProgress', 'inspectProjectDailyProgress', 'listProjectDailyProgress', 'inspectTaskDailyProgress',
]);
const WORKSPACE_QUERY_METHODS = Object.freeze([
  'getWorkspace', 'readProjectRegistryRecord', 'readServiceRegistryRecord',
  'listProjects', 'listServices', 'projectDetail', 'serviceDetail',
  'resolveSourceRoot', 'resolveProjectRoot', 'resolveServiceRoot',
]);

function pick(source: any, methods: any) {
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => source[method](...args)])));
}

export function createWorkspaceCliContributions(applications: { workspace?: any; project?: any; service?: any; dailyProgress?: any } = {}) {
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
    Object.freeze({
      key: 'project daily-progress record', surface: 'agent-machine',
      summary: '把 Agent 已构造的 Git 提交日摘要写入本机每日演进文件；Task 关联可选，不进入 Git 或 Task SQLite。',
      help: [
        'Usage: buildr project daily-progress record --project <code> [--date <YYYY-MM-DD>] --input <payload.json> [--target <canonical-workspace>] [--json]',
        '       buildr project daily-progress record --schema|--example [--json]',
        '',
        '把 Agent 已构造的四问摘要、提交与变更文件写入 .buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml。',
        '一天一份，校验通过后原子覆盖；他人提交不得挂 Task，存在的 Task ID 必须本机已有，否则整次失败且不写文件。',
        '该命令写本机文件并可关联本机 Task Record，不进入 Git 或 Task SQLite，也不扫描 Git，不是 primary 人类主路径。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'project' && action === 'daily-progress' && runtimeId === 'record',
      run: (runtime: any, context: any) => projectDailyProgressCommand(applications.dailyProgress || runtime, 'record', context.argv.slice(5)),
    }),
    Object.freeze({
      key: 'project daily-progress inspect', surface: 'agent-machine',
      summary: '只读查看某 Project 某日已保存的每日演进，并按日、人、任务投影；不创建文件。',
      help: [
        'Usage: buildr project daily-progress inspect --project <code> [--date <YYYY-MM-DD>] [--group day|person|task] [--target <canonical-workspace>] [--json]',
        '',
        '只读查看已保存的本机每日演进文件并解析仍存在的 Task 摘要。',
        '文件不存在时返回 not-found；v1 旧文件返回 incompatible。不创建文件，也不根据 Git 或 Task 列表合成日报。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'project' && action === 'daily-progress' && runtimeId === 'inspect',
      run: (runtime: any, context: any) => projectDailyProgressCommand(applications.dailyProgress || runtime, 'inspect', context.argv.slice(5)),
    }),
    Object.freeze({
      key: 'project daily-progress list', surface: 'agent-machine',
      summary: '只读列出某 Project 已保存的每日演进日期；不扫描 Git，不写文件。',
      help: [
        'Usage: buildr project daily-progress list --project <code> [--target <canonical-workspace>] [--json]',
        '',
        '只读列出 .buildr/daily-progress/<project-code>/ 中已保存的日期。不扫描 Git，也不把目录缺失解释为远端数据丢失。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'project' && action === 'daily-progress' && runtimeId === 'list',
      run: (runtime: any, context: any) => projectDailyProgressCommand(applications.dailyProgress || runtime, 'list', context.argv.slice(5)),
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
      registerWorkspaceManifestRepository(privateComposition);
      registerWorkspaceRegistryRepository(privateComposition, { readProductIdentity, resolveWebProfile: webProfileContract?.resolveWebProfile });
      registerProjectManifestRepository(privateComposition);
      registerServiceManifestRepository(privateComposition);
      registerProjectDailyProgressRepository(privateComposition);
      Object.assign(privateComposition, {
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
      registerProjectApplication(privateComposition);
      registerServiceApplication(privateComposition);
      registerProjectDailyProgressApplication(privateComposition);
      registerWorkspaceSourceGit(privateComposition);
      registerSourceCreationPolicy(privateComposition);
      registerProjectCreationApplication(privateComposition);
      registerServiceCreationApplication(privateComposition);
      privateComposition.ensureRegisteredTarget = (targetRoot: any) => ensureRegisteredTarget(privateComposition, targetRoot);

      const workspace = Object.freeze({
        ...pick(privateComposition, WORKSPACE_METHODS),
        ensureRegisteredTarget: privateComposition.ensureRegisteredTarget,
      });
      const project = pick(privateComposition, PROJECT_METHODS);
      const service = pick(privateComposition, SERVICE_METHODS);
      const query = pick(privateComposition, WORKSPACE_QUERY_METHODS);
      const dailyProgress = pick(privateComposition, PROJECT_DAILY_PROGRESS_METHODS);
      privateComposition.createProject = (args: string[]) => projectCreateCommand(project as any, args);
      privateComposition.createService = (args: string[]) => serviceCreateCommand(service as any, args);
      const runtimeMethods = Object.freeze(Object.fromEntries(
        Object.entries(privateComposition).filter(([, value]) => typeof value === 'function'),
      ));
      return Object.freeze({
        provides: {
          [WORKSPACE_APPLICATION]: workspace,
          [PROJECT_APPLICATION]: project,
          [SERVICE_APPLICATION]: service,
          [WORKSPACE_QUERY]: query,
          [WORKSPACE_RUNTIME_PORT]: Object.freeze({ methods: runtimeMethods }),
          [PROJECT_DAILY_PROGRESS_APPLICATION]: dailyProgress,
        },
        contributions: {
          cli: createWorkspaceCliContributions({ workspace, project, service, dailyProgress }),
          http: [createWorkspaceHttpContribution(Object.freeze({ ...workspace, ...project, ...service, ...dailyProgress }))],
          diagnostics: [Object.freeze({ id: 'workspace.diagnostics', readModel: Object.freeze({ workspace, project, service, dailyProgress }) })],
        },
      });
    },
  });
}
