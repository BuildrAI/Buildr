import { registerWorkspaceInfrastructure } from '../infrastructure/filesystem/index.mjs';
import { registerWorkspaceManifestRepository } from '../infrastructure/filesystem/workspace-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { registerProjectManifestRepository } from '../infrastructure/filesystem/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from '../infrastructure/filesystem/service-manifest-repository.mjs';
import { registerTaskRecordRepository } from '../infrastructure/filesystem/task-record-repository.mjs';
import { registerTaskReviewRepository } from '../infrastructure/filesystem/task-review-repository.mjs';
import { registerTaskVerificationRepository } from '../infrastructure/filesystem/task-verification-repository.mjs';
import { registerTaskEnvironmentRepository } from '../infrastructure/filesystem/task-environment-repository.mjs';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.mjs';
import { registerDomainsRuntime } from './domains/runtime.mjs';
import { registerDomainsWorkspace } from './domains/workspace.mjs';
import { registerDomainsComponents } from './domains/components.mjs';
import { registerDomainsCommands } from './domains/commands.mjs';
import { registerDomainsRules } from './domains/rules.mjs';
import { registerDomainsOpenspec } from './domains/openspec.mjs';
import { registerApplicationDoctor } from './doctor.mjs';
import { registerDomainsPackageAssets } from './domains/package-assets.mjs';
import { registerDomainsSkills } from './domains/skills.mjs';
import { registerApplicationPackageMaintenance } from './package-maintenance.mjs';
import { registerApplicationWorkspaceOperations } from './workspace-operations.mjs';
import { registerApplicationRuntime } from './runtime.mjs';
import { registerApplicationCliUpdate } from './cli-update.mjs';
import { registerWorkspaceApplication } from './workspace/workspace-application.mjs';
import { registerWorkspaceNodeRuntime } from '../infrastructure/filesystem/workspace-node-runtime.mjs';
import { registerProjectApplication } from './project/project-application.mjs';
import { registerServiceApplication } from './service/service-application.mjs';
import { registerChangeApplication } from './change/change-application.mjs';
import { registerGitWorktreeProvider } from './worktree/git-worktree-provider.mjs';
import { registerTaskFinishApplication } from './task-finish/task-finish-application.mjs';
import { registerTaskRecordApplication } from './task-record/task-record-application.mjs';
import { registerTaskReviewApplication } from './task-review/task-review-application.mjs';
import { registerTaskVerificationApplication } from './task-verification/task-verification-application.mjs';
import { registerTaskEnvironmentApplication } from './task-environment/task-environment-application.mjs';
import { registerTaskEnvironmentLegacyMigration } from './task-environment/legacy-migration.mjs';
import { registerVerificationApplication } from './verification/verification-application.mjs';
import * as platform from '../infrastructure/platform.mjs';

const REGISTRATIONS = [
  registerWorkspaceInfrastructure,
  registerWorkspaceManifestRepository,
  registerWorkspaceRegistryRepository,
  registerDomainsRuntime,
  registerDomainsWorkspace,
  registerProjectManifestRepository,
  registerServiceManifestRepository,
  registerTaskRecordRepository,
  registerTaskReviewRepository,
  registerTaskVerificationRepository,
  registerTaskEnvironmentRepository,
  registerProjectGitObserver,
  registerDomainsComponents,
  registerDomainsCommands,
  registerDomainsRules,
  registerDomainsOpenspec,
  registerApplicationDoctor,
  registerDomainsPackageAssets,
  registerDomainsSkills,
  registerWorkspaceApplication,
  registerWorkspaceNodeRuntime,
  registerProjectApplication,
  registerServiceApplication,
  registerChangeApplication,
  registerApplicationPackageMaintenance,
  registerApplicationWorkspaceOperations,
  registerApplicationCliUpdate,
  registerApplicationRuntime,
  registerGitWorktreeProvider,
  registerTaskEnvironmentApplication,
  registerTaskEnvironmentLegacyMigration,
  registerTaskRecordApplication,
  registerTaskReviewApplication,
  registerTaskVerificationApplication,
  registerVerificationApplication,
  registerTaskFinishApplication,
];

export function createRuntime() {
  const runtime = { ...platform };
  for (const register of REGISTRATIONS) register(runtime);
  return runtime;
}
