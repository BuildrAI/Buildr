import path from 'node:path';
import { agentRuntimePackageTree } from '../../tools/package-runtime.ts';
import { createManagedTestTempDir } from './managed-temp.ts';
let packageRoot: string | undefined;
/** No Development package/test helper is needed to materialize the public payload. */
export function fixturePackage(): string {
  if (process.env.BUILDR_AGENT_TEST_PACKAGE) return process.env.BUILDR_AGENT_TEST_PACKAGE;
  if (packageRoot) return packageRoot;
  const managed = createManagedTestTempDir();
  try { agentRuntimePackageTree(path.resolve(import.meta.dirname, '../..')).materialize(managed.root); }
  catch (error) { managed.cleanup(); throw error; }
  packageRoot = managed.root;
  process.once('exit', () => managed.cleanup());
  return managed.root;
}
