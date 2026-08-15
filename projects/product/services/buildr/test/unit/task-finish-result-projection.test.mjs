import assert from 'node:assert/strict';
import test from 'node:test';

import { compactTaskFinishResult, projectTaskFinishResult } from '../../src/application/task-finish/task-finish-result-projection.mjs';

function canonical(overrides = {}) {
  return {
    schemaVersion: 'buildr.task-finish-result/v2',
    runId: 'finish-run',
    status: 'blocked',
    identity: {
      task: 'finish-task',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 3,
      contentTargetIdentity: 'sha256-content',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot: '/private/environment',
      workspaceRoot: '/private/workspace',
    },
    resolvedContext: {
      capability: { id: 'buildr.task-finish', version: 1 },
      task: { taskId: 'finish-task' },
      handoff: { identity: 'sha256-handoff' },
      candidate: { identity: 'sha256-candidate', generation: 3, contentTargetIdentity: 'sha256-content' },
      environment: { workspaceNodeIdentity: 'sha256-node' },
      delivery: { agent: 'codex', targetBranch: 'dev', remote: 'origin' },
      identity: 'sha256-context',
    },
    handoff: { identity: 'sha256-handoff' },
    candidate: { identity: 'sha256-candidate', generation: 3, contentTargetIdentity: 'sha256-content' },
    deliveryCommit: { subject: 'fix: compact projection', identity: 'sha256-message' },
    carrier: {
      identity: 'sha256-carrier', root: '/private/carrier', head: 'abc123', expectedTargetRef: 'base123',
      deliveryBaseline: { head: 'base123' }, checks: [{ secret: true }],
    },
    phases: [
      { id: 'preflight', status: 'passed', attempts: 1, durationMs: 10, checks: [{ code: 'private' }], operations: [{ stdout: 'private' }] },
      { id: 'prepare', status: 'blocked', attempts: 1, durationMs: 20, observations: [{ path: '/private/log' }] },
    ],
    primaryFailure: {
      phase: 'prepare', operation: 'apply', failureClass: 'transient-external-condition', code: 'task-finish.conflict', status: 'blocked', exitCode: 1,
      message: 'Carrier conflicts require recovery.', findings: [{ path: 'src/conflict.mjs' }, { path: '/private/secret' }], diagnostic: { stderr: 'private' },
    },
    resume: { phase: 'prepare', token: 'sha256-resume', generatedAt: '2026-08-13T00:00:00.000Z', carrierIdentity: 'sha256-carrier' },
    nextWorkflow: null,
    nextAction: 'repeat-task-finish-run-with-resume-token',
    reuseMode: 'deterministic-reuse',
    equivalence: { operations: [{ stdout: 'private' }] },
    delivery: { status: 'blocked', expectedTargetRef: 'base123', observedTargetRef: 'base123', carrierRef: 'abc123' },
    completion: null,
    metrics: { canonicalCliInvocations: 1, formalVerificationExecutions: 0, productCommandObservations: 2, productExecutionMs: 30, wallClockMs: 40, coverage: 'product-complete' },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:01.000Z',
    completedAt: null,
    executionRecord: {
      status: 'blocked', recordId: 'record-1', outcome: 'blocked', lifecycleStatus: 'open', body: null,
      transientCleanup: { status: 'retained', code: null, locator: '/private/transient' },
      diagnostic: { code: 'quota', message: 'Resolve capacity.', details: { locator: '/private/database' } },
      nextActions: ['resolve-capacity'],
    },
    ...overrides,
  };
}

test('compact Task Finish Result 使用closed字段并保留恢复事实', () => {
  const compact = compactTaskFinishResult(canonical());
  assert.deepEqual(Object.keys(compact), [
    'schemaVersion', 'detail', 'runId', 'identity', 'status', 'currentPhase', 'deliveryCommit', 'phases', 'primaryFailure',
    'resume', 'nextWorkflow', 'nextAction', 'reuseMode', 'refs', 'delivery', 'completion', 'occupancy', 'bootstrapRecovery', 'metrics', 'timing', 'executionRecord',
  ]);
  assert.equal(compact.schemaVersion, 'buildr.task-finish-compact-result/v1');
  assert.equal(compact.detail, 'compact');
  assert.equal(compact.identity.taskId, 'finish-task');
  assert.equal(compact.resume.token, 'sha256-resume');
  assert.equal(compact.currentPhase, 'prepare');
  assert.deepEqual(compact.primaryFailure.conflictPaths, ['src/conflict.mjs']);
  assert.equal(compact.refs.carrierIdentity, 'sha256-carrier');
  assert.equal(compact.executionRecord.recordId, 'record-1');
  const serialized = JSON.stringify(compact);
  for (const forbidden of ['/private/', 'checks', 'operations', 'observations', 'stdout', 'stderr', 'equivalence', 'locator']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('compact Task Finish Result 保留 dirty preflight 与 Delivery Adaptation 的结构化路径', () => {
  const dirty = compactTaskFinishResult(canonical({
    primaryFailure: {
      phase: 'preflight',
      operation: 'retained-workspace',
      code: 'task-finish.retained-workspace-dirty',
      status: 'blocked',
      message: 'Retained Workspace is dirty.',
      findings: [{ unrelatedPaths: ['local-note.txt'] }],
    },
  }));
  assert.deepEqual(dirty.primaryFailure.conflictPaths, ['local-note.txt']);

  const adaptation = compactTaskFinishResult(canonical({
    primaryFailure: {
      phase: 'prepare',
      operation: 'delivery-adaptation',
      code: 'task-finish.delivery-adaptation-required',
      status: 'blocked',
      message: 'Adaptation required.',
      diagnostic: { code: 'task-finish.contribution-apply-conflict', conflictPaths: ['shared.txt'] },
    },
  }));
  assert.deepEqual(adaptation.primaryFailure.conflictPaths, ['shared.txt']);
});

test('full Task Finish Result 保持canonical对象不变', () => {
  const full = canonical();
  assert.equal(projectTaskFinishResult(full, 'full'), full);
  assert.equal(full.schemaVersion, 'buildr.task-finish-result/v2');
});

test('compact bootstrap provenance不暴露capsule路径', () => {
  const compact = compactTaskFinishResult(canonical({
    bootstrapRecovery: {
      identity: 'sha256-bootstrap', mode: 'retained-writer-candidate-phase-provider', retainedSourceCommit: 'before', sourceCommit: 'after', sourceTree: 'tree', executorDigest: 'sha256-provider',
      originalAttempt: { primaryFailure: { phase: 'prepare', origin: 'product-phase-provider', code: 'task-finish.provider-crashed' } },
      capsule: { root: '/private/capsule', manifest: '/private/capsule/authority.json', revocation: { status: 'revoked' } },
    },
  }));
  assert.equal(compact.bootstrapRecovery.originalFailure.origin, 'product-phase-provider');
  assert.equal(compact.bootstrapRecovery.capsuleRevocation, 'revoked');
  assert.doesNotMatch(JSON.stringify(compact.bootstrapRecovery), /private|authority\.json/);
});

test('compact覆盖complete、Doctor blocked、target race与Delivery Adaptation结论', () => {
  const cases = [
    {
      name: 'complete',
      input: { status: 'complete', phases: [{ id: 'cleanup', status: 'passed', attempts: 1, durationMs: 10 }], primaryFailure: null, resume: null, nextAction: 'review-task-retrospective', delivery: { status: 'delivered', targetDisposition: 'carrier', finalRemoteRef: 'final123' }, completion: { status: 'complete', carrierIdentity: 'sha256-carrier', taskContributionIdentity: 'sha256-contribution', completedAt: '2026-08-13T00:01:00.000Z' } },
      expected: { status: 'complete', phase: null, failure: null, action: 'review-task-retrospective' },
    },
    {
      name: 'doctor-blocked',
      input: { primaryFailure: { phase: 'deliver', operation: 'retained-doctor', code: 'task-finish.retained-doctor-not-ready', status: 'blocked', message: 'Doctor is not ready.' }, resume: { phase: 'deliver', token: 'sha256-doctor', carrierIdentity: 'sha256-carrier' } },
      expected: { status: 'blocked', phase: 'deliver', failure: 'task-finish.retained-doctor-not-ready', action: 'repeat-task-finish-run-with-resume-token' },
    },
    {
      name: 'target-race',
      input: { primaryFailure: { phase: 'deliver', operation: 'target-transition', code: 'task-finish.target-race', status: 'blocked', message: 'Target moved.' }, resume: { phase: 'prepare', token: 'sha256-race', carrierIdentity: 'sha256-carrier' } },
      expected: { status: 'blocked', phase: 'deliver', failure: 'task-finish.target-race', action: 'repeat-task-finish-run-with-resume-token' },
    },
    {
      name: 'delivery-adaptation',
      input: { primaryFailure: { phase: 'prepare', operation: 'carrier-prepare', code: 'task-finish.delivery-adaptation-required', status: 'blocked', message: 'Adaptation required.', findings: [{ path: 'src/adapt.mjs' }] }, resume: { phase: 'prepare', token: 'sha256-adapt', carrierIdentity: 'sha256-carrier' }, nextAction: 'adapt-run-owned-delivery-carrier-and-repeat-task-finish-run-with-resume-token' },
      expected: { status: 'blocked', phase: 'prepare', failure: 'task-finish.delivery-adaptation-required', action: 'adapt-run-owned-delivery-carrier-and-repeat-task-finish-run-with-resume-token' },
    },
  ];
  for (const item of cases) {
    const compact = compactTaskFinishResult(canonical(item.input));
    assert.equal(compact.status, item.expected.status, item.name);
    assert.equal(compact.currentPhase, item.expected.phase, item.name);
    assert.equal(compact.primaryFailure?.code || null, item.expected.failure, item.name);
    assert.equal(compact.nextAction, item.expected.action, item.name);
    if (item.input.resume) assert.equal(compact.resume.token, item.input.resume.token, item.name);
  }
});

test('compact投影缺少关键identity时fail closed', () => {
  const result = canonical({
    resolvedContext: null,
    identity: { task: 'finish-task' },
    handoff: null,
    candidate: null,
  });
  assert.throws(() => compactTaskFinishResult(result), (error) => error.code === 'task_finish.compact_projection_invalid');
});
