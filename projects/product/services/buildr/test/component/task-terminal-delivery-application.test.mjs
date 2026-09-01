import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTaskTerminalDeliveryApplication } from '../../src/task/application/task-terminal-delivery-application.mjs';

const TASK = 'terminal-task';
const ids = {
  handoff: 'sha256-handoff', candidate: 'sha256-candidate', target: 'sha256-target', carrier: 'sha256-carrier', result: 'sha256-result', plan: 'sha256-plan',
};

function cleanup() {
  return { operation: 'cleanup', status: 'cleaned', taskId: TASK, environment: { status: 'cleaned', latest: { cleanup: { status: 'cleaned', completedAt: '2026-08-05T00:00:05.000Z', summary: '已清理。' } } } };
}

function finishEntry(overrides = {}) {
  const result = {
    runId: `${TASK}-run`, status: 'complete', completedAt: '2026-08-05T00:00:06.000Z', reuseMode: 'deterministic-reuse',
    identity: { task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, targetBranch: 'dev', remote: 'origin' },
    handoff: { identity: ids.handoff }, candidate: { identity: ids.candidate, generation: 1, contentTargetIdentity: ids.target },
    carrier: { identity: ids.carrier },
    equivalence: { status: 'equivalent', reuseMode: 'deterministic-reuse', semanticEquivalence: 'deterministic-git-identity', handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, carrierIdentity: ids.carrier },
    delivery: { status: 'delivered', carrierRef: 'abc123', remoteAfterRef: 'abc123', finalRemoteRef: 'abc123', activation: { status: 'passed' }, retainedDoctor: 'passed', runtimeInstall: 'passed', localAppDelivery: { status: 'passed', channel: 'development' } },
    completion: { status: 'complete', cleanup: cleanup() },
    ...overrides,
  };
  return { result, completion: { task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, carrierIdentity: ids.carrier, carrierRef: 'abc123' } };
}

function handoff() {
  return {
    identity: ids.handoff,
    candidate: { identity: ids.candidate, generation: 1, contentTargetIdentity: ids.target, taskContextIdentity: 'sha256-context' },
    gates: {
      planning: { disposition: 'not-applicable', targetIdentity: ids.plan, summary: '无需独立方案审查。', source: 'change guard' },
      completion: { resultDigest: 'sha256-completion-result', targetIdentity: ids.candidate, outcome: 'ready', applicability: 'current' },
    },
    decision: { outcome: 'proceed', risks: [] },
  };
}

function association() {
  return {
    schemaVersion: 'buildr.task-terminal-delivery-associations/v1', handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1,
    gates: {
      planning: { status: 'gate-disposition', disposition: 'not-applicable', targetIdentity: ids.plan, summary: '无需独立方案审查。', source: 'change guard' },
      completion: { status: 'adopted-at-delivery', targetIdentity: ids.candidate, resultDigest: 'sha256-completion-result', outcome: 'ready' },
    },
    observedAt: '2026-08-05T00:00:06.000Z', source: 'task-finish-application',
  };
}

function runtimeFor(status = 'completed', finish = finishEntry()) {
  const immutable = handoff();
  const receipt = { taskContext: { identity: 'sha256-context' }, planning: { identity: ids.plan, nodes: [] }, contentTarget: { identity: ids.target }, candidate: immutable.candidate, handoffs: [immutable] };
  const runtime = {
    inspectTaskRecord: () => ({ record: { taskId: TASK, status, result: status === 'completed' ? { noChange: false } : null } }),
    inspectTaskDevelopment: () => ({ operation: 'inspect', status: 'inspected', development: { receipt } }),
    inspectTaskReview: () => ({ slots: {
      planning: { present: false, result: null, resultDigest: null, applicability: null },
      completion: { present: true, resultDigest: 'sha256-completion-result', applicability: 'unknown', result: { targetIdentity: ids.candidate, conclusion: { outcome: 'ready' } } },
    } }),
    inspectTaskFinishReadModel: () => finish ? ({ state: 'terminal', result: finish.result, completion: { ...finish.completion, runId: finish.result.runId, completedAt: finish.result.completedAt, finalRemoteRef: finish.result.delivery.finalRemoteRef, targetBranch: finish.result.identity.targetBranch, cleanup: finish.result.completion.cleanup, association: association() }, diagnostics: [] }) : ({ state: 'none', result: null, completion: null, diagnostics: [] }),
  };
  registerTaskTerminalDeliveryApplication(runtime);
  return runtime;
}

test('terminal composer separates delivered snapshot from live applicability', () => {
  const runtime = runtimeFor();
  runtime.inspectTaskReview = () => ({ slots: { planning: { present: false }, completion: { present: true, resultDigest: 'sha256-new-completion', result: { targetIdentity: 'sha256-new-target', conclusion: { outcome: 'changes-required' } } } } });
  const projection = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
  assert.equal(projection.delivery.finalRemoteRef, 'abc123');
  assert.equal(projection.associations.planning.status, 'gate-disposition');
  assert.equal(projection.associations.completion.status, 'adopted-at-delivery');
  assert.equal(projection.reviews.slots.completion.resultDigest, 'sha256-new-completion');
  assert.equal(projection.associations.completion.resultDigest, 'sha256-completion-result');
});

test('terminal composer does not gate new v2 delivery on deprecated product install fields', () => {
  const current = finishEntry({
    delivery: { status: 'delivered', carrierRef: 'abc123', remoteAfterRef: 'abc123', finalRemoteRef: 'abc123', activation: { status: 'passed' }, retainedDoctor: 'passed' },
  });
  const projection = runtimeFor('completed', current).inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
});

test('Task已交付但Environment cleanup pending时保持delivered并独立投影maintenance', () => {
  const runtime = runtimeFor();
  const terminal = runtime.inspectTaskFinishReadModel('/workspace', TASK);
  runtime.inspectTaskFinishReadModel = () => ({
    ...terminal,
    state: 'current',
    result: { ...terminal.result, status: 'cleanup_pending' },
    completion: {
      ...terminal.completion,
      status: 'prepared',
      cleanup: { status: 'pending', summary: 'cleanup remains independent' },
      maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'attention' },
    },
  });
  const projection = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
  assert.equal(projection.delivery.cleanup.status, 'pending');
  assert.deepEqual(projection.maintenance, { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'attention' });
});

test('terminal composer covers active, no-change, abandoned, unproven and identity mismatch', () => {
  assert.equal(runtimeFor('active').inspectTaskTerminalDelivery('/workspace', TASK).status, 'active');
  const noChange = runtimeFor(); noChange.inspectTaskRecord = () => ({ record: { taskId: TASK, status: 'completed', result: { noChange: true } } });
  assert.equal(noChange.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-no-change');
  assert.equal(runtimeFor('abandoned').inspectTaskTerminalDelivery('/workspace', TASK).status, 'abandoned');
  assert.equal(runtimeFor('completed', null).inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed');
  const missingAssociation = runtimeFor();
  const readFinish = missingAssociation.inspectTaskFinishReadModel;
  missingAssociation.inspectTaskFinishReadModel = (...args) => { const value = readFinish(...args); delete value.completion.association; return value; };
  assert.equal(missingAssociation.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed');
  const unavailable = runtimeFor('completed', null);
  unavailable.readTaskFinishResults = () => { throw new Error('GET must not scan Finish Result files.'); };
  assert.equal(unavailable.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed');
});

test('研发与审查Tab只读取自身节点与已写交付关联', () => {
  const assertNoAggregate = (runtime) => {
    runtime.inspectTaskTerminalDelivery = () => { throw new Error('专业 Tab 不得调用完整 terminal 聚合器。'); };
  };

  const developmentRuntime = runtimeFor();
  let developmentReads = 0;
  const inspectDevelopment = developmentRuntime.inspectTaskDevelopment;
  developmentRuntime.inspectTaskDevelopment = (...args) => { developmentReads += 1; return inspectDevelopment(...args); };
  developmentRuntime.inspectTaskReview = () => { throw new Error('Development Tab 不得读取 Review。'); };
  assertNoAggregate(developmentRuntime);
  const development = developmentRuntime.inspectTaskDevelopmentView('/workspace', TASK);
  assert.equal(developmentReads, 1);
  assert.equal(development.terminal.status, 'delivered');
  assert.equal(development.terminal.snapshot.handoff.identity, ids.handoff);

  const reviewRuntime = runtimeFor();
  let reviewReads = 0;
  const inspectReview = reviewRuntime.inspectTaskReview;
  reviewRuntime.inspectTaskReview = (...args) => { reviewReads += 1; return inspectReview(...args); };
  let reviewDevelopmentReads = 0;
  const reviewDevelopment = reviewRuntime.inspectTaskDevelopment;
  reviewRuntime.inspectTaskDevelopment = (...args) => { reviewDevelopmentReads += 1; return reviewDevelopment(...args); };
  assertNoAggregate(reviewRuntime);
  const reviews = reviewRuntime.inspectTaskReviewView('/workspace', TASK);
  assert.equal(reviewReads, 1);
  assert.equal(reviewDevelopmentReads, 1);
  assert.equal(reviews.terminal.associations.completion.status, 'adopted-at-delivery');

});


test('direct completion needs no Finish association and never invents verified delivery', () => {
  const runtime = runtimeFor('completed', null);
  const projection = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'completed');
  assert.equal(projection.delivered, false);
  assert.equal(projection.delivery, null);
  assert.deepEqual(projection.diagnostics, []);
  runtime.inspectTaskFinishReadModel = () => { throw Object.assign(new Error('old history unavailable'), { code: 'history-unavailable' }); };
  const degraded = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(degraded.status, 'completed');
  assert.equal(degraded.delivered, false);
  assert.equal(degraded.diagnostics[0].code, 'history-unavailable');
});

test('已完成任务隔离每种专业记录损坏且保留未完成任务错误', () => {
  for (const method of ['inspectTaskDevelopment', 'inspectTaskReview']) {
    const runtime = runtimeFor('completed', null);
    runtime[method] = () => { throw Object.assign(new Error('stored record invalid'), { code: 'record-invalid' }); };
    const result = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
    assert.equal(result.status, 'completed');
    assert.equal(result.delivered, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'record-invalid'));
    const active = runtimeFor('active', null);
    active[method] = runtime[method];
    assert.throws(() => active.inspectTaskTerminalDelivery('/workspace', TASK), /stored record invalid/);
  }
});

test('审查页不因无关旧研发记录损坏失去完成事实', () => {
  const runtime = runtimeFor('completed', null);
  runtime.inspectTaskDevelopment = () => { throw Object.assign(new Error('invalid development'), { code: 'development-invalid' }); };
  const result = runtime.inspectTaskReviewView('/workspace', TASK);
  assert.equal(result.terminal.status, 'completed');
  assert.equal(result.terminal.diagnostics[0].code, 'development-invalid');
});

test('专业页的自身读取失败明确返回不可用诊断而非伪造未记录', () => {
  const runtime = runtimeFor('completed', null);
  runtime.inspectTaskReview = () => { throw Object.assign(new Error('review unavailable'), { code: 'review-unavailable' }); };
  const review = runtime.inspectTaskReviewView('/workspace', TASK);
  assert.equal(review.terminal.status, 'completed');
  assert.equal(review.diagnostic.code, 'review-unavailable');
  runtime.inspectTaskDevelopment = () => { throw new Error('development unavailable'); };
  const development = runtime.inspectTaskDevelopmentView('/workspace', TASK);
  assert.equal(development.status, 'unavailable');
  assert.equal(development.terminal.status, 'completed');
});

test('旧收尾阻塞不覆盖进行中任务状态或生成恢复动作', () => {
  const runtime = runtimeFor('active', null);
  runtime.inspectTaskFinishReadModel = () => ({ state: 'current', result: { runId: 'legacy', status: 'blocked', nextAction: 'old resume' }, diagnostics: [] });
  const result = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(result.status, 'active');
  assert.equal(result.delivery.runId, 'legacy');
  assert.equal(result.delivery.nextAction, null);
});
