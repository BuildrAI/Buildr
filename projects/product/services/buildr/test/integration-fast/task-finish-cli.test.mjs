import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = path.resolve('bin/buildr.mjs');

test('task finish advance 与 inspect 返回同一持久 checkpoint', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cli-run', '--task', 'cli-task', '--change', 'cli-change', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=context-v1', '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const checkpoint = JSON.parse(created.stdout);
  assert.equal(checkpoint.currentStep, 'context');
  assert.equal(checkpoint.steps[0].status, 'running');
  assert.match(checkpoint.nextAction.attemptToken, /^[0-9a-f-]{36}$/);
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'cli-run', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.deepEqual(JSON.parse(inspected.stdout).steps, checkpoint.steps);
  const completed = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cli-run', '--target', root, '--outcome', 'passed', '--attempt', checkpoint.nextAction.attemptToken, '--fingerprint', 'context=context-v1', '--evidence', '{"id":"context-ready"}', '--json'], { encoding: 'utf8' });
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).currentStep, 'current-knowledge');
});
