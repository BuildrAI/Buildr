import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
for (const [cwd, script, args] of [
  [path.resolve(root, '../buildr-harness-ui'), 'tools/build.ts', []],
  [root, 'node_modules/typescript/bin/tsc', ['--noEmit']],
  [root, 'node_modules/vite/bin/vite.js', ['build']],
] as const) {
  const result = spawnSync(process.execPath, [script, ...args], {cwd, stdio: 'inherit'});
  if (result.error || result.status !== 0) throw result.error ?? new Error('harness_web_build_failed');
}
