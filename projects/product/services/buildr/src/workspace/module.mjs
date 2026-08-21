import { registerWorkspaceApplication } from './application/workspace-application.mjs';
import { registerProjectApplication } from './application/project-application.mjs';
import { registerServiceApplication } from './application/service-application.mjs';
import { registerWorkspaceManifestRepository } from './persistence/workspace-manifest-repository.mjs';
import { registerProjectManifestRepository } from './persistence/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from './persistence/service-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from './persistence/workspace-registry-repository.mjs';
import { registerWorkspaceCliAdapter } from './interfaces/cli/workspace.mjs';
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

export const WORKSPACE_MODULE_ID = 'workspace-core';
export const WORKSPACE_APPLICATION = 'workspace.application';
export const PROJECT_APPLICATION = 'project.application';
export const SERVICE_APPLICATION = 'service.application';
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
      registerWorkspaceApplication(runtime);
      registerProjectApplication(runtime);
      registerServiceApplication(runtime);
      registerWorkspaceCliAdapter(runtime);

      const workspace = pick(runtime, WORKSPACE_METHODS);
      const project = pick(runtime, PROJECT_METHODS);
      const service = pick(runtime, SERVICE_METHODS);
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
          [WORKSPACE_COMPATIBILITY]: compatibility,
        },
        contributions: {
          cli: createWorkspaceCliContributions(),
          http: [createWorkspaceHttpContribution(Object.freeze({ ...workspace, ...project, ...service }))],
        },
      });
    },
  });
}
