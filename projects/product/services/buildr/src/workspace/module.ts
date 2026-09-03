import { ensureRegisteredTarget, registerWorkspaceApplication } from './application/workspace-application.ts';
import { registerWorkspaceOperations } from './application/workspace-operations.ts';
import { registerProjectApplication } from './application/project-application.ts';
import { registerServiceApplication } from './application/service-application.ts';
import { registerProjectDailyProgressApplication } from './application/project-daily-progress-application.ts';
import { registerWorkspaceManifestRepository } from './persistence/workspace-manifest-repository.ts';
import { registerProjectManifestRepository } from './persistence/project-manifest-repository.ts';
import { registerServiceManifestRepository } from './persistence/service-manifest-repository.ts';
import { registerWorkspaceRegistryRepository } from './persistence/workspace-registry-repository.ts';
import { registerProjectDailyProgressRepository } from './persistence/project-daily-progress-repository.ts';
import { registerWorkspaceCliAdapter } from './interfaces/cli/workspace.ts';
import { projectDailyProgressCommand } from './interfaces/cli/project-daily-progress.ts';
import { createWorkspaceHttpContribution } from './interfaces/http/workspace-http.ts';
import { resolveSourceRoot, sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
import { registerWorkspaceManagementFence } from './infrastructure/workspace-management-fence.ts';

export { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from './application/workspace-root-gitignore-entries.ts';
export { createProject, createProjectSource, isProjectCode, isProjectId } from './domain/project.ts';
export { createService, createServiceSource, isServiceCode, isServiceId } from './domain/service.ts';
export { createWorkspace, isWorkspaceId } from './domain/workspace.ts';
export { resolveSourceRoot, sourceIdentity, sourceOwnership, sourceRootKind } from './domain/source-root.ts';
export { parseProjectsManifest, renderProjectsManifest } from './persistence/project-manifest-repository.ts';
export { parseServicesManifest, renderServicesDomainManifest } from './persistence/service-manifest-repository.ts';
export { parseWorkspaceManifest } from './persistence/workspace-manifest-repository.ts';
export { buildrWebDataRoot, readWorkspaceRegistryFile } from './persistence/workspace-registry-repository.ts';
export { ensureRegisteredTarget } from './application/workspace-application.ts';
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
export const PROJECT_DAILY_PROGRESS_APPLICATION = 'workspace.project-daily-progress-application';

const WORKSPACE_METHODS = Object.freeze([
  'getWorkspace', 'listRegisteredWorkspaces', 'registerLocalWorkspace', 'removeRegisteredWorkspace',
  'resolveRegisteredWorkspace', 'workspaceMigrationPlan', 'migrateWorkspaceMetadata', 'updateWorkspaceMetadata',
  'generateWorkspaceCreatePrompt', 'inspectLocalWorkspaceCandidate', 'getWorkspaceGettingStarted',
  'generateStartWorkPrompt', 'diagnoseWorkspaceMetadata',
]);
const PROJECT_METHODS = Object.freeze([
  'readProjectRegistryRecord', 'listProjects', 'projectDetail', 'projectDocument', 'projectMigrationPlan',
  'migrateProjectRegistry', 'updateProjectMetadata', 'generateProjectCreatePrompt',
]);
const SERVICE_METHODS = Object.freeze([
  'readServiceRegistryRecord', 'listServices', 'serviceDetail', 'serviceDocument', 'serviceMigrationPlan',
  'migrateServiceRegistry', 'updateServiceMetadata', 'generateServiceCreatePrompt',
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

export function createWorkspaceCliContributions() {
  return Object.freeze([
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
      run: (runtime: any, context: any) => runtime.createProject(context.argv.slice(4)),
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
      run: (runtime: any, context: any) => runtime.createService(context.argv.slice(4)),
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
      run: (runtime: any, context: any) => projectDailyProgressCommand(runtime, 'record', context.argv.slice(5)),
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
      run: (runtime: any, context: any) => projectDailyProgressCommand(runtime, 'inspect', context.argv.slice(5)),
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
      run: (runtime: any, context: any) => projectDailyProgressCommand(runtime, 'list', context.argv.slice(5)),
    }),
  ]);
}

export function createWorkspaceModule(runtime: any, { readProductIdentity, webProfileContract, agentRuntimeCapability = null }: any = {}) {
  return Object.freeze({
    id: WORKSPACE_MODULE_ID,
    requires: Object.freeze(agentRuntimeCapability ? [agentRuntimeCapability] : []),
    create(requires: any) {
      const agentRuntime = agentRuntimeCapability ? requires[agentRuntimeCapability] : {};
      Object.assign(runtime, agentRuntime);
      registerWorkspaceManifestRepository(runtime);
      registerWorkspaceRegistryRepository(runtime, { readProductIdentity, resolveWebProfile: webProfileContract?.resolveWebProfile });
      registerProjectManifestRepository(runtime);
      registerServiceManifestRepository(runtime);
      registerProjectDailyProgressRepository(runtime);
      Object.assign(runtime, {
        resolveSourceRoot,
        resolveProjectRoot: (targetRoot: any, project: any) => resolveSourceRoot(targetRoot, project.source),
        resolveServiceRoot: (targetRoot: any, service: any) => resolveSourceRoot(targetRoot, service.source),
        sourceIdentity,
        sourceOwnership,
        sourceRootKind,
      });
      registerWorkspaceApplication(runtime);
      registerWorkspaceOperations(runtime);
      registerProjectApplication(runtime);
      registerServiceApplication(runtime);
      registerProjectDailyProgressApplication(runtime);
      registerWorkspaceCliAdapter(runtime);
      registerWorkspaceManagementFence(runtime, { oppositeWebProfile: webProfileContract?.oppositeWebProfile });
      runtime.ensureRegisteredTarget = (targetRoot: any) => ensureRegisteredTarget(runtime, targetRoot);

      const workspace = Object.freeze({
        ...pick(runtime, WORKSPACE_METHODS),
        ensureRegisteredTarget: runtime.ensureRegisteredTarget,
      });
      const project = pick(runtime, PROJECT_METHODS);
      const service = pick(runtime, SERVICE_METHODS);
      const query = pick(runtime, WORKSPACE_QUERY_METHODS);
      const dailyProgress = pick(runtime, PROJECT_DAILY_PROGRESS_METHODS);
      return Object.freeze({
        provides: {
          [WORKSPACE_APPLICATION]: workspace,
          [PROJECT_APPLICATION]: project,
          [SERVICE_APPLICATION]: service,
          [WORKSPACE_QUERY]: query,
          [PROJECT_DAILY_PROGRESS_APPLICATION]: dailyProgress,
        },
        contributions: {
          cli: createWorkspaceCliContributions(),
          http: [createWorkspaceHttpContribution(Object.freeze({ ...workspace, ...project, ...service, ...dailyProgress }))],
          diagnostics: [Object.freeze({ id: 'workspace.diagnostics', readModel: Object.freeze({ workspace, project, service, dailyProgress }) })],
        },
      });
    },
  });
}
