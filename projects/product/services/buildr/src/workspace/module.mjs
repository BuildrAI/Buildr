import { registerWorkspaceApplication } from './application/workspace-application.mjs';
import { registerProjectApplication } from './application/project-application.mjs';
import { registerServiceApplication } from './application/service-application.mjs';
import { registerProjectDailyProgressApplication } from './application/project-daily-progress-application.mjs';
import { registerWorkspaceManifestRepository } from './persistence/workspace-manifest-repository.mjs';
import { registerProjectManifestRepository } from './persistence/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from './persistence/service-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from './persistence/workspace-registry-repository.mjs';
import { registerProjectDailyProgressRepository } from './persistence/project-daily-progress-repository.mjs';
import { registerWorkspaceCliAdapter } from './interfaces/cli/workspace.mjs';
import { projectDailyProgressCommand } from './interfaces/cli/project-daily-progress.mjs';
import { createWorkspaceHttpContribution } from './interfaces/http/workspace-http.mjs';

export { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from './application/workspace-root-gitignore-entries.mjs';
export { createProject, createProjectSource, isProjectCode, isProjectId } from './domain/project.mjs';
export { createService, createServiceSource, isServiceCode, isServiceId } from './domain/service.mjs';
export { createWorkspace, isWorkspaceId } from './domain/workspace.mjs';
export { parseProjectsManifest, renderProjectsManifest } from './persistence/project-manifest-repository.mjs';
export { parseServicesManifest, renderServicesDomainManifest } from './persistence/service-manifest-repository.mjs';
export { parseWorkspaceManifest } from './persistence/workspace-manifest-repository.mjs';
export { localAppDataRoot, readWorkspaceRegistryFile } from './persistence/workspace-registry-repository.mjs';
export { ensureRegisteredTarget } from './application/workspace-application.mjs';
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
} from './domain/project-daily-progress.mjs';

export const WORKSPACE_MODULE_ID = 'workspace-core';
export const WORKSPACE_APPLICATION = 'workspace.application';
export const PROJECT_APPLICATION = 'project.application';
export const SERVICE_APPLICATION = 'service.application';
export const PROJECT_DAILY_PROGRESS_APPLICATION = 'workspace.project-daily-progress-application';
export const WORKSPACE_COMPATIBILITY = 'workspace.bootstrap-compatibility';

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

function pick(source, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (...args) => source[method](...args)])));
}

export function createWorkspaceCliContributions() {
  return Object.freeze([
    Object.freeze({
      key: 'project create', surface: 'primary',
      summary: '创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。',
      help: [
        'Usage: buildr project create <code> [--target <dir>] [--name <text>] [--description <text>] [--repo <git-url>] [--remote <name>] [--integration-branch <branch>]',
        '',
        '创建或登记 Project，并把 UUID、workspaceId、code、name、description 与 source 写入 projects/manifest.yml。',
        '不传 --repo 时 Project 跟随 root Workspace Git；传入 --repo 时 remote 与 integration branch 是稳定声明，不是当前 checkout 状态。',
        '--title 继续作为 --name 的 legacy compatibility 输入，但 canonical help 和输出统一使用 --name。',
        'Project baseline 包含 commands.yml；它只引用 workspace Command catalog，不复制 executable、probe 或 install hint。',
      ],
      match: ({ domain, action }) => domain === 'project' && action === 'create',
      run: (runtime, context) => runtime.createProject(context.argv.slice(4)),
    }),
    Object.freeze({
      key: 'service create', surface: 'primary',
      summary: '创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。',
      help: [
        'Usage: buildr service create <project>/<service> <repo-ref> [--target <dir>] [--name <text>] [--description <text>] [--type <type>] [--remote <name>] [--integration-branch <branch>] [--json]',
        '',
        '创建或登记 Service，并把 UUID、workspaceId、projectId、code、name、description、type 与 source 写入所属 Project 的 services/manifest.yml。',
        'Git remote 与 integration branch 是稳定声明；current branch、HEAD、dirty 和 upstream 状态只实时观察。',
        '--title 和 --branch 继续作为 --name、--integration-branch 的 legacy compatibility 输入。',
        'Service 规则入口是 Service 目录中的 AGENTS.md，不在 Service registry 中记录规则路径。',
      ],
      match: ({ domain, action }) => domain === 'service' && action === 'create',
      run: (runtime, context) => runtime.createService(context.argv.slice(4)),
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
      match: ({ domain, action, runtimeId }) => domain === 'project' && action === 'daily-progress' && runtimeId === 'record',
      run: (runtime, context) => projectDailyProgressCommand(runtime, 'record', context.argv.slice(5)),
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
      match: ({ domain, action, runtimeId }) => domain === 'project' && action === 'daily-progress' && runtimeId === 'inspect',
      run: (runtime, context) => projectDailyProgressCommand(runtime, 'inspect', context.argv.slice(5)),
    }),
    Object.freeze({
      key: 'project daily-progress list', surface: 'agent-machine',
      summary: '只读列出某 Project 已保存的每日演进日期；不扫描 Git，不写文件。',
      help: [
        'Usage: buildr project daily-progress list --project <code> [--target <canonical-workspace>] [--json]',
        '',
        '只读列出 .buildr/daily-progress/<project-code>/ 中已保存的日期。不扫描 Git，也不把目录缺失解释为远端数据丢失。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'project' && action === 'daily-progress' && runtimeId === 'list',
      run: (runtime, context) => projectDailyProgressCommand(runtime, 'list', context.argv.slice(5)),
    }),
  ]);
}

export function createWorkspaceModule(runtime, { readProductIdentity } = {}) {
  return Object.freeze({
    id: WORKSPACE_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerWorkspaceManifestRepository(runtime);
      registerWorkspaceRegistryRepository(runtime, { readProductIdentity });
      registerProjectManifestRepository(runtime);
      registerServiceManifestRepository(runtime);
      registerProjectDailyProgressRepository(runtime);
      registerWorkspaceApplication(runtime);
      registerProjectApplication(runtime);
      registerServiceApplication(runtime);
      registerProjectDailyProgressApplication(runtime);
      registerWorkspaceCliAdapter(runtime);

      const workspace = pick(runtime, WORKSPACE_METHODS);
      const project = pick(runtime, PROJECT_METHODS);
      const service = pick(runtime, SERVICE_METHODS);
      const dailyProgress = pick(runtime, PROJECT_DAILY_PROGRESS_METHODS);
      const compatibility = Object.freeze({
        owner: 'workspace-capabilities',
        scope: 'existing runtime consumers only',
        exit: 'remove per consumer as Agent Assets, Web and System modules migrate; delete in legacy-exit-and-conformance',
      });
      return Object.freeze({
        provides: {
          [WORKSPACE_APPLICATION]: workspace,
          [PROJECT_APPLICATION]: project,
          [SERVICE_APPLICATION]: service,
          [PROJECT_DAILY_PROGRESS_APPLICATION]: dailyProgress,
          [WORKSPACE_COMPATIBILITY]: compatibility,
        },
        contributions: {
          cli: createWorkspaceCliContributions(),
          http: [createWorkspaceHttpContribution(Object.freeze({ ...workspace, ...project, ...service, ...dailyProgress }))],
        },
      });
    },
  });
}
