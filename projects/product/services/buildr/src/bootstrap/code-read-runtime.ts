import { createWorkspaceTaskRuntime } from './workspace-task-runtime.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../modules/workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../modules/task/module.ts';
import { createCodeApplication } from '../modules/code/application/code-application.ts';
import { createCodeDependencies } from '../modules/code/application/code-dependencies.ts';
import { createManagedFileQuery } from '../modules/agent-assets/application/managed-file-query.ts';

export function createCodeReadApplication() {
  const { runtime, registry } = createWorkspaceTaskRuntime();
  return createCodeApplication(createCodeDependencies(
    registry.provide(WORKSPACE_APPLICATION), registry.provide(WORKSPACE_QUERY),
    registry.provide(TASK_QUERY_APPLICATION).readTask, registry.provide(TASK_WORKTREE_PROVIDER),
    createManagedFileQuery(runtime.existsFile),
  ));
}
