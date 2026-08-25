import assert from 'node:assert/strict';
import test from 'node:test';

import { compactTaskFinishResult, projectTaskFinishResult } from '../../src/task/application/finish/task-finish-result-projection.mjs';
import { selfBootstrapTaskFinishResult } from '../../src/task/application/finish/task-finish-self-bootstrap-projection.mjs';

function canonical(overrides = {}) {
  return {
    schemaVersion: 'buildr.task-finish-result/v3',
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
      delivery: { agent: 'codex', targetBranch: 'dev', remote: 'origin' },
      identity: 'sha256-context',
    },
    handoff: { identity: 'sha256-handoff' },
    candidate: { identity: 'sha256-candidate', generation: 3, contentTargetIdentity: 'sha256-content' },
    deliveryCommit: { subject: 'fix: compact projection', identity: 'sha256-message' },
    carrier: {
      identity: 'sha256-carrier', root: '/private/carrier', head: 'abc123', expectedTargetRef: 'base123',
      deliveryBaseline: { head: 'base123' }, checks: [{ secret: true }],
      pathCoverage: { identity: 'sha256-coverage', counts: { total: 3, targetContained: 1, carrierChanged: 1, agentReviewedTarget: 1, missing: 0 }, agentReviewedTargetPaths: [{ path: 'secret.txt', reason: 'private' }] },
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
    'resume', 'nextWorkflow', 'nextAction', 'currentFacts', 'rollover', 'reuseMode', 'pathCoverage', 'deliveryAdaptation', 'refs', 'delivery', 'completion', 'maintenance', 'occupancy', 'bootstrapRecovery', 'metrics', 'timing', 'executionRecord',
  ]);
  assert.equal(compact.schemaVersion, 'buildr.task-finish-compact-result/v1');
  assert.equal(compact.detail, 'compact');
  assert.equal(compact.identity.taskId, 'finish-task');
  assert.equal(compact.resume.token, 'sha256-resume');
  assert.equal(compact.currentPhase, 'prepare');
  assert.deepEqual(compact.primaryFailure.conflictPaths, ['src/conflict.mjs']);
  assert.equal(compact.refs.carrierIdentity, 'sha256-carrier');
  assert.deepEqual(compact.pathCoverage, { identity: 'sha256-coverage', counts: { total: 3, targetContained: 1, carrierChanged: 1, agentReviewedTarget: 1, missing: 0 } });
  assert.equal(compact.executionRecord.recordId, 'record-1');
  const serialized = JSON.stringify(compact);
  for (const forbidden of ['/private/', 'checks', 'operations', 'observations', 'stdout', 'stderr', 'equivalence', 'locator']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('compact rollover结果只公开有界qualification和逐repository cleanup effects', () => {
  const compact = compactTaskFinishResult(canonical({
    status: 'active',
    primaryFailure: null,
    resume: null,
    rollover: {
      status: 'ready', supersededRunId: 'old-run', qualificationIdentity: 'sha256-qualification', currentReplacement: 'written',
      carrierCleanup: { status: 'removed', root: '/private/carrier', repositories: [{ selector: 'workspace', status: 'removed', root: '/private/repository', carrierIdentity: 'sha256-carrier' }] },
    },
  }));
  assert.deepEqual(compact.rollover, {
    status: 'ready', supersededRunId: 'old-run', qualificationIdentity: 'sha256-qualification',
    carrierCleanup: { status: 'removed', repositories: [{ selector: 'workspace', status: 'removed', carrierIdentity: 'sha256-carrier' }] },
    currentReplacement: 'written',
  });
  assert.equal(JSON.stringify(compact.rollover).includes('/private/'), false);
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
    deliveryAdaptation: {
      expectedCommitMessage: 'fix(task-finish): resolve conflict\n\nprivate body\n\nBuildr-Task: finish-task',
      preparationHints: {
        schemaVersion: 'buildr.task-finish-preparation-hints/v1',
        steps: [{ id: 'npm-ci', scope: 'service:product/buildr', recipe: 'buildr.npm-ci', cwd: 'projects/product/services/buildr', executable: 'projects/product/services/buildr/tools/development/run-development-npm', args: ['ci'], timeoutMs: 300000, outputs: [{ path: 'projects/product/services/buildr/node_modules', kind: 'directory' }] }],
        unavailable: [],
      },
    },
  }));
  assert.deepEqual(adaptation.primaryFailure.conflictPaths, ['shared.txt']);
  assert.match(adaptation.deliveryAdaptation.expectedCommitMessage, /Buildr-Task: finish-task/);
  assert.equal(adaptation.deliveryAdaptation.preparationHints.steps[0].args[0], 'ci');
  assert.doesNotMatch(JSON.stringify(adaptation.deliveryAdaptation.preparationHints), /\/private\//);

  const incomplete = compactTaskFinishResult(canonical({
    primaryFailure: {
      phase: 'prepare', operation: 'delivery-adaptation', code: 'task-finish.delivery-adaptation-path-coverage-incomplete', status: 'blocked',
      message: 'Task Contribution paths are missing.', findings: [{ missingPaths: ['feature-03.txt', 'feature-04.txt'] }],
    },
  }));
  assert.deepEqual(incomplete.primaryFailure.conflictPaths, ['feature-03.txt', 'feature-04.txt']);
});

test('full Task Finish Result 保持canonical对象不变', () => {
  const full = canonical();
  assert.equal(projectTaskFinishResult(full, 'full'), full);
  assert.equal(full.schemaVersion, 'buildr.task-finish-result/v3');
});

test('v2与v3 Result归一化为同一稳定self-bootstrap契约', () => {
  const legacyRoot = '/private/workspace/.buildr/transient/task-finish/carriers/finish-run';
  const legacy = selfBootstrapTaskFinishResult({
    ...canonical({ schemaVersion: 'buildr.task-finish-result/v2' }),
    carrier: { identity: 'sha256-workspace-carrier', root: legacyRoot, activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
    delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    completion: { status: 'complete', finalRemoteRef: 'final-ref' },
    primaryFailure: null,
    resume: null,
    status: 'complete',
  });
  const workspaceCarrierRoot = `${legacyRoot}/workspace-123`;
  const serviceCarrierRoot = `${legacyRoot}/service-456`;
  const multi = selfBootstrapTaskFinishResult(canonical({
    status: 'complete',
    primaryFailure: null,
    resume: null,
    identity: {
      ...canonical().identity,
      repositories: [
        { selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin', leaseTargetIdentity: 'sha256-workspace-target' },
        { selector: 'service:product/example', disposition: 'applicable', targetBranch: 'dev', remote: 'origin', leaseTargetIdentity: 'sha256-service-target' },
      ],
      repositorySetIdentity: 'sha256-repository-set',
    },
    repositorySetIdentity: 'sha256-repository-set',
    repositories: [
      {
        selector: 'service:product/example', disposition: 'applicable',
        deliveryCarrier: { identity: 'sha256-service-carrier', root: serviceCarrierRoot, activationPaths: ['service.txt'] },
        delivery: { status: 'delivered', remoteAfterRef: 'service-ref', finalRemoteRef: 'service-ref' },
      },
      {
        selector: 'workspace', disposition: 'applicable',
        deliveryCarrier: { identity: 'sha256-workspace-carrier', root: workspaceCarrierRoot, activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
        delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
      },
    ],
    completion: {
      status: 'complete',
      repositories: [
        { selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-workspace-carrier', carrierRef: 'workspace-ref', finalRemoteRef: 'final-ref' },
        { selector: 'service:product/example', disposition: 'applicable', carrierIdentity: 'sha256-service-carrier', carrierRef: 'service-ref', finalRemoteRef: 'service-ref' },
      ],
    },
  }));

  assert.equal(legacy.schemaVersion, 'buildr.task-finish-self-bootstrap-input/v1');
  assert.equal(multi.schemaVersion, legacy.schemaVersion);
  assert.deepEqual(Object.keys(multi), Object.keys(legacy));
  assert.equal(projectTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    identity: { ...canonical().identity, repositories: [] },
  }), 'self-bootstrap').schemaVersion, legacy.schemaVersion);
  assert.equal(multi.workspaceRepository.selector, 'workspace');
  assert.equal(multi.workspaceRepository.leaseTargetIdentity, 'sha256-workspace-target');
  assert.equal(multi.repositories[0].leaseTargetIdentity, 'sha256-service-target');
  assert.equal(legacy.workspaceRepository.leaseTargetIdentity, 'origin:dev');
  assert.equal(multi.workspaceRepository.carrier.root, workspaceCarrierRoot);
  assert.deepEqual(multi.carriers.map((carrier) => carrier.selector), ['service:product/example', 'workspace']);
  assert.equal(multi.carrierContainerRoot, legacyRoot);
  assert.equal(multi.selfBootstrap.baseRef, 'final-ref');
  assert.equal(multi.projectionIdentity.startsWith('sha256-'), true);
  assert.equal(JSON.stringify(multi).includes('task-finish-result/v3'), false);
});

test('v3空repositories且仅有legacy singleton carrier时投影唯一Workspace repository', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete',
    primaryFailure: null,
    resume: null,
    identity: { ...canonical().identity, repositories: [] },
    repositories: [],
    repositorySetIdentity: null,
    carrier: {
      identity: 'sha256-980797bee339d60c6820f414eef2b4295150c19d26cc26cd4dfe84eed88e88a2',
      head: '4e220b287c746020a9ff95486935200e2fe1eb32',
      changedPaths: [
        'projects/product/services/buildr/src/task/application/finish/task-finish-self-bootstrap-projection.mjs',
        'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs',
      ],
    },
    delivery: { status: 'delivered', remoteAfterRef: '4e220b287c746020a9ff95486935200e2fe1eb32', finalRemoteRef: '4e220b287c746020a9ff95486935200e2fe1eb32' },
    phases: [{ id: 'cleanup', status: 'passed' }],
    completion: {
      status: 'complete',
      cleanup: { status: 'cleaned' },
      finalRemoteRef: '4e220b287c746020a9ff95486935200e2fe1eb32',
    },
  }));

  assert.equal(result.schemaVersion, 'buildr.task-finish-self-bootstrap-input/v1');
  assert.equal(result.mode, 'complete');
  assert.equal(result.workspaceRepository.selector, 'workspace');
  assert.equal(result.workspaceRepository.disposition, 'applicable');
  assert.equal(result.workspaceRepository.carrier.identity, 'sha256-980797bee339d60c6820f414eef2b4295150c19d26cc26cd4dfe84eed88e88a2');
  assert.equal(result.workspaceRepository.carrier.root, null);
  assert.equal(result.workspaceRepository.carrier.availability, 'cleaned');
  assert.deepEqual(result.selfBootstrap.activationPaths, [
    'projects/product/services/buildr/src/task/application/finish/task-finish-self-bootstrap-projection.mjs',
    'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs',
  ]);
  assert.equal(result.selfBootstrap.applicability, 'applicable');
  assert.equal(result.selfBootstrap.baseRef, '4e220b287c746020a9ff95486935200e2fe1eb32');
  assert.deepEqual(result.carriers.map((carrier) => carrier.selector), ['workspace']);
});

test('外部交付reconciliation无需carrier也能投影Workspace activation paths', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete',
    primaryFailure: null,
    resume: null,
    carrier: null,
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin', leaseTargetIdentity: 'origin:dev' }],
    },
    repositories: [{
      selector: 'workspace',
      disposition: 'applicable',
      deliveryCarrier: null,
      delivery: {
        status: 'delivered',
        remoteAfterRef: 'external-ref',
        finalRemoteRef: 'external-ref',
        activationPaths: ['projects/product/services/buildr/src/example.mjs'],
      },
    }],
    completion: {
      status: 'complete',
      cleanup: { status: 'pending' },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: null, carrierRef: null, finalRemoteRef: 'external-ref' }],
    },
  }));

  assert.equal(result.mode, 'complete');
  assert.equal(result.workspaceRepository.carrier, null);
  assert.deepEqual(result.selfBootstrap.activationPaths, ['projects/product/services/buildr/src/example.mjs']);
  assert.equal(result.selfBootstrap.baseRef, 'external-ref');
});

test('v3空repositories且没有legacy carrier时保持workspace unavailable', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete',
    primaryFailure: null,
    resume: null,
    identity: { ...canonical().identity, repositories: [] },
    repositories: [],
    carrier: null,
  }));
  assert.equal(result.schemaVersion, 'buildr.task-finish-self-bootstrap-input/v1');
  assert.equal(result.workspaceRepository, null);
  assert.equal(result.selfBootstrap.applicability, 'unavailable');
  assert.equal(result.selfBootstrap.reason, 'Workspace repository facts are unavailable.');
  assert.deepEqual(result.repositories, []);
});

test('无Workspace贡献投影为not-applicable且Service carrier不提升为自举输入', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    identity: {
      ...canonical().identity,
      repositories: [
        { selector: 'workspace', disposition: 'not-applicable', reason: 'no-contribution', targetBranch: 'dev', remote: 'origin' },
        { selector: 'service:product/example', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' },
      ],
    },
    repositories: [
      { selector: 'workspace', disposition: 'not-applicable', reason: 'no-contribution', deliveryCarrier: null, delivery: null },
      {
        selector: 'service:product/example', disposition: 'applicable',
        deliveryCarrier: { identity: 'sha256-service', root: '/private/workspace/.buildr/transient/task-finish/carriers/finish-run/service', activationPaths: ['projects/product/services/buildr/src/looks-like-workspace.mjs'] },
        delivery: { status: 'delivered', remoteAfterRef: 'service-ref', finalRemoteRef: 'service-ref' },
      },
    ],
  }));
  assert.equal(result.selfBootstrap.applicability, 'not-applicable');
  assert.deepEqual(result.selfBootstrap.activationPaths, []);
  assert.equal(result.workspaceRepository.carrier, null);
  assert.deepEqual(result.carriers.map((carrier) => carrier.selector), ['service:product/example']);
});

test('complete cleanup后carrier root可清理但冻结自举事实保持可投影', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    phases: [{ id: 'cleanup', status: 'passed' }],
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' }],
    },
    repositories: [{
      selector: 'workspace', disposition: 'applicable',
      deliveryCarrier: { identity: 'sha256-cleaned-carrier', activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
      delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    }],
    completion: {
      status: 'complete',
      cleanup: { status: 'cleaned' },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-cleaned-carrier', carrierRef: 'final-ref', finalRemoteRef: 'final-ref' }],
    },
  }));

  assert.equal(result.mode, 'complete');
  assert.equal(result.workspaceRepository.carrier.identity, 'sha256-cleaned-carrier');
  assert.equal(result.workspaceRepository.carrier.root, null);
  assert.equal(result.workspaceRepository.carrier.availability, 'cleaned');
  assert.deepEqual(result.selfBootstrap.activationPaths, ['projects/product/services/buildr/src/example.mjs']);
  assert.equal(result.selfBootstrap.baseRef, 'final-ref');
});

test('Environment maintenance cleaned不替代carrier cleanup evidence', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    maintenance: { delivery: 'delivered', activation: 'passed', environmentCleanup: 'cleaned', diagnostics: 'not-opened' },
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' }],
    },
    repositories: [{
      selector: 'workspace', disposition: 'applicable',
      deliveryCarrier: { identity: 'sha256-cleaned-carrier', activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
      delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    }],
    completion: {
      status: 'complete', cleanup: { status: 'pending' },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-cleaned-carrier', carrierRef: 'final-ref', finalRemoteRef: 'final-ref' }],
    },
  }));

  assert.equal(result.workspaceRepository.carrier.root, '/private/workspace/.buildr/transient/task-finish/carriers/finish-run/workspace-21a3230e0377');
  assert.equal(result.workspaceRepository.carrier.availability, 'retained');
});

test('v3 reconciliation carrier缺root时恢复确定性的run-owned repository root', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' }],
    },
    repositories: [{
      selector: 'workspace', disposition: 'applicable',
      deliveryCarrier: { identity: 'sha256-adapted-carrier', head: 'final-ref', tree: 'final-tree', activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
      delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    }],
    completion: {
      status: 'complete', cleanup: { status: 'pending' },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-adapted-carrier', carrierRef: 'final-ref', finalRemoteRef: 'final-ref' }],
    },
  }));

  assert.equal(result.workspaceRepository.carrier.root, '/private/workspace/.buildr/transient/task-finish/carriers/finish-run/workspace-21a3230e0377');
  assert.equal(result.workspaceRepository.carrier.availability, 'retained');
});

test('cleanup phase passed与Environment attention不把真实carrier投影为cleaned', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    phases: [{ id: 'cleanup', status: 'passed', attempts: 1, durationMs: 10 }],
    maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'attention', diagnostics: 'not-opened' },
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' }],
    },
    repositories: [{
      selector: 'workspace', disposition: 'applicable',
      deliveryCarrier: { identity: 'sha256-retained-carrier', activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
      delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    }],
    completion: {
      status: 'complete', cleanup: { status: 'attention' },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-retained-carrier', carrierRef: 'final-ref', finalRemoteRef: 'final-ref' }],
    },
  }));

  assert.equal(result.workspaceRepository.carrier.root, '/private/workspace/.buildr/transient/task-finish/carriers/finish-run/workspace-21a3230e0377');
  assert.equal(result.workspaceRepository.carrier.availability, 'retained');
});

test('per-carrier removed evidence允许Environment attention下投影cleaned', () => {
  const result = selfBootstrapTaskFinishResult(canonical({
    status: 'complete', primaryFailure: null, resume: null,
    identity: {
      ...canonical().identity,
      repositories: [{ selector: 'workspace', disposition: 'applicable', targetBranch: 'dev', remote: 'origin' }],
    },
    repositories: [{
      selector: 'workspace', disposition: 'applicable',
      deliveryCarrier: { identity: 'sha256-removed-carrier', activationPaths: ['projects/product/services/buildr/src/example.mjs'] },
      delivery: { status: 'delivered', remoteAfterRef: 'final-ref', finalRemoteRef: 'final-ref' },
    }],
    completion: {
      status: 'complete',
      cleanup: { status: 'attention', carriers: { status: 'cleaned', repositories: [{ selector: 'workspace', status: 'removed', code: null }] } },
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: 'sha256-removed-carrier', carrierRef: 'final-ref', finalRemoteRef: 'final-ref' }],
    },
  }));

  assert.equal(result.workspaceRepository.carrier.root, null);
  assert.equal(result.workspaceRepository.carrier.availability, 'cleaned');
});

test('self-bootstrap projector对未知内部major与不完整carrier fail closed', () => {
  assert.throws(
    () => selfBootstrapTaskFinishResult(canonical({ schemaVersion: 'buildr.task-finish-result/v4', futureField: true })),
    (error) => error.code === 'task_finish.self_bootstrap_projection_invalid',
  );
  assert.throws(
    () => selfBootstrapTaskFinishResult({
      ...canonical({ schemaVersion: 'buildr.task-finish-result/v2' }),
      carrier: { identity: 'sha256-carrier', activationPaths: [] },
    }),
    (error) => error.code === 'task_finish.self_bootstrap_projection_invalid',
  );
  assert.throws(
    () => selfBootstrapTaskFinishResult({
      ...canonical({ schemaVersion: 'buildr.task-finish-result/v2' }),
      status: 'complete',
      carrier: { identity: 'sha256-carrier', activationPaths: [] },
    }),
    (error) => error.code === 'task_finish.self_bootstrap_projection_invalid',
  );
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
