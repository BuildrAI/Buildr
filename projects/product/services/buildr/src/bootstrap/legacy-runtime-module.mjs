import { registerWorkspaceInfrastructure } from '../infrastructure/filesystem/index.mjs';
import { registerProjectDailyProgressStore } from '../infrastructure/filesystem/project-daily-progress-store.mjs';
import { registerWorkspaceManifestRepository } from '../infrastructure/filesystem/workspace-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { registerWorkspaceManagementFence } from '../infrastructure/filesystem/workspace-management-fence.mjs';
import { registerProjectManifestRepository } from '../infrastructure/filesystem/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from '../infrastructure/filesystem/service-manifest-repository.mjs';
import { registerWorkspaceSqlite } from '../infrastructure/sqlite/workspace-sqlite.mjs';
import { registerTaskReviewRepository } from '../infrastructure/sqlite/task-review-repository.mjs';
import { registerTaskRetrospectiveRepository } from '../infrastructure/sqlite/task-retrospective-repository.mjs';
import { registerTaskVerificationRepository } from '../infrastructure/sqlite/task-verification-repository.mjs';
import { registerTaskDevelopmentRepository } from '../infrastructure/sqlite/task-development-repository.mjs';
import { registerTaskOverviewRepository } from '../infrastructure/sqlite/task-overview-repository.mjs';
import { registerParentCoordinationRepository } from '../infrastructure/sqlite/parent-coordination-repository.mjs';
import { registerTaskFinishRepository } from '../infrastructure/sqlite/task-finish-repository.mjs';
import { registerTaskExecutionRecordRepository } from '../infrastructure/sqlite/task-execution-record-repository.mjs';
import { registerTaskExecutionRecordBodyStore } from '../infrastructure/filesystem/task-execution-record-body-store.mjs';
import { registerTaskEnvironmentRepository } from '../infrastructure/filesystem/task-environment-repository.mjs';
import { registerContentTargetObserver } from '../infrastructure/content/content-target-observer.mjs';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.mjs';
import { registerDomainsRuntime } from '../application/domains/runtime.mjs';
import { registerDomainsWorkspace } from '../application/domains/workspace.mjs';
import { registerDomainsComponents } from '../application/domains/components.mjs';
import { registerDomainsCommands } from '../application/domains/commands.mjs';
import { registerDomainsRules } from '../application/domains/rules.mjs';
import { registerDomainsOpenspec } from '../application/domains/openspec.mjs';
import { registerApplicationDoctor } from '../application/doctor.mjs';
import { registerDomainsPackageAssets } from '../application/domains/package-assets.mjs';
import { registerDomainsSkills } from '../application/domains/skills.mjs';
import { registerApplicationPackageMaintenance } from '../application/package-maintenance.mjs';
import { registerApplicationWorkspaceOperations } from '../application/workspace-operations.mjs';
import { registerApplicationRuntime } from '../application/runtime.mjs';
import { registerApplicationCliUpdate } from '../application/cli-update.mjs';
import { registerWorkspaceApplication } from '../application/workspace/workspace-application.mjs';
import { registerProjectApplication } from '../application/project/project-application.mjs';
import { registerPublicationApplication } from '../application/publication/publication-application.mjs';
import { registerServiceApplication } from '../application/service/service-application.mjs';
import { registerChangeApplication } from '../application/change/change-application.mjs';
import { registerGitWorktreeProvider } from '../application/worktree/git-worktree-provider.mjs';
import { registerTaskFinishApplication } from '../application/task-finish/task-finish-application.mjs';
import { registerTaskTerminalDeliveryApplication } from '../application/task-terminal-delivery/task-terminal-delivery-application.mjs';
import { registerTaskReviewApplication } from '../application/task-review/task-review-application.mjs';
import { registerTaskRetrospectiveApplication } from '../application/task-retrospective/task-retrospective-application.mjs';
import { registerTaskVerificationApplication } from '../application/task-verification/task-verification-application.mjs';
import { registerTaskDevelopmentApplication } from '../application/task-development/task-development-application.mjs';
import { registerTaskEntrySnapshotApplication } from '../application/task-entry/task-entry-snapshot-application.mjs';
import { registerTaskPlanningIdentityApplication } from '../application/task-planning-identity/task-planning-identity-application.mjs';
import { registerTaskOverviewApplication } from '../application/task-overview/task-overview-application.mjs';
import { registerParentCoordinationApplication } from '../application/parent-coordination/parent-coordination-application.mjs';
import { registerProjectDailyProgressApplication } from '../application/project-daily-progress/project-daily-progress-application.mjs';
import { registerTaskEnvironmentApplication } from '../application/task-environment/task-environment-application.mjs';
import { registerTaskExecutionRecordApplication } from '../application/task-execution-record/task-execution-record-application.mjs';
import { registerVerificationApplication } from '../application/verification/verification-application.mjs';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.mjs';
import { registerProductInstallationStatus } from '../application/product-installation-status.mjs';

const TASK_RECORD_MODULE_SLOT = Symbol('task-record-module');

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
  registerTaskReviewRepository,
  registerTaskRetrospectiveRepository,
  registerTaskVerificationRepository,
  registerTaskDevelopmentRepository,
  registerTaskOverviewRepository,
  registerParentCoordinationRepository,
  registerTaskFinishRepository,
  registerTaskExecutionRecordRepository,
  registerTaskExecutionRecordBodyStore,
  registerTaskEnvironmentRepository,
  registerProjectDailyProgressStore,
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
  TASK_RECORD_MODULE_SLOT,
  registerProjectDailyProgressApplication,
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

export function registerLegacyRuntime(runtime, { installTaskRecordModule }) {
  if (typeof installTaskRecordModule !== 'function') throw new Error('Bootstrap must provide the Task Record module installer.');
  for (const register of REGISTRATIONS) {
    if (register === TASK_RECORD_MODULE_SLOT) installTaskRecordModule(runtime);
    else register(runtime);
  }
  return runtime;
}
