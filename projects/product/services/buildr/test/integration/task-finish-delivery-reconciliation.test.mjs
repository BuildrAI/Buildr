import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { observeGitTaskContribution, taskFinishCarrierRoot } from '../../src/task/application/finish/git-task-contribution.mjs';
import { reconcileTaskFinishDelivery } from '../../src/task/application/finish/task-finish-delivery-reconciliation.mjs';
import { normalizeTaskFinishRepositorySet, taskFinishRepositorySetIdentity } from '../../src/task/application/finish/task-finish-repository-set.mjs';
import { createFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return String(result.stdout || '').trim();
}

function fixture(t) {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-delivery-reconciliation-'));
  t.after(() => fs.rmSync(container, { recursive: true, force: true }));
  const remote = path.join(container, 'remote.git');
  const root = path.join(container, 'retained');
  fs.mkdirSync(root);
  git(container, ['init', '--bare', remote]);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr@example.com']);
  git(root, ['remote', 'add', 'origin', remote]);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.worktrees/\n');
  fs.writeFileSync(path.join(root, 'baseline.txt'), 'baseline\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  git(root, ['push', '-u', 'origin', 'dev']);
  const taskRoot = path.join(root, '.worktrees', 'task');
  git(root, ['worktree', 'add', '-b', 'codex/reconcile-task', taskRoot, 'dev']);
  git(taskRoot, ['config', 'user.name', 'Buildr Test']);
  git(taskRoot, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'delivered through PR\n');
  git(taskRoot, ['add', 'feature.txt']);
  git(taskRoot, ['commit', '-m', 'task candidate']);

  // Simulate a PR/rebase delivery: same Task Contribution bytes, different commit identity.
  fs.writeFileSync(path.join(root, 'feature.txt'), 'delivered through PR\n');
  git(root, ['add', 'feature.txt']);
  git(root, ['commit', '-m', 'merge external pull request']);
  git(root, ['push', 'origin', 'dev']);
  const taskContribution = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: git(root, ['rev-parse', 'HEAD']) });
  return { root, taskRoot, taskContribution };
}

function failedCarrierRun({ root, entry, registerCarrier = true, mutate = null }) {
  const oldHandoff = {
    ...entry.handoff,
    identity: `${entry.handoff.identity}-old`,
    candidate: {
      ...entry.handoff.candidate,
      identity: `${entry.handoff.candidate.identity}-old`,
      generation: entry.handoff.candidate.generation + 1,
      contentTargetIdentity: `${entry.handoff.candidate.contentTargetIdentity}-old`,
    },
  };
  const identity = {
    ...entry.identityParts,
    handoffIdentity: oldHandoff.identity,
    candidateIdentity: oldHandoff.candidate.identity,
    candidateGeneration: oldHandoff.candidate.generation,
    contentTargetIdentity: oldHandoff.candidate.contentTargetIdentity,
  };
  const run = createFinishRun({
    root,
    identity,
    developmentHandoff: oldHandoff,
    runId: `${entry.identityParts.task}-failed-carrier`,
    runtime: { readTaskFinishRunPersistence: () => null },
  });
  const carrierRoot = taskFinishCarrierRoot(root, run.runId, 'workspace');
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  if (registerCarrier) git(root, ['worktree', 'add', '--detach', carrierRoot, 'origin/dev']);
  else fs.mkdirSync(carrierRoot, { recursive: true });
  const carrier = {
    identity: 'sha256-old-carrier',
    root: carrierRoot,
    head: git(root, ['rev-parse', 'origin/dev']),
    changedPaths: ['feature.txt'],
    activationPaths: ['feature.txt'],
  };
  run.status = 'failed';
  const preflight = run.phases.find((phase) => phase.id === 'preflight');
  preflight.status = 'passed';
  preflight.attempts = 1;
  const prepare = run.phases.find((phase) => phase.id === 'prepare');
  prepare.status = 'failed';
  prepare.attempts = 1;
  prepare.failure = {
    phase: 'prepare', operation: 'task-contribution', check: null,
    failureClass: 'semantic-review-required', code: 'task-finish.task-contribution-drift-unresolved',
    status: 'failed', exitCode: null, message: 'fixture', findings: [], diagnostic: null,
  };
  run.primaryFailure = structuredClone(prepare.failure);
  run.repositories[0].deliveryCarrier = structuredClone(carrier);
  run.deliveryCarrier = structuredClone(carrier);
  mutate?.(run);
  return { run, carrierRoot };
}

test('delivery reconciliation从真实远端登记外部交付且不创建Delivery Carrier', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace',
    sourcePath: '.',
    retainedRoot: root,
    taskRoot,
    environmentBranch: 'codex/reconcile-task',
    targetBranch: 'dev',
    remote: 'origin',
    disposition: 'applicable',
    reason: null,
    taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-handoff',
    candidate: { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content' },
    gates: {
      planning: { disposition: 'not-applicable', targetIdentity: 'sha256-plan', summary: 'fixture', source: 'test' },
      verification: { targetIdentity: 'sha256-content', resultDigest: 'sha256-verification', outcome: 'passed' },
      completion: { targetIdentity: 'sha256-candidate', resultDigest: 'sha256-review', outcome: 'ready' },
    },
  };
  const entry = {
    handoff,
    identityParts: {
      task: 'reconcile-task',
      handoffIdentity: handoff.identity,
      candidateIdentity: handoff.candidate.identity,
      candidateGeneration: handoff.candidate.generation,
      contentTargetIdentity: handoff.candidate.contentTargetIdentity,
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      repositories,
      repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
      environmentRoot: taskRoot,
      workspaceRoot: root,
      deliveryCommitIdentity: null,
    },
  };
  let terminal = null;
  let completed = 0;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => null,
    finalizeTaskFinishPersistence: (_target, value) => { terminal = value; return value; },
    completeTaskRecordFromFinish: () => {
      completed += 1;
      return { status: 'completed', taskId: 'reconcile-task', recordDigest: 'sha256-task', record: { status: 'completed', result: { noChange: false } }, effects: [{ type: 'updated' }] };
    },
  };

  const result = reconcileTaskFinishDelivery({ runtime, root, entry });
  assert.equal(result.status, 'complete');
  assert.equal(result.deliveryResult.status, 'delivered');
  assert.equal(result.repositories[0].delivery.targetDisposition, 'contained');
  assert.equal(result.repositories[0].deliveryCarrier, null);
  assert.equal(result.repositories[0].delivery.containment.status, 'contained');
  assert.equal(result.maintenance.delivery, 'delivered');
  assert.equal(result.maintenance.environmentCleanup, 'pending');
  assert.equal(result.taskTerminal.status, 'completed');
  assert.equal(completed, 1);
  assert.equal(terminal.completion.mode, 'reconciliation');
  assert.equal(terminal.completion.cleanup.status, 'pending');

  const carrierRunRuntime = { readTaskFinishRunPersistence: () => null };
  const carrierRun = createFinishRun({
    root,
    identity: entry.identityParts,
    developmentHandoff: handoff,
    runId: 'reconcile-existing-carrier',
    runtime: carrierRunRuntime,
  });
  carrierRun.repositories[0].deliveryCarrier = {
    identity: 'sha256-carrier',
    head: git(root, ['rev-parse', 'origin/dev']),
    changedPaths: ['feature.txt'],
    activationPaths: ['feature.txt'],
  };
  const carrierRuntime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => ({ run: carrierRun }),
    finalizeTaskFinishPersistence: (_target, value) => value,
    completeTaskRecordFromFinish: () => ({
      status: 'completed',
      record: { status: 'completed', result: { noChange: false } },
    }),
  };
  const carrierResult = reconcileTaskFinishDelivery({ runtime: carrierRuntime, root, entry });
  assert.equal(carrierResult.repositories[0].delivery.targetDisposition, 'carrier');
  assert.deepEqual(carrierResult.repositories[0].delivery.activationPaths, ['feature.txt']);
});

test('无Environment的reconciliation不声称cleanup pending或cleaned', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot,
    environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin',
    disposition: 'applicable', reason: null, taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-handoff-no-environment',
    candidate: { identity: 'sha256-candidate-no-environment', generation: 1, contentTargetIdentity: 'sha256-content-no-environment' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = {
    handoff,
    identityParts: {
      task: 'reconcile-no-environment', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
      candidateGeneration: 1, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'agent-led-reconciliation',
      targetBranch: 'dev', remote: 'origin', repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
      environmentRoot: root, workspaceRoot: root, deliveryCommitIdentity: null, environmentAvailable: false,
    },
  };
  let terminal = null;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => null,
    finalizeTaskFinishPersistence: (_target, value) => { terminal = value; },
    completeTaskRecordFromFinish: () => ({ status: 'completed', record: { status: 'completed', result: { noChange: false } } }),
  };
  const result = reconcileTaskFinishDelivery({ runtime, root, entry });
  assert.equal(result.status, 'complete');
  assert.equal(result.maintenance.environmentCleanup, 'not-applicable');
  assert.equal(result.completion.cleanup.status, 'not-applicable');
  assert.equal(terminal.completion.cleanup.status, 'not-applicable');
});

test('多repository部分交付保存checkpoint并只重试未证明项', (t) => {
  const first = fixture(t);
  const second = fixture(t);
  git(second.root, ['push', '--force', 'origin', 'HEAD~1:dev']);
  const repositories = normalizeTaskFinishRepositorySet([
    { selector: 'workspace', sourcePath: '.', retainedRoot: first.root, taskRoot: first.taskRoot, environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null, taskContribution: first.taskContribution },
    { selector: 'service:demo/api', sourcePath: 'projects/demo/services/api', retainedRoot: second.root, taskRoot: second.taskRoot, environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null, taskContribution: second.taskContribution },
  ]);
  const handoff = {
    identity: 'sha256-handoff-multi',
    candidate: { identity: 'sha256-candidate-multi', generation: 1, contentTargetIdentity: 'sha256-content-multi' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = {
    handoff,
    identityParts: {
      task: 'reconcile-multi', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
      candidateGeneration: 1, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex',
      targetBranch: null, remote: null, repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
      environmentRoot: first.taskRoot, workspaceRoot: first.root, deliveryCommitIdentity: null,
    },
  };
  let current = null;
  let terminal = null;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => current,
    writeTaskFinishRunPersistence: (_target, run) => { current = { run: structuredClone(run) }; },
    finalizeTaskFinishPersistence: (_target, value) => { terminal = value; current = null; },
    completeTaskRecordFromFinish: () => ({ status: 'completed', record: { status: 'completed', result: { noChange: false } } }),
  };
  const partial = reconcileTaskFinishDelivery({ runtime, root: first.root, entry });
  assert.equal(partial.status, 'unproven');
  assert.equal(partial.repositories.find((item) => item.selector === 'workspace').status, 'delivered');
  assert.equal(partial.repositories.find((item) => item.selector === 'service:demo/api').status, 'unproven');
  assert.deepEqual(partial.effects[0].selectors, ['workspace']);
  assert.equal(current.run.repositories.find((item) => item.selector === 'workspace').delivery.status, 'delivered');
  assert.equal(current.run.repositories.find((item) => item.selector === 'service:demo/api').delivery, null);

  git(second.root, ['push', 'origin', 'dev']);
  const completed = reconcileTaskFinishDelivery({ runtime, root: first.root, entry });
  assert.equal(completed.status, 'complete');
  assert.equal(terminal.completion.repositories.every((item) => item.delivery.status === 'delivered'), true);
});

test('显式reconciliation在同repository topology的Task Contribution更新后清理旧失败run carrier并登记terminal Delivery', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot,
    environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin',
    disposition: 'applicable', reason: null, taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-current-handoff',
    candidate: { identity: 'sha256-current-candidate', generation: 2, contentTargetIdentity: 'sha256-current-content' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = {
    handoff,
    identityParts: {
      task: 'reconcile-stale-run', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
      candidateGeneration: handoff.candidate.generation, contentTargetIdentity: handoff.candidate.contentTargetIdentity,
      agent: 'codex', targetBranch: 'dev', remote: 'origin', repositories,
      repositorySetIdentity: taskFinishRepositorySetIdentity(repositories), environmentRoot: taskRoot,
      workspaceRoot: root, deliveryCommitIdentity: null,
    },
  };
  const { run: staleRun, carrierRoot } = failedCarrierRun({ root, entry, mutate: (run) => {
    const oldContribution = {
      ...run.identity.repositories[0].taskContribution,
      identity: 'sha256-old-task-contribution',
      source: {
        ...run.identity.repositories[0].taskContribution.source,
        tree: run.identity.repositories[0].taskContribution.originalBaseline.tree,
      },
    };
    run.identity.repositories[0].taskContribution = oldContribution;
    run.repositories[0].taskContribution = structuredClone(oldContribution);
    run.identity.repositorySetIdentity = taskFinishRepositorySetIdentity(run.identity.repositories);
  } });
  assert.notEqual(staleRun.identity.repositorySetIdentity, entry.identityParts.repositorySetIdentity);
  let current = { run: staleRun };
  let terminal = null;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => current,
    writeTaskFinishRunPersistence: () => assert.fail('recovery must not checkpoint over the stale current run'),
    finalizeTaskFinishPersistence: (_target, value) => { terminal = value; current = null; },
    completeTaskRecordFromFinish: () => ({ status: 'completed', record: { status: 'completed', result: { noChange: false } } }),
  };

  const result = reconcileTaskFinishDelivery({ runtime, root, entry });
  assert.equal(result.status, 'complete');
  assert.equal(result.recovery.supersededRunId, staleRun.runId);
  assert.equal(result.recovery.frozenHandoffIdentity, staleRun.identity.handoffIdentity);
  assert.equal(result.recovery.carrierCleanup.status, 'removed');
  assert.equal(result.repositories[0].delivery.targetDisposition, 'contained');
  assert.equal(fs.existsSync(carrierRoot), false);
  assert.equal(terminal.completion.recovery.supersededRunId, staleRun.runId);
  assert.equal(terminal.run.identity.handoffIdentity, handoff.identity);
});

test('current Handoff未被远端包含时保留旧失败run与carrier且不写checkpoint', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot,
    environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin',
    disposition: 'applicable', reason: null, taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-current-uncontained',
    candidate: { identity: 'sha256-candidate-uncontained', generation: 2, contentTargetIdentity: 'sha256-content-uncontained' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = { handoff, identityParts: {
    task: 'reconcile-uncontained', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
    candidateGeneration: 2, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex',
    targetBranch: 'dev', remote: 'origin', repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
    environmentRoot: taskRoot, workspaceRoot: root, deliveryCommitIdentity: null,
  } };
  const { run: staleRun, carrierRoot } = failedCarrierRun({ root, entry });
  git(root, ['push', '--force', 'origin', 'HEAD~1:dev']);
  let writes = 0;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => ({ run: staleRun }),
    writeTaskFinishRunPersistence: () => { writes += 1; },
    finalizeTaskFinishPersistence: () => { writes += 1; },
  };

  const result = reconcileTaskFinishDelivery({ runtime, root, entry });
  assert.equal(result.status, 'unproven');
  assert.equal(writes, 0);
  assert.equal(fs.existsSync(carrierRoot), true);
  assert.deepEqual(result.effects, []);
});

test('旧run有下游事实或repository topology漂移时reconciliation保持identity conflict', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot,
    environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin',
    disposition: 'applicable', reason: null, taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-current-conflict',
    candidate: { identity: 'sha256-candidate-conflict', generation: 2, contentTargetIdentity: 'sha256-content-conflict' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = { handoff, identityParts: {
    task: 'reconcile-conflict', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
    candidateGeneration: 2, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex',
    targetBranch: 'dev', remote: 'origin', repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
    environmentRoot: taskRoot, workspaceRoot: root, deliveryCommitIdentity: null,
  } };
  const downstream = failedCarrierRun({ root, entry, mutate: (run) => {
    const verify = run.phases.find((phase) => phase.id === 'verify');
    verify.status = 'passed';
    verify.attempts = 1;
  } }).run;
  const runtime = { readTaskFinishCompletionPersistence: () => null, readTaskFinishRunPersistence: () => ({ run: downstream }) };
  assert.throws(
    () => reconcileTaskFinishDelivery({ runtime, root, entry }),
    (error) => error.code === 'task_finish.reconciliation_current_run_identity_conflict'
      && error.details.recoveryBlockers.includes('terminalPrepareFailure'),
  );

  const drifted = structuredClone(entry);
  drifted.identityParts.repositories[0].targetBranch = 'release';
  drifted.identityParts.repositorySetIdentity = taskFinishRepositorySetIdentity(drifted.identityParts.repositories);
  assert.throws(
    () => reconcileTaskFinishDelivery({ runtime, root, entry: drifted }),
    (error) => error.code === 'task_finish.reconciliation_current_run_identity_conflict'
      && error.details.recoveryBlockers.includes('identityBoundary'),
  );
});

test('旧carrier ownership无法证明时保留旧current run并返回cleanup诊断', (t) => {
  const { root, taskRoot, taskContribution } = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([{
    selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot,
    environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin',
    disposition: 'applicable', reason: null, taskContribution,
  }]);
  const handoff = {
    identity: 'sha256-current-cleanup-blocked',
    candidate: { identity: 'sha256-candidate-cleanup-blocked', generation: 2, contentTargetIdentity: 'sha256-content-cleanup-blocked' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = { handoff, identityParts: {
    task: 'reconcile-cleanup-blocked', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
    candidateGeneration: 2, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex',
    targetBranch: 'dev', remote: 'origin', repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
    environmentRoot: taskRoot, workspaceRoot: root, deliveryCommitIdentity: null,
  } };
  const { run: staleRun, carrierRoot } = failedCarrierRun({ root, entry, registerCarrier: false });
  let writes = 0;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => ({ run: staleRun }),
    writeTaskFinishRunPersistence: () => { writes += 1; },
    finalizeTaskFinishPersistence: () => { writes += 1; },
  };

  const result = reconcileTaskFinishDelivery({ runtime, root, entry });
  assert.equal(result.status, 'unproven');
  assert.equal(result.recovery.carrierCleanup.status, 'blocked');
  assert.equal(result.recovery.carrierCleanup.repositories[0].code, 'task-finish.carrier-ownership-unprovable');
  assert.equal(writes, 0);
  assert.equal(fs.existsSync(carrierRoot), true);
});

test('多repository旧carrier部分清理后可幂等重试剩余项', (t) => {
  const first = fixture(t);
  const second = fixture(t);
  const repositories = normalizeTaskFinishRepositorySet([
    { selector: 'workspace', sourcePath: '.', retainedRoot: first.root, taskRoot: first.taskRoot, environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null, taskContribution: first.taskContribution },
    { selector: 'service:demo/api', sourcePath: 'projects/demo/services/api', retainedRoot: second.root, taskRoot: second.taskRoot, environmentBranch: 'codex/reconcile-task', targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null, taskContribution: second.taskContribution },
  ]);
  const handoff = {
    identity: 'sha256-current-partial-cleanup',
    candidate: { identity: 'sha256-candidate-partial-cleanup', generation: 2, contentTargetIdentity: 'sha256-content-partial-cleanup' },
    gates: { planning: { disposition: 'not-applicable' }, verification: { disposition: 'waived' }, completion: { disposition: 'waived' } },
  };
  const entry = { handoff, identityParts: {
    task: 'reconcile-partial-cleanup', handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity,
    candidateGeneration: 2, contentTargetIdentity: handoff.candidate.contentTargetIdentity, agent: 'codex',
    targetBranch: null, remote: null, repositories, repositorySetIdentity: taskFinishRepositorySetIdentity(repositories),
    environmentRoot: first.taskRoot, workspaceRoot: first.root, deliveryCommitIdentity: null,
  } };
  const oldHandoff = {
    ...handoff,
    identity: `${handoff.identity}-old`,
    candidate: { ...handoff.candidate, identity: `${handoff.candidate.identity}-old`, generation: 3, contentTargetIdentity: `${handoff.candidate.contentTargetIdentity}-old` },
  };
  const oldIdentity = {
    ...entry.identityParts,
    handoffIdentity: oldHandoff.identity,
    candidateIdentity: oldHandoff.candidate.identity,
    candidateGeneration: oldHandoff.candidate.generation,
    contentTargetIdentity: oldHandoff.candidate.contentTargetIdentity,
  };
  const staleRun = createFinishRun({
    root: first.root, identity: oldIdentity, developmentHandoff: oldHandoff,
    runId: 'reconcile-partial-cleanup-failed-carrier', runtime: { readTaskFinishRunPersistence: () => null },
  });
  staleRun.status = 'failed';
  const preflight = staleRun.phases.find((phase) => phase.id === 'preflight');
  preflight.status = 'passed';
  preflight.attempts = 1;
  const prepare = staleRun.phases.find((phase) => phase.id === 'prepare');
  prepare.status = 'failed';
  prepare.attempts = 1;
  prepare.failure = { phase: 'prepare', operation: 'task-contribution', check: null, failureClass: 'semantic-review-required', code: 'task-finish.task-contribution-drift-unresolved', status: 'failed', exitCode: null, message: 'fixture', findings: [], diagnostic: null };
  staleRun.primaryFailure = structuredClone(prepare.failure);

  const firstRoot = taskFinishCarrierRoot(first.root, staleRun.runId, 'workspace');
  const secondRoot = taskFinishCarrierRoot(first.root, staleRun.runId, 'service:demo/api');
  fs.mkdirSync(path.dirname(firstRoot), { recursive: true });
  git(first.root, ['worktree', 'add', '--detach', firstRoot, 'origin/dev']);
  fs.mkdirSync(secondRoot, { recursive: true });
  const carrierFacts = [
    { selector: 'workspace', root: firstRoot, head: git(first.root, ['rev-parse', 'origin/dev']) },
    { selector: 'service:demo/api', root: secondRoot, head: git(second.root, ['rev-parse', 'origin/dev']) },
  ];
  for (const facts of carrierFacts) {
    const state = staleRun.repositories.find((repository) => repository.selector === facts.selector);
    state.deliveryCarrier = { identity: `sha256-carrier-${facts.selector}`, root: facts.root, head: facts.head, changedPaths: ['feature.txt'], activationPaths: ['feature.txt'] };
  }

  let current = { run: staleRun };
  let terminal = null;
  const runtime = {
    readTaskFinishCompletionPersistence: () => null,
    readTaskFinishRunPersistence: () => current,
    finalizeTaskFinishPersistence: (_target, value) => { terminal = value; current = null; },
    completeTaskRecordFromFinish: () => ({ status: 'completed', record: { status: 'completed', result: { noChange: false } } }),
  };
  const partial = reconcileTaskFinishDelivery({ runtime, root: first.root, entry });
  assert.equal(partial.status, 'unproven');
  assert.deepEqual(partial.effects, [{ type: 'stale-carrier-removed', selector: 'workspace', carrierIdentity: 'sha256-carrier-workspace' }]);
  assert.equal(fs.existsSync(firstRoot), false);
  assert.equal(fs.existsSync(secondRoot), true);
  assert.equal(current.run.runId, staleRun.runId);

  fs.rmdirSync(secondRoot);
  git(second.root, ['worktree', 'add', '--detach', secondRoot, 'origin/dev']);
  const completed = reconcileTaskFinishDelivery({ runtime, root: first.root, entry });
  assert.equal(completed.status, 'complete');
  assert.equal(completed.recovery.carrierCleanup.repositories.find((repository) => repository.selector === 'workspace').status, 'not-applicable');
  assert.equal(completed.recovery.carrierCleanup.repositories.find((repository) => repository.selector === 'service:demo/api').status, 'removed');
  assert.equal(terminal.run.identity.handoffIdentity, handoff.identity);
});
