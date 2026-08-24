import assert from 'node:assert/strict';
import test from 'node:test';

import { projectTaskFinishCurrentFacts } from '../../src/task/application/finish/task-finish-current-facts.mjs';
import {
  cleanupStaleFinishRunForRollover,
  cleanupStaleFinishRunForRetirement,
  inspectStaleFinishRunRolloverEligibility,
  inspectStaleFinishRunRetirementEligibility,
} from '../../src/task/application/finish/task-finish-recovery-primitives.mjs';

function phase(id, status, attempts) {
  return { id, status, attempts };
}

function stalePersistence(overrides = {}) {
  const repositories = [{
    selector: 'workspace', sourcePath: '.', retainedRoot: '/retained', taskRoot: '/task', environmentBranch: 'codex/task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null,
  }];
  return {
    runDigest: 'sha256-old-run',
    run: {
      runId: 'old-run', status: 'failed',
      identity: { task: 'task-1', handoffIdentity: 'sha256-old-handoff', candidateIdentity: 'sha256-old-candidate', candidateGeneration: 1, contentTargetIdentity: 'sha256-old-content', repositorySetIdentity: 'sha256-old-set', repositories },
      phases: [phase('preflight', 'passed', 1), phase('prepare', 'failed', 1), phase('verify', 'pending', 0), phase('deliver', 'pending', 0), phase('cleanup', 'pending', 0)],
      repositories: [{ selector: 'workspace', deliveryCarrier: { root: '/carrier', identity: 'sha256-carrier' }, delivery: null }],
      deliveryCarrier: { root: '/carrier', identity: 'sha256-carrier' }, resume: null, delivery: null, completion: null,
      ...overrides,
    },
    lease: null,
    preparedCompletion: null,
  };
}

function currentIdentity(overrides = {}) {
  return {
    task: 'task-1', handoffIdentity: 'sha256-current-handoff', candidateIdentity: 'sha256-current-candidate', candidateGeneration: 2, contentTargetIdentity: 'sha256-current-content', repositorySetIdentity: 'sha256-current-set',
    repositories: [{ selector: 'workspace', sourcePath: '.', retainedRoot: '/retained', taskRoot: '/task', environmentBranch: 'codex/task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null }],
    ...overrides,
  };
}

test('current facts对未知Finish blocker保留事实并同时暴露多种策略能力', () => {
  const readiness = {
    ready: true, gaps: { development: [], environment: [], delivery: [] }, handoff: { identity: 'sha256-handoff' }, nextWorkflow: null,
    identityParts: { task: 'task-1', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, contentTargetIdentity: 'sha256-content', repositorySetIdentity: 'sha256-set', repositories: [] },
  };
  const facts = projectTaskFinishCurrentFacts({
    taskId: 'task-1', operation: 'entry-readiness', readiness,
    result: { runId: 'run-1', status: 'blocked', identity: readiness.identityParts, repositories: [], primaryFailure: { code: 'task_finish.unclassified_delivery_state', message: 'No predefined recovery strategy.' } },
  });
  assert.equal(facts.blockers[0].code, 'task_finish.unclassified_delivery_state');
  assert.deepEqual(facts.availableCapabilities.filter((item) => item.status === 'available').map((item) => item.id), ['finish-run', 'finish-reconcile', 'git-operations', 'task-development', 'abandon-task']);
  assert.deepEqual(facts.requiredPrerequisites, []);
  assert.equal(facts.compatibilityHint, null);
});

test('current facts只公开portable occupancy与maintenance状态', () => {
  const facts = projectTaskFinishCurrentFacts({
    taskId: 'task-1',
    result: {
      runId: 'run-1', status: 'failed', identity: { handoffIdentity: 'sha256-handoff', repositories: [] }, repositories: [],
      occupancy: { status: 'released', releasedAt: '2026-08-23T00:00:00.000Z', previousCarrierIdentity: 'sha256-carrier', cleanup: { status: 'removed', root: '/private/carrier', repositories: [{ selector: 'workspace', status: 'removed', root: '/private/repository', carrierIdentity: 'sha256-carrier' }] } },
      maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'cleaned', diagnostics: 'retained', selfBootstrap: { carrierRoot: '/private/bootstrap' } },
    },
  });
  assert.deepEqual(facts.maintenance, { delivery: 'delivered', activation: 'attention', environmentCleanup: 'cleaned', diagnostics: 'retained' });
  assert.deepEqual(facts.ownership.occupancy.cleanup.repositories, [{ selector: 'workspace', status: 'removed', carrierIdentity: 'sha256-carrier' }]);
  assert.equal(JSON.stringify(facts).includes('/private/'), false);
});

test('旧run retirement资格封闭检查topology、phase与全部side-effect事实', () => {
  const eligible = inspectStaleFinishRunRetirementEligibility(stalePersistence(), currentIdentity());
  assert.equal(eligible.eligible, true);
  assert.deepEqual(eligible.blockers, []);

  const withLease = stalePersistence();
  withLease.lease = { token: 'foreign' };
  const blocked = inspectStaleFinishRunRetirementEligibility(withLease, currentIdentity());
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.blockers, ['lease']);
});

test('retirement原语在remote containment未证明时零cleanup effect', () => {
  const result = cleanupStaleFinishRunForRetirement({ persistence: stalePersistence(), identity: currentIdentity(), remoteContainmentProven: false });
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'task_finish.run_retirement_remote_containment_unproven');
  assert.equal(result.cleanup, null);
});

function rolloverPersistence(overrides = {}) {
  const failure = { phase: 'prepare', operation: 'task-contribution', code: 'task-finish.task-contribution-drift-unresolved' };
  const persistence = stalePersistence({
    primaryFailure: failure,
    phases: [phase('preflight', 'passed', 1), { ...phase('prepare', 'failed', 1), failure }, phase('verify', 'pending', 0), phase('deliver', 'pending', 0), phase('cleanup', 'pending', 0)],
    repositories: [{ selector: 'workspace', deliveryCarrier: { root: '/carrier', identity: 'sha256-carrier' }, carrierDisposability: { identity: 'sha256-proof' }, delivery: null }],
    ...overrides,
  });
  return persistence;
}

test('local rollover只接受已知Contribution drift和未变化carrier proof', () => {
  const verifyCarrier = () => ({ status: 'unchanged' });
  const eligible = inspectStaleFinishRunRolloverEligibility(rolloverPersistence(), currentIdentity(), { verifyCarrier });
  assert.equal(eligible.eligible, true);
  assert.match(eligible.recoveryToken, /^sha256-/);

  const drifted = inspectStaleFinishRunRolloverEligibility(rolloverPersistence(), currentIdentity(), { verifyCarrier: () => ({ status: 'changed', code: 'task-finish.carrier-disposability-drift' }) });
  assert.equal(drifted.eligible, false);
  assert.deepEqual(drifted.blockers, ['carrierDisposability']);

  const withDelivery = rolloverPersistence({ delivery: { status: 'delivered' } });
  assert.deepEqual(inspectStaleFinishRunRolloverEligibility(withDelivery, currentIdentity(), { verifyCarrier }).blockers, ['delivery']);
});

test('local rollover token不匹配时不触发carrier cleanup', () => {
  const result = cleanupStaleFinishRunForRollover({
    persistence: rolloverPersistence(),
    identity: currentIdentity(),
    recoveryToken: 'sha256-wrong',
    verifyCarrier: () => ({ status: 'unchanged' }),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'task_finish.run_rollover_token_mismatch');
  assert.equal(result.cleanup, null);
});

test('multi-repository部分cleanup失败逐selector报告effects并保留current replacement边界', () => {
  const persistence = rolloverPersistence();
  const qualification = inspectStaleFinishRunRolloverEligibility(persistence, currentIdentity(), { verifyCarrier: () => ({ status: 'unchanged' }) });
  const cleanup = cleanupStaleFinishRunForRollover({
    persistence,
    identity: currentIdentity(),
    recoveryToken: qualification.recoveryToken,
    verifyCarrier: () => ({ status: 'unchanged' }),
    removeCarriers: () => ({
      status: 'blocked',
      repositories: [
        { selector: 'service:a', status: 'removed', carrierIdentity: 'sha256-a' },
        { selector: 'service:b', status: 'blocked', code: 'task-finish.carrier-cleanup-failed', carrierIdentity: 'sha256-b' },
      ],
      diagnostic: { selector: 'service:b', code: 'task-finish.carrier-cleanup-failed' },
    }),
  });
  assert.equal(cleanup.status, 'blocked');
  assert.equal(cleanup.code, 'task_finish.carrier_cleanup_failed');
  assert.deepEqual(cleanup.cleanup.repositories.map((item) => [item.selector, item.status]), [['service:a', 'removed'], ['service:b', 'blocked']]);
});

test('current facts仅在资格成立时暴露rollover token与能力', () => {
  const recovery = inspectStaleFinishRunRolloverEligibility(rolloverPersistence(), currentIdentity(), { verifyCarrier: () => ({ status: 'unchanged' }) });
  const facts = projectTaskFinishCurrentFacts({ taskId: 'task-1', recovery });
  const capability = facts.availableCapabilities.find((item) => item.id === 'finish-rollover');
  assert.equal(facts.recovery.disposition, 'stale-run-retirable');
  assert.equal(capability.status, 'available');
  assert.equal(capability.recoveryToken, recovery.recoveryToken);
  assert.equal(facts.availableCapabilities.find((item) => item.id === 'finish-run').status, 'blocked');
  assert.equal(JSON.stringify(facts).includes('/carrier'), false);
});
