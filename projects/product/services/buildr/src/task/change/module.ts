import { registerChangeApplication, type ChangeRuntime, type OpenSpecQuery, type ProjectQuery, type WorktreeQuery } from './application/change-application.ts';
import { createChangeHttpContribution } from './interfaces/http/change-http.ts';
import { OPENSPEC_QUERY } from '../openspec/module.ts';
import { PROJECT_APPLICATION } from '../../workspace/module.ts';
import { TASK_WORKTREE_PROVIDER } from '../infrastructure/git-worktree-provider.ts';

export const CHANGE_MODULE_ID = 'change';
export const CHANGE_APPLICATION = 'change.application';

const METHODS = Object.freeze([
  'listProjectChanges', 'listChanges', 'changeDetail', 'generateChangeCreatePrompt',
  'generateChangeActionPrompt', 'resolveTaskScopedChange', 'taskScopedChangeDetail',
  'taskUiPrototypes', 'taskUiPrototype',
]);

type ChangeModuleRequires = Record<string, unknown>;
type Callable = (...args: unknown[]) => unknown;

function dependency(requires: ChangeModuleRequires, key: string): Record<string, unknown> {
  const value = requires[key];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Change module dependency is missing: ${key}`);
  return Object.fromEntries(Object.entries(value));
}

function openSpecDependency(requires: ChangeModuleRequires): OpenSpecQuery {
  const value = dependency(requires, OPENSPEC_QUERY);
  if (typeof value.inspectChangeChecklist !== 'function') throw new Error('OpenSpec Query dependency is invalid.');
  const inspectChangeChecklist = value.inspectChangeChecklist;
  return { inspectChangeChecklist: (root) => Reflect.apply(inspectChangeChecklist, value, [root]) };
}

function projectDependency(requires: ChangeModuleRequires): ProjectQuery {
  const value = dependency(requires, PROJECT_APPLICATION);
  if (typeof value.projectDetail !== 'function' || typeof value.listProjects !== 'function') throw new Error('Project Query dependency is invalid.');
  const projectDetail = value.projectDetail;
  const listProjects = value.listProjects;
  return {
    projectDetail: (root, code) => Reflect.apply(projectDetail, value, [root, code]),
    listProjects: (root) => Reflect.apply(listProjects, value, [root]),
  };
}

function worktreeDependency(requires: ChangeModuleRequires): WorktreeQuery {
  const value = dependency(requires, TASK_WORKTREE_PROVIDER);
  if (typeof value.inspectGitWorktrees !== 'function') throw new Error('Worktree Query dependency is invalid.');
  const inspectGitWorktrees = value.inspectGitWorktrees;
  return { inspectGitWorktrees: (input) => Reflect.apply(inspectGitWorktrees, value, [input]) };
}

function runtimeMethod(runtime: ChangeRuntime, method: string): Callable {
  return (...args) => {
    const value = runtime[method];
    if (typeof value !== 'function') throw new Error(`Change runtime method is missing: ${method}`);
    return Reflect.apply(value, runtime, args);
  };
}

export function createChangeModule(runtime: ChangeRuntime) {
  return Object.freeze({
    id: CHANGE_MODULE_ID,
    requires: Object.freeze([OPENSPEC_QUERY, PROJECT_APPLICATION, TASK_WORKTREE_PROVIDER]),
    create(requires: ChangeModuleRequires) {
      registerChangeApplication(runtime, {
        openSpecQuery: openSpecDependency(requires),
        projectQuery: projectDependency(requires),
        worktreeQuery: worktreeDependency(requires),
      });
      const application = Object.freeze({
        ...Object.fromEntries(METHODS.map((method) => [method, runtimeMethod(runtime, method)])),
        inspectTaskRecord: runtimeMethod(runtime, 'inspectTaskRecord'),
      });
      return Object.freeze({
        provides: { [CHANGE_APPLICATION]: application },
        contributions: { http: [createChangeHttpContribution(application)] },
      });
    },
  });
}
