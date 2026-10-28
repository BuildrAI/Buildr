import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Buildr main restarts preserve the exact independent execution and its pending question', {timeout:120_000}, () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const result = spawnSync(process.execPath, [path.join(root,'tools/development/run-isolated-workspace-check.ts'),'--script',path.join(root,'tools/development/agent-process-isolation-check.ts')], {cwd:root,encoding:'utf8',timeout:110_000,env:process.env});
  assert.equal(result.status,0,result.stderr + result.stdout);
  assert.match(result.stdout,/"mainRestarts":2/);
  assert.match(result.stdout,/"cleanup":"cleaned"/);
});
