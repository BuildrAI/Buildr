import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { createFinishRun, executeFinishRun, finishResult } from '../../src/task/application/finish/task-finish-run.mjs';
import { normalizeTaskFinishDeliveryCommit } from '../../src/task/application/finish/task-finish-delivery-commit.mjs';

const test = createBuildrApplicationTest('integration-task-finish-sqlite');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Finish SQLite Test\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 123e4567-e89b-42d3-a456-426614174001
name: Finish SQLite Test
description: Finish SQLite Test
runtime:
  node:
    version: ${process.versions.node}
`);
  return root;
}

function identity(root, task) {
  return {
    task,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content-target',
    agent: 'codex',
    targetBranch: 'dev',
    remote: 'origin',
    environmentRoot: root,
    workspaceRoot: root,
  };
}

function repositoryPlan(root, selector, { retainedRoot = root, remote = 'origin', targetBranch = 'dev' } = {}) {
  const suffix = selector.replaceAll(/[^a-z0-9]+/gi, '-');
  return {
    selector,
    sourcePath: selector === 'workspace' ? '.' : `projects/${suffix}`,
    retainedRoot,
    taskRoot: path.join(root, '.worktrees', suffix),
    environmentBranch: `codex/${suffix}`,
    targetBranch,
    remote,
    disposition: 'applicable',
    taskContribution: {
      identity: `sha256-contribution-${suffix}`,
      originalBaseline: { tree: `baseline-${suffix}` },
      source: { tree: `source-${suffix}` },
    },
  };
}

test('Task Finish current run、lease和completion由Workspace SQLite统一持久化', async (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecord(root, { taskId: 'sqlite-finish', title: 'SQLite Finish', intent: 'Prove Finish state ownership.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId: 'sqlite-finish-run', identity: identity(root, 'sqlite-finish'), runtime });
  runtime.writeTaskFinishRunPersistence(root, run);

  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: 'sqlite-finish' }).run.runId, 'sqlite-finish-run');
  const lease = runtime.acquireTaskFinishTargetLease(root, { run, targetIdentity: 'origin:dev' });
  assert.equal(lease.storage, 'sqlite');
  assert.equal(runtime.acquireTaskFinishTargetLease(root, { run, targetIdentity: 'origin:dev' }).token, lease.token);

  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v1',
    runId: run.runId,
    task: run.identity.task,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    carrierIdentity: 'sha256-carrier',
    carrierRef: 'carrier-head',
    finalRemoteRef: 'remote-head',
    targetBranch: 'dev',
    status: 'prepared',
    association: null,
  };
  runtime.writeTaskFinishCompletionPersistence(root, { taskId: run.identity.task, runId: run.runId, result: completion, status: 'cleanup_pending' });
  assert.equal(runtime.readTaskFinishCompletionPersistence(root, { runId: run.runId }).completion.status, 'prepared');

  const handlers = Object.fromEntries(['preflight', 'prepare', 'verify', 'deliver'].map((phase) => [phase, async () => ({ status: 'passed' })]));
  handlers.cleanup = async () => ({ status: 'passed', output: { completion: { ...completion, status: 'complete', completedAt: new Date().toISOString() } } });
  const result = await executeFinishRun({ root, run, handlers, runtime });
  assert.equal(result.status, 'complete');
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: run.identity.task }, { optional: true }), null);
  const terminal = runtime.readTaskFinishCompletionPersistence(root, { taskId: run.identity.task });
  assert.equal(terminal.status, 'complete');
  assert.equal(terminal.completion.result.status, 'complete');

  const database = runtime.openWorkspaceStructuredStore(root, { writable: false }).database;
  const row = database.prepare('SELECT status, lease_target_identity AS leaseTargetIdentity, json_extract(phases_json, \'$[4].id\') AS cleanupPhase FROM task_finish_current').get();
  assert.deepEqual({ ...row }, { status: 'complete', leaseTargetIdentity: null, cleanupPhase: 'cleanup' });
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_finish_runs', 'task_finish_completions', 'task_finish_target_leases', 'task_finish_transient_artifacts')").get().count, 0);
  database.close();
});

test('multi-repository terminal persistence统一投影Workspace target且不降级为attention', async (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'sqlite-finish-multi-repository';
  runtime.createTaskRecord(root, { taskId: task, title: task, intent: 'Prove multi-repository terminal projection.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId: `${task}-run`,
    identity: {
      ...identity(root, task),
      targetBranch: null,
      remote: null,
      repositories: [
        repositoryPlan(root, 'service:demo/api', { targetBranch: 'dev-api' }),
        repositoryPlan(root, 'workspace'),
      ],
    },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, run);
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v3',
    runId: run.runId,
    task,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    repositorySetIdentity: run.identity.repositorySetIdentity,
    targetBranch: null,
    status: 'complete',
    cleanup: { status: 'cleaned' },
    maintenance: { delivery: 'delivered', activation: 'passed', environmentCleanup: 'cleaned', diagnostics: 'not-opened' },
    association: null,
  };
  const handlers = Object.fromEntries(['preflight', 'prepare', 'verify', 'deliver'].map((phase) => [phase, async () => ({ status: 'passed' })]));
  handlers.cleanup = async () => ({ status: 'passed', output: { completion } });

  const result = await executeFinishRun({ root, run, handlers, runtime });

  assert.equal(result.status, 'complete');
  assert.equal(result.identity.targetBranch, 'dev');
  assert.equal(result.identity.remote, 'origin');
  assert.equal(result.completion.persistence, undefined);
  assert.equal(result.maintenance.diagnostics, 'not-opened');
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }, { optional: true }), null);
  const terminal = runtime.readTaskFinishCompletionPersistence(root, { taskId: task });
  assert.equal(terminal.status, 'complete');
  const database = runtime.openWorkspaceStructuredStore(root, { writable: false }).database;
  const row = database.prepare("SELECT target_branch, target_remote, json_extract(payload_json, '$.kind') AS kind FROM task_finish_current WHERE task_id = ?").get(task);
  assert.deepEqual({ ...row }, { target_branch: 'dev', target_remote: 'origin', kind: 'terminal' });
  database.close();
});

test('multi-service terminal persistence在没有Workspace repository时保持顶层target为空', async (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'sqlite-finish-multi-service';
  runtime.createTaskRecord(root, { taskId: task, title: task, intent: 'Prove service-only terminal projection.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId: `${task}-run`,
    identity: {
      ...identity(root, task),
      targetBranch: null,
      remote: null,
      repositories: [
        repositoryPlan(root, 'service:demo/api', { targetBranch: 'dev-api' }),
        repositoryPlan(root, 'service:demo/worker', { targetBranch: 'dev-worker' }),
      ],
    },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, run);
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v3',
    runId: run.runId,
    task,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    repositorySetIdentity: run.identity.repositorySetIdentity,
    targetBranch: null,
    status: 'complete',
    cleanup: { status: 'cleaned' },
    maintenance: { delivery: 'delivered', activation: 'not-applicable', environmentCleanup: 'cleaned', diagnostics: 'not-opened' },
    association: null,
  };
  const handlers = Object.fromEntries(['preflight', 'prepare', 'verify', 'deliver'].map((phase) => [phase, async () => ({ status: 'passed' })]));
  handlers.cleanup = async () => ({ status: 'passed', output: { completion } });

  const result = await executeFinishRun({ root, run, handlers, runtime });

  assert.equal(result.status, 'complete');
  assert.equal(result.identity.targetBranch, null);
  assert.equal(result.identity.remote, null);
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }, { optional: true }), null);
  const database = runtime.openWorkspaceStructuredStore(root, { writable: false }).database;
  const row = database.prepare("SELECT target_branch, target_remote, json_extract(payload_json, '$.kind') AS kind FROM task_finish_current WHERE task_id = ?").get(task);
  assert.deepEqual({ ...row }, { target_branch: null, target_remote: null, kind: 'terminal' });
  database.close();
});

test('reconciliation terminal只在failed current run ID与digest精确匹配时原子替换', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'sqlite-recovery-terminal';
  runtime.createTaskRecord(root, { taskId: task, title: task, intent: 'Prove atomic recovery terminal replacement.', projects: [], services: [], changes: [] });
  const oldRun = createFinishRun({ root, runId: 'sqlite-recovery-old', identity: identity(root, task), runtime });
  oldRun.status = 'failed';
  oldRun.updatedAt = new Date().toISOString();
  runtime.writeTaskFinishRunPersistence(root, oldRun);
  const frozen = runtime.readTaskFinishRunPersistence(root, { taskId: task });

  const newIdentity = {
    ...identity(root, task),
    handoffIdentity: 'sha256-handoff-current',
    candidateIdentity: 'sha256-candidate-current',
    candidateGeneration: 2,
    contentTargetIdentity: 'sha256-content-current',
  };
  const terminalRun = createFinishRun({ root, runId: 'sqlite-recovery-current', identity: newIdentity, runtime: { ...runtime, readTaskFinishRunPersistence: () => null } });
  terminalRun.status = 'complete';
  terminalRun.completedAt = new Date().toISOString();
  terminalRun.updatedAt = terminalRun.completedAt;
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v3',
    runId: terminalRun.runId,
    task,
    handoffIdentity: newIdentity.handoffIdentity,
    candidateIdentity: newIdentity.candidateIdentity,
    candidateGeneration: newIdentity.candidateGeneration,
    contentTargetIdentity: newIdentity.contentTargetIdentity,
    repositorySetIdentity: terminalRun.identity.repositorySetIdentity,
    status: 'complete',
    cleanup: { status: 'pending' },
    association: null,
  };
  terminalRun.completion = completion;
  const result = { ...finishResult(terminalRun), completion };

  assert.throws(() => runtime.finalizeTaskFinishPersistence(root, { run: terminalRun, result, completion }), (error) => error.code === 'task_finish_current_conflict');
  assert.throws(() => runtime.finalizeTaskFinishPersistence(root, {
    run: terminalRun,
    result,
    completion,
    supersededCurrent: { runId: oldRun.runId, runDigest: 'sha256-stale-digest' },
  }), (error) => error.code === 'task_finish_current_conflict');
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }).run.runId, oldRun.runId);

  runtime.finalizeTaskFinishPersistence(root, {
    run: terminalRun,
    result,
    completion,
    supersededCurrent: { runId: oldRun.runId, runDigest: frozen.runDigest },
  });
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }, { optional: true }), null);
  const stored = runtime.readTaskFinishCompletionPersistence(root, { taskId: task });
  assert.equal(stored.runId, terminalRun.runId);
  assert.equal(stored.completion.handoffIdentity, newIdentity.handoffIdentity);
  assert.throws(() => runtime.writeTaskFinishTerminalCleanupPersistence(root, {
    taskId: task,
    runId: 'another-run',
    cleanup: { status: 'cleaned', carriers: { status: 'cleaned', repositories: [] } },
  }), (error) => error.code === 'task_finish_current_conflict');
  runtime.writeTaskFinishTerminalCleanupPersistence(root, {
    taskId: task,
    runId: terminalRun.runId,
    cleanup: { status: 'attention', carriers: { status: 'cleaned', repositories: [{ selector: 'workspace', status: 'not-applicable', code: null }] } },
  });
  const updated = runtime.readTaskFinishCompletionPersistence(root, { taskId: task }).completion;
  assert.equal(updated.cleanup.carriers.status, 'cleaned');
  assert.deepEqual(updated.result.completion.cleanup, updated.cleanup);
});

test('rollover只用旧run ID和digest原子替换为新的active current run', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'sqlite-rollover-current';
  runtime.createTaskRecord(root, { taskId: task, title: task, intent: 'Prove atomic active run rollover.', projects: [], services: [], changes: [] });
  const oldRun = createFinishRun({ root, runId: 'sqlite-rollover-old', identity: identity(root, task), runtime });
  oldRun.status = 'failed';
  oldRun.phases[0] = { ...oldRun.phases[0], status: 'passed', attempts: 1 };
  oldRun.phases[1] = { ...oldRun.phases[1], status: 'failed', attempts: 1 };
  runtime.writeTaskFinishRunPersistence(root, oldRun);
  const frozen = runtime.readTaskFinishRunPersistence(root, { taskId: task });
  const nextRun = createFinishRun({
    root,
    runId: 'sqlite-rollover-next',
    identity: { ...identity(root, task), handoffIdentity: 'sha256-handoff-2', candidateIdentity: 'sha256-candidate-2', candidateGeneration: 2, contentTargetIdentity: 'sha256-content-2' },
    runtime: { ...runtime, readTaskFinishRunPersistence: () => null },
  });

  assert.throws(() => runtime.replaceTaskFinishRunPersistence(root, {
    run: nextRun,
    supersededCurrent: { runId: oldRun.runId, runDigest: 'sha256-wrong' },
  }), (error) => error.code === 'task_finish_current_conflict');
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }).run.runId, oldRun.runId);

  const replaced = runtime.replaceTaskFinishRunPersistence(root, {
    run: nextRun,
    supersededCurrent: { runId: oldRun.runId, runDigest: frozen.runDigest },
  });
  assert.equal(replaced.run.runId, nextRun.runId);
  assert.equal(replaced.run.status, 'active');
  assert.equal(runtime.readTaskFinishRunPersistence(root, { taskId: task }).run.runId, nextRun.runId);
});

test('Task Finish current独占完整delivery message且公开result只投影subject与identity', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'delivery-message-owner';
  runtime.createTaskRecord(root, { taskId: task, title: 'Delivery message owner', intent: 'Prove message ownership.', projects: [], services: [], changes: [] });
  const deliveryCommit = normalizeTaskFinishDeliveryCommit('fix(task-finish): freeze message\n\nprivate body evidence', task);
  const run = createFinishRun({
    root,
    runId: 'delivery-message-owner-run',
    identity: { ...identity(root, task), deliveryCommitIdentity: deliveryCommit.identity },
    deliveryCommit,
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, run);
  const current = runtime.readTaskFinishRunPersistence(root, { taskId: task }).run;
  assert.equal(current.deliveryCommit.message, deliveryCommit.message);
  assert.equal(current.identity.deliveryCommitIdentity, deliveryCommit.identity);
  const result = finishResult(current);
  assert.deepEqual(result.deliveryCommit, { subject: deliveryCommit.subject, identity: deliveryCommit.identity });
  assert.doesNotMatch(JSON.stringify(result), /private body evidence/);
});

test('Delivery Adaptation Result临时返回完整冻结message与可移植准备提示', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const task = 'delivery-adaptation-guidance';
  runtime.createTaskRecord(root, { taskId: task, title: 'Delivery adaptation guidance', intent: 'Prove exact adaptation guidance.', projects: [], services: [], changes: [] });
  const deliveryCommit = normalizeTaskFinishDeliveryCommit('fix(task-finish): adapt carrier\n\nprivate rationale', task);
  const run = createFinishRun({
    root,
    runId: 'delivery-adaptation-guidance-run',
    identity: { ...identity(root, task), deliveryCommitIdentity: deliveryCommit.identity },
    deliveryCommit,
    runtime,
  });
  run.status = 'blocked';
  run.primaryFailure = { phase: 'prepare', operation: 'delivery-adaptation', code: 'task-finish.delivery-adaptation-required', status: 'blocked' };
  run.resume = { phase: 'prepare', token: 'sha256-resume', carrierIdentity: 'sha256-carrier' };
  run.deliveryCarrier = {
    identity: 'sha256-carrier',
    adaptationGuidance: {
      preparationHints: {
        schemaVersion: 'buildr.task-finish-preparation-hints/v1',
        steps: [{ id: 'prepare', cwd: 'projects/product/services/buildr', executable: 'tools/development/run-development-npm', args: ['ci'], outputs: [] }],
        unavailable: [],
      },
    },
  };

  const adaptation = finishResult(run);
  assert.equal(adaptation.deliveryAdaptation.expectedCommitMessage, deliveryCommit.message);
  assert.equal(adaptation.deliveryAdaptation.preparationHints.steps[0].args[0], 'ci');
  assert.equal(adaptation.carrier.adaptationGuidance, undefined);

  run.status = 'complete';
  run.primaryFailure = null;
  run.resume = null;
  assert.equal(finishResult(run).deliveryAdaptation, null);
});

test('target lease使用expiry与token fencing避免旧owner释放新owner', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  for (const taskId of ['lease-owner-a', 'lease-owner-b']) {
    runtime.createTaskRecord(root, { taskId, title: taskId, intent: 'Prove lease fencing.', projects: [], services: [], changes: [] });
  }
  const ownerA = createFinishRun({ root, runId: 'lease-owner-a-run', identity: identity(root, 'lease-owner-a'), runtime });
  const ownerB = createFinishRun({ root, runId: 'lease-owner-b-run', identity: identity(root, 'lease-owner-b'), runtime });
  runtime.writeTaskFinishRunPersistence(root, ownerA);
  runtime.writeTaskFinishRunPersistence(root, ownerB);

  const leaseA = runtime.acquireTaskFinishTargetLease(root, { run: ownerA, targetIdentity: 'origin:dev', clock: () => 0 });
  const wrongToken = { ...leaseA, token: 'wrong-token' };
  assert.equal(runtime.releaseTaskFinishTargetLease(root, wrongToken).released, false);
  assert.equal(runtime.acquireTaskFinishTargetLease(root, { run: ownerB, targetIdentity: 'origin:dev', clock: () => 30_000 }).blocked, true);

  runtime.writeTaskFinishRunPersistence(root, { ...ownerA, status: 'failed', updatedAt: new Date(45_000).toISOString() });
  const leaseB = runtime.acquireTaskFinishTargetLease(root, { run: ownerB, targetIdentity: 'origin:dev', clock: () => 61_000 });
  assert.equal(leaseB.blocked, undefined);
  assert.notEqual(leaseB.token, leaseA.token);
  assert.equal(runtime.releaseTaskFinishTargetLease(root, leaseA).released, false);
  assert.equal(runtime.releaseTaskFinishTargetLease(root, leaseB).released, true);
});

test('retained内部lease driver以closed schema获取刷新和释放matching owner', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const taskId = 'lease-driver-owner';
  const runId = 'lease-driver-owner-run';
  runtime.createTaskRecord(root, { taskId, title: taskId, intent: 'Prove internal lease driver.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId, identity: identity(root, taskId), runtime });
  runtime.writeTaskFinishRunPersistence(root, run);
  const driver = fileURLToPath(new URL('../../src/task/interfaces/internal/task-finish-target-lease-driver.mjs', import.meta.url));
  const invoke = (action, extra = []) => spawnSync(process.execPath, [driver, action, '--task', taskId, '--run', runId, '--target-identity', 'origin:dev', '--target', root, ...extra], { encoding: 'utf8' });

  const acquired = invoke('acquire');
  assert.equal(acquired.status, 0, acquired.stderr);
  const acquisition = JSON.parse(acquired.stdout);
  assert.equal(acquisition.schemaVersion, 'buildr.task-finish-target-lease-driver-result/v1');
  assert.equal(acquisition.status, 'passed');
  assert.equal(acquisition.targetIdentity, 'origin:dev');
  assert.equal(acquisition.resolvedTargetIdentity, 'origin:dev');
  assert.equal(acquisition.resolution, 'exact');
  assert.ok(acquisition.lease.token);

  const refreshed = invoke('refresh');
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(JSON.parse(refreshed.stdout).lease.token, acquisition.lease.token);

  const released = invoke('release', ['--lease-token', acquisition.lease.token]);
  assert.equal(released.status, 0, released.stderr);
  assert.equal(JSON.parse(released.stdout).released, true);
  assert.deepEqual(runtime.inspectTaskFinishPersistence(root).leases, []);
});

test('repository-set lease只对matching owner唯一解析legacy logical target', (t) => {
  const root = workspace(t);
  const foreignRoot = workspace(t);
  const runtime = t.buildrContexts.application;
  for (const taskId of ['repository-lease-unique', 'repository-lease-ambiguous']) {
    runtime.createTaskRecord(root, { taskId, title: taskId, intent: 'Prove repository-scoped lease compatibility.', projects: [], services: [], changes: [] });
  }

  const uniqueRun = createFinishRun({
    root,
    runId: 'repository-lease-unique-run',
    identity: { ...identity(root, 'repository-lease-unique'), repositories: [repositoryPlan(root, 'workspace')] },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, uniqueRun);
  const exactIdentity = uniqueRun.identity.repositories[0].leaseTargetIdentity;
  const legacy = runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: 'origin:dev',
  });
  assert.equal(legacy.resolution.mode, 'legacy-logical-unique');
  assert.equal(legacy.resolution.targetIdentity, exactIdentity);
  assert.equal(legacy.value.targetIdentity, exactIdentity);
  assert.equal(runtime.inspectTaskFinishPersistence(root).leases[0].targetIdentity, exactIdentity);
  assert.equal(runtime.releaseTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: 'origin:dev',
    token: 'wrong-token',
  }).released, false);
  assert.equal(runtime.inspectTaskFinishPersistence(root).leases.length, 1);
  assert.throws(() => runtime.releaseTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: 'wrong-run',
    targetIdentity: 'origin:dev',
    token: legacy.token,
  }), (error) => error.code === 'task_finish_current_conflict');
  assert.equal(runtime.releaseTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: 'origin:dev',
    token: legacy.token,
  }).released, true);

  assert.throws(() => runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: 'upstream:main',
  }), (error) => error.code === 'task_finish_target_identity_mismatch');
  assert.throws(() => runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: 'sha256-wrong-repository',
  }), (error) => error.code === 'task_finish_target_identity_mismatch');
  assert.throws(() => runtime.acquireTaskFinishCurrentTargetLease(foreignRoot, {
    taskId: uniqueRun.identity.task,
    runId: uniqueRun.runId,
    targetIdentity: exactIdentity,
  }), (error) => error.code === 'task_finish_current_conflict');

  const ambiguousRun = createFinishRun({
    root,
    runId: 'repository-lease-ambiguous-run',
    identity: {
      ...identity(root, 'repository-lease-ambiguous'),
      repositories: [
        repositoryPlan(root, 'workspace'),
        repositoryPlan(root, 'service:product/example', { retainedRoot: path.join(root, 'repositories', 'example') }),
      ],
    },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, ambiguousRun);
  assert.throws(() => runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: ambiguousRun.identity.task,
    runId: ambiguousRun.runId,
    targetIdentity: 'origin:dev',
  }), (error) => error.code === 'task_finish_target_identity_ambiguous');
  const serviceIdentity = ambiguousRun.identity.repositories.find((repository) => repository.selector === 'service:product/example').leaseTargetIdentity;
  const exact = runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: ambiguousRun.identity.task,
    runId: ambiguousRun.runId,
    targetIdentity: serviceIdentity,
  });
  assert.equal(exact.resolution.mode, 'exact');
  assert.equal(exact.value.targetIdentity, serviceIdentity);
  assert.equal(runtime.releaseTaskFinishCurrentTargetLease(root, {
    taskId: ambiguousRun.identity.task,
    runId: ambiguousRun.runId,
    targetIdentity: serviceIdentity,
    token: exact.token,
  }).released, true);
});

test('terminal Finish row可临时持有自举lease且过期后由新owner接管', async (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  for (const taskId of ['terminal-lease-owner', 'terminal-lease-successor']) {
    runtime.createTaskRecord(root, { taskId, title: taskId, intent: 'Prove terminal activation lease.', projects: [], services: [], changes: [] });
  }
  const terminalRun = createFinishRun({ root, runId: 'terminal-lease-owner-run', identity: identity(root, 'terminal-lease-owner'), runtime });
  runtime.writeTaskFinishRunPersistence(root, terminalRun);
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v1', runId: terminalRun.runId, task: terminalRun.identity.task,
    handoffIdentity: terminalRun.identity.handoffIdentity, candidateIdentity: terminalRun.identity.candidateIdentity,
    candidateGeneration: terminalRun.identity.candidateGeneration, contentTargetIdentity: terminalRun.identity.contentTargetIdentity,
    carrierIdentity: 'sha256-carrier', carrierRef: 'carrier-head', finalRemoteRef: 'remote-head', targetBranch: 'dev', status: 'complete', association: null,
  };
  const handlers = Object.fromEntries(['preflight', 'prepare', 'verify', 'deliver'].map((phase) => [phase, async () => ({ status: 'passed' })]));
  handlers.cleanup = async () => ({ status: 'passed', output: { completion: { ...completion, completedAt: new Date().toISOString() } } });
  assert.equal((await executeFinishRun({ root, run: terminalRun, handlers, runtime })).status, 'complete');

  const activationLease = runtime.acquireTaskFinishCurrentTargetLease(root, {
    taskId: terminalRun.identity.task, runId: terminalRun.runId, targetIdentity: 'origin:dev', leaseDurationMs: 15 * 60_000, clock: () => 0,
  });
  assert.equal(activationLease.value.expiresAt, new Date(15 * 60_000).toISOString());

  const successor = createFinishRun({ root, runId: 'terminal-lease-successor-run', identity: identity(root, 'terminal-lease-successor'), runtime });
  runtime.writeTaskFinishRunPersistence(root, successor);
  assert.equal(runtime.acquireTaskFinishTargetLease(root, { run: successor, targetIdentity: 'origin:dev', clock: () => 60_000 }).blocked, true);
  const successorLease = runtime.acquireTaskFinishTargetLease(root, { run: successor, targetIdentity: 'origin:dev', clock: () => 15 * 60_000 + 1 });
  assert.equal(successorLease.blocked, undefined);
  assert.notEqual(successorLease.token, activationLease.token);
  assert.equal(runtime.releaseTaskFinishTargetLease(root, activationLease).released, false);
  assert.equal(runtime.releaseTaskFinishTargetLease(root, successorLease).released, true);
});

test('SQLite-only Finish 不迁移旧目录中的 completed 或 blocked 状态', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecord(root, { taskId: 'legacy-finish', title: 'Legacy Finish', intent: 'Prove old files are not migrated.', projects: [], services: [], changes: [] });
  const legacyRoot = path.join(root, '.buildr', 'task-finish');
  fs.mkdirSync(path.join(legacyRoot, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(legacyRoot, 'completed'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'runs', 'legacy-finish-run.json'), '{"schemaVersion":"buildr.task-finish-run/v2","status":"complete"}');
  fs.writeFileSync(path.join(legacyRoot, 'completed', 'legacy-finish-run.json'), '{"schemaVersion":"buildr.task-finish-completion/v1","status":"complete"}');

  assert.equal(runtime.readTaskFinishCompletionPersistence(root, { taskId: 'legacy-finish' }), null);
  assert.equal(runtime.inspectTaskFinishPersistence(root).legacy, undefined);
  assert.equal(fs.existsSync(path.join(legacyRoot, 'runs', 'legacy-finish-run.json')), true);
  assert.equal(fs.existsSync(path.join(legacyRoot, 'completed', 'legacy-finish-run.json')), true);
});

test('单表拒绝损坏phase JSON且不再暴露per-artifact metadata API', (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecord(root, { taskId: 'artifact-finish', title: 'Artifact Finish', intent: 'Check transient ownership.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId: 'artifact-finish-run', identity: identity(root, 'artifact-finish'), runtime });
  runtime.writeTaskFinishRunPersistence(root, run);
  assert.equal(runtime.registerTaskFinishTransientArtifactPersistence, undefined);
  assert.equal(runtime.updateTaskFinishTransientArtifactPersistence, undefined);
  const database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  assert.throws(() => database.prepare("UPDATE task_finish_current SET phases_json = '[]' WHERE task_id = ?").run(run.identity.task));
  assert.throws(() => database.prepare("UPDATE task_finish_current SET phases_json = json_set(phases_json, '$[0].status', 'unknown') WHERE task_id = ?").run(run.identity.task));
  database.prepare("UPDATE task_finish_current SET candidate_identity = 'sha256-corrupt' WHERE task_id = ?").run(run.identity.task);
  database.close();
  assert.throws(() => runtime.readTaskFinishRunPersistence(root, { taskId: run.identity.task }), (failure) => failure.code === 'task_finish_current_query_fields_mismatch');
  const report = runtime.inspectTaskFinishPersistence(root);
  assert.equal(report.status, 'healthy');
  assert.equal(report.current.length, 1);
  assert.equal('artifacts' in report, false);
});

test('Task Finish current只保存compact phase与current failure owner facts', async (t) => {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecord(root, { taskId: 'compact-finish', title: 'Compact Finish', intent: 'Keep attempt diagnostics outside current.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId: 'compact-finish-run', identity: identity(root, 'compact-finish'), runtime });
  const handlers = {
    preflight: async () => ({
      status: 'blocked',
      checks: [{ check: 'retained-workspace', severity: 'error', code: 'task-finish.retained-workspace-dirty', localPath: '/Users/example/workspace' }],
      operations: [{ kind: 'command', id: 'git-status', command: 'git', args: ['status'], cwd: '/Users/example/workspace', stdout: { preview: 'token=secret', bytes: 12, digest: 'sha256-output', truncated: false }, stderr: { preview: '', bytes: 0, digest: 'sha256-empty', truncated: false } }],
      observations: [{ root: '/Users/example/workspace' }],
      output: { raw: 'not-current-authority' },
      failure: { operation: 'retained-workspace', failureClass: 'transient-external-condition', code: 'task-finish.retained-workspace-dirty', message: 'Workspace is dirty.', findings: [{ path: '/Users/example/workspace/private' }], diagnostic: { token: 'secret-token', root: '/Users/example/workspace' } },
    }),
  };
  const result = await executeFinishRun({ root, run, handlers, runtime });
  assert.equal(result.status, 'blocked');
  const current = runtime.readTaskFinishRunPersistence(root, { taskId: 'compact-finish' }).run;
  const phase = current.phases[0];
  assert.equal('checks' in phase, false);
  assert.equal('operations' in phase, false);
  assert.equal('observations' in phase, false);
  assert.equal('output' in phase, false);
  assert.deepEqual(phase.failure.diagnostic, { digest: phase.failure.diagnostic.digest });
  assert.equal('findings' in phase.failure, false);
  const database = runtime.openWorkspaceStructuredStore(root, { writable: false }).database;
  const row = database.prepare('SELECT phases_json AS phasesJson, payload_json AS payloadJson FROM task_finish_current WHERE task_id = ?').get('compact-finish');
  database.close();
  assert.doesNotMatch(row.phasesJson, /checks|operations|observations|stdout|stderr|secret-token|\/Users\/example/);
  assert.doesNotMatch(row.payloadJson, /executionRecord|recordId|task-execution-record|secret-token|\/Users\/example/);
});
