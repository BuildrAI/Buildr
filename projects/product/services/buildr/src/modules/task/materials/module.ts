import { TASK_COMMAND_APPLICATION, TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../module.ts';
import { WORKSPACE_QUERY } from '../../workspace/module.ts';
import { createTaskMaterialsApplication } from './application/task-materials-application.ts';
import type { TaskDocumentQuery, TaskDocumentProjectQuery, TaskDocumentWorktreeQuery } from './application/task-project-document-reader.ts';
import { createTaskMaterialsCliContributions } from './interfaces/cli/task-materials.ts';
import { createTaskMaterialsHttpContribution } from './interfaces/http/task-materials-http.ts';
import { createTaskBriefMigrationApplication } from './application/task-brief-migration.ts';
import { createTaskBriefMigrationCliContribution } from './interfaces/cli/task-brief-migration.ts';

export const TASK_MATERIALS_APPLICATION = 'task.materials-application';
export const TASK_BRIEF_MIGRATION_APPLICATION = 'task.brief-migration-application';
type Dependencies = {
  [TASK_QUERY_APPLICATION]: TaskDocumentQuery & { assertCanonicalTaskWorkspace(root: string): string } & Parameters<typeof createTaskBriefMigrationApplication>[0];
  [TASK_COMMAND_APPLICATION]: Parameters<typeof createTaskBriefMigrationApplication>[1];
  [WORKSPACE_QUERY]: TaskDocumentProjectQuery;
  [TASK_WORKTREE_PROVIDER]: TaskDocumentWorktreeQuery;
};
export const TASK_MATERIALS_MODULE = Object.freeze({
  id: 'task-materials',
  requires: Object.freeze([TASK_QUERY_APPLICATION, TASK_COMMAND_APPLICATION, WORKSPACE_QUERY, TASK_WORKTREE_PROVIDER]),
  create(requires: Dependencies) {
    const application = createTaskMaterialsApplication({ taskQuery: requires[TASK_QUERY_APPLICATION], projectQuery: requires[WORKSPACE_QUERY], worktreeQuery: requires[TASK_WORKTREE_PROVIDER] });
    const migration = createTaskBriefMigrationApplication(requires[TASK_QUERY_APPLICATION], requires[TASK_COMMAND_APPLICATION], application);
    return Object.freeze({ provides: { [TASK_MATERIALS_APPLICATION]: application, [TASK_BRIEF_MIGRATION_APPLICATION]: migration }, contributions: { cli: [...createTaskMaterialsCliContributions(application), createTaskBriefMigrationCliContribution(migration)], http: [createTaskMaterialsHttpContribution(application)] } });
  },
});
