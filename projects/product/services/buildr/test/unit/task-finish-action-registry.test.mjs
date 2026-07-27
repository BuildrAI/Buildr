import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FINISH_ACTIONS, FINISH_ACTION_REGISTRY_SCHEMA, listFinishActions, resolveFinishAction } from '../../src/application/task-finish/task-finish-action-registry.mjs';
import { createFinishRun, executeSafeFinishRun, FINISH_STEPS, inspectFinishRun, readFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-actions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.join(root, 'projects', 'product', 'buildr');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(cli, 0o755);
  const run = createFinishRun({ root, runId: 'registry-run', task: 'registry-task', change: 'registry-change', targetBranch: 'dev' });
  return { root, cli, run };
}

test('action registry 为全部标准 finish step 提供唯一 entry', () => {
  assert.equal(listFinishActions().schemaVersion, FINISH_ACTION_REGISTRY_SCHEMA);
  for (const step of FINISH_STEPS) assert.equal(FINISH_ACTIONS.filter((action) => action.step === step.id).length, 1, step.id);
  assert.deepEqual([...new Set(FINISH_ACTIONS.map((action) => action.step))].sort(), FINISH_STEPS.map((step) => step.id).sort());
  for (const action of FINISH_ACTIONS) {
    assert.ok(action.id && action.kind && action.executionSurface && action.authorization);
    assert.ok(Array.isArray(action.effects));
    assert.ok(action.resultContract && action.evidenceProjection && action.fallbackPolicy);
  }
});

test('resolver 区分 ready、input、provider handoff 与 registry miss', (t) => {
  const { root, cli, run } = fixture(t);
  const ready = resolveFinishAction({ root, run, step: 'context', context: { cliInvocation: { command: '/usr/bin/env', argsPrefix: ['sh', cli] } } });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.plan.actionId, 'context.verify-environment');
  assert.equal(ready.plan.planSource, 'registry');
  assert.match(ready.fingerprint, /^registry-v1-/);

  const input = resolveFinishAction({ root: path.join(root, 'consumer'), run, step: 'context' });
  assert.equal(input.status, 'input-required');
  assert.deepEqual(input.requiredInputs, ['cliInvocation']);

  const external = resolveFinishAction({ root: path.join(root, 'consumer'), run, step: 'context', context: { cliSource: cli } });
  assert.equal(external.status, 'ready');
  assert.equal(external.plan.commandSource, 'external-declared');
  assert.deepEqual(ready.plan.args.slice(0, 2), ['sh', cli]);

  const provider = resolveFinishAction({ root, run, step: 'current-knowledge' });
  assert.equal(provider.status, 'agent-provider-required');
  assert.equal(provider.providerHandoff.action, 'inspect');

  const missing = resolveFinishAction({ root, run, step: 'future-step' });
  assert.equal(missing.status, 'agent-reasoning-required');
  assert.equal(missing.reason, 'registry-action-uncovered');
});

test('safe executor 无 caller plan/fingerprint 时执行 registry action并停在provider handoff', async (t) => {
  const { root, cli } = fixture(t);
  const result = await executeSafeFinishRun({
    root, runId: 'registry-run', actionContext: { cliSource: cli },
    runCommand: async () => ({ status: 0, stdout: '{"executionReady":true}', stderr: '' }),
  });
  assert.equal(result.currentStep, 'current-knowledge');
  assert.equal(result.safeExecution.reason, 'agent-provider-required');
  assert.deepEqual(result.safeExecution.executedSteps.map(({ step, actionId, planSource }) => ({ step, actionId, planSource })), [
    { step: 'context', actionId: 'context.verify-environment', planSource: 'registry' },
  ]);
  const checkpoint = inspectFinishRun(readFinishRun({ root, runId: 'registry-run' }));
  assert.equal(checkpoint.steps[0].evidence[0].planSource, 'registry');
});

test('registry允许receipt事实声明的environment外部产品CLI', async (t) => {
  const { root, cli } = fixture(t);
  const consumer = path.join(root, 'consumer');
  fs.mkdirSync(consumer);
  createFinishRun({ root: consumer, runId: 'external-run', task: 'external-task', targetBranch: 'dev' });
  const result = await executeSafeFinishRun({
    root: consumer, runId: 'external-run', actionContext: { cliSource: cli },
    runCommand: async () => ({ status: 0, stdout: '{"executionReady":true}', stderr: '' }),
  });
  assert.equal(result.safeExecution.executedSteps[0].actionId, 'context.verify-environment');
  assert.equal(result.currentStep, 'current-knowledge');
});

test('显式 caller plan 保持兼容且不会冒充 registry coverage', async (t) => {
  const { root } = fixture(t);
  const result = await executeSafeFinishRun({
    root, runId: 'registry-run', fingerprints: { context: 'caller-v1' },
    executionPlans: { context: { cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: 'caller-context' } },
    runCommand: async () => ({ status: 0, stdout: '', stderr: '' }),
  });
  assert.equal(result.safeExecution.executedSteps[0].planSource, 'caller-supplied');
});
