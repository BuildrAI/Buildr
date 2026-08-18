import { registerWorkspaceInfrastructure } from '../infrastructure/filesystem/index.mjs';
import { registerWorkspaceManifestRepository } from '../infrastructure/filesystem/workspace-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { registerWorkspaceManagementFence } from '../infrastructure/filesystem/workspace-management-fence.mjs';
import { registerProjectManifestRepository } from '../infrastructure/filesystem/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from '../infrastructure/filesystem/service-manifest-repository.mjs';
import { registerWorkspaceSqlite } from '../infrastructure/sqlite/workspace-sqlite.mjs';
import { registerTaskRecordRepository } from '../infrastructure/sqlite/task-record-repository.mjs';
import { registerTaskReviewRepository } from '../infrastructure/sqlite/task-review-repository.mjs';
import { registerTaskRetrospectiveRepository } from '../infrastructure/sqlite/task-retrospective-repository.mjs';
import { registerTaskVerificationRepository } from '../infrastructure/sqlite/task-verification-repository.mjs';
import { registerTaskDevelopmentRepository } from '../infrastructure/sqlite/task-development-repository.mjs';
import { registerTaskOverviewRepository } from '../infrastructure/sqlite/task-overview-repository.mjs';
import { registerTaskFinishRepository } from '../infrastructure/sqlite/task-finish-repository.mjs';
import { registerTaskExecutionRecordRepository } from '../infrastructure/sqlite/task-execution-record-repository.mjs';
import { registerTaskExecutionRecordBodyStore } from '../infrastructure/filesystem/task-execution-record-body-store.mjs';
import { registerTaskEnvironmentRepository } from '../infrastructure/filesystem/task-environment-repository.mjs';
import { registerContentTargetObserver } from '../infrastructure/content/content-target-observer.mjs';
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
import { registerProjectApplication } from './project/project-application.mjs';
import { registerPublicationApplication } from './publication/publication-application.mjs';
import { registerServiceApplication } from './service/service-application.mjs';
import { registerChangeApplication } from './change/change-application.mjs';
import { registerGitWorktreeProvider } from './worktree/git-worktree-provider.mjs';
import { registerTaskFinishApplication } from './task-finish/task-finish-application.mjs';
import { registerTaskTerminalDeliveryApplication } from './task-terminal-delivery/task-terminal-delivery-application.mjs';
import { registerTaskRecordApplication } from './task-record/task-record-application.mjs';
import { registerTaskReviewApplication } from './task-review/task-review-application.mjs';
import { registerTaskRetrospectiveApplication } from './task-retrospective/task-retrospective-application.mjs';
import { registerTaskVerificationApplication } from './task-verification/task-verification-application.mjs';
import { registerTaskDevelopmentApplication } from './task-development/task-development-application.mjs';
import { registerTaskEntrySnapshotApplication } from './task-entry/task-entry-snapshot-application.mjs';
import { registerTaskPlanningIdentityApplication } from './task-planning-identity/task-planning-identity-application.mjs';
import { registerTaskOverviewApplication } from './task-overview/task-overview-application.mjs';
import { registerParentCoordinationApplication } from './parent-coordination/parent-coordination-application.mjs';
import { registerTaskEnvironmentApplication } from './task-environment/task-environment-application.mjs';
import { registerTaskExecutionRecordApplication } from './task-execution-record/task-execution-record-application.mjs';
import { registerVerificationApplication } from './verification/verification-application.mjs';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.mjs';
import { registerProductInstallationStatus } from './product-installation-status.mjs';
import * as platform from '../infrastructure/platform.mjs';

const REGISTRATIONS = [
  registerWorkspaceInfrastructure,
  registerProductInvocation,
  registerWorkspaceManifestRepository,
  registerWorkspaceRegistryRepository,
  registerWorkspaceManagementFence,
  registerDomainsRuntime,
  registerDomainsWorkspace,
  registerProjectManifestRepository,
  registerServiceManifestRepository,
  registerWorkspaceSqlite,
  registerTaskRecordRepository,
  registerTaskReviewRepository,
  registerTaskRetrospectiveRepository,
  registerTaskVerificationRepository,
  registerTaskDevelopmentRepository,
  registerTaskOverviewRepository,
  registerTaskFinishRepository,
  registerTaskExecutionRecordRepository,
  registerTaskExecutionRecordBodyStore,
  registerTaskEnvironmentRepository,
  registerContentTargetObserver,
  registerProjectGitObserver,
  registerDomainsComponents,
  registerDomainsCommands,
  registerDomainsRules,
  registerDomainsOpenspec,
  registerApplicationDoctor,
  registerDomainsPackageAssets,
  registerDomainsSkills,
  registerWorkspaceApplication,
  registerProjectApplication,
  registerPublicationApplication,
  registerServiceApplication,
  registerChangeApplication,
  registerApplicationPackageMaintenance,
  registerApplicationWorkspaceOperations,
  registerApplicationCliUpdate,
  registerProductInstallationStatus,
  registerApplicationRuntime,
  registerGitWorktreeProvider,
  registerTaskEnvironmentApplication,
  registerTaskRecordApplication,
  registerTaskExecutionRecordApplication,
  registerTaskReviewApplication,
  registerTaskRetrospectiveApplication,
  registerTaskVerificationApplication,
  registerTaskDevelopmentApplication,
  registerTaskEntrySnapshotApplication,
  registerTaskPlanningIdentityApplication,
  registerParentCoordinationApplication,
  registerTaskOverviewApplication,
  registerVerificationApplication,
  registerTaskFinishApplication,
  registerTaskTerminalDeliveryApplication,
];

export function createRuntime() {
  const runtime = { ...platform };
  for (const register of REGISTRATIONS) register(runtime);
  return runtime;
}
