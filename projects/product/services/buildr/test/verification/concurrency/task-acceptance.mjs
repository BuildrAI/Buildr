import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

import { parseSuccessfulJson, processesOverlap, spawnSupervised } from '../../helpers/child-process-supervisor.mjs';

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
  tasks: [], cliExecutions: [], previews: [], previewConcurrency: null,
  resourceCoordination: null, targetRace: null, failureDiagnostics: null,
  verificationRuns: [],
  cleanup: { previews: [], resources: [], worktrees: [], branches: [], receipts: [] },
  retainedDoctor: null, durationMs: 0,
};

function runBuildr(args, options = {}) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, env, encoding: 'utf8', timeout: 30_000, ...options });
}

function requireSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function git(cwd, args, options = {}) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

function commitIfDirty(cwd, message) {
  if (!git(cwd, ['status', '--porcelain'])) return;
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message]);
}

async function waitFor(predicate, label, timeoutMs = 5_000) {
  const limit = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= limit) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function runWorker(root, taskId, acquiredFile, releaseFile) {
  const worker = spawnSupervised(process.execPath, [RESOURCE_WORKER, root, taskId, acquiredFile, releaseFile], {
    cwd: PRODUCT_ROOT,
    env,
    owner: { taskId, runId: `run-${taskId}` },
    timeoutMs: 8_000,
  });
  workers.push({ ...worker, releaseFile });
  return worker;
}

function runTaskInvocation(task, cwd) {
  const result = spawnSync(task.cliInvocation.command, [
    ...task.cliInvocation.argsPrefix,
    'worktree', 'context', '--target', task.repositories.find((item) => item.selector === 'project:nested').checkoutPath, '--json',
  ], { cwd, env, encoding: 'utf8', timeout: 10_000 });
  const context = requireSuccess(result, `CLI invocation ${task.taskId}`);
  assert.equal(context.taskId, task.taskId);
  assert.equal(context.membership.selector, 'project:nested');
  assert.deepEqual(context.allowedExecutionRoots, task.repositories.map((item) => item.checkoutPath));
  assert.equal(context.executionBinding.cliIdentity, task.cliIdentity);
  return { taskId: task.taskId, cwd, command: task.cliInvocation.command, membership: context.membership.selector, cliIdentity: context.executionBinding.cliIdentity, executionReady: context.executionReady };
}

function releaseWorkers() {
  for (const worker of workers) {
    if (worker.child.exitCode === null && !fs.existsSync(worker.releaseFile)) fs.writeFileSync(worker.releaseFile, 'release\n');
  }
}

try {
  const initialized = runBuildr(['init', '--target', workspace, '--name', 'concurrent-acceptance', '--description', 'Temporary concurrent task acceptance workspace', '--profile', 'team']);
  assert.equal(initialized.status, 0, initialized.stderr);
  execFileSync('git', ['init', '--initial-branch=dev', workspace], { stdio: 'ignore' });
  git(workspace, ['config', 'user.email', 'buildr-test@example.com']);
  git(workspace, ['config', 'user.name', 'Buildr Test']);
  git(workspace, ['add', '.']);
  git(workspace, ['commit', '-m', 'fixture']);

  const seed = path.join(fixtureRoot, 'nested-seed');
  fs.mkdirSync(seed);
  execFileSync('git', ['init', '--initial-branch=dev', seed], { stdio: 'ignore' });
  git(seed, ['config', 'user.email', 'buildr-test@example.com']);
  git(seed, ['config', 'user.name', 'Buildr Test']);
  fs.writeFileSync(path.join(seed, 'README.md'), '# nested acceptance repository\n');
  git(seed, ['add', 'README.md']);
  git(seed, ['commit', '-m', 'nested fixture']);
  const nestedRemote = path.join(fixtureRoot, 'nested.git');
  execFileSync('git', ['clone', '--bare', seed, nestedRemote], { stdio: 'ignore' });
  const nestedUrl = `file://${nestedRemote}`;
  const nestedCreated = runBuildr(['project', 'create', 'nested', '--target', workspace, '--repo', nestedUrl, '--integration-branch', 'dev', '--name', 'Nested', '--description', 'Nested acceptance repository']);
  assert.equal(nestedCreated.status, 0, nestedCreated.stderr || nestedCreated.stdout);
  const nestedRoot = path.join(workspace, 'projects', 'nested');
  git(nestedRoot, ['config', 'user.email', 'buildr-test@example.com']);
  git(nestedRoot, ['config', 'user.name', 'Buildr Test']);
  const verificationCapability = (id, delayMs, resourceClaims) => ({
    id, title: id, command: { argv: [process.execPath, '-e', `setTimeout(() => {}, ${delayMs})`], cwd: '.' },
    maturity: 'stable', stages: ['candidate'], enforcement: { candidate: 'required' },
    applicability: { paths: ['**'], risks: [] }, coverage: { kind: 'acceptance', owns: [id] },
    environment: { requires: ['node'], services: [] }, effects: { level: 'local-temporary', writes: [], externalSystems: false },
    authorization: 'implicit', resourceClaims, dependsOn: [], supersedes: [], sources: ['concurrent-task-acceptance'],
  });
  fs.writeFileSync(path.join(nestedRoot, 'verification.yml'), `${JSON.stringify({
    schemaVersion: 'buildr.project-verification/v1', mode: 'authoritative',
    resources: [
      { id: 'task-temp', title: 'Task temp', strategy: 'isolated', cleanup: 'provider-owned', authorization: 'implicit' },
      { id: 'shared-slot', title: 'Shared slot', strategy: 'coordinated', capacity: 1, cleanup: 'provider-owned', authorization: 'implicit' },
    ],
    capabilities: [verificationCapability('nested.parallel-a', 80, ['task-temp']), verificationCapability('nested.parallel-b', 80, ['task-temp']), verificationCapability('nested.coordinated', 160, ['shared-slot'])],
  }, null, 2)}\n`);
  assert.equal(runBuildr(['sync', 'codex', '--target', workspace]).status, 0);
  commitIfDirty(nestedRoot, 'nested runtime fixture');
  git(workspace, ['add', '-f', '.agents']);
  commitIfDirty(workspace, 'register nested repository');

  for (const taskId of taskIds) {
    const created = requireSuccess(runBuildr(['worktree', 'create', taskId, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'dev', '--include', 'project:nested', '--target', workspace, '--json']), `create ${taskId}`);
    assert.equal(created.executionReady, true);
    assert.equal(path.isAbsolute(created.cliInvocation.command), true);
    assert.deepEqual(created.repositories.map((item) => item.selector), ['workspace', 'project:nested']);
    summary.tasks.push({ taskId, environmentRoot: created.environment.root, repositories: created.repositories, allowedExecutionRoots: created.repositories.map((item) => item.checkoutPath), cliInvocation: created.cliInvocation, cliIdentity: created.executionBinding.cliIdentity });
  }
  assert.notEqual(summary.tasks[0].environmentRoot, summary.tasks[1].environmentRoot);
  assert.notEqual(summary.tasks[0].repositories[1].checkoutPath, summary.tasks[1].repositories[1].checkoutPath);

  summary.cliExecutions.push(runTaskInvocation(summary.tasks[0], workspace));
  summary.cliExecutions.push(runTaskInvocation(summary.tasks[1], summary.tasks[1].repositories[1].checkoutPath));

  const verificationProcesses = summary.tasks.map((task) => spawnSupervised(task.cliInvocation.command, [
    ...task.cliInvocation.argsPrefix,
    'verification', 'run', '--project', 'nested', '--level', 'candidate', '--target', task.environmentRoot,
    '--environment', task.taskId, '--owner', 'codex', '--json',
  ], { cwd: task.repositories[1].checkoutPath, env, owner: { taskId: task.taskId, runId: 'formal-verification' }, timeoutMs: 15_000 }));
  const verificationResults = await Promise.all(verificationProcesses.map((run) => run.completed));
  assert.equal(processesOverlap(verificationResults[0], verificationResults[1]), true);
  summary.verificationRuns = verificationResults.map((result, index) => {
    const payload = parseSuccessfulJson(result, `verification ${taskIds[index]}`);
    assert.equal(payload.candidateCompleteness, 'confirmed');
    assert.match(payload.evidenceIdentity, /^sha256-/);
    return { taskId: taskIds[index], evidenceIdentity: payload.evidenceIdentity, environment: payload.environment, durationMs: payload.durationMs, checks: payload.checks };
  });
  assert.equal(summary.verificationRuns.every((run) => run.environment.taskId === run.taskId), true);
  assert.equal(summary.verificationRuns.some((run) => run.checks.find((check) => check.id === 'nested.coordinated').resourceCoordination.waitDurationMs > 50), true);

  const previewRuns = summary.tasks.map((task) => {
    const instance = `${task.taskId}-preview`;
    previews.push(instance);
    return spawnSupervised(process.execPath, [BUILDR, 'app', 'preview', 'start', instance, '--target', task.environmentRoot, '--no-open', '--json'], {
      cwd: task.repositories[1].checkoutPath,
      env,
      owner: { taskId: task.taskId, instance },
      timeoutMs: 10_000,
    });
  });
  const previewResults = await Promise.all(previewRuns.map((run) => run.completed));
  assert.equal(processesOverlap(previewResults[0], previewResults[1]), true);
  for (let index = 0; index < previewResults.length; index += 1) {
    const preview = parseSuccessfulJson(previewResults[index], `preview ${taskIds[index]}`);
    summary.previews.push({ taskId: taskIds[index], instance: previews[index], url: preview.url, port: Number(new URL(preview.url).port), owner: preview.owner, stateRoot: path.join(appData, 'previews', previews[index]) });
  }
  assert.notEqual(summary.previews[0].port, summary.previews[1].port);
  assert.deepEqual(summary.previews.map((item) => item.owner.taskId), taskIds);
  assert.equal(summary.previews.every((item) => fs.existsSync(item.stateRoot)), true);
  const prematureCleanup = runBuildr(['worktree', 'cleanup', taskIds[0], '--agent', 'codex', '--integrated-ref', 'workspace=dev', '--integrated-ref', 'project:nested=dev', '--target', workspace, '--json']);
  assert.notEqual(prematureCleanup.status, 0);
  const prematureCleanupResult = JSON.parse(prematureCleanup.stdout);
  assert.equal(prematureCleanupResult.blocked.code, 'worktree.cleanup_runtime_active');
  assert.equal(fs.existsSync(summary.tasks[0].environmentRoot), true);
  summary.cleanup.receipts.push({ taskId: taskIds[0], runtimeGuard: prematureCleanupResult.blocked.code, environmentPreserved: true });
  summary.previewConcurrency = { overlapped: true, processes: previewResults.map(({ owner, pid, startedAt, finishedAt, durationMs, exitCode, signal }) => ({ owner, pid, startedAt, finishedAt, durationMs, exitCode, signal })) };
  if (process.env.BUILDR_ACCEPTANCE_INJECT_FAILURE === 'after-previews') throw new Error('Injected acceptance failure after concurrent previews');

  const isolated = taskIds.map((taskId, index) => runWorker(path.join(leases, `isolated-${index}`), taskId, path.join(fixtureRoot, `isolated-${index}-acquired.json`), path.join(fixtureRoot, `isolated-${index}-release`)));
  await Promise.all(isolated.map((_, index) => waitFor(() => fs.existsSync(path.join(fixtureRoot, `isolated-${index}-acquired.json`)), `isolated worker ${index}`)));
  for (let index = 0; index < isolated.length; index += 1) fs.writeFileSync(path.join(fixtureRoot, `isolated-${index}-release`), 'release\n');
  const isolatedResults = await Promise.all(isolated.map((run) => run.completed));
  assert.equal(processesOverlap(isolatedResults[0], isolatedResults[1]), true);
  summary.cleanup.resources.push(...isolatedResults.flatMap((result, index) => parseSuccessfulJson(result, `isolated resource worker ${index}`)));

  const firstAcquired = path.join(fixtureRoot, 'first-acquired.json');
  const secondAcquired = path.join(fixtureRoot, 'second-acquired.json');
  const firstRelease = path.join(fixtureRoot, 'first-release');
  const secondRelease = path.join(fixtureRoot, 'second-release');
  const first = runWorker(path.join(leases, 'coordinated'), taskIds[0], firstAcquired, firstRelease);
  await waitFor(() => fs.existsSync(firstAcquired), 'first resource claim');
  const secondStartedAt = Date.now();
  const second = runWorker(path.join(leases, 'coordinated'), taskIds[1], secondAcquired, secondRelease);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(fs.existsSync(secondAcquired), false);
  fs.writeFileSync(firstRelease, 'release\n');
  summary.cleanup.resources.push(...parseSuccessfulJson(await first.completed, 'first coordinated worker'));
  await waitFor(() => fs.existsSync(secondAcquired), 'second resource claim');
  const secondClaim = JSON.parse(fs.readFileSync(secondAcquired, 'utf8'));
  fs.writeFileSync(secondRelease, 'release\n');
  summary.cleanup.resources.push(...parseSuccessfulJson(await second.completed, 'second coordinated worker'));
  summary.resourceCoordination = {
    isolatedParallel: { overlapped: true, owners: taskIds },
    coordinated: { capacity: 1, firstOwner: taskIds[0], secondOwner: secondClaim.owner.taskId, secondWaitDurationMs: Date.now() - secondStartedAt },
  };
  assert.equal(secondClaim.owner.taskId, taskIds[1]);

  const failedWorker = spawnSupervised(process.execPath, ['-e', 'process.stderr.write("expected worker failure\\n"); process.exit(7)'], { owner: { taskId: taskIds[0], runId: 'failure-injection' }, timeoutMs: 2_000 });
  const failedDiagnostic = await failedWorker.completed;
  assert.equal(failedDiagnostic.exitCode, 7);
  assert.equal(failedDiagnostic.signal, null);
  assert.match(failedDiagnostic.stderr, /expected worker failure/);
  summary.failureDiagnostics = { status: 'captured', owner: failedDiagnostic.owner, exitCode: failedDiagnostic.exitCode, signal: failedDiagnostic.signal, timedOut: failedDiagnostic.timedOut, stdout: failedDiagnostic.stdout, stderr: failedDiagnostic.stderr };

  summary.targetRace = {
    status: 'owned-by-task-finish-journey',
    reason: 'Concurrent task acceptance no longer drives the removed caller-authored Finish protocol; v2 target-race recovery is covered by the product executor tests.',
  };

  summary.status = 'passed';
} catch (error) {
  summary.error = { name: error.name, message: error.message, diagnostic: error.diagnostic || null };
  process.exitCode = 1;
} finally {
  releaseWorkers();
  for (const worker of workers) {
    if (worker.child.exitCode === null) {
      try { await Promise.race([worker.completed, new Promise((resolve) => setTimeout(resolve, 500))]); } catch {}
      if (worker.child.exitCode === null) worker.child.kill('SIGTERM');
    }
  }
  for (const instance of [...previews].reverse()) {
    const taskId = instance.replace(/-preview$/, '');
    const task = summary.tasks.find((item) => item.taskId === taskId);
    const other = summary.tasks.find((item) => item.taskId !== taskId);
    if (task && other) {
      const wrongOwner = runBuildr(['app', 'preview', 'stop', instance, '--target', other.environmentRoot, '--task', other.taskId, '--owner', 'codex', '--json']);
      summary.cleanup.previews.push({ instance, status: wrongOwner.status === 0 ? 'owner-guard-failed' : 'wrong-owner-rejected', diagnostic: (wrongOwner.stderr || wrongOwner.stdout).trim() });
    }
    const stopped = task
      ? runBuildr(['app', 'preview', 'stop', instance, '--target', task.environmentRoot, '--task', task.taskId, '--owner', 'codex', '--json'])
      : runBuildr(['app', 'preview', 'stop', instance, '--json']);
    summary.cleanup.previews.push({ instance, status: stopped.status === 0 ? 'stopped' : 'failed', diagnostic: stopped.status === 0 ? null : (stopped.stderr || stopped.stdout).trim() });
  }
  if (fs.existsSync(workspace)) {
    for (const task of summary.tasks) {
      if (!fs.existsSync(task.environmentRoot)) continue;
      if (task.taskId === taskIds[0]) {
        const wrongOwner = runBuildr(['worktree', 'cleanup', task.taskId, '--agent', 'claude-code', '--integrated-ref', 'workspace=dev', '--integrated-ref', 'project:nested=dev', '--target', workspace, '--json']);
        let negative = null;
        try { negative = JSON.parse(wrongOwner.stdout); } catch {}
        summary.cleanup.receipts.push({ taskId: task.taskId, ownerGuard: negative?.blocked?.code || 'missing-diagnostic', environmentPreserved: fs.existsSync(task.environmentRoot) });
      }
      const cleaned = runBuildr(['worktree', 'cleanup', task.taskId, '--agent', 'codex', '--integrated-ref', 'workspace=dev', '--integrated-ref', 'project:nested=dev', '--target', workspace, '--json']);
      let result = null;
      try { result = JSON.parse(cleaned.stdout); } catch {}
      summary.cleanup.worktrees.push({ taskId: task.taskId, status: result?.status || 'failed', repositories: result?.repositories || [], diagnostic: cleaned.status === 0 ? null : (cleaned.stderr || cleaned.stdout).trim() });
      summary.cleanup.branches.push(...(result?.branches || []));
      summary.cleanup.receipts.push({ taskId: task.taskId, environment: result?.receipts?.environment || 'failed', adoption: result?.receipts?.adoption || 'unknown' });
      if (task.taskId === taskIds[0]) {
        const other = summary.tasks.find((item) => item.taskId === taskIds[1]);
        const inspected = runBuildr(['worktree', 'inspect', other.taskId, '--target', workspace, '--json']);
        summary.cleanup.receipts.push({ taskId: other.taskId, preservedAfterOtherCleanup: inspected.status === 0 && fs.existsSync(other.environmentRoot) });
      }
    }
    const doctor = runBuildr(['doctor', '--agent', 'codex', '--target', workspace, '--json']);
    if (doctor.status === 0) {
      const report = JSON.parse(doctor.stdout);
      summary.retainedDoctor = { ok: report.ok, ready: report.health?.ready, actionableCount: report.health?.actionableCount };
    } else summary.retainedDoctor = { ok: false, message: doctor.stderr };
  }
  summary.durationMs = Date.now() - startedAt;
  const cleanupPassed = summary.cleanup.previews.every((item) => ['stopped', 'wrong-owner-rejected'].includes(item.status))
    && summary.cleanup.previews.filter((item) => item.status === 'wrong-owner-rejected').length === taskIds.length
    && summary.cleanup.resources.every((item) => ['released', 'not-applicable'].includes(item.status))
    && summary.cleanup.worktrees.length === taskIds.length
    && summary.cleanup.worktrees.every((item) => item.status === 'removed')
    && summary.cleanup.receipts.some((item) => item.ownerGuard === 'worktree.cleanup_owner_mismatch' && item.environmentPreserved === true)
    && summary.cleanup.receipts.some((item) => item.runtimeGuard === 'worktree.cleanup_runtime_active' && item.environmentPreserved === true)
    && summary.cleanup.receipts.some((item) => item.taskId === taskIds[1] && item.preservedAfterOtherCleanup === true)
    && summary.cleanup.receipts.filter((item) => item.environment).every((item) => item.environment === 'removed');
  if (!cleanupPassed || summary.retainedDoctor?.ready !== true) {
    summary.status = 'failed';
    process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
