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

test('task finish completion 使用持久化 selector plan 且无需重复声明', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-selector-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"test":"node --test"}}\n');
  const executionPlan = JSON.stringify({
    cwd: root,
    command: process.execPath,
    commandSource: 'external-declared',
    npmScript: 'test',
    verificationSelector: 'group:unit',
    availableSelectors: ['group:unit'],
  });
  const claimed = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'selector-run', '--task', 'selector-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=context-v1', '--execution-plan', executionPlan, '--json'], { encoding: 'utf8' });
  assert.equal(claimed.status, 0, claimed.stderr);
  const checkpoint = JSON.parse(claimed.stdout);

  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'selector-run', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const persistedPlan = JSON.parse(inspected.stdout).steps.find((step) => step.id === 'context').executionPlan;
  assert.equal(persistedPlan.verificationSelector, 'group:unit');
  assert.deepEqual(persistedPlan.availableSelectors, ['group:unit']);

  const completed = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'selector-run', '--target', root, '--outcome', 'passed', '--attempt', checkpoint.nextAction.attemptToken, '--fingerprint', 'context=context-v1', '--evidence', '{"id":"selector-completion"}', '--json'], { encoding: 'utf8' });
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).currentStep, 'current-knowledge');
});

test('task finish run 自动执行安全计划并在未声明步骤停止', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plan = (id) => ({ cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: id });
  const plans = JSON.stringify({ context: plan('context-safe'), 'current-knowledge': plan('knowledge-safe') });
  const result = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--run', 'safe-run', '--task', 'safe-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=context-v1', '--fingerprint', 'current-knowledge=knowledge-v1', '--execution-plans', plans, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const checkpoint = JSON.parse(result.stdout);
  assert.equal(checkpoint.currentStep, 'contract-convergence');
  assert.equal(checkpoint.safeExecution.reason, 'safe-plan-unavailable');
  assert.equal(checkpoint.safeExecution.executedSteps.length, 2);
});
