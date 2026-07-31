import { registerWorkspaceInfrastructure } from '../infrastructure/filesystem/index.mjs';
import { registerWorkspaceManifestRepository } from '../infrastructure/filesystem/workspace-manifest-repository.mjs';
import { registerWorkspaceRegistryRepository } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { registerProjectManifestRepository } from '../infrastructure/filesystem/project-manifest-repository.mjs';
import { registerServiceManifestRepository } from '../infrastructure/filesystem/service-manifest-repository.mjs';
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
import { registerWorktreeApplication } from './worktree/worktree-application.mjs';
import { registerTaskFinishApplication } from './task-finish/task-finish-application.mjs';
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
  registerWorktreeApplication,
  registerVerificationApplication,
  registerTaskFinishApplication,
];

export function createRuntime() {
  const runtime = { ...platform };
  for (const register of REGISTRATIONS) register(runtime);
  return runtime;
}
