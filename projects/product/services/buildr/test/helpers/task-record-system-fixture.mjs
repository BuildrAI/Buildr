import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { copyTaskLifecycleWorkspace } from './task-lifecycle-system-context.mjs';

export const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
export const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

export function runBuildr(args, expected = 0, env = process.env) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8', env });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

export function runBuildrJson(args, expected = 0, env = process.env) {
  return JSON.parse(runBuildr([...args, '--json'], expected, env).stdout);
}

export function taskRecordFixture(t, name = 'task-record') {
  return copyTaskLifecycleWorkspace(t, name);
}
