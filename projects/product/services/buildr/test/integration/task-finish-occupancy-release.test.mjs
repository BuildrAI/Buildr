import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { registerTaskFinishApplication } from '../../src/application/task-finish/task-finish-application.mjs';
import { createIsolatedGitCarrier, observeGitTaskContribution } from '../../src/application/task-finish/git-task-contribution.mjs';
import { createFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';
import { compactTaskFinishResult } from '../../src/application/task-finish/task-finish-result-projection.mjs';
import { initializeTaskFinishSqliteWorkspace } from '../helpers/task-finish-sqlite-fixture.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t, task) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-occupancy-release-'));
  const environmentRoot = `${root}-task`;
  t.after(() => {
    try { spawnSync('git', ['worktree', 'remove', '--force', environmentRoot], { cwd: root, encoding: 'utf8' }); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(environmentRoot, { recursive: true, force: true });
  });
  initializeTaskFinishSqliteWorkspace(root);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'baseline\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  git(root, ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  git(environmentRoot, ['config', 'user.name', 'Buildr Test']);
  git(environmentRoot, ['config', 'user.email', 'buildr@example.com']);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: task, title: `Finish ${task}`, intent: 'Occupancy release fixture.', projects: [], services: [], changes: [] });
  Object.assign(runtime, {
    optionValue(args, name, fallback) {
      const index = args.indexOf(name);
      if (index === -1) return fallback;
      const value = args[index + 1];
      return !value || String(value).startsWith('--') ? fallback : value;
    },
    withResolvedTarget(args) {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? root : args[index + 1]) };
    },
    assertTaskDevelopmentCarrier() {
      throw new Error('occupancy release must skip Development identity assertion');
    },
    openTaskExecutionRecord() {
      throw new Error('occupancy release must not open a five-phase execution record');
    },
  });
  const completions = [];
  const originalComplete = runtime.completeTaskRecordFromFinish.bind(runtime);
  runtime.completeTaskRecordFromFinish = (...args) => {
    completions.push(args);
    return originalComplete(...args);
  };
  registerTaskFinishApplication(runtime);
  return { root, environmentRoot, runtime, completions };
}

function persistBlockedCarrier(runtime, root, environmentRoot, task, runId) {
  fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'candidate contribution\n');
  git(environmentRoot, ['add', 'feature.txt']);
  git(environmentRoot, ['commit', '-m', 'candidate']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const contribution = observeGitTaskContribution({ root: environmentRoot, deliveryBaselineHead: baselineHead });
  const carrier = createIsolatedGitCarrier({
    repositoryRoot: environmentRoot,
    workspaceRoot: root,
    runId,
    deliveryBaselineHead: baselineHead,
    taskContribution: contribution,
    message: 'delivery carrier',
  });
  const identity = {
    task,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content',
    agent: 'codex',
    targetBranch: 'dev',
    remote: 'origin',
    environmentRoot,
    workspaceRoot: root,
  };
  const run = createFinishRun({ root, identity, runId, runtime });
  run.status = 'blocked';
  run.deliveryCarrier = carrier;
  run.delivery = { status: 'blocked', remoteAfterRef: null, finalRemoteRef: null };
  run.resume = { phase: 'deliver', token: 'sha256-resume', carrierIdentity: carrier.identity };
  run.primaryFailure = {
    phase: 'deliver',
    operation: 'push',
    failureClass: 'transient-external-condition',
    code: 'task-finish.push-failed',
    status: 'blocked',
    message: 'push blocked before delivery',
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  return { run, carrier };
}

test('已放弃且从未交付时释放占用并保持 Task abandoned', async (t) => {
  const task = 'occupancy-abandoned';
  const { root, environmentRoot, runtime, completions } = fixture(t, task);
  const runId = 'occupancy-abandoned-20260815000000-deadbeef';
  const { carrier } = persistBlockedCarrier(runtime, root, environmentRoot, task, runId);
  runtime.abandonTaskRecord(root, task, { reason: 'stop unfinished delivery occupancy' });
  const remoteBefore = git(root, ['rev-parse', 'HEAD']);

  const result = await runtime.taskFinish('run', ['--task', task, '--run', runId, '--release-occupancy', '--target', root]);
  const compact = compactTaskFinishResult(result);

  assert.equal(result.occupancy.status, 'released');
  assert.equal(result.status === 'complete', false);
  assert.equal(compact.occupancy.status, 'released');
  assert.equal(compact.status, result.status);
  assert.equal(fs.existsSync(carrier.root), false);
  assert.equal(runtime.inspectTaskRecord(root, task).record.status, 'abandoned');
  assert.equal(git(root, ['rev-parse', 'HEAD']), remoteBefore);
  assert.deepEqual(completions, []);
  const inspected = await runtime.taskFinish('inspect', ['--run', runId, '--target', root]);
  assert.equal(inspected.occupancy.status, 'released');
  assert.equal(inspected.carrier, null);
});

test('已成功交付则拒绝释放并保留 carrier', async (t) => {
  const task = 'occupancy-delivered';
  const { root, environmentRoot, runtime } = fixture(t, task);
  const runId = 'occupancy-delivered-20260815000000-deadbeef';
  const { run, carrier } = persistBlockedCarrier(runtime, root, environmentRoot, task, runId);
  run.delivery = { status: 'delivered', remoteAfterRef: git(root, ['rev-parse', 'HEAD']), finalRemoteRef: git(root, ['rev-parse', 'HEAD']) };
  runtime.writeTaskFinishRunPersistence(root, run);
  runtime.abandonTaskRecord(root, task, { reason: 'already delivered occupancy' });

  await assert.rejects(
    () => runtime.taskFinish('run', ['--task', task, '--run', runId, '--release-occupancy', '--target', root]),
    (error) => error.code === 'task_finish.release_occupancy_already_delivered',
  );
  assert.equal(fs.existsSync(carrier.root), true);
  assert.equal(runtime.inspectTaskRecord(root, task).record.status, 'abandoned');
});

test('任务仍是 active 则拒绝释放且不进入五阶段', async (t) => {
  const task = 'occupancy-active';
  const { root, environmentRoot, runtime } = fixture(t, task);
  const runId = 'occupancy-active-20260815000000-deadbeef';
  const { carrier } = persistBlockedCarrier(runtime, root, environmentRoot, task, runId);

  await assert.rejects(
    () => runtime.taskFinish('run', ['--task', task, '--run', runId, '--release-occupancy', '--target', root]),
    (error) => error.code === 'task_finish.release_occupancy_not_abandoned',
  );
  assert.equal(fs.existsSync(carrier.root), true);
  assert.equal(runtime.inspectTaskRecord(root, task).record.status, 'active');
});

test('--release-occupancy 与恢复类选项互斥', async (t) => {
  const task = 'occupancy-mutex';
  const { root, runtime } = fixture(t, task);
  await assert.rejects(
    () => runtime.taskFinish('run', ['--task', task, '--run', 'run-x', '--release-occupancy', '--resume', 'token', '--target', root]),
    (error) => error.code === 'task_finish.release_occupancy_mutex',
  );
  await assert.rejects(
    () => runtime.taskFinish('run', ['--task', task, '--run', 'run-x', '--release-occupancy', '--bootstrap-recovery', '--target', root]),
    (error) => error.code === 'task_finish.release_occupancy_mutex',
  );
});
