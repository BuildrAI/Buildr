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
  assert.equal(database.prepare('SELECT count(*) AS count FROM task_finish_target_leases').get().count, 0);
  assert.equal(database.prepare('SELECT count(*) AS count FROM task_finish_transient_artifacts').get().count, 0);
  database.close();
});

test('legacy completed Finish 只在显式 cutover 后导入 SQLite，非终态不恢复', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'legacy-finish', title: 'Legacy Finish', intent: 'Cut over a completed result.', projects: [], services: [], changes: [] });
  const runIdentity = identity(root, 'legacy-finish');
  const run = {
    schemaVersion: 'buildr.task-finish-run/v2', runId: 'legacy-finish-run', status: 'complete', identity: runIdentity,
    identityDigest: 'sha256-legacy', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    invocations: 1, deliveryCarrier: { identity: 'sha256-carrier', head: 'carrier-head', tree: 'carrier-tree', changedPaths: [] },
    equivalence: null, delivery: { finalRemoteRef: 'remote-head' }, completion: { status: 'complete' }, resume: null, primaryFailure: null,
    phases: ['preflight', 'prepare', 'verify', 'deliver', 'cleanup'].map((id) => ({ id, status: 'passed', attempts: 1, durationMs: 1 })),
  };
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v1', runId: run.runId, task: run.identity.task,
    handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity, carrierIdentity: 'sha256-carrier', carrierRef: 'carrier-head',
    finalRemoteRef: 'remote-head', targetBranch: run.identity.targetBranch, status: 'complete', completedAt: run.completedAt,
  };
  const legacyRoot = path.join(root, '.buildr', 'task-finish');
  fs.mkdirSync(path.join(legacyRoot, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(legacyRoot, 'completed'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'runs', `${run.runId}.json`), JSON.stringify(run));
  fs.writeFileSync(path.join(legacyRoot, 'completed', `${run.runId}.json`), JSON.stringify(completion));

  const cutover = runtime.cutoverLegacyTaskFinishStore(root);
  assert.equal(cutover.status, 'complete');
  assert.deepEqual(cutover.imported, [{ taskId: 'legacy-finish', runId: run.runId }]);
  assert.equal(runtime.readTaskFinishCompletionPersistence(root, { taskId: 'legacy-finish' }).completion.result.status, 'complete');
  assert.equal(fs.existsSync(path.join(legacyRoot, 'runs', `${run.runId}.json`)), false);
  assert.equal(fs.existsSync(path.join(legacyRoot, 'completed', `${run.runId}.json`)), false);
  const blockedRun = { ...run, runId: 'legacy-blocked-run', status: 'blocked', completion: { status: 'prepared' } };
  const blockedCompletion = { ...completion, runId: blockedRun.runId, status: 'prepared' };
  fs.writeFileSync(path.join(legacyRoot, 'runs', `${blockedRun.runId}.json`), JSON.stringify(blockedRun));
  fs.writeFileSync(path.join(legacyRoot, 'completed', `${blockedRun.runId}.json`), JSON.stringify(blockedCompletion));
  const rejected = runtime.cutoverLegacyTaskFinishStore(root);
  assert.equal(rejected.imported.length, 0);
  assert.equal(rejected.diagnostics[0].code, 'legacy_cutover_not_terminal');
  assert.equal(fs.existsSync(path.join(legacyRoot, 'runs', `${blockedRun.runId}.json`)), true);
  assert.deepEqual(runtime.cutoverLegacyTaskFinishStore(root).imported, []);
});

test('transient artifact locator 必须被 run-owned root 限制，Doctor 只报告不删除', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'artifact-finish', title: 'Artifact Finish', intent: 'Check transient ownership.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId: 'artifact-finish-run', identity: identity(root, 'artifact-finish'), runtime });
  runtime.writeTaskFinishRunPersistence(root, run);
  assert.throws(() => runtime.registerTaskFinishTransientArtifactPersistence(root, { runId: run.runId, artifactId: 'escape', kind: 'stderr', relativeLocator: '../outside.log', sizeBytes: 1, sha256: 'sha256-x' }), (error) => error.code === 'task_finish_artifact_path_escape');
  const artifactRoot = path.join(root, '.buildr', 'transient', 'task-finish', run.runId);
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(path.join(artifactRoot, 'stderr.log'), 'x');
  runtime.registerTaskFinishTransientArtifactPersistence(root, { runId: run.runId, artifactId: 'stderr', kind: 'stderr', relativeLocator: `.buildr/transient/task-finish/${run.runId}/stderr.log`, sizeBytes: 1, sha256: 'sha256-x' });
  const report = runtime.inspectTaskFinishPersistence(root);
  assert.equal(report.artifacts[0].present, true);
  assert.equal(report.status, 'healthy');
  assert.equal(fs.existsSync(path.join(artifactRoot, 'stderr.log')), true);
});
