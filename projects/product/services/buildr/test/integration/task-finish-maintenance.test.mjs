import { legacyFinishRuntime } from '../helpers/legacy-finish-history.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { reconcileTaskFinishMaintenance } from '../../src/task/application/finish/task-finish-maintenance.mjs';
import { finishResult, inspectFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';
import { createFinishRun } from '../helpers/legacy-finish-history.mjs';

const test = createBuildrApplicationTest('integration-task-finish-maintenance');

function fixture(t, taskId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-maintenance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Finish maintenance fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174008\nname: Finish maintenance fixture\ndescription: Finish maintenance fixture\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = legacyFinishRuntime(t.buildrContexts.application);
  runtime.createTaskRecord(root, { taskId, title: 'Finish maintenance fixture', intent: 'Verify maintenance refresh.', projects: [], services: [], changes: [] });
  return { root, runtime };
}

function identity(root, taskId) {
  return {
    task: taskId,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content',
    agent: 'codex',
    targetBranch: 'dev',
    remote: null,
    environmentRoot: root,
    workspaceRoot: root,
  };
}

function completedRun(root, taskId, runId, runtime) {
  const run = createFinishRun({ root, identity: identity(root, taskId), runId, runtime });
  run.status = 'complete';
  run.completedAt = run.updatedAt;
  run.phases.forEach((phase) => { phase.status = phase.id === 'prepare' || phase.id === 'verify' ? 'not-applicable' : 'passed'; });
  run.completion = {
    schemaVersion: 'buildr.task-finish-completion/v3',
    task: taskId,
    runId,
    status: 'complete',
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    cleanup: { status: 'pending', summary: 'fixture' },
    maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'not-opened' },
    association: { handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, candidateGeneration: 1, gates: {} },
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  return run;
}

test('Product writer updates current Finish maintenance and preserves delivery projection', (t) => {
  const taskId = 'finish-maintenance-current';
  const { root, runtime } = fixture(t, taskId);
  const run = completedRun(root, taskId, 'current-run', runtime);
  runtime.readTaskEnvironmentCurrent = () => ({ status: 'cleaned', environment: { latest: { cleanup: { completedAt: '2026-08-21T00:00:00.000Z' } } } });
  const refreshed = reconcileTaskFinishMaintenance({
    runtime,
    root,
    taskId,
    runId: run.runId,
    selfBootstrapResult: { schemaVersion: 'buildr.self-bootstrap-closeout-result/v1', status: 'passed', taskId, runId: run.runId, phases: [{ id: 'finalize', status: 'passed' }] },
  });
  const inspected = inspectFinishRun({ root, runId: run.runId, runtime });
  assert.equal(refreshed.maintenance.activation, 'passed');
  assert.equal(refreshed.maintenance.environmentCleanup, 'cleaned');
  assert.equal(inspected.maintenance.activation, 'passed');
  assert.equal(inspected.maintenance.environmentCleanup, 'cleaned');
  assert.equal(inspected.status, 'complete');
});

test('Product writer updates terminal Finish cleanup from Environment current', (t) => {
  const taskId = 'finish-maintenance-terminal';
  const { root, runtime } = fixture(t, taskId);
  const run = completedRun(root, taskId, 'terminal-run', runtime);
  const result = finishResult(run);
  runtime.finalizeTaskFinishPersistence(root, { run, result, completion: run.completion });
  runtime.readTaskEnvironmentCurrent = () => ({ status: 'cleaned', environment: { latest: { cleanup: { completedAt: '2026-08-21T00:00:00.000Z' } } } });
  const refreshed = reconcileTaskFinishMaintenance({ runtime, root, taskId });
  const inspected = inspectFinishRun({ root, runId: run.runId, runtime });
  assert.equal(refreshed.maintenance.environmentCleanup, 'cleaned');
  assert.equal(inspected.maintenance.environmentCleanup, 'cleaned');
  assert.equal(inspected.completion.cleanup.status, 'cleaned');
  assert.equal(inspected.maintenance.activation, 'attention');
});
