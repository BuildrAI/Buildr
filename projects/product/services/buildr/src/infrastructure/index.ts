import { registerWorkspaceInfrastructure } from './filesystem/index.ts';
import { registerWorkspaceSqlite } from './sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction } from './sqlite/transaction.ts';

/**
 * The Infrastructure composition root owns technical mechanisms only. Business
 * repositories are privately registered by their owning `src/task/module.ts`
 * descriptor; task capabilities are installed by the bootstrap module registry.
 */
export const INFRASTRUCTURE_CAPABILITIES = Object.freeze([
  Object.freeze({ id: 'filesystem', owner: 'src/infrastructure/filesystem/index.ts' }),
  Object.freeze({ id: 'git', owner: 'src/infrastructure/git' }),
  Object.freeze({ id: 'network', owner: 'src/infrastructure/network' }),
  Object.freeze({ id: 'platform', owner: 'src/infrastructure/platform.ts' }),
  Object.freeze({ id: 'process', owner: 'src/infrastructure/process.ts' }),
  Object.freeze({ id: 'product-resources', owner: 'src/infrastructure/product-resources/index.ts' }),
  Object.freeze({ id: 'sqlite', owner: 'src/infrastructure/sqlite/workspace-sqlite.ts' }),
  Object.freeze({ id: 'sqlite-transaction', owner: 'src/infrastructure/sqlite/transaction.ts' }),
  Object.freeze({ id: 'test-context-runtime', owner: 'src/infrastructure/testing/context-runtime/index.ts' }),
  Object.freeze({ id: 'migration', owner: 'src/infrastructure/sqlite/migrations' }),
]);

export function registerInfrastructure(runtime: any, options: any = {}): any  {
  registerWorkspaceInfrastructure(runtime);
  registerWorkspaceSqlite(runtime, options);
  registerSqliteTransaction(runtime);
  return runtime;
}
