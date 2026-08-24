import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateTaskFinishBootstrapRecovery,
  inspectTaskFinishBootstrapRecoveryQualification,
} from '../../src/task/application/finish/task-finish-bootstrap-recovery.mjs';
import { executeFinishRun, finishResult } from '../../src/task/application/finish/task-finish-run.mjs';

function phase(id, status = 'pending', attempts = 0, failure = null) {
  return {
    id, status, attempts,
    startedAt: null, completedAt: null, durationMs: 0,
    inputIdentity: null, outputIdentity: null,
    checks: [], operations: [], observations: [], output: null, failure,
  };
}

function failedPrepareRun() {
  const failure = { phase: 'prepare', origin: 'product-phase-provider', operation: 'carrier-preparation', code: 'task-finish.test-provider-defect', status: 'failed', message: 'injected provider defect' };
  return {
    schemaVersion: 'buildr.task-finish-run/v2',
    runId: 'repair-finish-20260814000000-deadbeef',
    status: 'failed',
    identity: {
      task: 'repair-finish', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 2,
      contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: 'origin',
      environmentRoot: '/tmp/task-source', workspaceRoot: '/tmp/workspace', deliveryCommitIdentity: 'sha256-message',
    },
    identityDigest: 'sha256-run',
    createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:01.000Z', completedAt: null,
    invocations: 1, productCommandObservations: 0,
    deliveryCommit: { identity: 'sha256-message', subject: 'fix: repair finish' }, developmentHandoff: null,
    deliveryCarrier: null, equivalence: null, delivery: null, completion: null, resume: null, primaryFailure: failure,
    phases: [phase('preflight', 'passed', 1), phase('prepare', 'failed', 1, failure), phase('verify'), phase('deliver'), phase('cleanup')],
  };
}

function context() {
  return {
    identity: 'sha256-bootstrap', runId: 'repair-finish-20260814000000-deadbeef', taskId: 'repair-finish',
    targetRoot: '/tmp/workspace', retainedSourceRoot: '/tmp/workspace/projects/product/services/buildr', retainedSourceCommit: 'a'.repeat(40),
    capsuleRoot: '/tmp/workspace/.buildr/transient/task-finish/bootstrap-recovery/run/capsule',
    manifestPath: '/tmp/workspace/.buildr/transient/task-finish/bootstrap-recovery/run/capsule/authority.json',
    sourceRoot: '/tmp/workspace/.buildr/transient/task-finish/bootstrap-recovery/run/capsule/source',
    executorModule: '/tmp/workspace/.buildr/transient/task-finish/bootstrap-recovery/run/capsule/source/projects/product/services/buildr/src/task/application/finish/task-finish-product-executor.mjs',
    revocationPath: '/tmp/workspace/.buildr/transient/task-finish/bootstrap-recovery/run/capsule/revocation.json',
    sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40), executorDigest: 'sha256-executor',
    authorization: { kind: 'explicit-cli-flag', identity: 'sha256-authorization', authorizedAt: '2026-08-14T00:00:02.000Z' },
  };
}

test('无副作用prepare provider failure可以在同一run受控重置', () => {
  const run = failedPrepareRun();
  const qualification = inspectTaskFinishBootstrapRecoveryQualification({ run, lease: null, preparedCompletion: null });
  assert.equal(qualification.ready, true);
  assert.equal(qualification.phaseId, 'prepare');

  const activated = activateTaskFinishBootstrapRecovery(run, context(), { run, lease: null, preparedCompletion: null });
  assert.equal(activated.runId, run.runId);
  assert.equal(activated.status, 'active');
  assert.equal(activated.phases[1].status, 'pending');
  assert.equal(activated.phases[1].attempts, 1);
  assert.equal(activated.bootstrapRecovery.mode, 'retained-writer-candidate-phase-provider');
  assert.equal(activated.bootstrapRecovery.originalAttempt.runStatus, 'failed');
  assert.equal(activated.bootstrapRecovery.originalAttempt.primaryFailure.code, 'task-finish.test-provider-defect');
  assert.equal(activated.identity.candidateGeneration, 2);
});

test('已有carrier或downstream fact时bootstrap recovery fail closed', () => {
  const run = failedPrepareRun();
  run.deliveryCarrier = { identity: 'sha256-carrier' };
  const qualification = inspectTaskFinishBootstrapRecoveryQualification({ run, lease: null, preparedCompletion: null });
  assert.equal(qualification.ready, false);
  assert.equal(qualification.code, 'task_finish.bootstrap_recovery_not_qualified');
  assert.equal(qualification.sideEffects.carrier, true);
});

test('普通Product失败即使边界相同也不能冒充provider exception', () => {
  const run = failedPrepareRun();
  delete run.primaryFailure.origin;
  delete run.phases[1].failure.origin;
  const qualification = inspectTaskFinishBootstrapRecoveryQualification({ run, lease: null, preparedCompletion: null });
  assert.equal(qualification.ready, false);
  assert.equal(qualification.origin, null);
});

test('五阶段shell只给未处理的provider exception标记确定origin', async () => {
  const run = failedPrepareRun();
  run.status = 'active';
  run.primaryFailure = null;
  run.phases = [phase('preflight'), phase('prepare'), phase('verify'), phase('deliver'), phase('cleanup')];
  const result = await executeFinishRun({
    root: '/tmp/workspace',
    run,
    handlers: { preflight: async () => { throw Object.assign(new Error('provider crashed'), { code: 'task-finish.provider-crashed' }); } },
    runtime: { writeTaskFinishRunPersistence() {} },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.primaryFailure.origin, 'product-phase-provider');
  assert.equal(result.phases[0].failure.origin, 'product-phase-provider');
});

test('Finish Result保留bootstrap provenance且formal verification count仍为零', () => {
  const run = activateTaskFinishBootstrapRecovery(failedPrepareRun(), context(), { run: failedPrepareRun(), lease: null, preparedCompletion: null });
  const result = finishResult(run, () => Date.parse('2026-08-14T00:00:03.000Z'));
  assert.equal(result.bootstrapRecovery.identity, 'sha256-bootstrap');
  assert.equal(result.metrics.bootstrapRecoveryExecutions, 1);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
});
