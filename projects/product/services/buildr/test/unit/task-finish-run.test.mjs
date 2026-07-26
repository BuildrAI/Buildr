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
  return { result: advanceFinishRun({ root, runId, fingerprints: { [step]: fingerprint }, outcome: 'passed', attemptToken: token, effect: { id: `${step}-effect` }, evidence: { id: `${step}-evidence` } }), token, step };
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
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'context-v1' }, outcome: 'passed', attemptToken: token, effect: { id: 'adopted' } });
  advanceFinishRun({ root, runId: 'finish-1', fingerprints: { context: 'context-v1' }, outcome: 'passed', attemptToken: token, effect: { id: 'adopted' } });
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
  const result = advanceFinishRun({ root, runId: 'finish-1', fingerprints: { 'integration-push': 'push-v1' }, outcome: 'passed', attemptToken: token, expectedTargetRef: 'aaa', observedTargetRef: 'bbb' });
  assert.equal(result.blocked[0].code, 'target-race');
  const run = readFinishRun({ root, runId: 'finish-1' });
  assert.equal(run.steps.find((item) => item.id === 'target-convergence').status, 'stale');
  assert.equal(run.steps.find((item) => item.id === 'integration-push').effects.length, 0);
});
