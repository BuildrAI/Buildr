import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createFinishRun,
  executeFinishRun,
  FINISH_PHASES,
  finishRunFile,
  inspectFinishRun,
  readFinishRun,
} from '../../src/application/task-finish/task-finish-run.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function identity(root, task = 'finish-handoff') {
  return {
    task,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content-target',
    agent: 'codex',
    targetBranch: 'dev',
    remote: null,
    environmentRoot: root,
    workspaceRoot: root,
    workspaceNodeIdentity: 'sha256-workspace-node',
  };
}

function passingHandlers(calls = [], carrierHead = 'abc') {
  return Object.fromEntries(FINISH_PHASES.map((phase) => [phase, async () => {
    calls.push(phase);
    if (phase === 'prepare') return { status: 'passed', output: { deliveryCarrier: { identity: `carrier-${carrierHead}`, head: carrierHead, tree: `tree-${carrierHead}`, branch: 'codex/finish-handoff' } } };
    if (phase === 'verify') return { status: 'passed', output: { equivalence: { status: 'equivalent', formalVerificationExecutions: 0, carrierIdentity: `carrier-${carrierHead}` } } };
    if (phase === 'deliver') return { status: 'passed', output: { delivery: { status: 'delivered', carrierRef: carrierHead } } };
    if (phase === 'cleanup') return { status: 'passed', output: { completion: { status: 'complete', receipt: '/tmp/complete.json' } } };
    return { status: 'passed' };
  }]));
}

test('单次产品调用消费 handoff 并完成五阶段，formal Verification 恒为零', async (t) => {
  const root = fixture(t);
  const calls = [];
  const result = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'normal', identity: identity(root) }), handlers: passingHandlers(calls) });
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v2');
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, FINISH_PHASES);
  assert.deepEqual(result.phases.map((phase) => phase.id), FINISH_PHASES);
  assert.equal(result.handoff.identity, 'sha256-handoff');
  assert.deepEqual(result.candidate, { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content-target' });
  assert.equal(result.carrier.identity, 'carrier-abc');
  assert.equal(result.equivalence.status, 'equivalent');
  assert.equal(result.metrics.formalVerificationExecutions, 0);
  assert.equal(Object.hasOwn(result.identity, 'project'), false);
  assert.equal(Object.hasOwn(result.identity, 'change'), false);
});

test('run identity 强制绑定 Development handoff/Candidate/Content Target，拒绝旧 shape', (t) => {
  const root = fixture(t);
  const run = createFinishRun({ root, runId: 'current', identity: identity(root) });
  assert.equal(run.schemaVersion, 'buildr.task-finish-run/v2');
  for (const field of ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity']) {
    const invalid = identity(root);
    delete invalid[field];
    assert.throws(() => createFinishRun({ root, runId: `missing-${field.toLowerCase()}`, identity: invalid }), new RegExp(field));
  }
  const oldFile = finishRunFile(root, 'old-v1');
  fs.mkdirSync(path.dirname(oldFile), { recursive: true });
  fs.writeFileSync(oldFile, JSON.stringify({ schemaVersion: 'buildr.task-finish-run/v1', runId: 'old-v1', phases: [] }));
  assert.throws(() => readFinishRun({ root, runId: 'old-v1' }), /Unsupported Task Finish run schema/);
});

test('carrier equivalence 缺陷终止 run 并返回 Task Development', async (t) => {
  const root = fixture(t);
  const calls = [];
  const handlers = passingHandlers(calls);
  handlers.verify = async () => {
    calls.push('verify');
    return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Carrier content changed.' } };
  };
  const result = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'defect', identity: identity(root, 'defect') }), handlers });
  assert.equal(result.status, 'failed');
  assert.equal(result.nextWorkflow, 'task-development');
  assert.equal(result.primaryFailure.phase, 'verify');
  assert.deepEqual(calls, ['preflight', 'prepare', 'verify']);
  assert.equal(result.resume, null);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
});

test('连续 target race 每次使用新精确 token 重建 carrier，复用 Candidate 且不执行 formal Verification', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.deliver = async () => {
    firstCalls.push('deliver');
    return { status: 'blocked', failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target changed.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'target-race', identity: identity(root, 'target-race') }), handlers });
  assert.equal(first.status, 'blocked');
  assert.equal(first.nextWorkflow, null);
  assert.match(first.resume.token, /^sha256-/);
  assert.deepEqual(firstCalls, ['preflight', 'prepare', 'verify', 'deliver']);
  const secondCalls = [];
  const secondHandlers = passingHandlers(secondCalls, 'def');
  secondHandlers.deliver = async () => {
    secondCalls.push('deliver');
    return { status: 'blocked', failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target changed again.' } };
  };
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'target-race' }), handlers: secondHandlers, resumeToken: first.resume.token });
  assert.equal(second.status, 'blocked');
  assert.deepEqual(secondCalls, ['prepare', 'verify', 'deliver']);
  assert.match(second.resume.token, /^sha256-/);
  assert.notEqual(second.resume.token, first.resume.token);
  const thirdCalls = [];
  const third = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'target-race' }), handlers: passingHandlers(thirdCalls, 'ghi'), resumeToken: second.resume.token });
  assert.equal(third.status, 'complete');
  assert.deepEqual(thirdCalls, ['prepare', 'verify', 'deliver', 'cleanup']);
  assert.equal(third.candidate.identity, 'sha256-candidate');
  assert.equal(third.candidate.generation, 1);
  assert.equal(third.carrier.head, 'ghi');
  assert.equal(third.phases.find((phase) => phase.id === 'preflight').attempts, 1);
  assert.equal(third.phases.find((phase) => phase.id === 'prepare').attempts, 3);
  assert.equal(third.phases.find((phase) => phase.id === 'verify').attempts, 3);
  assert.equal(third.phases.find((phase) => phase.id === 'deliver').attempts, 3);
  assert.equal(third.metrics.formalVerificationExecutions, 0);
  assert.equal(inspectFinishRun({ root, runId: 'target-race' }).status, 'complete');
});

test('cleanup 暂态阻塞恢复只重试 cleanup', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.cleanup = async () => {
    firstCalls.push('cleanup');
    return { status: 'blocked', failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: 'task-finish.environment-busy', message: 'Task-owned process is still running.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'cleanup-resume', identity: identity(root, 'cleanup-resume') }), handlers });
  const secondCalls = [];
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'cleanup-resume' }), handlers: passingHandlers(secondCalls), resumeToken: first.resume.token });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['cleanup']);
  assert.equal(second.phases.find((phase) => phase.id === 'verify').attempts, 1);
  assert.equal(second.metrics.formalVerificationExecutions, 0);
});
