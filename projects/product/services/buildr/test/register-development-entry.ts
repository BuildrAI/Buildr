import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { activateIsolatedWorkspaceState } from '../tools/development/isolated-workspace-state.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.BUILDR_NPM_ENTRY_PATH ??= path.join(serviceRoot, 'bin', 'buildr.mjs');

// Only the isolated workspace runner owns both the fixture and its state root.
// Independent node-test workers must retain their separate scopes.
const ownsWorkspaceScope = Boolean(process.env.BUILDR_SMOKE_ROOT && process.env.BUILDR_SMOKE_ROOT === process.env.BUILDR_TEST_LOCAL_STATE_ROOT);
activateIsolatedWorkspaceState({ reuseInherited: ownsWorkspaceScope });
