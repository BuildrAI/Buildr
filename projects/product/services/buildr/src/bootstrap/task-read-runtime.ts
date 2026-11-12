import { createWorkspaceTaskRuntime } from './workspace-task-runtime.ts';
import { WORKSPACE_QUERY } from '../modules/workspace/module.ts';
import { createOpenSpecQuery, OPENSPEC_QUERY } from '../modules/openspec/query.ts';
import { TASK_CHANGE_BINDER } from '../modules/task/module.ts';
import { CHANGE_APPLICATION, createChangeModule } from '../modules/task/change/module.ts';
import { TASK_CHANGED_FILES_MODULE } from '../modules/task/changed-files/module.ts';
import { TASK_COMMITS_MODULE } from '../modules/task/commits/module.ts';
import { TASK_MATERIALS_MODULE } from '../modules/task/materials/module.ts';

/** Compose task reads inside the Worker without starting the Web or Agent runtime. */
export function createTaskReadRuntime() {
  const { runtime, registry } = createWorkspaceTaskRuntime();
  registry.install(TASK_COMMITS_MODULE);
  registry.install(TASK_CHANGED_FILES_MODULE);
  registry.install(TASK_MATERIALS_MODULE);
  registry.install({
    id: 'openspec-query',
    requires: [WORKSPACE_QUERY],
    create: (requires: Record<string, any>) => ({
      provides: { [OPENSPEC_QUERY]: createOpenSpecQuery(requires[WORKSPACE_QUERY]) },
    }),
  });
  registry.install(createChangeModule(runtime));
  registry.provide(TASK_CHANGE_BINDER).bindChangeResolver(registry.provide(CHANGE_APPLICATION));
  return (capability: string) => registry.provide(capability);
}
