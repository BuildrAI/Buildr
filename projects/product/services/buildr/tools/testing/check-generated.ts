import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
for (const script of ['contracts/task-dto.ts', 'contracts/task-professional-dto.ts', 'contracts/runtime-system-dto.ts', 'contracts/workbench-dto.ts', 'contracts/workspace-agent-assets-dto.ts']) {
  const result = spawnSync(process.execPath, [path.join(root, 'tools/codegen', script), '--check'], { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
