import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

import { parseSuccessfulJson, processesOverlap, spawnSupervised } from '../../helpers/child-process-supervisor.mjs';
import { materializeCleanProductSource } from '../../helpers/clean-product-source.mjs';

const SOURCE_PRODUCT_ROOT = path.resolve(import.meta.dirname, '../../..');
const startedAt = Date.now();
const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-concurrent-task-acceptance-')));
const { root: PRODUCT_ROOT, cli: BUILDR } = materializeCleanProductSource(SOURCE_PRODUCT_ROOT, path.join(fixtureRoot, 'product-manager'));
const workspace = path.join(fixtureRoot, 'workspace');
const appData = path.join(fixtureRoot, 'app-data');
const env = { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData };
const platformTimeout = (milliseconds) => process.platform === 'win32' ? milliseconds * 3 : milliseconds;
const previews = [];
const taskIds = ['acceptance-task-a', 'acceptance-task-b'];
const digest = (value) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
const summary = {
  schemaVersion: 'buildr.concurrent-task-acceptance/v1',
  status: 'failed',
  tasks: [], cliExecutions: [], previews: [], previewConcurrency: null,
  phases: [], environmentPreparation: null,
  previewRegistrationFailure: null,
  resourceCoordination: null, targetRace: null, failureDiagnostics: null,
  verificationRuns: [],
  portableResults: [],
  cleanup: { previews: [], resources: [], environments: [], branches: [], receipts: [] },
  retainedDoctor: null, durationMs: 0,
};
let activePhase = null;

function startPhase(name) {
  assert.equal(activePhase, null, `phase ${activePhase?.name} is still active`);
  activePhase = { name, startedAt: new Date().toISOString(), startedAtMs: Date.now() };
}

function finishPhase(status = 'passed') {
  if (!activePhase) return;
  const finishedAtMs = Date.now();
  summary.phases.push({
    name: activePhase.name,
    status,
    startedAt: activePhase.startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - activePhase.startedAtMs,
  });
  activePhase = null;
}

function runBuildr(args, options = {}) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, env, encoding: 'utf8', timeout: platformTimeout(30_000), ...options });
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

try {
  startPhase('fixture');
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
    id, title: id,
    scope: { project: 'nested', services: [] },
    proves: [id], evidence: ['system'], usableFor: ['task-delivery'], discovery: { sources: ['**'] },
    invocation: { affected: { kind: 'command', argv: [process.execPath, '-e', `setTimeout(() => {}, ${delayMs})`], cwd: '.' }, full: { kind: 'command', argv: [process.execPath, '-e', `setTimeout(() => {}, ${delayMs})`], cwd: '.' } },
    environment: { requires: ['node'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' },
    resourceClaims,
  });
  fs.writeFileSync(path.join(nestedRoot, 'verification.yml'), `${JSON.stringify({
    schemaVersion: 'buildr.project-verification/v3',
    resources: [
      { id: 'shared-slot', title: 'Shared slot', strategy: 'coordinated', capacity: 1, authorization: 'implicit' },
    ],
    capabilities: [verificationCapability('nested.parallel-a', 80, []), verificationCapability('nested.parallel-b', 80, []), verificationCapability('nested.coordinated', 160, ['shared-slot'])],
  }, null, 2)}\n`);
  assert.equal(runBuildr(['sync', 'codex', '--target', workspace]).status, 0);
  commitIfDirty(nestedRoot, 'nested runtime fixture');
  git(workspace, ['add', '-f', '.agents']);
  commitIfDirty(workspace, 'register nested repository');

  finishPhase();
  startPhase('environment-prepare');
  for (const taskId of taskIds) {
    requireSuccess(runBuildr(['task', 'create', taskId, '--title', taskId, '--intent', '验证双 Task Environment 并发', '--project', 'nested', '--target', workspace, '--json']), `create Task ${taskId}`);
  }
  const environmentPlan = path.join(path.dirname(workspace), 'task-acceptance-environment-plan.json');
  fs.writeFileSync(environmentPlan, `${JSON.stringify({ schemaVersion: 'buildr.task-environment-plan/v1', notApplicableReason: 'Project-only fixture has no Service-scoped technical preparation.', services: [] })}\n`);
  const prepareProcesses = taskIds.map((taskId) => spawnSupervised(process.execPath, [
    BUILDR, 'task', 'environment', 'prepare', taskId,
    '--plan', environmentPlan, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'dev', '--target', workspace, '--json',
  ], { cwd: PRODUCT_ROOT, env, owner: { taskId, runId: 'environment-prepare' }, timeoutMs: platformTimeout(60_000), outputLimit: 128 * 1024 }));
  const prepareResults = await Promise.all(prepareProcesses.map((run) => run.completed));
  assert.equal(processesOverlap(prepareResults[0], prepareResults[1]), true);
  summary.environmentPreparation = {
    overlapped: true,
    processes: prepareResults.map(({ owner, pid, startedAt: processStartedAt, finishedAt, durationMs, exitCode, signal }) => ({ owner, pid, startedAt: processStartedAt, finishedAt, durationMs, exitCode, signal })),
  };
  for (let index = 0; index < taskIds.length; index += 1) {
    const taskId = taskIds[index];
    const prepared = parseSuccessfulJson(prepareResults[index], `prepare ${taskId}`);
    assert.equal(prepared.status, 'ready');
    assert.equal(prepared.execution.ready, true);
    assert.equal(path.isAbsolute(prepared.execution.cliInvocation.command), true);
    assert.deepEqual(prepared.environment.scopes.map((scope) => scope.selector), ['workspace', 'project:nested']);
    summary.tasks.push({
      taskId,
      environmentRoot: prepared.execution.workdir,
      repositories: prepared.environment.scopes.map((scope) => ({ selector: scope.selector, checkoutPath: scope.executionRoot })),
      allowedExecutionRoots: prepared.execution.allowedExecutionRoots,
      cliInvocation: prepared.execution.cliInvocation,
    });
  }
  assert.notEqual(summary.tasks[0].environmentRoot, summary.tasks[1].environmentRoot);
  assert.notEqual(summary.tasks[0].repositories[1].checkoutPath, summary.tasks[1].repositories[1].checkoutPath);

  finishPhase();
  startPhase('task-invocation');
  const invocationProcesses = summary.tasks.map((task, index) => {
    const cwd = index === 0 ? workspace : task.repositories[1].checkoutPath;
    return {
      cwd,
      run: spawnSupervised(task.cliInvocation.command, [
        ...task.cliInvocation.argsPrefix,
        'task', 'environment', 'inspect', task.taskId, '--target', workspace, '--json',
      ], { cwd, env, owner: { taskId: task.taskId, runId: 'task-invocation' }, timeoutMs: platformTimeout(10_000), outputLimit: 64 * 1024 }),
    };
  });
  const invocationResults = await Promise.all(invocationProcesses.map(({ run }) => run.completed));
  summary.cliExecutions = invocationResults.map((result, index) => {
    const task = summary.tasks[index];
    const inspected = parseSuccessfulJson(result, `CLI invocation ${task.taskId}`);
    assert.equal(inspected.taskId, task.taskId);
    assert.equal(inspected.status, 'ready');
    assert.deepEqual(inspected.environment.scopes.map((scope) => scope.selector), ['workspace', 'project:nested']);
    assert.deepEqual(inspected.execution.allowedExecutionRoots, task.allowedExecutionRoots);
    return { taskId: task.taskId, cwd: invocationProcesses[index].cwd, command: task.cliInvocation.command, scopes: inspected.environment.scopes.map((scope) => scope.selector), ready: inspected.execution.ready };
  });

  finishPhase();
  startPhase('verification');
  const verificationPlans = summary.tasks.map((task) => {
    const targetIdentity = digest(`target:${task.taskId}`);
    const planned = spawnSync(task.cliInvocation.command, [
      ...task.cliInvocation.argsPrefix,
      'verification', 'plan', '--project', 'nested', '--target-kind', 'task-delivery', '--selection-scope', 'affected',
      '--target-identity', targetIdentity, '--changed-path', 'README.md', '--target', task.environmentRoot, '--json',
    ], { cwd: task.repositories[1].checkoutPath, env, encoding: 'utf8', timeout: platformTimeout(10_000) });
    const plan = requireSuccess(planned, `verification plan ${task.taskId}`);
    assert.equal(plan.status, 'ready');
    assert.deepEqual(plan.selectedItems.map((item) => item.id).sort(), ['nested.coordinated', 'nested.parallel-a', 'nested.parallel-b']);
    const planPath = path.join(task.environmentRoot, `.verification-plan-${task.taskId}.json`);
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    return planPath;
  });
  const verificationProcesses = summary.tasks.map((task) => spawnSupervised(task.cliInvocation.command, [
    ...task.cliInvocation.argsPrefix,
    'verification', 'run', '--project', 'nested', '--plan', verificationPlans[summary.tasks.indexOf(task)],
    '--target-identity', digest(`target:${task.taskId}`), '--target', task.environmentRoot,
    '--candidate-identity', digest(`candidate:${task.taskId}`), '--candidate-generation', '1',
    '--environment', task.taskId, '--workspace', workspace, '--detail', 'full', '--json',
  ], { cwd: task.repositories[1].checkoutPath, env, owner: { taskId: task.taskId, runId: 'formal-verification' }, timeoutMs: platformTimeout(15_000), outputLimit: 64 * 1024 }));
  const verificationResults = await Promise.all(verificationProcesses.map((run) => run.completed));
  assert.equal(processesOverlap(verificationResults[0], verificationResults[1]), true);
  summary.verificationRuns = verificationResults.map((result, index) => {
    const payload = parseSuccessfulJson(result, `verification ${taskIds[index]}`);
    assert.equal(payload.schemaVersion, 'buildr.verification-execution/v1');
    assert.match(payload.executionIdentity, /^sha256-/);
    assert.equal(payload.executionRecord.status, 'retained');
    assert.equal(payload.executionRecord.outcome, 'passed');
    assert.equal(payload.executionRecord.lifecycleStatus, 'retained');
    assert.equal('locator' in payload.executionRecord.body, false);
    assert.equal(fs.existsSync(payload.evidenceReference), false);
    return { taskId: taskIds[index], executionIdentity: payload.executionIdentity, executionRecord: payload.executionRecord, environment: payload.environment, durationMs: payload.durationMs, checks: payload.checks };
  });
  assert.equal(summary.verificationRuns.every((run) => run.environment.taskId === run.taskId), true);

  finishPhase();
  startPhase('verification-result');
  const recordProcesses = summary.tasks.map((task, index) => spawnSupervised(task.cliInvocation.command, [
    ...task.cliInvocation.argsPrefix,
    'task', 'verification', 'reconcile', task.taskId,
    '--candidate-identity', digest(`candidate:${task.taskId}`), '--candidate-generation', '1',
    '--target-identity', digest(`target:${task.taskId}`),
    '--target-summary', `Concurrent acceptance ${task.taskId}`,
    '--record', summary.verificationRuns[index].executionRecord.recordId,
    '--declaration-root', task.environmentRoot, '--target', workspace, '--json',
  ], { cwd: task.repositories[1].checkoutPath, env, owner: { taskId: task.taskId, runId: 'verification-result-record' }, timeoutMs: platformTimeout(10_000), outputLimit: 64 * 1024 }));
  const recordedResults = await Promise.all(recordProcesses.map((run) => run.completed));
  summary.portableResults = recordedResults.map((result, index) => {
    const recorded = parseSuccessfulJson(result, `record verification result ${taskIds[index]}`);
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.slot.applicability.status, 'current');
    return { taskId: taskIds[index], path: recorded.slot.path, resultDigest: recorded.slot.resultDigest, applicability: recorded.slot.applicability.status };
  });
  assert.notEqual(summary.portableResults[0].path, summary.portableResults[1].path);
  assert.notEqual(summary.portableResults[0].resultDigest, summary.portableResults[1].resultDigest);

  finishPhase();
  startPhase('resource-coordination');
  const parallelOverlaps = summary.verificationRuns.map((run) => {
    const first = run.checks.find((check) => check.id === 'nested.parallel-a');
    const second = run.checks.find((check) => check.id === 'nested.parallel-b');
    return Date.parse(first.startedAt) < Date.parse(second.finishedAt) && Date.parse(second.startedAt) < Date.parse(first.finishedAt);
  });
  assert.equal(parallelOverlaps.every(Boolean), true);
  const coordinated = summary.verificationRuns.map((run) => run.checks.find((check) => check.id === 'nested.coordinated'));
  for (const check of coordinated) {
    assert.equal(check.resourceCoordination.claims.some((claim) => claim.status === 'acquired' && claim.resource === 'shared-slot'), true);
    assert.equal(check.resourceCoordination.release.some((claim) => claim.status === 'released' && claim.resource === 'shared-slot'), true);
    summary.cleanup.resources.push(...check.resourceCoordination.release);
  }
  const orderedCoordination = [...coordinated].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  assert.equal(Date.parse(orderedCoordination[0].finishedAt) <= Date.parse(orderedCoordination[1].startedAt), true, 'capacity-one coordinated checks must not overlap');
  summary.resourceCoordination = {
    isolatedParallel: { overlapped: true, owners: taskIds },
    coordinated: {
      capacity: 1,
      firstOwner: orderedCoordination[0].resourceCoordination.claims[0].owner.taskId,
      secondOwner: orderedCoordination[1].resourceCoordination.claims[0].owner.taskId,
      secondWaitDurationMs: orderedCoordination[1].resourceCoordination.waitDurationMs,
      overlapped: false,
    },
  };
  finishPhase();

  startPhase('preview');
  const previewRuns = summary.tasks.map((task) => {
    const instance = `${task.taskId}-preview`;
    previews.push(instance);
    return spawnSupervised(process.execPath, [BUILDR, 'web', 'preview', 'start', instance, '--task', task.taskId, '--target', workspace, '--no-open', '--json'], {
      cwd: task.repositories[1].checkoutPath,
      env,
      owner: { taskId: task.taskId, instance },
      timeoutMs: platformTimeout(10_000),
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
  const failedPreviewInstance = 'acceptance-register-failure';
  const failedPreview = runBuildr([
    'web', 'preview', 'start', failedPreviewInstance,
    '--task', taskIds[0], '--target', workspace, '--no-open', '--json',
  ], { env: { ...env, BUILDR_FAULT_TASK_ENVIRONMENT_RESOURCE_REGISTER: '1' } });
  assert.notEqual(failedPreview.status, 0);
  assert.match(failedPreview.stderr, /Preview Environment 登记失败，实例已回收/);
  const afterFailedPreview = requireSuccess(runBuildr(['web', 'preview', 'list', '--json']), 'list previews after registration failure');
  assert.deepEqual(afterFailedPreview.previews.map((item) => item.instance).sort(), [...previews].sort());
  const environmentAfterFailedPreview = requireSuccess(runBuildr(['task', 'environment', 'inspect', taskIds[0], '--target', workspace, '--json']), 'inspect Environment after preview registration failure');
  assert.equal(environmentAfterFailedPreview.environment.resources.some((resource) => resource.id === `preview:${failedPreviewInstance}`), false);
  assert.equal(environmentAfterFailedPreview.environment.resources.some((resource) => resource.id === `preview:${previews[0]}` && resource.status === 'running'), true);
  summary.previewRegistrationFailure = { taskId: taskIds[0], instance: failedPreviewInstance, processReclaimed: true, existingResourcesPreserved: true };
  summary.previewConcurrency = { overlapped: true, processes: previewResults.map(({ owner, pid, startedAt, finishedAt, durationMs, exitCode, signal }) => ({ owner, pid, startedAt, finishedAt, durationMs, exitCode, signal })) };
  if (process.env.BUILDR_ACCEPTANCE_INJECT_FAILURE === 'after-previews') throw new Error('Injected acceptance failure after concurrent previews');
  finishPhase();
  startPhase('failure-diagnostics');
  const failedWorker = spawnSupervised(process.execPath, ['-e', 'process.stderr.write("expected worker failure\\n"); process.exit(7)'], { owner: { taskId: taskIds[0], runId: 'failure-injection' }, timeoutMs: 2_000 });
  const failedDiagnostic = await failedWorker.completed;
  assert.equal(failedDiagnostic.exitCode, 7);
  assert.equal(failedDiagnostic.signal, null);
  assert.match(failedDiagnostic.stderr, /expected worker failure/);
  summary.failureDiagnostics = { status: 'captured', owner: failedDiagnostic.owner, exitCode: failedDiagnostic.exitCode, signal: failedDiagnostic.signal, timedOut: failedDiagnostic.timedOut, stdout: failedDiagnostic.stdout, stderr: failedDiagnostic.stderr };
  finishPhase();

  summary.targetRace = {
    status: 'owned-by-task-finish-journey',
    reason: 'Concurrent task acceptance no longer drives the removed caller-authored Finish protocol; isolated-carrier target-race recovery and fail-closed contribution checks are covered by product executor tests.',
  };

  summary.status = 'passed';
} catch (error) {
  finishPhase('failed');
  summary.error = { name: error.name, message: error.message, diagnostic: error.diagnostic || null };
  process.exitCode = 1;
} finally {
  if (activePhase) finishPhase(summary.status === 'passed' ? 'passed' : 'failed');
  startPhase('cleanup');
  const previewStops = [];
  for (const instance of [...previews].reverse()) {
    const taskId = instance.replace(/-preview$/, '');
    const task = summary.tasks.find((item) => item.taskId === taskId);
    const other = summary.tasks.find((item) => item.taskId !== taskId);
    if (task && other && instance === previews[1]) {
      const wrongOwner = runBuildr(['web', 'preview', 'stop', instance, '--target', workspace, '--task', other.taskId, '--json']);
      summary.cleanup.previews.push({ instance, status: wrongOwner.status === 0 ? 'owner-guard-failed' : 'wrong-owner-rejected', diagnostic: (wrongOwner.stderr || wrongOwner.stdout).trim() });
    }
    const args = task
      ? [BUILDR, 'web', 'preview', 'stop', instance, '--target', workspace, '--task', task.taskId, '--json']
      : [BUILDR, 'web', 'preview', 'stop', instance, '--json'];
    previewStops.push({
      instance,
      run: spawnSupervised(process.execPath, args, { cwd: PRODUCT_ROOT, env, owner: { taskId, instance }, timeoutMs: platformTimeout(10_000), outputLimit: 64 * 1024 }),
    });
  }
  const previewStopResults = await Promise.all(previewStops.map(({ run }) => run.completed));
  for (let index = 0; index < previewStops.length; index += 1) {
    const stopped = previewStopResults[index];
    summary.cleanup.previews.push({ instance: previewStops[index].instance, status: stopped.exitCode === 0 ? 'stopped' : 'failed', diagnostic: stopped.exitCode === 0 ? null : (stopped.stderr || stopped.stdout).trim() });
  }
  if (fs.existsSync(workspace)) {
    const activeTasks = summary.tasks.filter((task) => fs.existsSync(task.environmentRoot));
    const abandonRuns = activeTasks.map((task) => spawnSupervised(process.execPath, [
      BUILDR, 'task', 'abandon', task.taskId, '--reason', 'concurrent acceptance fixture complete', '--target', workspace, '--json',
    ], { cwd: PRODUCT_ROOT, env, owner: { taskId: task.taskId, runId: 'task-abandon' }, timeoutMs: platformTimeout(10_000), outputLimit: 64 * 1024 }));
    const abandonResults = await Promise.all(abandonRuns.map((run) => run.completed));
    for (let index = 0; index < abandonResults.length; index += 1) {
      if (abandonResults[index].exitCode !== 0) summary.cleanup.receipts.push({ taskId: activeTasks[index].taskId, abandon: 'failed' });
    }
    for (const task of activeTasks) {
      const cleaned = runBuildr(['task', 'environment', 'cleanup', task.taskId, '--target', workspace, '--json']);
      let result = null;
      try { result = JSON.parse(cleaned.stdout); } catch {}
      summary.cleanup.environments.push({ taskId: task.taskId, status: result?.status || 'failed', effects: result?.effects || [], diagnostic: cleaned.status === 0 ? null : (cleaned.stderr || cleaned.stdout).trim() });
      summary.cleanup.branches.push(...(result?.effects || []).filter((effect) => effect.type === 'local-branch-removed'));
      summary.cleanup.receipts.push({ taskId: task.taskId, environment: result?.environment?.latest?.cleanup?.status || 'failed' });
      if (task.taskId === taskIds[0]) {
        const other = summary.tasks.find((item) => item.taskId === taskIds[1]);
        const inspected = runBuildr(['task', 'environment', 'inspect', other.taskId, '--target', workspace, '--json']);
        summary.cleanup.receipts.push({ taskId: other.taskId, preservedAfterOtherCleanup: inspected.status === 0 && fs.existsSync(other.environmentRoot) });
      }
    }
    const doctor = runBuildr(['doctor', '--agent', 'codex', '--target', workspace, '--json']);
    if (doctor.status === 0) {
      const report = JSON.parse(doctor.stdout);
      summary.retainedDoctor = {
        ok: report.ok,
        ready: report.health?.ready,
        actionableCount: report.health?.actionableCount,
        findings: (report.findings || []).map((finding) => ({ code: finding.code, path: finding.path || null, message: finding.message })),
      };
    } else summary.retainedDoctor = { ok: false, message: doctor.stderr };
  }
  const cleanupPassed = summary.cleanup.previews.every((item) => ['stopped', 'wrong-owner-rejected'].includes(item.status))
    && summary.cleanup.previews.filter((item) => item.status === 'wrong-owner-rejected').length === 1
    && summary.cleanup.resources.every((item) => ['released', 'not-applicable'].includes(item.status))
    && summary.cleanup.environments.length === taskIds.length
    && summary.cleanup.environments.every((item) => item.status === 'cleaned')
    && summary.cleanup.receipts.every((item) => item.abandon !== 'failed')
    && summary.cleanup.receipts.some((item) => item.taskId === taskIds[1] && item.preservedAfterOtherCleanup === true)
    && summary.cleanup.receipts.filter((item) => item.environment).every((item) => item.environment === 'cleaned');
  if (!cleanupPassed || summary.retainedDoctor?.ready !== true) {
    summary.status = 'failed';
    process.exitCode = 1;
  }
  finishPhase(cleanupPassed && summary.retainedDoctor?.ready === true ? 'passed' : 'failed');
  summary.durationMs = Date.now() - startedAt;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
