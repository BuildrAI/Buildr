import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { inspectGitCarrierContainment } from '../../src/application/task-finish/git-task-contribution.mjs';
import {
  createFinishRun,
  writeFinishCompletion,
} from '../../src/application/task-finish/task-finish-run.mjs';
import { executeRetainedTaskFinishCleanup } from '../../src/interfaces/internal/task-finish-retained-cleanup.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writePreparedCompletion(root, run, runtime) {
  writeFinishCompletion({
    root,
    runId: run.runId,
    completion: {
      schemaVersion: 'buildr.task-finish-completion/v1',
      runId: run.runId,
      task: run.identity.task,
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      carrierIdentity: run.deliveryCarrier.identity,
      carrierRef: run.deliveryCarrier.head,
      finalRemoteRef: run.delivery.finalRemoteRef,
      targetBranch: run.identity.targetBranch,
      status: 'prepared',
      preparedAt: new Date().toISOString(),
    },
    runtime,
  });
}

function readyRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retained-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Retained cleanup SQLite Test\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174003\nname: Retained cleanup SQLite Test\ndescription: Retained cleanup SQLite Test\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'finish-task', title: 'Finish Task', intent: 'SQLite-only retained cleanup test.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId: 'retained-cleanup',
    identity: {
      task: 'finish-task',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot: path.join(root, '.worktrees', 'finish-task'),
      workspaceRoot: root,
      workspaceNodeIdentity: 'sha256-workspace-node',
    },
    runtime,
  });
  run.deliveryCarrier = { identity: 'sha256-carrier', head: 'carrier-ref' };
  run.delivery = { status: 'delivered', carrierRef: 'carrier-ref', remoteAfterRef: 'carrier-ref', finalRemoteRef: 'carrier-ref' };
  run.phases.find((phase) => phase.id === 'deliver').status = 'passed';
  run.phases.find((phase) => phase.id === 'cleanup').status = 'running';
  runtime.writeTaskFinishRunPersistence(root, run);
  writePreparedCompletion(root, run, runtime);
  return { root, run, runtime };
}

function alreadyContainedRun(t) {
  const current = readyRun(t);
  const { root, run, runtime } = current;
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Retained Cleanup']);
  git(root, ['config', 'user.email', 'retained-cleanup@example.com']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(root, 'feature.txt'), 'delivered content\n');
  git(root, ['add', 'feature.txt']);
  git(root, ['commit', '-m', 'delivery carrier']);
  const carrierRef = git(root, ['rev-parse', 'HEAD']);
  const carrierEntry = git(root, ['ls-tree', 'HEAD', 'feature.txt']).match(/^(\d+) \S+ ([0-9a-f]+)\t/);
  assert.ok(carrierEntry);
  fs.writeFileSync(path.join(root, 'later.txt'), 'self-bootstrap successor\n');
  git(root, ['add', 'later.txt']);
  git(root, ['commit', '-m', 'self-bootstrap successor']);
  const finalRemoteRef = git(root, ['rev-parse', 'HEAD']);
  run.deliveryCarrier = {
    identity: 'sha256-contained-carrier',
    head: carrierRef,
    changedPaths: ['feature.txt'],
    changes: [{
      path: 'feature.txt',
      beforeMode: '000000',
      afterMode: carrierEntry[1],
      beforeBlob: '0000000000000000000000000000000000000000',
      afterBlob: carrierEntry[2],
      status: 'A',
    }],
  };
  const containment = inspectGitCarrierContainment({ repositoryRoot: root, targetRef: finalRemoteRef, carrier: run.deliveryCarrier });
  assert.equal(containment.status, 'contained');
  run.delivery = {
    status: 'delivered',
    targetDisposition: 'already-contained',
    carrierRef,
    remoteAfterRef: finalRemoteRef,
    finalRemoteRef,
    containment,
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  writePreparedCompletion(root, run, runtime);
  return current;
}

test('retained cleanup bootstrap derives Environment authorization from durable Finish facts', async (t) => {
  const { root, run, runtime: sqliteRuntime } = readyRun(t);
  let authorization = null;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }, { selector: 'product/buildr', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (workspaceRoot, task, value) => {
      assert.equal(workspaceRoot, fs.realpathSync(root));
      assert.equal(task, run.identity.task);
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.deepEqual(authorization, {
    type: 'finish',
    deliveries: { workspace: 'dev', 'product/buildr': 'dev' },
    candidateRef: 'carrier-ref',
    integratedContributions: { workspace: run.deliveryCarrier },
  });
});

test('retained cleanup uses saved cleanup context when execution foundations are blocked', async (t) => {
  const { root, run, runtime: sqliteRuntime } = readyRun(t);
  let cleanupCalled = false;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({ ready: false, blocked: { code: 'task_environment_probe_blocked', message: 'Runtime projection is stale.' } }),
    resolveTaskEnvironmentCleanupContext: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async () => {
      cleanupCalled = true;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(cleanupCalled, true);
});

test('retained cleanup accepts an exact already-contained successor and preserves the carrier authorization', async (t) => {
  const { root, run, runtime: sqliteRuntime } = alreadyContainedRun(t);
  let authorization = null;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (_workspaceRoot, _task, value) => {
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(authorization.candidateRef, run.deliveryCarrier.head);
  assert.deepEqual(authorization.integratedContributions, { workspace: run.deliveryCarrier });
});

test('retained cleanup rejects missing or mismatched already-contained evidence', async (t) => {
  for (const mutate of [
    (delivery) => { delete delivery.containment; },
    (delivery) => { delivery.containment = { ...delivery.containment, targetRef: delivery.carrierRef }; },
  ]) {
    const { root, run, runtime } = alreadyContainedRun(t);
    mutate(run.delivery);
    runtime.writeTaskFinishRunPersistence(root, run);
    await assert.rejects(
      executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
      (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
    );
  }
});

test('retained cleanup rejects legacy delivery without finalRemoteRef', async (t) => {
  const { root, run, runtime } = readyRun(t);
  delete run.delivery.finalRemoteRef;
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});

test('retained cleanup still requires finalRemoteRef for an activation-aware run', async (t) => {
  const { root, run, runtime } = readyRun(t);
  run.deliveryCarrier.activationPlan = { identity: 'sha256-activation-plan' };
  delete run.delivery.finalRemoteRef;
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});

test('retained cleanup bootstrap rejects an unprepared Finish run', async (t) => {
  const { root, run, runtime } = readyRun(t);
  run.phases.find((phase) => phase.id === 'deliver').status = 'pending';
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});
