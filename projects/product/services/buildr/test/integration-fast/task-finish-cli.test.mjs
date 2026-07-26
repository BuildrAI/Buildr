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
  const created = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cli-run', '--task', 'cli-task', '--change', 'cli-change', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=context-v1', '--detail', 'full', '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const checkpoint = JSON.parse(created.stdout);
  assert.equal(checkpoint.currentStep, 'context');
  assert.equal(checkpoint.steps[0].status, 'running');
  assert.match(checkpoint.nextAction.attemptToken, /^[0-9a-f-]{36}$/);
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'cli-run', '--target', root, '--detail', 'full', '--json'], { encoding: 'utf8' });
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
  const claimed = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'selector-run', '--task', 'selector-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=context-v1', '--execution-plan', executionPlan, '--detail', 'full', '--json'], { encoding: 'utf8' });
  assert.equal(claimed.status, 0, claimed.stderr);
  const checkpoint = JSON.parse(claimed.stdout);

  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'selector-run', '--target', root, '--detail', 'full', '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const persistedPlan = JSON.parse(inspected.stdout).steps.find((step) => step.id === 'context').executionPlan;
  assert.equal(persistedPlan.verificationSelector, 'group:unit');
  assert.deepEqual(persistedPlan.availableSelectors, ['group:unit']);

  const completed = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'selector-run', '--target', root, '--outcome', 'passed', '--attempt', checkpoint.nextAction.attemptToken, '--fingerprint', 'context=context-v1', '--evidence', '{"id":"selector-completion"}', '--json'], { encoding: 'utf8' });
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).currentStep, 'current-knowledge');
});

test('task finish JSON 默认使用 compact checkpoint，full detail 显式展开', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-compact-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const compact = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'compact-run', '--task', 'compact-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=v1', '--json'], { encoding: 'utf8' });
  assert.equal(compact.status, 0, compact.stderr);
  const summary = JSON.parse(compact.stdout);
  assert.equal(summary.schemaVersion, 'buildr.task-finish-checkpoint-summary/v1');
  assert.equal(summary.steps, undefined);
  const full = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'compact-run', '--target', root, '--detail', 'full', '--json'], { encoding: 'utf8' });
  assert.ok(Array.isArray(JSON.parse(full.stdout).steps));
});

test('task finish cleanup prepare/finalize 通过 canonical receipt 跨 environment 完成', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let checkpoint = JSON.parse(spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cleanup-run', '--task', 'cleanup-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=v', '--detail', 'full', '--json'], { encoding: 'utf8' }).stdout);
  while (checkpoint.currentStep !== 'cleanup') {
    const step = checkpoint.currentStep;
    const args = [cli, 'task', 'finish', 'advance', '--run', 'cleanup-run', '--target', root, '--outcome', 'passed', '--attempt', checkpoint.nextAction.attemptToken, '--fingerprint', `${step}=v`, '--evidence', `{"id":"${step}-ok"}`, '--detail', 'full', '--json'];
    if (step === 'integration-push') args.push('--ref-transition', '{"expectedBeforePush":"a","observedBeforePush":"a","expectedAfterPush":"b","observedAfterPush":"b"}');
    checkpoint = JSON.parse(spawnSync(process.execPath, args, { encoding: 'utf8' }).stdout);
    if (checkpoint.currentStep && checkpoint.nextAction.status !== 'running') checkpoint = JSON.parse(spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cleanup-run', '--target', root, '--fingerprint', `${checkpoint.currentStep}=v`, '--detail', 'full', '--json'], { encoding: 'utf8' }).stdout);
  }
  if (checkpoint.nextAction.status !== 'running') checkpoint = JSON.parse(spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'cleanup-run', '--target', root, '--fingerprint', 'cleanup=v', '--detail', 'full', '--json'], { encoding: 'utf8' }).stdout);
  const prepared = spawnSync(process.execPath, [cli, 'task', 'finish', 'cleanup-prepare', '--run', 'cleanup-run', '--target', root, '--attempt', checkpoint.nextAction.attemptToken, '--evidence', '{"id":"cleanup-ready","worktreeClean":true}', '--json'], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).cleanup.status, 'prepared');
  const finalized = spawnSync(process.execPath, [cli, 'task', 'finish', 'cleanup-finalize', '--run', 'cleanup-run', '--target', root, '--evidence', '{"id":"cleanup-complete","environmentRetained":true}', '--json'], { encoding: 'utf8' });
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal(JSON.parse(finalized.stdout).status, 'complete');
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

test('task finish recover消费版本化manifest并连续执行safe plans', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-recover-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = spawnSync(process.execPath, [cli, 'task', 'finish', 'advance', '--run', 'recover-run', '--task', 'recover-task', '--target-branch', 'dev', '--target', root, '--fingerprint', 'context=old', '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const plan = { cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: 'context-recovered' };
  const recovery = JSON.stringify({
    schemaVersion: 'buildr.task-finish-recovery/v1', id: 'cli-recovery',
    identities: { before: { environment: 'old' }, after: { environment: 'new' } },
    fingerprints: { context: 'new' }, executionPlans: { context: plan }, transition: { type: 'implementation-changed', evidenceId: 'checkout-change' },
  });
  const result = spawnSync(process.execPath, [cli, 'task', 'finish', 'recover', '--run', 'recover-run', '--target', root, '--recovery', recovery, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const checkpoint = JSON.parse(result.stdout);
  assert.equal(checkpoint.currentStep, 'current-knowledge');
  assert.equal(checkpoint.recovery.transition.type, 'implementation-changed');
  assert.equal(checkpoint.safeExecution.executedSteps[0].step, 'context');
});
