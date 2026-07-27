import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import { advanceFinishRun, createFinishRun, inspectFinishRun, readFinishRun } from '../../../src/application/task-finish/task-finish-run.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const RESOURCE_WORKER = path.join(PRODUCT_ROOT, 'test', 'fixtures', 'verification-resource-worker.mjs');
const startedAt = Date.now();
const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-concurrent-task-acceptance-')));
const workspace = path.join(fixtureRoot, 'workspace');
const appData = path.join(fixtureRoot, 'app-data');
const leases = path.join(fixtureRoot, 'leases');
const env = { ...process.env, BUILDR_APP_DATA_DIR: appData };
const previews = [];
const workers = [];
const taskIds = ['acceptance-task-a', 'acceptance-task-b'];
const summary = {
  schemaVersion: 'buildr.concurrent-task-acceptance/v1',
  status: 'failed',
  tasks: [], previews: [], resourceCoordination: null, targetRace: null,
  cleanup: { previews: [], resources: [], worktrees: [], branches: [] },
  retainedDoctor: null, durationMs: 0,
};

function runBuildr(args, options = {}) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, env, encoding: 'utf8', timeout: 30_000, ...options });
}

function requireSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function waitFor(predicate, label, timeoutMs = 5_000) {
  const limit = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= limit) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function runWorker(taskId, acquiredFile, releaseFile) {
  const child = spawn(process.execPath, [RESOURCE_WORKER, leases, taskId, acquiredFile, releaseFile], { cwd: PRODUCT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `resource worker exited ${code}`))));
  const worker = { taskId, child, completed, releaseFile };
  workers.push(worker);
  return worker;
}

function passUntil(root, runId, targetStep) {
  while (inspectFinishRun(readFinishRun({ root, runId })).currentStep !== targetStep) {
    const current = inspectFinishRun(readFinishRun({ root, runId })).currentStep;
    const claimed = advanceFinishRun({ root, runId, fingerprints: { [current]: `${runId}-${current}` } });
    advanceFinishRun({
      root, runId, fingerprints: { [current]: `${runId}-${current}` }, outcome: 'passed',
      attemptToken: claimed.nextAction.attemptToken, effect: { id: `${runId}-${current}-effect` }, evidence: { id: `${runId}-${current}-evidence` },
    });
  }
}

try {
  const initialized = runBuildr(['init', '--target', workspace, '--name', 'concurrent-acceptance', '--description', 'Temporary concurrent task acceptance workspace', '--profile', 'team']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const synced = runBuildr(['sync', 'codex', '--target', workspace]);
  assert.equal(synced.status, 0, synced.stderr);
  execFileSync('git', ['init', '--initial-branch=dev', workspace], { stdio: 'ignore' });
  execFileSync('git', ['-C', workspace, 'config', 'user.email', 'buildr-test@example.com']);
  execFileSync('git', ['-C', workspace, 'config', 'user.name', 'Buildr Test']);
  execFileSync('git', ['-C', workspace, 'add', '.']);
  execFileSync('git', ['-C', workspace, 'commit', '-m', 'fixture'], { stdio: 'ignore' });

  for (const taskId of taskIds) {
    const created = requireSuccess(runBuildr(['worktree', 'create', taskId, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'dev', '--target', workspace, '--json']), `create ${taskId}`);
    assert.equal(created.executionReady, true);
    assert.equal(path.isAbsolute(created.cliInvocation.command), true);
    summary.tasks.push({ taskId, environmentRoot: created.environment.root, cliInvocation: created.cliInvocation, cliIdentity: created.executionBinding.cliIdentity });
  }
  assert.notEqual(summary.tasks[0].environmentRoot, summary.tasks[1].environmentRoot);

  for (const task of summary.tasks) {
    const instance = `${task.taskId}-preview`;
    const preview = requireSuccess(runBuildr(['app', 'preview', 'start', instance, '--target', task.environmentRoot, '--no-open', '--json']), `preview ${task.taskId}`);
    previews.push(instance);
    summary.previews.push({ taskId: task.taskId, instance, url: preview.url, port: Number(new URL(preview.url).port), owner: preview.owner });
  }
  assert.notEqual(summary.previews[0].port, summary.previews[1].port);
  assert.deepEqual(summary.previews.map((item) => item.owner.taskId), taskIds);

  const firstAcquired = path.join(fixtureRoot, 'first-acquired.json');
  const secondAcquired = path.join(fixtureRoot, 'second-acquired.json');
  const firstRelease = path.join(fixtureRoot, 'first-release');
  const secondRelease = path.join(fixtureRoot, 'second-release');
  const first = runWorker(taskIds[0], firstAcquired, firstRelease);
  await waitFor(() => fs.existsSync(firstAcquired), 'first resource claim');
  const secondStartedAt = Date.now();
  const second = runWorker(taskIds[1], secondAcquired, secondRelease);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(fs.existsSync(secondAcquired), false);
  fs.writeFileSync(firstRelease, 'release\n');
  summary.cleanup.resources.push(...JSON.parse(await first.completed));
  await waitFor(() => fs.existsSync(secondAcquired), 'second resource claim');
  const secondClaim = JSON.parse(fs.readFileSync(secondAcquired, 'utf8'));
  fs.writeFileSync(secondRelease, 'release\n');
  summary.cleanup.resources.push(...JSON.parse(await second.completed));
  summary.resourceCoordination = { capacity: 1, firstOwner: taskIds[0], secondOwner: secondClaim.owner.taskId, secondWaitDurationMs: Date.now() - secondStartedAt };
  assert.equal(secondClaim.owner.taskId, taskIds[1]);

  const finishRoot = path.join(workspace, '.buildr', 'acceptance-finish');
  createFinishRun({ root: finishRoot, runId: taskIds[0], task: taskIds[0], change: 'acceptance', targetBranch: 'dev' });
  passUntil(finishRoot, taskIds[0], 'integration-push');
  const claimed = advanceFinishRun({ root: finishRoot, runId: taskIds[0], fingerprints: { 'integration-push': 'candidate-a' } });
  const raced = advanceFinishRun({
    root: finishRoot, runId: taskIds[0], fingerprints: { 'integration-push': 'candidate-a' }, outcome: 'passed',
    attemptToken: claimed.nextAction.attemptToken, evidence: { id: 'target-observation' }, expectedTargetRef: 'base-ref', observedTargetRef: 'task-b-ref',
  });
  assert.equal(raced.blocked[0].code, 'target-race');
  assert.equal(readFinishRun({ root: finishRoot, runId: taskIds[0] }).steps.find((step) => step.id === 'integration-push').effects.length, 0);
  summary.targetRace = { status: 'blocked', code: raced.blocked[0].code, expected: 'base-ref', observed: 'task-b-ref', targetOverwritten: false };

  summary.status = 'passed';
} catch (error) {
  summary.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  for (const worker of workers) {
    if (worker.child.exitCode === null) {
      try { fs.writeFileSync(worker.releaseFile, 'release\n'); } catch {}
      worker.child.kill('SIGTERM');
    }
  }
  for (const instance of [...previews].reverse()) {
    const stopped = runBuildr(['app', 'preview', 'stop', instance, '--json']);
    summary.cleanup.previews.push({ instance, status: stopped.status === 0 ? 'stopped' : 'failed' });
  }
  if (fs.existsSync(workspace)) {
    for (const taskId of [...taskIds].reverse()) {
      const worktree = path.join(workspace, '.worktrees', taskId);
      try {
        if (fs.existsSync(worktree)) execFileSync('git', ['-C', workspace, 'worktree', 'remove', worktree], { stdio: 'ignore' });
        summary.cleanup.worktrees.push({ taskId, status: fs.existsSync(worktree) ? 'failed' : 'removed' });
      } catch (error) { summary.cleanup.worktrees.push({ taskId, status: 'failed', message: error.message }); }
      try {
        execFileSync('git', ['-C', workspace, 'branch', '-D', `codex/${taskId}`], { stdio: 'ignore' });
        summary.cleanup.branches.push({ taskId, status: 'removed' });
      } catch { summary.cleanup.branches.push({ taskId, status: 'not-present' }); }
    }
    const doctor = runBuildr(['doctor', '--agent', 'codex', '--target', workspace, '--json']);
    if (doctor.status === 0) {
      const report = JSON.parse(doctor.stdout);
      summary.retainedDoctor = { ok: report.ok, ready: report.health?.ready, actionableCount: report.health?.actionableCount };
    } else summary.retainedDoctor = { ok: false, message: doctor.stderr };
  }
  summary.durationMs = Date.now() - startedAt;
  const cleanupPassed = summary.cleanup.previews.every((item) => item.status === 'stopped')
    && summary.cleanup.resources.every((item) => ['released', 'not-applicable'].includes(item.status))
    && summary.cleanup.worktrees.every((item) => item.status === 'removed');
  if (!cleanupPassed || summary.retainedDoctor?.ready !== true) {
    summary.status = 'failed';
    process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
