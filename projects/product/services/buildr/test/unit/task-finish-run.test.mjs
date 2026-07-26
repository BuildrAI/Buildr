import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceFinishRun, createFinishRun, inspectFinishRun, readFinishRun, resumeFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

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
