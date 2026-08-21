import { registerInfrastructure } from '../infrastructure/index.mjs';
import { registerWorkspaceManagementFence } from '../infrastructure/filesystem/workspace-management-fence.mjs';
import { registerTaskFinishRepository } from '../task/persistence/finish/task-finish-repository.mjs';
import { registerContentTargetObserver } from '../infrastructure/content/content-target-observer.mjs';
import { registerProjectGitObserver } from '../infrastructure/git/project-git-observer.mjs';
import { registerDomainsOpenspec } from '../application/domains/openspec.mjs';
import { registerApplicationDoctor } from '../application/doctor.mjs';
import { registerDomainsPackageAssets } from '../application/domains/package-assets.mjs';
import { registerApplicationWorkspaceOperations } from '../application/workspace-operations.mjs';
import { registerPublicationApplication } from '../application/publication/publication-application.mjs';
import { registerChangeApplication } from '../application/change/change-application.mjs';
import { registerGitWorktreeProvider } from '../application/worktree/git-worktree-provider.mjs';
import { registerTaskFinishApplication } from '../application/task-finish/task-finish-application.mjs';
import { registerTaskTerminalDeliveryApplication } from '../application/task-terminal-delivery/task-terminal-delivery-application.mjs';
import { registerVerificationApplication } from '../application/verification/verification-application.mjs';
import { registerProductInvocation } from '../infrastructure/product-invocation/index.mjs';

const TASK_RECORD_MODULE_SLOT = Symbol('task-record-module');
const TASK_REVIEW_MODULE_SLOT = Symbol('task-review-module');
const WORKSPACE_MODULE_SLOT = Symbol('workspace-module');
const AGENT_ASSETS_MODULE_SLOT = Symbol('agent-assets-module');
const TASK_RETROSPECTIVE_MODULE_SLOT = Symbol('task-retrospective-module');
const TASK_ENVIRONMENT_MODULE_SLOT = Symbol('task-environment-module');
const TASK_EXECUTION_RECORD_MODULE_SLOT = Symbol('task-execution-record-module');
const TASK_VERIFICATION_MODULE_SLOT = Symbol('task-verification-module');
const TASK_PLANNING_IDENTITY_MODULE_SLOT = Symbol('task-planning-identity-module');
const TASK_DEVELOPMENT_MODULE_SLOT = Symbol('task-development-module');
const PARENT_COORDINATION_MODULE_SLOT = Symbol('parent-coordination-module');
const TASK_OVERVIEW_MODULE_SLOT = Symbol('task-overview-module');
const TASK_ENTRY_SNAPSHOT_MODULE_SLOT = Symbol('task-entry-snapshot-module');

const REGISTRATIONS = [
  registerInfrastructure,
  registerProductInvocation,
  registerWorkspaceManagementFence,
  WORKSPACE_MODULE_SLOT,
  AGENT_ASSETS_MODULE_SLOT,
  registerTaskFinishRepository,
  registerContentTargetObserver,
  registerProjectGitObserver,
  registerDomainsOpenspec,
  registerApplicationDoctor,
  registerDomainsPackageAssets,
  registerPublicationApplication,
  registerChangeApplication,
  registerApplicationWorkspaceOperations,
  registerGitWorktreeProvider,
  TASK_RECORD_MODULE_SLOT,
  TASK_ENVIRONMENT_MODULE_SLOT,
  TASK_EXECUTION_RECORD_MODULE_SLOT,
  TASK_REVIEW_MODULE_SLOT,
  TASK_RETROSPECTIVE_MODULE_SLOT,
  TASK_VERIFICATION_MODULE_SLOT,
  TASK_PLANNING_IDENTITY_MODULE_SLOT,
  TASK_DEVELOPMENT_MODULE_SLOT,
  PARENT_COORDINATION_MODULE_SLOT,
  TASK_OVERVIEW_MODULE_SLOT,
  TASK_ENTRY_SNAPSHOT_MODULE_SLOT,
  registerVerificationApplication,
  registerTaskFinishApplication,
  registerTaskTerminalDeliveryApplication,
];

export function registerLegacyRuntime(runtime, {
  installAgentAssetsModule,
  installTaskRecordModule,
  installTaskReviewModule,
  installTaskRetrospectiveModule,
  installTaskEnvironmentModule,
  installTaskExecutionRecordModule,
  installTaskVerificationModule,
  installTaskPlanningIdentityModule,
  installTaskDevelopmentModule,
  installParentCoordinationModule,
  installTaskOverviewModule,
  installTaskEntrySnapshotModule,
  installWorkspaceModule,
}) {
  if (typeof installAgentAssetsModule !== 'function') throw new Error('Bootstrap must provide the Agent Assets module installer.');
  if (typeof installTaskRecordModule !== 'function') throw new Error('Bootstrap must provide the Task Record module installer.');
  if (typeof installTaskReviewModule !== 'function') throw new Error('Bootstrap must provide the Task Review module installer.');
  if (typeof installTaskRetrospectiveModule !== 'function') throw new Error('Bootstrap must provide the Task Retrospective module installer.');
  if (typeof installTaskEnvironmentModule !== 'function') throw new Error('Bootstrap must provide the Task Environment module installer.');
  if (typeof installTaskExecutionRecordModule !== 'function') throw new Error('Bootstrap must provide the Task Execution Record module installer.');
  if (typeof installTaskVerificationModule !== 'function') throw new Error('Bootstrap must provide the Task Verification module installer.');
  if (typeof installTaskPlanningIdentityModule !== 'function') throw new Error('Bootstrap must provide the Task Planning Identity module installer.');
  if (typeof installTaskDevelopmentModule !== 'function') throw new Error('Bootstrap must provide the Task Development module installer.');
  if (typeof installParentCoordinationModule !== 'function') throw new Error('Bootstrap must provide the Parent Coordination module installer.');
  if (typeof installTaskOverviewModule !== 'function') throw new Error('Bootstrap must provide the Task Overview module installer.');
  if (typeof installTaskEntrySnapshotModule !== 'function') throw new Error('Bootstrap must provide the Task Entry Snapshot module installer.');
  if (typeof installWorkspaceModule !== 'function') throw new Error('Bootstrap must provide the Workspace module installer.');
  for (const register of REGISTRATIONS) {
    if (register === AGENT_ASSETS_MODULE_SLOT) installAgentAssetsModule(runtime);
    else if (register === TASK_RECORD_MODULE_SLOT) installTaskRecordModule(runtime);
    else if (register === TASK_REVIEW_MODULE_SLOT) installTaskReviewModule(runtime);
    else if (register === TASK_RETROSPECTIVE_MODULE_SLOT) installTaskRetrospectiveModule(runtime);
    else if (register === TASK_ENVIRONMENT_MODULE_SLOT) installTaskEnvironmentModule(runtime);
    else if (register === TASK_EXECUTION_RECORD_MODULE_SLOT) installTaskExecutionRecordModule(runtime);
    else if (register === TASK_VERIFICATION_MODULE_SLOT) installTaskVerificationModule(runtime);
    else if (register === TASK_PLANNING_IDENTITY_MODULE_SLOT) installTaskPlanningIdentityModule(runtime);
    else if (register === TASK_DEVELOPMENT_MODULE_SLOT) installTaskDevelopmentModule(runtime);
    else if (register === PARENT_COORDINATION_MODULE_SLOT) installParentCoordinationModule(runtime);
    else if (register === TASK_OVERVIEW_MODULE_SLOT) installTaskOverviewModule(runtime);
    else if (register === TASK_ENTRY_SNAPSHOT_MODULE_SLOT) installTaskEntrySnapshotModule(runtime);
    else if (register === WORKSPACE_MODULE_SLOT) installWorkspaceModule(runtime);
    else register(runtime);
  }
  return runtime;
}
