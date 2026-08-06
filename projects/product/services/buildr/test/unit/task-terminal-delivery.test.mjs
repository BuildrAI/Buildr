import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTaskTerminalDeliveryApplication } from '../../src/application/task-terminal-delivery/task-terminal-delivery-application.mjs';

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
    candidate: { identity: ids.candidate, generation: 1, contentTargetIdentity: ids.target, taskContextIdentity: 'sha256-context', policyIdentity: 'sha256-policy' },
    gates: {
      planning: { disposition: 'not-applicable', targetIdentity: ids.plan, summary: '无需独立方案审查。', source: 'change guard' },
      verification: { resultDigest: ids.result, targetIdentity: ids.target, outcome: 'passed', applicability: 'current' },
      completion: { resultDigest: 'sha256-completion-result', targetIdentity: ids.candidate, outcome: 'ready', applicability: 'current' },
    },
    decision: { outcome: 'proceed', risks: [] },
  };
}

function runtimeFor(status = 'completed', finish = finishEntry()) {
  const immutable = handoff();
  const receipt = { taskContext: { identity: 'sha256-context' }, planning: { identity: ids.plan, nodes: [] }, contentTarget: { identity: ids.target }, verificationPolicy: { identity: 'sha256-policy' }, candidate: immutable.candidate, handoffs: [immutable] };
  const runtime = {
    inspectTaskRecord: () => ({ record: { taskId: TASK, status, result: status === 'completed' ? { noChange: false } : null } }),
    inspectTaskDevelopment: () => ({ operation: 'inspect', status: 'inspected', development: { receipt } }),
    inspectTaskReview: () => ({ slots: {
      planning: { present: false, result: null, resultDigest: null, applicability: null },
      completion: { present: true, resultDigest: 'sha256-completion-result', applicability: 'unknown', result: { targetIdentity: ids.candidate, conclusion: { outcome: 'ready' } } },
    } }),
    inspectTaskVerification: () => ({ slot: { present: true, resultDigest: ids.result, applicability: { status: 'unknown' }, result: { target: { identity: ids.target }, conclusion: { outcome: 'passed' } } } }),
    inspectTaskLifecycleReadModel: () => ({ model: { finish: finish ? {
      status: 'delivered', runId: finish.result.runId, handoffIdentity: finish.result.identity.handoffIdentity,
      candidateIdentity: finish.result.identity.candidateIdentity, candidateGeneration: finish.result.identity.candidateGeneration,
      contentTargetIdentity: finish.result.identity.contentTargetIdentity, completedAt: finish.result.completedAt,
      finalRemoteRef: finish.result.delivery.finalRemoteRef, targetBranch: finish.result.identity.targetBranch,
      remote: finish.result.identity.remote, cleanup: finish.result.completion.cleanup, reuseMode: finish.result.reuseMode,
      equivalence: finish.result.equivalence,
      association: {
        schemaVersion: 'buildr.task-terminal-delivery-associations/v1', handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1,
        gates: {
          planning: { status: 'gate-disposition', disposition: 'not-applicable', targetIdentity: ids.plan, summary: '无需独立方案审查。', source: 'change guard' },
          completion: { status: 'adopted-at-delivery', targetIdentity: ids.candidate, resultDigest: 'sha256-completion-result', outcome: 'ready' },
          verification: { status: 'verified-at-delivery', targetIdentity: ids.target, resultDigest: ids.result, outcome: 'passed' },
        },
        observedAt: '2026-08-05T00:00:06.000Z', source: 'task-finish-application',
      },
      diagnostics: [],
    } : null } }),
  };
  registerTaskTerminalDeliveryApplication(runtime);
  return runtime;
}

test('terminal composer separates delivered snapshot from live applicability', () => {
  const runtime = runtimeFor();
  runtime.inspectTaskReview = () => ({ slots: { planning: { present: false }, completion: { present: true, resultDigest: 'sha256-new-completion', result: { targetIdentity: 'sha256-new-target', conclusion: { outcome: 'changes-required' } } } } });
  runtime.inspectTaskVerification = () => ({ slot: { present: true, resultDigest: 'sha256-new-verification', result: { target: { identity: 'sha256-new-target' }, conclusion: { outcome: 'failed' } } } });
  const projection = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
  assert.equal(projection.delivery.finalRemoteRef, 'abc123');
  assert.equal(projection.associations.planning.status, 'gate-disposition');
  assert.equal(projection.associations.completion.status, 'adopted-at-delivery');
  assert.equal(projection.associations.verification.status, 'verified-at-delivery');
  assert.equal(projection.reviews.slots.completion.resultDigest, 'sha256-new-completion');
  assert.equal(projection.associations.completion.resultDigest, 'sha256-completion-result');
  assert.equal(projection.associations.verification.resultDigest, ids.result);
});

test('terminal composer does not gate new v2 delivery on deprecated product install fields', () => {
  const current = finishEntry({
    delivery: { status: 'delivered', carrierRef: 'abc123', remoteAfterRef: 'abc123', finalRemoteRef: 'abc123', activation: { status: 'passed' }, retainedDoctor: 'passed' },
  });
  const projection = runtimeFor('completed', current).inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
});

test('terminal composer covers active, no-change, abandoned, unproven and identity mismatch', () => {
  assert.equal(runtimeFor('active').inspectTaskTerminalDelivery('/workspace', TASK).status, 'active');
  const noChange = runtimeFor(); noChange.inspectTaskRecord = () => ({ record: { taskId: TASK, status: 'completed', result: { noChange: true } } });
  assert.equal(noChange.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-no-change');
  assert.equal(runtimeFor('abandoned').inspectTaskTerminalDelivery('/workspace', TASK).status, 'abandoned');
  assert.equal(runtimeFor('completed', null).inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-unproven');
  const missingAssociation = runtimeFor();
  const readLifecycle = missingAssociation.inspectTaskLifecycleReadModel;
  missingAssociation.inspectTaskLifecycleReadModel = (...args) => { const value = readLifecycle(...args); delete value.model.finish.association; return value; };
  assert.equal(missingAssociation.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-unproven');
  const unavailable = runtimeFor('completed', null);
  unavailable.readTaskFinishResults = () => { throw new Error('GET must not scan Finish Result files.'); };
  assert.equal(unavailable.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-unproven');
});

test('三个专业 Tab 只读取自身节点与已写交付关联', () => {
  const assertNoAggregate = (runtime) => {
    runtime.inspectTaskTerminalDelivery = () => { throw new Error('专业 Tab 不得调用完整 terminal 聚合器。'); };
  };

  const developmentRuntime = runtimeFor();
  let developmentReads = 0;
  const inspectDevelopment = developmentRuntime.inspectTaskDevelopment;
  developmentRuntime.inspectTaskDevelopment = (...args) => { developmentReads += 1; return inspectDevelopment(...args); };
  developmentRuntime.inspectTaskReview = () => { throw new Error('Development Tab 不得读取 Review。'); };
  developmentRuntime.inspectTaskVerification = () => { throw new Error('Development Tab 不得读取 Verification。'); };
  assertNoAggregate(developmentRuntime);
  const development = developmentRuntime.inspectTaskDevelopmentView('/workspace', TASK);
  assert.equal(developmentReads, 1);
  assert.equal(development.terminal.status, 'delivered');
  assert.equal(development.terminal.snapshot.handoff.identity, ids.handoff);

  const reviewRuntime = runtimeFor();
  let reviewReads = 0;
  const inspectReview = reviewRuntime.inspectTaskReview;
  reviewRuntime.inspectTaskReview = (...args) => { reviewReads += 1; return inspectReview(...args); };
  reviewRuntime.inspectTaskDevelopment = () => { throw new Error('Review Tab 不得读取 Development。'); };
  reviewRuntime.inspectTaskVerification = () => { throw new Error('Review Tab 不得读取 Verification。'); };
  assertNoAggregate(reviewRuntime);
  const reviews = reviewRuntime.inspectTaskReviewView('/workspace', TASK);
  assert.equal(reviewReads, 1);
  assert.equal(reviews.terminal.associations.completion.status, 'adopted-at-delivery');

  const verificationRuntime = runtimeFor();
  let verificationReads = 0;
  const inspectVerification = verificationRuntime.inspectTaskVerification;
  verificationRuntime.inspectTaskVerification = (...args) => { verificationReads += 1; return inspectVerification(...args); };
  verificationRuntime.inspectTaskDevelopment = () => { throw new Error('Verification Tab 不得读取 Development。'); };
  verificationRuntime.inspectTaskReview = () => { throw new Error('Verification Tab 不得读取 Review。'); };
  assertNoAggregate(verificationRuntime);
  const verification = verificationRuntime.inspectTaskVerificationView('/workspace', TASK);
  assert.equal(verificationReads, 1);
  assert.equal(verification.terminal.associations.verification.status, 'verified-at-delivery');
});
