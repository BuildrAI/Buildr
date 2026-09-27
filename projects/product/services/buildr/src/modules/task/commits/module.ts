import { WORKSPACE_QUERY } from '../../workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../module.ts';
import { createTaskCommitsApplication, type TaskCommitsDependencies } from './application/task-commits-application.ts';
import { createTaskCommitsCliContributions } from './interfaces/cli/task-commits.ts';
import { createTaskCommitsHttpContribution } from './interfaces/http/task-commits-http.ts';

export const TASK_COMMITS_APPLICATION = 'task.commits-application';
type Dependencies = {
  [TASK_QUERY_APPLICATION]: Pick<TaskCommitsDependencies, 'readTask'>;
  [WORKSPACE_QUERY]: Pick<TaskCommitsDependencies, 'readProjectRegistryRecord' | 'readServiceRegistryRecord' | 'resolveSourceRoot'>;
  [TASK_WORKTREE_PROVIDER]: Pick<TaskCommitsDependencies, 'readGitWorktreeEvidence'>;
};
export const TASK_COMMITS_MODULE = Object.freeze({
  id: 'task-commits',
  requires: Object.freeze([TASK_QUERY_APPLICATION, WORKSPACE_QUERY, TASK_WORKTREE_PROVIDER]),
  create(requires: Dependencies) {
    const application = createTaskCommitsApplication({
      readTask: requires[TASK_QUERY_APPLICATION].readTask,
      readProjectRegistryRecord: requires[WORKSPACE_QUERY].readProjectRegistryRecord,
      readServiceRegistryRecord: requires[WORKSPACE_QUERY].readServiceRegistryRecord,
      resolveSourceRoot: requires[WORKSPACE_QUERY].resolveSourceRoot,
      readGitWorktreeEvidence: requires[TASK_WORKTREE_PROVIDER].readGitWorktreeEvidence,
    });
    return Object.freeze({ provides: { [TASK_COMMITS_APPLICATION]: application }, contributions: {
      cli: createTaskCommitsCliContributions(application), http: [createTaskCommitsHttpContribution()],
    } });
  },
});
