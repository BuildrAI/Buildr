import { createRuntimeInfrastructure } from './runtime-infrastructure.ts';
import { createModuleRegistry } from './module-registry.ts';
import { createWorkspaceModule, WORKSPACE_QUERY } from '../modules/workspace/module.ts';
import { readCurrentProductIdentity } from '../modules/installation/infrastructure/current-product-identity.ts';
import * as webProfileContract from '../modules/installation/contracts/web-profile.ts';
import { createOpenSpecQuery, OPENSPEC_QUERY } from '../modules/openspec/query.ts';
import { TASK_CHANGE_BINDER, TASK_MODULE, createWorktreeProviderModule } from '../modules/task/module.ts';
import { CHANGE_APPLICATION, createChangeModule } from '../modules/task/change/module.ts';
import { TASK_CHANGED_FILES_MODULE } from '../modules/task/changed-files/module.ts';
import { TASK_COMMITS_MODULE } from '../modules/task/commits/module.ts';
import { TASK_MATERIALS_MODULE } from '../modules/task/materials/module.ts';

/** Compose task reads inside the Worker without starting the Web or Agent runtime. */
export function createTaskReadRuntime() {
  const runtime = createRuntimeInfrastructure();
  const registry = createModuleRegistry();
  registry.install(createWorkspaceModule(runtime, { readProductIdentity: readCurrentProductIdentity, webProfileContract }));
  registry.install(TASK_MODULE);
  registry.install(createWorktreeProviderModule(runtime));
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
