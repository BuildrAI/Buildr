import { WORKSPACE_QUERY } from '../../workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../module.ts';
import { createTaskChangedFilesApplication, type TaskChangedFilesDependencies } from './application/task-changed-files-application.ts';
import { createTaskChangedFilesCliContributions } from './interfaces/cli/task-changed-files.ts';
import { createTaskChangedFilesHttpContribution } from './interfaces/http/task-changed-files-http.ts';

export const TASK_CHANGED_FILES_APPLICATION = 'task.changed-files-application';
type Dependencies = {
  [TASK_QUERY_APPLICATION]: Pick<TaskChangedFilesDependencies, 'readTask'>;
  [WORKSPACE_QUERY]: Pick<TaskChangedFilesDependencies, 'readProjectRegistryRecord' | 'readServiceRegistryRecord' | 'resolveSourceRoot'>;
  [TASK_WORKTREE_PROVIDER]: Pick<TaskChangedFilesDependencies, 'readGitWorktreeEvidence'>;
};
export const TASK_CHANGED_FILES_MODULE = Object.freeze({
  id: 'task-changed-files',
  requires: Object.freeze([TASK_QUERY_APPLICATION, WORKSPACE_QUERY, TASK_WORKTREE_PROVIDER]),
  create(requires: Dependencies) {
    const application = createTaskChangedFilesApplication({
      readTask: requires[TASK_QUERY_APPLICATION].readTask,
      readProjectRegistryRecord: requires[WORKSPACE_QUERY].readProjectRegistryRecord,
      readServiceRegistryRecord: requires[WORKSPACE_QUERY].readServiceRegistryRecord,
      resolveSourceRoot: requires[WORKSPACE_QUERY].resolveSourceRoot,
      readGitWorktreeEvidence: requires[TASK_WORKTREE_PROVIDER].readGitWorktreeEvidence,
    });
    return Object.freeze({ provides: { [TASK_CHANGED_FILES_APPLICATION]: application }, contributions: {
      cli: createTaskChangedFilesCliContributions(application), http: [createTaskChangedFilesHttpContribution()],
    } });
  },
});
