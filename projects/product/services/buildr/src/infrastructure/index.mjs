import { registerWorkspaceInfrastructure } from './filesystem/index.mjs';
import { registerWorkspaceSqlite } from './sqlite/workspace-sqlite.mjs';

/**
 * The Infrastructure composition root owns technical mechanisms only. Business
 * repositories are privately registered by their owning `src/task/module.mjs`
 * descriptor; Task Finish remains with its legacy Application until its own migration.
 */
export const INFRASTRUCTURE_CAPABILITIES = Object.freeze([
  Object.freeze({ id: 'filesystem', owner: 'src/infrastructure/filesystem/index.mjs' }),
  Object.freeze({ id: 'git', owner: 'src/infrastructure/git' }),
  Object.freeze({ id: 'network', owner: 'src/infrastructure/network' }),
  Object.freeze({ id: 'platform', owner: 'src/infrastructure/platform.mjs' }),
  Object.freeze({ id: 'process', owner: 'src/infrastructure/process.mjs' }),
  Object.freeze({ id: 'product-resources', owner: 'src/infrastructure/product-resources/index.mjs' }),
  Object.freeze({ id: 'sqlite', owner: 'src/infrastructure/sqlite/workspace-sqlite.mjs' }),
  Object.freeze({ id: 'migration', owner: 'src/infrastructure/sqlite/migrations' }),
]);

export function registerInfrastructure(runtime, options = {}) {
  registerWorkspaceInfrastructure(runtime);
  registerWorkspaceSqlite(runtime, options);
  return runtime;
}
