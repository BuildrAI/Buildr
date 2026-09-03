import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { copyTaskLifecycleWorkspace } from './task-lifecycle-system-context.ts';

export const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
export const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

export function runBuildr(args: any, expected: any = 0, env: any = process.env): any  {
  const result: any = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8', env });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

export function runBuildrJson(args: any, expected: any = 0, env: any = process.env): any  {
  return JSON.parse(runBuildr([...args, '--json'], expected, env).stdout);
}

export function taskRecordFixture(t: any, name: any = 'task-record'): any  {
  return copyTaskLifecycleWorkspace(t, name);
}
