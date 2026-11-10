import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { activateIsolatedWorkspaceState } from '../tools/development/isolated-workspace-state.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.BUILDR_NPM_ENTRY_PATH ??= path.join(serviceRoot, 'bin', 'buildr.mjs');

activateIsolatedWorkspaceState();
