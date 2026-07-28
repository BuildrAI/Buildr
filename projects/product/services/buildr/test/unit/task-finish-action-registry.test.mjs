import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { classifyRetainedConvergencePaths, FINISH_ACTIONS, FINISH_ACTION_REGISTRY_SCHEMA, listFinishActions, resolveFinishAction } from '../../src/application/task-finish/task-finish-action-registry.mjs';
import { advanceFinishRun, createFinishRun, executeSafeFinishRun, FINISH_STEPS, inspectFinishRun, readFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

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
  const currentActions = FINISH_ACTIONS.filter((action) => !action.legacy);
  assert.deepEqual([...new Set(currentActions.map((action) => action.step))].sort(), FINISH_STEPS.map((step) => step.id).sort());
  assert.deepEqual(FINISH_ACTIONS.filter((action) => action.legacy).map((action) => action.step), ['archive']);
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

test('OpenSpec convergence登记产品恢复与明确阻塞出口', () => {
  const action = FINISH_ACTIONS.find((entry) => entry.id === 'contract-convergence.openspec');
  assert.deepEqual(action.resultContract.blockedReasons, ['semantic-resolution-required', 'recovery-unprovable']);
  assert.equal(action.fallbackPolicy, 'product-recovery-then-agent-semantic-or-evidence-repair');
  assert.ok(action.evidenceProjection.required.includes('recovery classification'));
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

test('retained convergence 分类 runtime、默认入口与未知路径', () => {
  const impact = classifyRetainedConvergencePaths([
    'skills/buildr/task-finish/SKILL.md',
    'projects/product/services/buildr/src/interfaces/cli/help.mjs',
    'projects/product/services/buildr/src/application/verification/evidence-lifecycle.mjs',
    'projects/product/services/buildr/src/interfaces/local-app/runtime/task-preview.mjs',
    'projects/product/docs/buildr-product.md',
  ]);
  assert.equal(impact.requiresRuntimeSync, true);
  assert.equal(impact.requiresCliInstall, true);
  assert.equal(impact.requiresLocalAppInstall, true);
  assert.ok(impact.cli.includes('services/buildr/src/application/verification/evidence-lifecycle.mjs'));
  assert.deepEqual(impact.unknown, ['docs/buildr-product.md']);
});

test('retained convergence 缺少 authority 时零执行并返回 input-required', (t) => {
  const { root, run } = fixture(t);
  const result = resolveFinishAction({ root, run, step: 'retained-convergence', context: { agent: 'codex' } });
  assert.equal(result.status, 'input-required');
  assert.deepEqual(result.requiredInputs, ['retainedWorkspaceRoot', 'retainedCliInvocation', 'changedPaths']);
});

test('runtime install 只接受 receipt-bound Node 与 retained CLI identity', (t) => {
  const { root, run } = fixture(t);
  const source = path.join(root, 'projects/product/services/buildr/bin/buildr.mjs');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, '#!/usr/bin/env node\n');
  const context = {
    retainedWorkspaceRoot: root,
    retainedCliInvocation: { command: process.execPath, argsPrefix: [source] },
    retainedRuntimeIdentity: { nodeExecutable: process.execPath, nodeMajor: Number(process.versions.node.split('.')[0]), cliSource: source, targetRoot: root },
    changedPaths: ['projects/product/services/buildr/src/application/verification/evidence-lifecycle.mjs'],
  };
  const ready = resolveFinishAction({ root, run, step: 'runtime-install', context });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.action.kind, 'provider-executable');
  assert.deepEqual(ready.plan.stages.map((stage) => stage.id), ['runtime-identity-before', 'default-cli-install', 'installed-cli-check']);
  assert.equal(ready.plan.metadata.identity.nodeExecutable, process.execPath);

  const drifted = resolveFinishAction({ root, run, step: 'runtime-install', context: { ...context, retainedRuntimeIdentity: { ...context.retainedRuntimeIdentity, nodeMajor: 18 } } });
  assert.equal(drifted.status, 'agent-provider-required');
  assert.equal(drifted.providerHandoff.reason, 'retained-runtime-identity-mismatch');

  const localApp = resolveFinishAction({ root, run, step: 'runtime-install', context: { ...context, changedPaths: ['projects/product/services/buildr/src/interfaces/local-app/runtime/server.mjs'] } });
  assert.equal(localApp.status, 'agent-provider-required');
  assert.equal(localApp.providerHandoff.reason, 'local-app-install-has-no-stable-product-handler');
});

test('formal verification product handler binds result to candidate identity', (t) => {
  const { root, cli, run } = fixture(t);
  const result = resolveFinishAction({ root, run, step: 'formal-assurance', context: { cliSource: cli, project: 'product', candidateIdentity: 'candidate-v2' } });
  assert.equal(result.status, 'ready');
  assert.equal(result.fingerprint, 'candidate-v2');
  assert.ok(result.plan.args.includes('--candidate-fingerprint'));
  assert.deepEqual(result.plan.jsonRequired, ['schemaVersion', 'status', 'evidenceIdentity', 'evidenceLifecycle']);
});

test('formal verification rejects a caller shell disguised with verification arguments', async (t) => {
  const { root } = fixture(t);
  while (inspectFinishRun(readFinishRun({ root, runId: 'registry-run' })).currentStep !== 'formal-assurance') {
    const checkpoint = inspectFinishRun(readFinishRun({ root, runId: 'registry-run' }));
    const step = checkpoint.currentStep;
    const claimed = advanceFinishRun({ root, runId: 'registry-run', fingerprints: { [step]: `${step}-ready` } });
    advanceFinishRun({ root, runId: 'registry-run', fingerprints: { [step]: `${step}-ready` }, outcome: 'passed', attemptToken: claimed.nextAction.attemptToken, evidence: { id: `${step}-evidence` } });
  }
  let invoked = false;
  const result = await executeSafeFinishRun({
    root,
    runId: 'registry-run',
    actionContext: { cliInvocation: { command: '/bin/sh', argsPrefix: ['-c', 'exit 0'] }, project: 'product', candidateIdentity: 'candidate-v3' },
    runCommand: async () => { invoked = true; return { status: 0, stdout: '{}', stderr: '' }; },
  });
  assert.equal(result.safeExecution.reason, 'safe-plan-unavailable');
  assert.equal(invoked, false);
});
