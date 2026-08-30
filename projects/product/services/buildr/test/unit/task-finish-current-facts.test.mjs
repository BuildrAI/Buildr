import assert from 'node:assert/strict';
import test from 'node:test';

import { projectTaskFinishCurrentFacts } from '../../src/task/application/finish/task-finish-current-facts.mjs';

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
  assert.deepEqual(facts.availableCapabilities.filter((item) => item.status === 'available').map((item) => item.id), []);
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
