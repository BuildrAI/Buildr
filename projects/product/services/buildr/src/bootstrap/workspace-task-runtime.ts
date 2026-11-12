import { createRuntimeInfrastructure } from './runtime-infrastructure.ts';
import { createModuleRegistry } from './module-registry.ts';
import { readCurrentProductIdentity } from '../modules/installation/infrastructure/current-product-identity.ts';
import * as webProfileContract from '../modules/installation/contracts/web-profile.ts';
import { createWorkspaceModule } from '../modules/workspace/module.ts';
import { TASK_MODULE, createWorktreeProviderModule } from '../modules/task/module.ts';

export function createWorkspaceTaskRuntime() {
  const runtime = createRuntimeInfrastructure();
  const registry = createModuleRegistry();
  registry.install(createWorkspaceModule(runtime, { readProductIdentity: readCurrentProductIdentity, webProfileContract }));
  registry.install(TASK_MODULE);
  registry.install(createWorktreeProviderModule(runtime));
  return { runtime, registry };
}
