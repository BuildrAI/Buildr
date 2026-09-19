import { TASK_QUERY_APPLICATION, TASK_WORK_CONTEXT_APPLICATION, PROJECT_DAILY_PROGRESS_APPLICATION } from '../task/module.ts';
import { WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT } from '../workspace/module.ts';
import { createPreferencesApplication } from './application/preferences-application.ts';
import { createWorkbenchApplication } from './application/workbench-application.ts';
import { createWorkbenchHttpContribution } from './interfaces/http/workbench-http.ts';
import { createWorkbenchCliContributions } from './interfaces/cli/workbench-cli.ts';
export const WORKBENCH_APPLICATION = 'workbench.application';
export const WORKBENCH_MODULE = Object.freeze({
  id: 'workbench',
  requires: [TASK_QUERY_APPLICATION, TASK_WORK_CONTEXT_APPLICATION, PROJECT_DAILY_PROGRESS_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT],
  create(requires: Record<string, any>) {
    const taskQuery = requires[TASK_QUERY_APPLICATION];
    const workspace = requires[WORKSPACE_QUERY];
    const store = requires[WORKSPACE_TASK_SUPPORT];
    const dailyProgress = requires[PROJECT_DAILY_PROGRESS_APPLICATION];
    const tasks = Object.freeze({ inspect: taskQuery.inspectTaskView, list: taskQuery.queryTasks });
    const preferences = createPreferencesApplication({
      store: { runWorkspaceSqliteRead: store.runWorkspaceSqliteRead, runWorkspaceTransaction: store.runWorkspaceTransaction },
      tasks: { inspect: tasks.inspect },
      workspace: { get: workspace.getWorkspace, projects: workspace.readProjectRegistryRecord },
    });
    const application = Object.freeze({ ...preferences, ...createWorkbenchApplication({
      preferences: { inspectWorkbenchPreferences: preferences.inspectWorkbenchPreferences },
      workContext: requires[TASK_WORK_CONTEXT_APPLICATION],
      tasks,
      projects: workspace.readProjectRegistryRecord,
      dailyProgress: { list: dailyProgress.listProjectDailyProgress, inspect: dailyProgress.inspectProjectDailyProgress },
    }) });
    return Object.freeze({ provides: { [WORKBENCH_APPLICATION]: application }, contributions: { http: [createWorkbenchHttpContribution(application)], cli: createWorkbenchCliContributions(application) } });
  },
});
