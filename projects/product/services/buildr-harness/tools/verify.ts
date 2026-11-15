import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildAgentService } from './build.ts';

const root = path.resolve(import.meta.dirname, '..');
buildAgentService(root);
const result = spawnSync(process.execPath, [path.join(root, 'tools/test.ts')], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
