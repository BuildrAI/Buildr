import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceFinishRun, compactFinishCheckpoint, createFinishRun, executeSafeFinishRun, finalizeFinishCleanup, FINISH_RECOVERY_SCHEMA, FINISH_REPAIR_AUTHORIZATION_SCHEMA, FINISH_STEPS, inspectFinishRun, prepareFinishCleanup, readFinishRun, recoverFinishRun, renewFinishLease, resumeFinishRun, validateFinishExecutionPlan } from '../../src/application/task-finish/task-finish-run.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function create(root, runId = 'finish-1', targetBranch = 'dev') {
  return createFinishRun({ root, runId, task: runId, change: 'change-1', targetBranch });
}

function passCurrent(root, runId, fingerprint = 'same') {
  const claimed = advanceFinishRun({ root, runId, fingerprints: { [inspectFinishRun(readFinishRun({ root, runId })).currentStep]: fingerprint } });
  const step = claimed.currentStep;
  const token = readFinishRun({ root, runId }).steps.find((item) => item.id === step).attemptToken;
  const refObservation = step === 'integration-push'
    ? { expectedTargetRef: 'same-ref', observedTargetRef: 'same-ref' }
    : {};
  return { result: advanceFinishRun({ root, runId, fingerprints: { [step]: fingerprint }, outcome: 'passed', attemptToken: token, effect: { id: `${step}-effect` }, evidence: { id: `${step}-evidence` }, ...refObservation }), token, step };
}

test('cleanup blocked 后 resume 不重复 push 或正式验证', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'cleanup') passCurrent(root, 'finish-1');
  const claimed = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { cleanup: 'cleanup-v1' } });
  const token = readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'cleanup').attemptToken;
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { cleanup: 'cleanup-v1' }, outcome: 'blocked', attemptToken: token, blocked: { code: 'cleanup-failed', reason: 'preview still running' } });
  const resumed = resumeFinishRun({ root, runId: 'finish-1', fingerprints: { cleanup: 'cleanup-v2' } });
  assert.equal(resumed.currentStep, 'cleanup');
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.equal(run.steps.find((item) => item.id === 'integration-push').attempt, 1);
  assert.equal(run.steps.find((item) => item.id === 'formal-assurance').attempt, 1);
});

test('最终树 fingerprint 变化只失效 formal assurance 及下游', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'integration-push') passCurrent(root, 'finish-1');
  resumeFinishRun({ root, runId: 'finish-1', fingerprints: { 'formal-assurance': 'new-tree' } });
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.equal(run.steps.find((item) => item.id === 'contract-convergence').status, 'passed');
  assert.equal(run.steps.find((item) => item.id === 'formal-assurance').status, 'running');
  assert.equal(run.steps.find((item) => item.id === 'asset-review').status, 'stale');
});

test('重复提交 passed attempt 不重复 effects', (t) => {
  const root = fixture(t); create(root);
  const claimed = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'context-v1' } });
  const token = readFinishRun({ root, runId: 'finish-1' }).steps[0].attemptToken;
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'context-v1' }, outcome: 'passed', attemptToken: token, effect: { id: 'adopted' }, evidence: { id: 'context-ready' } });
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'context-v1' }, outcome: 'passed', attemptToken: token, effect: { id: 'adopted' }, evidence: { id: 'context-ready' } });
  assert.equal(readFinishRun({ root, runId: 'finish-1' }).steps[0].effects.length, 1);
  assert.equal(claimed.currentStep, 'context');
});

test('失效step保留历史effect但completed effects只报告当前completion identity', (t) => {
  const root = fixture(t); create(root);
  passCurrent(root, 'finish-1', 'old');
  let checkpoint = resumeFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'new' } });
  assert.equal(checkpoint.completedEffects.length, 0);
  checkpoint = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'new' }, outcome: 'passed', attemptToken: checkpoint.nextAction.attemptToken, effect: { id: 'context-new-effect' }, evidence: { id: 'context-new-evidence' } });
  assert.deepEqual(checkpoint.completedEffects.map((effect) => effect.id), ['context-new-effect']);
  assert.equal(readFinishRun({ root, runId: 'finish-1' }).steps[0].effects.length, 2);
});

test('不同资源可并行，共享 target branch 使用短 lease', (t) => {
  const root = fixture(t); create(root, 'one', 'dev'); create(root, 'two', 'other');
  for (const id of ['one', 'two']) while (inspectFinishRun(readFinishRun({ root, runId: id })).currentStep !== 'target-convergence') passCurrent(root, id);
  advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' } });
  assert.doesNotThrow(() => advanceFinishRun({ root, runId: 'two', fingerprints: { 'target-convergence': 'two' } }));

  create(root, 'three', 'dev');
  while (inspectFinishRun(readFinishRun({ root, runId: 'three' })).currentStep !== 'target-convergence') passCurrent(root, 'three');
  assert.throws(() => advanceFinishRun({ root, runId: 'three', fingerprints: { 'target-convergence': 'three' } }), (error) => error.code === 'task_finish.lease_held');
});

test('过期 lease 可由另一个 run 接管', (t) => {
  const root = fixture(t); create(root, 'one'); create(root, 'two');
  for (const id of ['one', 'two']) while (inspectFinishRun(readFinishRun({ root, runId: id })).currentStep !== 'target-convergence') passCurrent(root, id);
  advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' }, clock: () => 1_000, leaseTtlMs: 10 });
  assert.doesNotThrow(() => advanceFinishRun({ root, runId: 'two', fingerprints: { 'target-convergence': 'two' }, clock: () => 2_000 }));
});

test('远端 target ref 竞态阻塞 push 并失效 target convergence 下游', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'integration-push') passCurrent(root, 'finish-1');
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'integration-push': 'push-v1' } });
  const token = readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'integration-push').attemptToken;
  const result = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'integration-push': 'push-v1' }, outcome: 'passed', attemptToken: token, evidence: { id: 'push-observation' }, expectedTargetRef: 'aaa', observedTargetRef: 'bbb' });
  assert.equal(result.blocked[0].code, 'target-race');
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.equal(run.steps.find((item) => item.id === 'target-convergence').status, 'stale');
  assert.equal(run.steps.find((item) => item.id === 'integration-push').effects.length, 0);
});

test('integration push 接受自身 ref transition 与已收敛幂等结果', (t) => {
  for (const [runId, before] of [['pushed', 'base'], ['idempotent', 'candidate']]) {
    const root = fixture(t); create(root, runId);
    while (inspectFinishRun(readFinishRun({ root, runId })).currentStep !== 'integration-push') passCurrent(root, runId);
    const claimed = advanceFinishRun({ root, runId, fingerprints: { 'integration-push': 'push-v2' } });
    const result = advanceFinishRun({
      root, runId, fingerprints: { 'integration-push': 'push-v2' }, outcome: 'passed', attemptToken: claimed.nextAction.attemptToken,
      evidence: { id: `${runId}-transition` },
      refTransition: { expectedBeforePush: 'base', observedBeforePush: before, expectedAfterPush: 'candidate', observedAfterPush: 'candidate' },
    });
    assert.equal(result.blocked.length, 0);
    const evidence = readFinishRun({ root, runId }).steps.find((item) => item.id === 'integration-push').evidence.at(-1);
    assert.equal(evidence.refTransition.observedAfterPush, 'candidate');
    assert.equal(evidence.idempotent, before === 'candidate');
  }
});

test('running step 失效会终结 attempt 并释放自己的 lease', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'target-convergence') passCurrent(root, 'finish-1');
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'target-convergence': 'old' }, clock: () => 1_000 });
  resumeFinishRun({ root, runId: 'finish-1', fingerprints: { 'target-convergence': 'new' }, clock: () => 1_100 });
  const run = readFinishRun({ root, runId: 'finish-1' });
  const attempts = run.steps.find((item) => item.id === 'target-convergence').attempts;
  assert.equal(attempts[0].outcome, 'stale');
  assert.equal(attempts[0].finishedAt, new Date(1_100).toISOString());
  assert.equal(attempts[1].outcome, 'running');
});

test('complete run 写入 canonical compact completion receipt', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).status !== 'complete') passCurrent(root, 'finish-1');
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.ok(fs.existsSync(run.completionReceipt));
  const receipt = JSON.parse(fs.readFileSync(run.completionReceipt, 'utf8'));
  assert.equal(receipt.schemaVersion, 'buildr.task-finish-completion/v1');
  assert.equal(Object.hasOwn(receipt.timing, 'attempts'), false);
  assert.equal(run.steps.flatMap((item) => item.attempts).some((attempt) => attempt.finishedAt == null), false);
});

test('cleanup prepare 与 retained checkout finalize 分离真实删除证据', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'cleanup') passCurrent(root, 'finish-1');
  const claimed = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { cleanup: 'cleanup-v2' } });
  const prepared = prepareFinishCleanup({ root, runId: 'finish-1', attemptToken: claimed.nextAction.attemptToken, evidence: { id: 'cleanup-prepared', worktreeClean: true } });
  assert.equal(prepared.cleanup.status, 'prepared');
  assert.equal(JSON.parse(fs.readFileSync(prepared.completionReceipt, 'utf8')).status, 'prepared');
  assert.throws(() => finalizeFinishCleanup({ root, runId: 'finish-1', evidence: { id: 'missing-removal' } }), /environmentRemoved/);
  const completed = finalizeFinishCleanup({ root, runId: 'finish-1', evidence: { id: 'cleanup-complete', environmentRemoved: true, branchRemoved: true } });
  assert.equal(completed.status, 'complete');
  assert.equal(JSON.parse(fs.readFileSync(completed.completionReceipt, 'utf8')).status, 'complete');
});

test('compact checkpoint 不重复展开 steps 与 attempts', (t) => {
  const root = fixture(t); create(root);
  const compact = compactFinishCheckpoint(inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })));
  assert.equal(compact.schemaVersion, 'buildr.task-finish-checkpoint-summary/v1');
  assert.equal(Object.hasOwn(compact, 'steps'), false);
  assert.equal(Object.hasOwn(compact.timing, 'attempts'), true);
  assert.equal(compact.timing.attempts, undefined);
});

test('run id 不得逃逸 canonical runs root', (t) => {
  const root = fixture(t);
  assert.throws(() => createFinishRun({ root, runId: '../../../escaped', task: 'demo', targetBranch: 'dev' }), /run id/);
  assert.equal(fs.existsSync(path.join(root, 'escaped.json')), false);
});

test('passed step 必须提供 fingerprint 与 evidence，push 必须提供 ref observation', (t) => {
  const root = fixture(t); create(root);
  const withoutFingerprint = advanceFinishRun({ root, runId: 'finish-1' });
  assert.throws(() => advanceFinishRun({ root, runId: 'finish-1', outcome: 'passed', attemptToken: withoutFingerprint.nextAction.attemptToken }), /fingerprint/);

  const run = readFinishRun({ root, runId: 'finish-1' });
  run.steps[0].inputFingerprint = 'context-v1';
  fs.writeFileSync(path.join(root, '.buildr/task-finish/runs/finish-1.json'), `${JSON.stringify(run, null, 2)}\n`);
  assert.throws(() => advanceFinishRun({ root, runId: 'finish-1', outcome: 'passed', attemptToken: withoutFingerprint.nextAction.attemptToken }), /evidence/);

  advanceFinishRun({ root, runId: 'finish-1', outcome: 'passed', attemptToken: withoutFingerprint.nextAction.attemptToken, evidence: { id: 'context-ready' } });
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'integration-push') passCurrent(root, 'finish-1');
  const push = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'integration-push': 'push-v1' } });
  assert.throws(() => advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'integration-push': 'push-v1' }, outcome: 'passed', attemptToken: push.nextAction.attemptToken, evidence: { id: 'push-ready' } }), /expectedTargetRef/);
});

test('过期 holder 不得删除接管者 lease 或提交成功', (t) => {
  const root = fixture(t);
  for (const id of ['one', 'two', 'three']) {
    create(root, id, 'dev');
    while (inspectFinishRun(readFinishRun({ root, runId: id })).currentStep !== 'target-convergence') passCurrent(root, id);
  }
  const one = advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' }, clock: () => 1_000, leaseTtlMs: 10 });
  advanceFinishRun({ root, runId: 'two', fingerprints: { 'target-convergence': 'two' }, clock: () => 2_000, leaseTtlMs: 10_000 });
  const late = advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' }, outcome: 'passed', attemptToken: one.nextAction.attemptToken, evidence: { id: 'late-result' }, clock: () => 2_001 });
  assert.equal(late.blocked[0].code, 'lease-lost');
  assert.throws(() => advanceFinishRun({ root, runId: 'three', fingerprints: { 'target-convergence': 'three' }, clock: () => 2_002 }), (error) => error.code === 'task_finish.lease_held');
});

test('非法 outcome 不得消费已领取的共享 lease', (t) => {
  const root = fixture(t);
  for (const id of ['one', 'two']) {
    create(root, id, 'dev');
    while (inspectFinishRun(readFinishRun({ root, runId: id })).currentStep !== 'target-convergence') passCurrent(root, id);
  }
  const claimed = advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' } });
  assert.throws(() => advanceFinishRun({ root, runId: 'one', fingerprints: { 'target-convergence': 'one' }, outcome: 'unknown', attemptToken: claimed.nextAction.attemptToken }), /Unsupported Task Finish outcome/);
  assert.throws(() => advanceFinishRun({ root, runId: 'two', fingerprints: { 'target-convergence': 'two' } }), (error) => error.code === 'task_finish.lease_held');
});

test('execution plan 在领取动作前拒绝错误 cwd 与不存在 npm script', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"test":"node --test"}}\n');
  assert.throws(() => validateFinishExecutionPlan({ root, plan: { cwd: path.dirname(root), command: process.execPath, commandSource: 'external-declared' } }), /outside/);
  assert.throws(() => validateFinishExecutionPlan({ root, plan: { cwd: root, command: process.execPath } }), /receipt-bound/);
  assert.throws(() => validateFinishExecutionPlan({ root, plan: { cwd: root, command: process.execPath, commandSource: 'external-declared', npmScript: 'missing' } }), /does not exist/);
  const plan = validateFinishExecutionPlan({ root, plan: { cwd: root, command: process.execPath, commandSource: 'external-declared', npmScript: 'test', verificationSelector: 'group:unit', availableSelectors: ['group:unit'] } });
  assert.equal(plan.npmScript, 'test');
  assert.equal(plan.verificationSelector, 'group:unit');
  assert.deepEqual(plan.availableSelectors, ['group:unit']);
  assert.equal(validateFinishExecutionPlan({ root, plan }).verificationSelector, 'group:unit');
});

test('active v1 run 兼容补入 late asset review 步骤', (t) => {
  const root = fixture(t); create(root);
  const file = path.join(root, '.buildr/task-finish/runs/finish-1.json');
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  legacy.steps = legacy.steps.filter((item) => item.id !== 'asset-review-late');
  legacy.steps.find((item) => item.id === 'cleanup').dependsOn = ['runtime-install'];
  fs.writeFileSync(file, `${JSON.stringify(legacy, null, 2)}\n`);
  const migrated = readFinishRun({ root, runId: 'finish-1' });
  assert.ok(migrated.steps.some((item) => item.id === 'asset-review-late'));
  assert.deepEqual(migrated.steps.find((item) => item.id === 'cleanup').dependsOn, ['asset-review-late']);
});

test('当前 holder 可续租且过期 holder 不可复活', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'target-convergence') passCurrent(root, 'finish-1');
  const claimed = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'target-convergence': 'target' }, clock: () => 1_000, leaseTtlMs: 100 });
  const renewed = renewFinishLease({ root, runId: 'finish-1', attemptToken: claimed.nextAction.attemptToken, clock: () => 1_050, leaseTtlMs: 200 });
  const lease = readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'target-convergence').lease;
  assert.equal(lease.renewalCount, 1);
  assert.equal(Date.parse(lease.expiresAt), 1_250);
  assert.equal(renewed.steps.find((item) => item.id === 'target-convergence').lease.renewalCount, 1);
  assert.throws(() => renewFinishLease({ root, runId: 'finish-1', attemptToken: claimed.nextAction.attemptToken, clock: () => 2_000 }), (error) => error.code === 'task_finish.lease-expired');
});

test('inspect 保留 blocked retry timing 并汇总浪费成本', (t) => {
  const root = fixture(t); create(root);
  const claimed = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v1' }, clock: () => 1_000 });
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v1' }, outcome: 'blocked', attemptToken: claimed.nextAction.attemptToken, blocked: { code: 'preflight', reason: 'bad plan' }, clock: () => 1_025 });
  const resumed = resumeFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v2' }, clock: () => 2_000 });
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v2' }, outcome: 'passed', attemptToken: resumed.nextAction.attemptToken, evidence: { id: 'context-ok' }, clock: () => 2_040 });
  const timing = inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).timing;
  assert.equal(timing.attemptCount, 2);
  assert.equal(timing.retryCount, 1);
  assert.equal(timing.attributableWasteMs, 25);
});

test('late asset review 位于 runtime install 与 cleanup 之间', () => {
  const ids = FINISH_STEPS.map((item) => item.id);
  assert.ok(ids.indexOf('runtime-install') < ids.indexOf('asset-review-late'));
  assert.ok(ids.indexOf('asset-review-late') < ids.indexOf('cleanup'));
});

test('safe executor 在原 checkpoint 上连续完成已声明只读步骤并停在边界', async (t) => {
  const root = fixture(t); create(root);
  const plan = (id) => ({ cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: id });
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1',
    fingerprints: { context: 'context-v1', 'current-knowledge': 'knowledge-v1' },
    executionPlans: { context: plan('context-safe'), 'current-knowledge': plan('knowledge-safe') },
  });
  assert.equal(result.safeExecution.status, 'stopped');
  assert.equal(result.safeExecution.reason, 'safe-plan-unavailable');
  assert.equal(result.currentStep, 'contract-convergence');
  assert.deepEqual(result.safeExecution.executedSteps.map(({ step, status }) => ({ step, status })), [
    { step: 'context', status: 'passed' }, { step: 'current-knowledge', status: 'passed' },
  ]);
});

test('safe executor 命令失败后保留 blocked checkpoint', async (t) => {
  const root = fixture(t); create(root);
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { context: 'context-v1' },
    executionPlans: { context: { cwd: root, command: '/usr/bin/false', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: 'context-failed' } },
  });
  assert.equal(result.safeExecution.reason, 'safe-action-failed');
  assert.equal(result.blocked[0].code, 'safe-action-failed');
});

test('safe executor 并行执行同一步的只读 observations', async (t) => {
  const root = fixture(t); create(root);
  let active = 0; let maxActive = 0;
  const runCommand = async () => {
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return { status: 0, stdout: '{}', stderr: '' };
  };
  const observation = { cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeHandler: 'process-probe' };
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { context: 'context-v1' }, runCommand,
    executionPlans: { context: { cwd: root, sharedMutation: false, safeAuto: true, evidenceId: 'parallel-context', observations: [observation, observation] } },
  });
  assert.equal(maxActive, 2);
  assert.equal(result.steps[0].evidence[0].observationCount, 2);
});

test('registered runtime sync handler 复用原状态机共享 lease', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'runtime-convergence') passCurrent(root, 'finish-1');
  const executable = path.join(root, 'projects/product/buildr');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, '#!/bin/sh\n');
  let observedLease = false;
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { 'runtime-convergence': 'runtime-v1' },
    executionPlans: { 'runtime-convergence': { cwd: root, command: executable, args: ['sync', 'codex', '--target', root], sharedMutation: true, safeAuto: true, safeHandler: 'buildr-runtime-sync', evidenceId: 'runtime-sync' } },
    runCommand: async () => { observedLease = Boolean(readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'runtime-convergence').lease); return { status: 0, stdout: '{}', stderr: '' }; },
  });
  assert.equal(observedLease, true);
  assert.equal(result.steps.find((item) => item.id === 'runtime-convergence').status, 'passed');
});

test('registered OpenSpec convergence handler调用单一产品入口', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'contract-convergence') passCurrent(root, 'finish-1');
  const executable = path.join(root, 'projects/product/buildr');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, '#!/bin/sh\n');
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { 'contract-convergence': 'converge-v1' },
    executionPlans: { 'contract-convergence': { cwd: root, command: executable, args: ['openspec', 'converge', 'change', '--project', 'product', '--target', root, '--json'], sharedMutation: true, safeAuto: true, safeHandler: 'buildr-openspec-converge', evidenceId: 'product-convergence' } },
    runCommand: async () => ({ status: 0, stdout: '{"schemaVersion":"buildr.openspec-convergence/v1","status":"passed"}', stderr: '' }),
  });
  assert.equal(result.currentStep, 'candidate-commit');
});

test('composite handler 顺序执行阶段并记录阶段 timing', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'contract-convergence') passCurrent(root, 'finish-1');
  const probe = (id) => ({ id, cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe' });
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { 'contract-convergence': 'composite-v1' },
    executionPlans: { 'contract-convergence': { cwd: root, sharedMutation: true, safeAuto: true, safeHandler: 'openspec-convergence', evidenceId: 'convergence-composite', stages: [{ id: 'rehearsal', commands: [probe('one')] }, { id: 'post-sync', commands: [probe('two')] }] } },
  });
  assert.equal(result.currentStep, 'candidate-commit');
  const evidence = readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'contract-convergence').evidence[0];
  assert.deepEqual(evidence.stages.map((stage) => stage.id), ['rehearsal', 'post-sync']);
});

test('formal verification composite 并行执行 required capabilities', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'formal-assurance') passCurrent(root, 'finish-1');
  let active = 0; let maxActive = 0;
  const capability = (id) => ({ id, cwd: root, command: process.execPath, commandSource: 'external-declared', args: ['--test'], sharedMutation: false, safeAuto: true, safeHandler: 'verification-capability' });
  const result = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { 'formal-assurance': 'candidate-v1' },
    executionPlans: { 'formal-assurance': { cwd: root, sharedMutation: true, safeAuto: true, safeHandler: 'formal-verification', evidenceId: 'affected-summary', stages: [{ id: 'required-capabilities', parallel: true, commands: [capability('fast'), capability('archive')] }] } },
    runCommand: async () => { active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; return { status: 0, stdout: '{}', stderr: '' }; },
  });
  assert.equal(maxActive, 2);
  assert.equal(result.currentStep, 'asset-review');
  assert.equal(readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'formal-assurance').evidence[0].observationCount, 2);
});

test('formal failure默认等待identity-bound repair授权', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'formal-assurance') passCurrent(root, 'finish-1');
  const command = { cwd: root, command: process.execPath, commandSource: 'external-declared', args: ['--test'], sharedMutation: false, safeAuto: true, safeHandler: 'verification-capability' };
  const plan = { cwd: root, sharedMutation: true, safeAuto: true, safeHandler: 'formal-verification', evidenceId: 'failed-formal', stages: [{ id: 'required', commands: [command] }] };
  const failed = await executeSafeFinishRun({
    root, runId: 'finish-1', fingerprints: { 'formal-assurance': 'candidate-failed' }, executionPlans: { 'formal-assurance': plan },
    runCommand: async () => ({ status: 1, stdout: '[verify-changed] failed: static contract tests (1)\n✖ task finish sequencing', stderr: '[verify-changed] warning: budget exceeded' }),
  });
  assert.equal(failed.repairDecision.status, 'required');
  assert.equal(failed.repairDecision.authorized, false);
  assert.equal(failed.diagnostics.primaryFailure.check, 'static contract tests (1)');
  assert.deepEqual(failed.diagnostics.warnings, ['[verify-changed] warning: budget exceeded']);
  const manifest = recoveryManifest({
    identities: { before: { candidate: 'old' }, after: { candidate: 'new' } },
    fingerprints: { 'contract-convergence': 'new' },
    transition: { type: 'implementation-changed', evidenceId: 'repair', changedPaths: ['src/application/task-finish/task-finish-run.mjs'] },
  });
  await assert.rejects(recoverFinishRun({ root, runId: 'finish-1', manifest }), /repair authorization is required/);
  manifest.repairAuthorization = {
    schemaVersion: FINISH_REPAIR_AUTHORIZATION_SCHEMA, id: 'auth-1', task: 'finish-1', change: 'change-1',
    failureIdentity: readFinishRun({ root, runId: 'finish-1' }).steps.find((item) => item.id === 'formal-assurance').inputFingerprint,
    allowedScopes: ['src/application/task-finish/**'], authorizedAt: new Date(Date.now() - 25).toISOString(),
  };
  const recovered = await recoverFinishRun({ root, runId: 'finish-1', manifest });
  assert.equal(recovered.recovery.repairAuthorization.id, 'auth-1');
  assert.ok(recovered.timing.repairMs >= 0);
  assert.equal(recovered.timing.phaseCoverage, 'verification-repair-reverification-closeout');
});

test('completion timing独立报告verification与closeout-only', (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'cleanup') passCurrent(root, 'finish-1');
  const checkpoint = inspectFinishRun(readFinishRun({ root, runId: 'finish-1' }));
  assert.ok(checkpoint.timing.initialVerificationMs >= 0);
  assert.ok(checkpoint.timing.closeoutMs >= 0);
  assert.equal(checkpoint.timing.endToEndWallClockMs, checkpoint.timing.wallClockMs);
  assert.ok(checkpoint.timing.orchestrationGapMs >= 0);
});

function recoveryManifest(overrides = {}) {
  return {
    schemaVersion: FINISH_RECOVERY_SCHEMA, id: 'recover-1',
    identities: {
      before: { environment: 'env-1', candidate: 'tree-1', target: 'ref-1', runtime: 'runtime-1', change: 'change-1', assurance: 'assurance-1' },
      after: { environment: 'env-1', candidate: 'tree-2', target: 'ref-1', runtime: 'runtime-2', change: 'change-1', assurance: null },
    },
    fingerprints: { 'contract-convergence': 'tree-2', 'candidate-commit': 'tree-2', 'target-convergence': 'ref-1', 'runtime-convergence': 'runtime-2', 'formal-assurance': 'tree-2' },
    executionPlans: {}, transition: { type: 'implementation-changed', evidenceId: 'candidate-diff' },
    ...overrides,
  };
}

test('typed recovery 原子终结 running lease 并停在真实 safe boundary', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'target-convergence') passCurrent(root, 'finish-1');
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'target-convergence': 'ref-1' } });
  const result = await recoverFinishRun({ root, runId: 'finish-1', manifest: recoveryManifest() });
  assert.equal(result.recovery.boundary, 'contract-convergence');
  assert.equal(result.safeExecution.reason, 'safe-plan-unavailable');
  const run = readFinishRun({ root, runId: 'finish-1' });
  const target = run.steps.find((item) => item.id === 'target-convergence');
  assert.equal(target.attempts.at(-1).outcome, 'stale');
  assert.equal(target.lease, null);
});

test('runtime projection recovery 需要digest与允许路径证明，否则按implementation changed fail closed', async (t) => {
  const root = fixture(t); create(root);
  while (inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).currentStep !== 'formal-assurance') passCurrent(root, 'finish-1');
  const before = recoveryManifest();
  before.id = 'runtime-proof-missing';
  before.transition = { type: 'runtime-projection-only', changedPaths: ['.agents/skills/task-finish/SKILL.md'], allowedPaths: [] };
  const failedClosed = await recoverFinishRun({ root, runId: 'finish-1', manifest: before });
  assert.equal(failedClosed.recovery.transition.type, 'implementation-changed');
  assert.equal(failedClosed.recovery.transition.classification, 'fail-closed');

  const proven = recoveryManifest({
    id: 'runtime-proof-ok',
    identities: { before: before.identities.after, after: { ...before.identities.after, runtime: 'runtime-3' } },
    transition: { type: 'runtime-projection-only', changedPaths: ['.agents/skills/task-finish/SKILL.md'], allowedPaths: ['.agents/skills/task-finish/SKILL.md'], sourceDigest: 'source-1', projectionDigest: 'projection-1', evidenceId: 'sync-receipt' },
  });
  const result = await recoverFinishRun({ root, runId: 'finish-1', manifest: proven });
  assert.equal(result.recovery.boundary, 'runtime-convergence');
  assert.equal(result.recovery.transition.type, 'runtime-projection-only');
});

test('重复 recovery 不重复登记transition，safe command ledger使用原始byte计量与child诊断', async (t) => {
  const root = fixture(t); create(root);
  const plan = { cwd: root, command: '/usr/bin/false', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: 'context-failed' };
  const manifest = recoveryManifest({
    identities: { before: { environment: 'old' }, after: { environment: 'new' } },
    fingerprints: { context: 'new' }, executionPlans: { context: plan }, transition: { type: 'unknown' },
  });
  const runCommand = async () => ({ status: 2, stdout: JSON.stringify({ schemaVersion: 'buildr.child/v1', status: 'blocked', code: 'child-invalid', nextActions: ['repair'] }), stderr: '' });
  const first = await recoverFinishRun({ root, runId: 'finish-1', manifest, runCommand });
  assert.equal(first.diagnostics.code, 'child-invalid');
  assert.deepEqual(first.diagnostics.nextActions, ['repair']);
  await recoverFinishRun({ root, runId: 'finish-1', manifest, runCommand });
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.equal(run.recoveries.filter((entry) => entry.id === 'recover-1').length, 1);
  assert.equal(run.observationLedger.find((entry) => entry.kind === 'command').stdoutBytes, Buffer.byteLength(JSON.stringify({ schemaVersion: 'buildr.child/v1', status: 'blocked', code: 'child-invalid', nextActions: ['repair'] })));
});

test('recovery成功后executed timing归属当前step并清除已解决diagnostic', async (t) => {
  const root = fixture(t); create(root);
  passCurrent(root, 'finish-1');
  passCurrent(root, 'finish-1');
  const probe = (id) => ({ cwd: root, command: '/usr/bin/true', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: id });
  await executeSafeFinishRun({ root, runId: 'finish-1', fingerprints: { 'contract-convergence': 'old' }, executionPlans: { 'contract-convergence': probe('old-failure') }, runCommand: async () => ({ status: 2, stdout: '{"status":"blocked","code":"old"}', stderr: '' }) });
  assert.equal(inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).diagnostics.code, 'old');
  const manifest = recoveryManifest({
    identities: { before: { environment: 'old' }, after: { environment: 'new' } },
    fingerprints: { context: 'new-context', 'current-knowledge': 'new-knowledge', 'contract-convergence': 'new-contract' },
    executionPlans: { context: probe('new-context'), 'current-knowledge': probe('new-knowledge'), 'contract-convergence': probe('new-contract') },
  });
  const result = await recoverFinishRun({ root, runId: 'finish-1', manifest, runCommand: async () => ({ status: 0, stdout: '{}', stderr: '' }) });
  assert.equal(result.diagnostics, null);
  assert.equal(result.validEvidence.some((evidence) => evidence.id === 'old-failure'), false);
  assert.equal(result.validEvidence.some((evidence) => evidence.id === 'new-contract'), true);
  for (const executed of result.safeExecution.executedSteps) {
    assert.equal(executed.durationMs, result.timing.attempts.filter((attempt) => attempt.step === executed.step).at(-1).durationMs);
  }
});

test('大输出非结构化失败有界且full diagnostic digest持久，手工checkpoint标记coverage gap', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-ledger-'));
  const root = path.join(workspace, '.worktrees', 'task');
  fs.mkdirSync(root, { recursive: true });
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  create(root);
  const plan = { cwd: root, command: '/usr/bin/false', commandSource: 'external-declared', args: [], sharedMutation: false, safeAuto: true, safeHandler: 'process-probe', evidenceId: 'large-failure' };
  const output = 'x'.repeat(50_000);
  const result = await executeSafeFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v1' }, executionPlans: { context: plan }, runCommand: async () => ({ status: 9, stdout: '', stderr: output }) });
  assert.equal(result.diagnostics.structured, false);
  assert.equal(result.diagnostics.stderr.preview.length, 1000);
  assert.equal(result.diagnostics.stderrBytes, undefined);
  assert.ok(fs.existsSync(result.diagnostics.diagnostic.path));
  assert.equal(result.timing.outputBytes, 50_000);
  assert.equal(result.timing.coverage, 'product-complete');

  const resumed = resumeFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v2' } });
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'v2' }, outcome: 'passed', attemptToken: resumed.nextAction.attemptToken, evidence: { id: 'manual-context' } });
  assert.equal(inspectFinishRun(readFinishRun({ root, runId: 'finish-1' })).timing.coverage, 'product-partial');
});
