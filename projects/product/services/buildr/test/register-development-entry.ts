import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createIsolatedWorkspaceState } from '../tools/development/isolated-workspace-state.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.BUILDR_NPM_ENTRY_PATH ??= path.join(serviceRoot, 'bin', 'buildr.mjs');

const state = createIsolatedWorkspaceState();
Object.assign(process.env, state.env);
process.once('exit', () => {
  try { state.cleanup(); }
  catch (error) {
    process.stderr.write(`Development test state cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
});
