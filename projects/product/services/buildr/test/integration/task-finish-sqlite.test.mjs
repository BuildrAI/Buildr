import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createFinishRun, executeFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

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
    workspaceNodeIdentity: 'sha256-node',
  };
}

test('Task Finish current run、lease和completion由Workspace SQLite统一持久化', async (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
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

test('target lease使用expiry与token fencing避免旧owner释放新owner', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
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

test('SQLite-only Finish 不迁移旧目录中的 completed 或 blocked 状态', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
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
  const runtime = createRuntime();
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
