import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { registerTaskDevelopmentApplication } from '../../src/task/application/task-development-application.mjs';
import { registerTaskFinishApplication } from '../../src/task/application/finish/task-finish-application.mjs';
import { createTaskFinishProductHandlers } from '../../src/task/application/finish/task-finish-product-executor.mjs';
import { createFinishRun, executeFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';
import { normalizeTaskFinishDeliveryCommit } from '../../src/task/application/finish/task-finish-delivery-commit.mjs';
import { createGitCarrierDisposabilityProof, taskFinishCarrierRoot } from '../../src/task/application/finish/git-task-contribution.mjs';
import { taskDevelopmentDigest } from '../../src/task/domain/task-development.mjs';
import { registerContentTargetObserver } from '../../src/task/infrastructure/content-target-observer.mjs';
import { createTaskFinishSqliteRuntime, persistTaskFinishRun } from '../helpers/task-finish-sqlite-fixture.mjs';

function command(cwd, executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writeExecutable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

const fakeBuildr = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const options = (name) => args.flatMap((value, index) => value === name ? [args[index + 1]] : []);
const output = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
if (args[0] === 'version') output({ schemaVersion: 'buildr.version/v1', version: '2.0.0-test' });
else if (args[0] === 'openspec' && args[1] === 'audit') output({ schemaVersion: 'buildr.openspec-audit/v1', status: 'passed' });
else if (args[0] === 'openspec' && args[1] === 'converge') {
  const target = option('--target');
  const active = path.join(target, 'projects', 'product', 'openspec', 'changes', args[2]);
  const archived = path.join(target, 'projects', 'product', 'openspec', 'changes', 'archive', args[2]);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.renameSync(active, archived);
  output({ schemaVersion: 'buildr.openspec-converge/v1', status: 'passed', receipt: path.join(archived, '.buildr-convergence.yml') });
} else if (args[0] === 'sync') process.exit(0);
else if (args[0] === 'task' && args[1] === 'environment' && args[2] === 'prepare') {
  output({ schemaVersion: 'buildr.task-environment-operation-result/v1', operation: 'prepare', status: 'ready', taskId: args[3] });
}
else if (args[0] === 'web' && args[1] === 'launcher' && ['install', 'status'].includes(args[2])) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  output({
    schemaVersion: 'buildr.launcher-status/v1', platform: 'darwin', channel: 'development',
    target: '/Applications/Buildr Web Dev.app', installed: true,
    identity: { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', source: 'checkout', buildId: head.slice(0, 12) + '-fixture', checkout: { head, dirty: false } },
  });
}
else if (args[0] === 'verification' && args[1] === 'run') {
  const targetIdentity = option('--target-identity');
  const checks = options('--capability').map((id) => ({ id, title: id, status: 'passed', exitCode: 0, durationMs: 7, stdout: '', stderr: '' }));
  output({
    schemaVersion: 'buildr.verification-execution/v1', status: 'passed', target: { identity: targetIdentity, stable: true },
    checks, executionIdentity: 'execution-' + targetIdentity, evidenceReference: null, durationMs: 7,
  });
} else if (args[0] === 'doctor') {
  const target = option('--target');
  const ready = option('--agent') === 'codex' && !fs.existsSync(path.join(target, '.doctor-not-ready'));
  output({ schemaVersion: 'buildr.doctor/v1', health: { ready }, findings: ready ? [] : [{ code: 'fixture.agent-runtime-not-ready' }] });
  if (!ready) process.exitCode = 1;
}
else { process.stderr.write('unsupported fake Buildr invocation: ' + args.join(' ')); process.exit(2); }
`;

const fakeOpenSpec = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ summary: { passed: 1, failed: 0 } }) + '\\n');
`;

function taskEnvironmentFixture({ task, environmentRoot, retained, controllerCommand = path.join(retained, 'projects', 'product', 'buildr'), controllerSourceRoot = path.dirname(controllerCommand), repositoryRemote = 'origin', repositoryStartPoint = 'dev' }) {
  const controllerInvocation = { command: process.execPath, argsPrefix: [controllerCommand], sourceRoot: controllerSourceRoot, kind: 'stable-controller' };
  const execution = () => ({
    ready: true,
    taskId: task,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: retained,
    environmentRoot,
    validationRoot: environmentRoot,
    executionRoots: [environmentRoot],
    allowedExecutionRoots: [environmentRoot],
    controller: { identity: 'fixture-controller', adapter: 'codex' },
    controllerInvocation,
    cliInvocation: {
      command: process.execPath,
      argsPrefix: [controllerCommand],
      sourceRoot: controllerSourceRoot,
      kind: 'task-environment-candidate',
    },
    repositories: [{
      selector: 'workspace',
      sourceRepository: retained,
      checkoutPath: environmentRoot,
      branch: `codex/${task}`,
      remote: repositoryRemote,
      startPoint: repositoryStartPoint,
      state: 'ready',
    }],
    scopes: [{ selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: environmentRoot, validationRoot: environmentRoot, shared: false }],
    resources: [],
  });
  return {
    resolveTaskEnvironmentExecution: execution,
    prepareTaskEnvironment: () => { throw new Error('Candidate runtime must not mutate Task Environment authority.'); },
    cleanupTaskEnvironment: async () => { throw new Error('Candidate runtime must not clean its Task Environment.'); },
    cleanupTaskEnvironmentThroughRetainedController: async (workspaceRoot, taskId, authorization) => {
      assert.equal(path.resolve(workspaceRoot), path.resolve(retained));
      assert.equal(taskId, task);
      assert.match(authorization?.runId || '', /^[a-z0-9._-]+$/);
      assert.match(authorization?.candidateRef || '', /^[0-9a-f]{40}$/);
      if (fs.existsSync(environmentRoot)) {
        command(retained, 'git', ['worktree', 'remove', '--force', environmentRoot]);
        return { status: 'cleaned', effects: [{ type: 'git-worktree-removed', path: environmentRoot }], diagnostic: null };
      }
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
}

function taskDevelopmentFixture() {
  let generation = 1;
  const gates = {
    planning: { targetIdentity: 'sha256-planning-target', resultDigest: 'sha256-planning', outcome: 'ready' },
    verification: { targetIdentity: 'sha256-verification-target', resultDigest: 'sha256-verification', outcome: 'passed' },
    completion: { targetIdentity: 'sha256-completion-target', resultDigest: 'sha256-completion', outcome: 'ready' },
  };
  const history = [];
  const snapshot = () => {
    const candidate = { identity: `sha256-candidate-${generation}`, generation, contentTargetIdentity: `sha256-content-target-${generation}`, taskContextIdentity: 'sha256-task-context', policyIdentity: 'sha256-policy' };
    const decision = { outcome: 'proceed', candidateIdentity: candidate.identity, summary: 'ready', risks: [] };
    const handoff = { identity: `sha256-handoff-${generation}`, candidate, gates, decision };
    if (!history.some((item) => item.identity === handoff.identity)) history.push(handoff);
    return { candidate, decision, handoff, receipt: { candidate, gates, decision, handoffs: [...history] } };
  };
  let taskRecord = null;
  return {
    inspectTaskRecord: (_root, task) => ({ record: taskRecord || { taskId: task, status: 'active', result: null } }),
    completeTaskRecordFromFinish: (_root, task) => {
      if (!taskRecord) taskRecord = { taskId: task, status: 'active', result: null };
      if (taskRecord.status === 'active') taskRecord = { ...taskRecord, status: 'completed', result: { summary: '任务贡献已验证交付。', noChange: false } };
      return { operation: 'complete', status: 'completed', taskId: task, record: taskRecord, recordDigest: taskDevelopmentDigest(taskRecord), effects: [{ type: 'updated', taskId: task }] };
    },
    inspectTaskDevelopment: () => {
      const current = snapshot();
      return { development: { receipt: current.receipt, applicability: { handoff: 'current' } } };
    },
    assertTaskDevelopmentCarrier: (_root, _task, expected) => {
      const current = snapshot();
      const observed = {
        handoffIdentity: current.handoff.identity,
        candidateIdentity: current.candidate.identity,
        candidateGeneration: current.candidate.generation,
        contentTargetIdentity: current.candidate.contentTargetIdentity,
      };
      const mismatches = Object.keys(observed).filter((field) => observed[field] !== expected?.[field]);
      return mismatches.length
        ? { status: 'stale', development: { receipt: current.receipt, applicability: { handoff: 'current' } }, diagnostic: { code: 'task_development_carrier_identity_mismatch', details: { expected, current: observed, mismatches } }, effects: [] }
        : { status: 'equivalent', development: { receipt: current.receipt, applicability: { handoff: 'current' } }, effects: [] };
    },
    advanceTaskDevelopmentHandoff: () => { generation += 1; return snapshot().handoff; },
  };
}

const isolatedJourneys = [];
const processEnvironmentJourneys = [];
const journeyTiming = new AsyncLocalStorage();

function timedJourney(name, run) {
  return async (t) => {
    const timing = { name, startedAt: performance.now(), bodyStartedAt: null, bodyFinishedAt: null };
    let result;
    let failure;
    try {
      result = await journeyTiming.run(timing, () => run(t));
    } catch (error) {
      failure = error;
    } finally {
      timing.bodyFinishedAt = performance.now();
    }
    t.after(() => {
      const finishedAt = performance.now();
      const bodyStartedAt = timing.bodyStartedAt ?? timing.startedAt;
      const bodyFinishedAt = timing.bodyFinishedAt ?? finishedAt;
      process.stderr.write(`[buildr-golden-journey-timing] ${JSON.stringify({
        schemaVersion: 'buildr.golden-journey-timing/v1',
        owner: 'system-task-finish',
        journey: name,
        prepareDurationMs: Math.round(bodyStartedAt - timing.startedAt),
        bodyDurationMs: Math.round(bodyFinishedAt - bodyStartedAt),
        waitDurationMs: 0,
        cleanupDurationMs: Math.round(finishedAt - bodyFinishedAt),
        totalDurationMs: Math.round(finishedAt - timing.startedAt),
      })}\n`);
    });
    if (failure) throw failure;
    return result;
  };
}

function startJourneyBody() {
  const timing = journeyTiming.getStore();
  assert.ok(timing, 'golden journey timing context is required');
  assert.equal(timing.bodyStartedAt, null, 'golden journey body can only start once');
  timing.bodyStartedAt = performance.now();
}

function isolatedJourney(name, run) {
  assert.doesNotMatch(Function.prototype.toString.call(run), /process\.env/, `${name} mutates process.env and must use processEnvironmentJourney`);
  isolatedJourneys.push({ name, run: timedJourney(name, run) });
}

function processEnvironmentJourney(name, run) {
  assert.match(Function.prototype.toString.call(run), /process\.env/, `${name} does not need the serialized process environment group`);
  processEnvironmentJourneys.push({ name, run: timedJourney(name, run) });
}

isolatedJourney('无副作用陈旧run保持兼容；Contribution漂移旧carrier经显式rollover换代', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-stale-run-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Stale Finish run fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, 'README.md'), '# baseline\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'stale-finish-run';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'generation one\n');
  command(environmentRoot, 'git', ['add', 'feature.txt']);
  command(environmentRoot, 'git', ['commit', '-m', 'candidate generation one']);
  fs.writeFileSync(path.join(retained, 'retained-blocker.txt'), 'keep preflight blocked\n');

  const development = taskDevelopmentFixture();
  const environment = taskEnvironmentFixture({ task, environmentRoot, retained });
  const runtime = {
    ...createTaskFinishSqliteRuntime(retained, task),
    ...environment,
    ...development,
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? retained : args[index + 1]) };
    },
  };
  registerTaskFinishApplication(runtime);
  startJourneyBody();

  const first = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver generation one', '--target', retained]);
  assert.equal(first.status, 'blocked');
  assert.equal(first.primaryFailure.phase, 'preflight');
  assert.equal(first.carrier, null);
  const firstRunId = first.runId;
  const firstRecordCount = runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length;
  assert.equal(firstRecordCount, 1);

  development.advanceTaskDevelopmentHandoff();
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--target', retained]),
    (error) => error.code === 'task_finish.entry_gaps'
      && error.details?.gaps?.delivery?.some((gap) => gap.code === 'task_finish.commit_message_required'),
  );
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { taskId: task }).run.runId, firstRunId);

  const second = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver generation two', '--target', retained]);
  assert.equal(second.status, 'blocked');
  assert.notEqual(second.runId, firstRunId);
  assert.equal(second.candidate.generation, 2);
  assert.equal(second.deliveryCommit.subject, 'fix(task-finish): deliver generation two');
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 2);

  const safePrepare = runtime.readTaskFinishRunPersistence(retained, { taskId: task });
  const prepareFailure = { phase: 'prepare', operation: 'carrier-preparation', check: null, failureClass: 'product-execution-failure', code: 'task-finish.carrier-prepare-failed', status: 'failed', exitCode: null, message: 'Unable to snapshot exact Task source.', findings: [], diagnostic: null };
  safePrepare.run.status = 'failed';
  safePrepare.run.phases.find((phase) => phase.id === 'preflight').status = 'passed';
  safePrepare.run.phases.find((phase) => phase.id === 'preflight').failure = null;
  safePrepare.run.phases.find((phase) => phase.id === 'prepare').status = 'failed';
  safePrepare.run.phases.find((phase) => phase.id === 'prepare').attempts = 1;
  safePrepare.run.phases.find((phase) => phase.id === 'prepare').failure = prepareFailure;
  safePrepare.run.primaryFailure = prepareFailure;
  safePrepare.run.resume = null;
  runtime.writeTaskFinishRunPersistence(retained, safePrepare.run);
  development.advanceTaskDevelopmentHandoff();
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--target', retained]),
    (error) => error.code === 'task_finish.entry_gaps'
      && error.details?.gaps?.delivery?.some((gap) => gap.code === 'task_finish.commit_message_required'),
  );
  const third = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver generation three', '--target', retained]);
  assert.equal(third.status, 'blocked');
  assert.notEqual(third.runId, second.runId);
  assert.equal(third.candidate.generation, 3);
  assert.equal(third.deliveryCommit.subject, 'fix(task-finish): deliver generation three');
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 3);

  const prepareBlocked = runtime.readTaskFinishRunPersistence(retained, { taskId: task });
  const blockedFailure = { phase: 'prepare', operation: 'target-fetch', check: null, failureClass: 'transient-external-condition', code: 'task-finish.target-fetch-failed', status: 'blocked', exitCode: 1, message: 'Unable to observe the target branch.', findings: [], diagnostic: null };
  prepareBlocked.run.status = 'blocked';
  prepareBlocked.run.phases.find((phase) => phase.id === 'preflight').status = 'passed';
  prepareBlocked.run.phases.find((phase) => phase.id === 'preflight').failure = null;
  prepareBlocked.run.phases.find((phase) => phase.id === 'prepare').status = 'blocked';
  prepareBlocked.run.phases.find((phase) => phase.id === 'prepare').attempts = 1;
  prepareBlocked.run.phases.find((phase) => phase.id === 'prepare').failure = blockedFailure;
  prepareBlocked.run.primaryFailure = blockedFailure;
  prepareBlocked.run.resume = { phase: 'prepare', token: 'sha256-prepare-resume', generatedAt: new Date().toISOString(), carrierIdentity: null };
  runtime.writeTaskFinishRunPersistence(retained, prepareBlocked.run);
  development.advanceTaskDevelopmentHandoff();
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver generation four', '--target', retained]),
    (error) => error.code === 'task_finish.current_run_identity_conflict'
      && error.details?.sideEffectFacts?.includes('uncertainPhase'),
  );

  const persisted = runtime.readTaskFinishRunPersistence(retained, { taskId: task });
  const plan = persisted.run.identity.repositories[0];
  const carrierRoot = taskFinishCarrierRoot(retained, third.runId, plan.selector);
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  command(retained, 'git', ['worktree', 'add', '--detach', carrierRoot, 'HEAD']);
  const carrier = { identity: 'sha256-owned-carrier', root: carrierRoot, head: command(carrierRoot, 'git', ['rev-parse', 'HEAD']) };
  const proof = createGitCarrierDisposabilityProof({
    repositoryRoot: plan.taskRoot, workspaceRoot: retained, runId: third.runId, repositorySelector: plan.selector, carrier,
    handoffIdentity: persisted.run.identity.handoffIdentity, repositoryTopology: plan,
    prepareFailure: { operation: 'delivery-adaptation', code: 'task-finish.delivery-adaptation-required', status: 'blocked' },
  });
  assert.equal(proof.status, 'proved');
  const driftFailure = { phase: 'prepare', operation: 'task-contribution', check: null, failureClass: 'upstream-candidate-defect', code: 'task-finish.task-contribution-drift-unresolved', status: 'failed', exitCode: null, message: 'Task Contribution changed before prepare.', findings: [], diagnostic: null };
  persisted.run.status = 'failed';
  persisted.run.phases.find((phase) => phase.id === 'preflight').status = 'passed';
  persisted.run.phases.find((phase) => phase.id === 'preflight').attempts = 1;
  persisted.run.phases.find((phase) => phase.id === 'prepare').status = 'failed';
  persisted.run.phases.find((phase) => phase.id === 'prepare').attempts = 1;
  persisted.run.phases.find((phase) => phase.id === 'prepare').failure = driftFailure;
  for (const phaseId of ['verify', 'deliver', 'cleanup']) Object.assign(persisted.run.phases.find((phase) => phase.id === phaseId), { status: 'pending', attempts: 0, failure: null });
  persisted.run.repositories[0].deliveryCarrier = carrier;
  persisted.run.repositories[0].carrierDisposability = proof.proof;
  persisted.run.deliveryCarrier = carrier;
  persisted.run.carrierDisposability = proof.proof;
  persisted.run.primaryFailure = driftFailure;
  persisted.run.resume = null;
  runtime.writeTaskFinishRunPersistence(retained, persisted.run);
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver generation four', '--target', retained]),
    (error) => error.code === 'task_finish.current_run_identity_conflict',
  );
  const facts = runtime.inspectTaskFinishCurrentFacts(retained, task);
  assert.equal(facts.recovery.disposition, 'stale-run-retirable');
  const rolloverCapability = facts.availableCapabilities.find((capability) => capability.id === 'finish-rollover');
  assert.equal(rolloverCapability.status, 'available');
  const rollover = await runtime.taskFinish('rollover', ['--task', task, '--recovery-token', rolloverCapability.recoveryToken, '--commit-message', 'fix(task-finish): deliver generation four', '--target', retained]);
  assert.equal(rollover.status, 'active');
  assert.equal(rollover.identity.candidateGeneration, 4);
  assert.equal(rollover.rollover.supersededRunId, third.runId);
  assert.equal(fs.existsSync(carrierRoot), false);
  const retainedCurrent = runtime.readTaskFinishRunPersistence(retained, { taskId: task }).run;
  assert.equal(retainedCurrent.runId, rollover.runId);
  assert.equal(retainedCurrent.supersededCurrent.runId, third.runId);
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 3);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], command(retained, 'git', ['rev-parse', 'HEAD']));
});

isolatedJourney('旧 v2 无副作用 commit-message mismatch 可由同一首次命令安全替换', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-legacy-mismatch-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Legacy mismatch recovery fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), fakeBuildr);
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, 'README.md'), '# baseline with unrelated commit message\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline message unrelated to Finish']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'legacy-message-mismatch-task';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'Task contribution\n');
  command(environmentRoot, 'git', ['add', 'feature.txt']);
  command(environmentRoot, 'git', ['commit', '-m', 'implement candidate']);
  const environment = taskEnvironmentFixture({ task, environmentRoot, retained });
  const development = taskDevelopmentFixture();
  const runtime = {
    ...createTaskFinishSqliteRuntime(retained, task),
    ...environment,
    ...development,
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? retained : args[index + 1]) };
    },
  };
  const current = development.inspectTaskDevelopment().development.receipt;
  const handoff = current.handoffs.at(-1);
  const subject = 'fix(task-finish): recover legacy mismatch';
  const deliveryCommit = normalizeTaskFinishDeliveryCommit(subject, task);
  const legacy = createFinishRun({
    root: retained,
    runId: 'legacy-message-mismatch-run',
    identity: {
      task,
      handoffIdentity: handoff.identity,
      candidateIdentity: handoff.candidate.identity,
      candidateGeneration: handoff.candidate.generation,
      contentTargetIdentity: handoff.candidate.contentTargetIdentity,
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot,
      workspaceRoot: retained,
      deliveryCommitIdentity: deliveryCommit.identity,
    },
    deliveryCommit,
    developmentHandoff: handoff,
    runtime,
  });
  legacy.schemaVersion = 'buildr.task-finish-run/v2';
  const mismatch = {
    phase: 'prepare', operation: 'carrier-preparation', check: null, failureClass: 'product-execution-failure',
    code: 'task-finish.commit-message-mismatch', status: 'failed', exitCode: null,
    message: 'Delivery Carrier commit message does not match the frozen Task Finish message.', findings: [],
    diagnostic: { expectedIdentity: deliveryCommit.identity, observedSubject: 'baseline message unrelated to Finish' },
  };
  legacy.status = 'failed';
  legacy.phases.find((phase) => phase.id === 'preflight').status = 'passed';
  legacy.phases.find((phase) => phase.id === 'preflight').attempts = 1;
  legacy.phases.find((phase) => phase.id === 'prepare').status = 'failed';
  legacy.phases.find((phase) => phase.id === 'prepare').attempts = 1;
  legacy.phases.find((phase) => phase.id === 'prepare').failure = mismatch;
  legacy.primaryFailure = mismatch;
  runtime.writeTaskFinishRunPersistence(retained, legacy);
  registerTaskFinishApplication(runtime);
  startJourneyBody();

  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): different message', '--target', retained]),
    (error) => error.code === 'task_finish.commit_message_override',
  );
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { taskId: task }).run.runId, legacy.runId);

  const recovered = await runtime.taskFinish('run', ['--task', task, '--commit-message', subject, '--target', retained]);
  assert.equal(recovered.status, 'complete', JSON.stringify(recovered, null, 2));
  assert.notEqual(recovered.runId, legacy.runId);
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { taskId: task }, { optional: true }), null);
  assert.equal(runtime.readTaskFinishCompletionPersistence(retained, { taskId: task }).completion.result.runId, recovered.runId);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], recovered.carrier.head);
});

function realTaskDevelopmentFixture({ task, environmentRoot, retained, environment, workspaceOnly = false }) {
  let receipt = null;
  let savedObservation = null;
  let taskRecord = { taskId: task, intent: workspaceOnly ? 'Deliver a workspace-only formal Task.' : 'Reuse the same Candidate after Delivery Baseline advance.', scope: { projects: workspaceOnly ? [] : ['product'], services: [] }, changes: [], status: 'active', result: null };
  const planningTargetIdentity = taskDevelopmentDigest(`${task}:planning`);
  const declarationIdentity = taskDevelopmentDigest(`${task}:declaration`);
  const sqliteRuntime = createTaskFinishSqliteRuntime(retained, task);
  const runtime = {
    ...sqliteRuntime,
    ...environment,
    inspectTaskRecord: () => ({ record: taskRecord }),
    prepareTaskRecordPersistence: () => ({ record: taskRecord }),
    completeTaskRecordFromFinish: () => {
      const changed = taskRecord.status === 'active';
      if (changed) taskRecord = { ...taskRecord, status: 'completed', result: { summary: '任务贡献已验证交付。', noChange: false } };
      return { operation: 'complete', status: 'completed', taskId: task, record: taskRecord, recordDigest: taskDevelopmentDigest(taskRecord), effects: changed ? [{ type: 'updated', taskId: task }] : [] };
    },
    observeTaskVerificationDeclarations: () => workspaceOnly ? [] : [{
      project: 'product', path: 'projects/product/verification.yml', identity: declarationIdentity, valid: true,
      declaration: { capabilities: [{ id: 'product.delivery', requiredForDelivery: true }] },
    }],
    inspectTaskReview: (_root, _task, options = {}) => ({ slots: {
      planning: {
        present: true, applicability: options.planningTargetIdentity && options.planningTargetIdentity !== planningTargetIdentity ? 'stale' : 'current',
        resultDigest: taskDevelopmentDigest(`${task}:planning-result`), result: { targetIdentity: planningTargetIdentity, conclusion: { outcome: 'ready' } },
      },
      completion: options.completionTargetIdentity ? {
        present: true, applicability: 'current', resultDigest: taskDevelopmentDigest(`${task}:completion-result`),
        result: { targetIdentity: options.completionTargetIdentity, conclusion: { outcome: 'ready' } },
      } : { present: false, applicability: 'unknown' },
    } }),
    inspectTaskVerification: (_root, _task, options = {}) => ({ slot: {
      present: true,
      applicability: { status: 'current' },
      resultDigest: taskDevelopmentDigest(`${task}:verification-result`),
      result: {
        target: { identity: options.targetIdentity },
        capabilities: workspaceOnly ? [] : [{ project: 'product', capability: 'product.delivery', outcome: 'passed', facts: ['Passed.'] }],
        coverageGaps: workspaceOnly ? [{ scope: 'workspace', summary: 'No workspace verification capability.' }] : [],
        conclusion: { outcome: workspaceOnly ? 'not-passed' : 'passed' },
      },
    } }),
    readTaskDevelopmentPersistence: (_root, _task, options = {}) => {
      if (!receipt && options.optional) return null;
      assert.ok(receipt, 'Development Receipt must exist.');
      return { root: retained, file: `workspace-sqlite:task-development/${task}`, receipt, receiptDigest: taskDevelopmentDigest(receipt), applicability: savedObservation?.applicability, observedAt: savedObservation?.observedAt };
    },
    writeTaskDevelopmentPersistence: (_root, next, observation) => {
      receipt = next;
      savedObservation = observation;
      return { root: retained, file: `workspace-sqlite:task-development/${task}`, receipt, receiptDigest: taskDevelopmentDigest(receipt), applicability: savedObservation.applicability, observedAt: savedObservation.observedAt };
    },
  };
  registerContentTargetObserver(runtime);
  registerTaskDevelopmentApplication(runtime);
  runtime.observeTaskDevelopment(retained, task, { changeDispositions: [], planningTargetIdentity });
  runtime.recordTaskDevelopmentPolicy(retained, task, workspaceOnly
    ? { capabilities: [], coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }], overrides: [] }
    : { capabilities: [{ project: 'product', capability: 'product.delivery', required: true }], coverageGaps: [], overrides: [] });
  runtime.freezeTaskDevelopmentCandidate(retained, task, { planningTargetIdentity });
  runtime.recordTaskDevelopmentKnowledge(retained, task, {
    treeIdentity: runtime.inspectTaskDevelopment(retained, task).development.receipt.contentTarget.identity,
    status: 'aligned',
    summary: 'Task Finish system fixture current knowledge is aligned.',
    sourceIdentities: ['test:task-finish-product-journey'],
    unresolvedItems: [],
  });
  runtime.decideTaskDevelopment(retained, task, {
    outcome: 'proceed', summary: 'Current gates.',
    risks: workspaceOnly ? [{ gate: 'verification', resultDigest: taskDevelopmentDigest(`${task}:verification-result`), scope: 'workspace', summary: 'Workspace coverage gap accepted for this Candidate.', source: 'user:system-regression' }] : [],
  });
  runtime.createTaskDevelopmentHandoff(retained, task);
  const before = runtime.inspectTaskDevelopment(retained, task);
  assert.equal(before.development.applicability.handoff, 'current');
  return runtime;
}

processEnvironmentJourney('Doctor与内部登记失败不否定交付，reconcile只修复Task终态', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-journey-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Finish journey test fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  fs.writeFileSync(path.join(seed, '.doctor-not-ready'), 'self-bootstrap activation required\n');
  fs.mkdirSync(path.join(seed, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(seed, '.buildr', 'tracked-metadata.json'), 'baseline metadata\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), fakeBuildr);
  const changeRoot = path.join(seed, 'projects', 'product', 'openspec', 'changes', 'finish-journey');
  fs.mkdirSync(path.join(changeRoot, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] implementation complete\n');
  fs.writeFileSync(path.join(changeRoot, '.buildr', 'knowledge-impact.yml'), 'schemaVersion: buildr.knowledge-impact/v1\nimpacts: []\nunresolvedItems: []\n');
  fs.writeFileSync(path.join(seed, 'projects', 'product', 'verification.yml'), 'schemaVersion: buildr.project-verification/v2\nresources: []\ncapabilities:\n  - id: product.delivery\n');
  fs.writeFileSync(path.join(seed, 'README.md'), '# Task Finish journey\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['add', '-f', '.buildr/tracked-metadata.json']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'finish-journey-task';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'finished candidate\n');
  fs.writeFileSync(path.join(environmentRoot, '.buildr', 'tracked-metadata.json'), 'task-local metadata\n');
  const nestedMetadata = path.join(environmentRoot, 'projects', 'product', 'openspec', 'changes', 'archive', 'finish-journey', '.buildr', 'convergence-receipt.json');
  fs.mkdirSync(path.dirname(nestedMetadata), { recursive: true });
  fs.writeFileSync(nestedMetadata, '{"status":"control-only"}\n');
  command(environmentRoot, 'git', ['add', 'feature.txt']);
  command(environmentRoot, 'git', ['commit', '-m', 'implement candidate']);
  const candidateHead = command(environmentRoot, 'git', ['rev-parse', 'HEAD']);
  command(environmentRoot, 'git', ['add', '-f', '.buildr/tracked-metadata.json']);
  command(environmentRoot, 'git', ['add', '-f', path.relative(environmentRoot, nestedMetadata)]);
  const environment = taskEnvironmentFixture({ task, environmentRoot, retained, repositoryRemote: null, repositoryStartPoint: 'HEAD' });
  const runtime = realTaskDevelopmentFixture({ task, environmentRoot, retained, environment });
  const frozen = runtime.inspectTaskDevelopment(retained, task).development.receipt.candidate;
  fs.writeFileSync(path.join(retained, 'baseline-advance.txt'), 'new delivery baseline\n');
  command(retained, 'git', ['add', 'baseline-advance.txt']);
  command(retained, 'git', ['commit', '-m', 'advance delivery baseline']);
  const advancedBaselineHead = command(retained, 'git', ['rev-parse', 'HEAD']);
  command(retained, 'git', ['push', 'origin', 'dev']);

  const openspec = path.join(fixture, 'bin', 'openspec');
  writeExecutable(openspec, fakeOpenSpec);
  const hostileBin = path.join(fixture, 'hostile-bin');
  writeExecutable(path.join(hostileBin, 'node'), '#!/bin/sh\necho "unexpected incompatible Node" >&2\nexit 91\n');
  const originalPath = process.env.PATH;
  process.env.PATH = `${hostileBin}${path.delimiter}${originalPath || ''}`;
  t.after(() => { process.env.PATH = originalPath; });
  Object.assign(runtime, {
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? retained : args[index + 1]) };
    },
  });
  registerTaskFinishApplication(runtime);
  startJourneyBody();
  const gateObservation = runtime.inspectTaskDevelopment(retained, task);
  const expectedHandoff = gateObservation.development.receipt.handoffs.at(-1);
  assert.equal(gateObservation.development.applicability.contentTarget, 'current');
  assert.equal(gateObservation.development.applicability.candidate, 'current');
  assert.equal(gateObservation.development.applicability.handoff, 'current');
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--target', retained]),
    (error) => error.code === 'task_finish.entry_gaps'
      && error.details?.gaps?.delivery?.length === 1
      && error.details.gaps.delivery[0].code === 'task_finish.commit_message_required'
      && /semantic commit message/.test(error.nextAction),
  );
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { taskId: task }, { optional: true }), null);
  assert.deepEqual(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records, []);
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--target-branch', 'main', '--commit-message', 'fix(task-finish): deliver journey candidate', '--target', retained]),
    (error) => error.code === 'task_finish.entry_gaps'
      && error.details?.nextWorkflow == null
      && error.details?.gaps?.delivery?.some((item) => item.code === 'task_finish.target_branch_mismatch' && item.details?.retainedBranch === 'dev')
      && (error.details?.gaps?.development || []).length === 0,
  );
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'task-finish', 'runs')), false);
  const completeTaskRecordFromFinish = runtime.completeTaskRecordFromFinish;
  let completionAttempts = 0;
  runtime.completeTaskRecordFromFinish = (...args) => {
    completionAttempts += 1;
    if (completionAttempts === 1) throw Object.assign(new Error('Injected transient Task Record failure.'), { code: 'task_record_write_failed' });
    return completeTaskRecordFromFinish(...args);
  };
  const openTaskExecutionRecord = runtime.openTaskExecutionRecord;
  runtime.openTaskExecutionRecord = () => { throw Object.assign(new Error('Injected execution record quota backpressure.'), { code: 'task_execution_record_quota_exceeded', nextAction: 'cleanup eligible execution records' }); };
  const result = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver journey candidate', '--target', retained]);
  runtime.openTaskExecutionRecord = openTaskExecutionRecord;
  assert.equal(result.status, 'complete', JSON.stringify(result, null, 2));
  assert.equal(result.delivery.status, 'delivered');
  assert.equal(result.delivery.activation.status, 'attention');
  assert.equal(result.delivery.activation.code, 'task-finish.retained-doctor-failed');
  assert.equal(result.delivery.retainedDoctor, 'attention');
  assert.equal(result.executionRecord.status, 'attention');
  assert.equal(result.completion.taskTerminal.status, 'attention');
  assert.equal(result.completion.taskTerminal.code, 'task_record_write_failed');
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'active');
  assert.deepEqual(result.phases.map(({ id, status }) => [id, status]), [
    ['preflight', 'passed'], ['prepare', 'passed'], ['verify', 'passed'], ['deliver', 'passed'], ['cleanup', 'passed'],
  ]);
  assert.equal(result.metrics.canonicalCliInvocations, 1);
  assert.equal(result.metrics.agentProviderCompletions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
  const terminalAssociation = runtime.readTaskFinishCompletionPersistence(retained, { taskId: task }, { optional: false }).completion.association;
  assert.equal(terminalAssociation.handoffIdentity, expectedHandoff.identity);
  assert.equal(terminalAssociation.candidateIdentity, frozen.identity);
  assert.equal(terminalAssociation.gates.planning.status, 'adopted-at-delivery');
  assert.equal(terminalAssociation.gates.verification.status, 'verified-at-delivery');
  assert.equal(terminalAssociation.gates.completion.status, 'adopted-at-delivery');
  assert.deepEqual(result.candidate, { identity: frozen.identity, generation: 1, contentTargetIdentity: frozen.contentTargetIdentity });
  assert.equal(result.identity.remote, 'origin');
  assert.equal(result.identity.targetBranch, 'dev');
  assert.equal(result.delivery.targetDisposition, 'carrier');
  assert.equal(result.delivery.remoteAfterRef, result.carrier.head);
  assert.equal(result.delivery.finalRemoteRef, result.carrier.head);
  assert.equal(result.carrier.deliveryBaseline.head, advancedBaselineHead);
  assert.notEqual(result.carrier.head, candidateHead);
  assert.deepEqual(result.phases.find((phase) => phase.id === 'deliver').operations, []);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(command(retained, 'git', ['rev-parse', 'HEAD']), result.carrier.head);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], result.carrier.head);
  assert.equal(command(retained, 'git', ['show', `${result.carrier.head}:.buildr/tracked-metadata.json`]), 'baseline metadata');
  assert.equal(command(retained, 'git', ['show', `${result.carrier.head}:baseline-advance.txt`]), 'new delivery baseline');
  assert.equal(result.carrier.changedPaths.includes('.buildr/tracked-metadata.json'), false);
  assert.equal(result.carrier.changedPaths.some((changedPath) => changedPath.split('/').includes('.buildr')), false);
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${result.carrier.head}:projects/product/openspec/changes/archive/finish-journey/.buildr/convergence-receipt.json`], { cwd: retained }).status, 0);
  assert.equal(result.completion.receipt, `workspace-sqlite:task-finish-completion/${task}`);
  const completion = runtime.readTaskFinishCompletionPersistence(retained, { taskId: task }, { optional: false }).completion;
  assert.equal(completion.status, 'complete');
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'task-finish', 'carriers', result.runId)), false);
  const reconciled = await runtime.taskFinish('reconcile', ['--task', task, '--target', retained]);
  assert.equal(reconciled.status, 'complete');
  assert.equal(reconciled.idempotent, true);
  assert.equal(reconciled.taskCompletion.status, 'completed');
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'completed');
  assert.deepEqual(runtime.inspectTaskRecord(retained, task).record.result, { summary: '任务贡献已验证交付。', noChange: false });
  const noOp = await runtime.taskFinish('run', ['--run', result.runId, '--target', retained]);
  assert.equal(noOp.status, 'complete');
  assert.equal(noOp.executionRecord.status, 'not-opened');
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 0);
});

isolatedJourney('同路径基线冲突保留current Candidate并经显式零差异 Delivery Adaptation恢复交付', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-adaptation-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Finish adaptation test fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), fakeBuildr);
  fs.writeFileSync(path.join(seed, 'projects', 'product', 'verification.yml'), 'schemaVersion: buildr.project-verification/v2\nresources: []\ncapabilities:\n  - id: product.delivery\n');
  fs.writeFileSync(path.join(seed, 'shared.txt'), 'baseline meaning\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'finish-adaptation-task';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  fs.writeFileSync(path.join(environmentRoot, 'shared.txt'), 'task meaning\n');
  command(environmentRoot, 'git', ['add', 'shared.txt']);
  command(environmentRoot, 'git', ['commit', '-m', 'implement candidate']);
  const taskHeadBeforeFinish = command(environmentRoot, 'git', ['rev-parse', 'HEAD']);
  const environment = taskEnvironmentFixture({ task, environmentRoot, retained });
  const runtime = realTaskDevelopmentFixture({ task, environmentRoot, retained, environment });
  const frozen = runtime.inspectTaskDevelopment(retained, task).development.receipt.candidate;

  fs.writeFileSync(path.join(environmentRoot, 'shared.txt'), 'drifted task meaning\n');
  assert.equal(runtime.inspectTaskDevelopment(retained, task).development.applicability.handoff, 'current', 'GET只返回最近一次正式action保存的观察');
  fs.writeFileSync(path.join(environmentRoot, 'shared.txt'), 'task meaning\n');
  assert.equal(runtime.inspectTaskDevelopment(retained, task).development.applicability.handoff, 'current');

  fs.writeFileSync(path.join(retained, 'shared.txt'), 'new baseline meaning\n');
  command(retained, 'git', ['add', 'shared.txt']);
  command(retained, 'git', ['commit', '-m', 'advance conflicting baseline']);
  const advancedBaselineHead = command(retained, 'git', ['rev-parse', 'HEAD']);
  command(retained, 'git', ['push', 'origin', 'dev']);

  let compatibilityStatus = 'failed';
  let advanceTargetDuringCompatibility = false;
  let racedBaselineHead = null;
  Object.assign(runtime, {
    runTaskFinishCarrierCompatibility: ({ carrier }) => {
      if (compatibilityStatus === 'passed' && advanceTargetDuringCompatibility) {
        fs.writeFileSync(path.join(retained, 'target-race.txt'), 'target advanced after zero-delta review\n');
        command(retained, 'git', ['add', 'target-race.txt']);
        command(retained, 'git', ['commit', '-m', 'advance after zero-delta review']);
        command(retained, 'git', ['push', 'origin', 'dev']);
        racedBaselineHead = command(retained, 'git', ['rev-parse', 'HEAD']);
        advanceTargetDuringCompatibility = false;
      }
      return { status: compatibilityStatus, checks: [{ id: 'product.delivery-carrier-compatibility', status: compatibilityStatus, carrierTree: carrier.tree }], evidenceIdentity: `compatibility-${carrier.tree}-${compatibilityStatus}` };
    },
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? retained : args[index + 1]) };
    },
  });
  registerTaskFinishApplication(runtime);
  startJourneyBody();
  const firstSubject = 'fix(task-finish): deliver adapted journey candidate';
  const first = await runtime.taskFinish('run', ['--task', task, '--commit-message', firstSubject, '--target', retained]);

  assert.equal(first.status, 'blocked', JSON.stringify(first, null, 2));
  assert.equal(first.primaryFailure.code, 'task-finish.delivery-adaptation-required');
  assert.equal(first.primaryFailure.failureClass, 'semantic-review-required');
  assert.equal(first.nextWorkflow, null);
  assert.equal(first.reuseMode, 'adaptation-required');
  assert.equal(first.candidate.generation, 1);
  assert.equal(first.metrics.formalVerificationExecutions, 0);
  assert.equal(fs.existsSync(environmentRoot), true);
  assert.equal(command(environmentRoot, 'git', ['rev-parse', 'HEAD']), taskHeadBeforeFinish);
  assert.equal(runtime.inspectTaskDevelopment(retained, task).development.applicability.handoff, 'current');
  const initialCarrierProof = runtime.readTaskFinishRunPersistence(retained, { runId: first.runId }).run.repositories[0].carrierDisposability;
  assert.match(initialCarrierProof.identity, /^sha256-/);
  assert.equal(initialCarrierProof.initialPrepareFailure.code, 'task-finish.delivery-adaptation-required');

  const carrierHeadBeforeResume = command(first.carrier.root, 'git', ['rev-parse', 'HEAD']);
  const missingConfirmation = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', first.resume.token, '--target', retained]);
  assert.equal(missingConfirmation.status, 'blocked');
  assert.equal(missingConfirmation.primaryFailure.code, 'task-finish.delivery-adaptation-missing');
  assert.equal(command(first.carrier.root, 'git', ['rev-parse', 'HEAD']), carrierHeadBeforeResume);
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { runId: first.runId }).run.repositories[0].carrierDisposability.identity, initialCarrierProof.identity);

  const compatibilityFailure = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', missingConfirmation.resume.token, '--accept-zero-delta-adaptation', '--target', retained]);
  assert.equal(compatibilityFailure.status, 'blocked');
  assert.equal(compatibilityFailure.primaryFailure.code, 'task-finish.compatibility-checks-failed');
  assert.equal(compatibilityFailure.delivery, null);
  assert.equal(fs.existsSync(environmentRoot), true);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], advancedBaselineHead);

  compatibilityStatus = 'passed';
  advanceTargetDuringCompatibility = true;
  const targetRace = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', compatibilityFailure.resume.token, '--accept-zero-delta-adaptation', '--target', retained]);
  assert.equal(targetRace.status, 'blocked');
  assert.equal(targetRace.primaryFailure.code, 'task-finish.target-race');
  assert.equal(targetRace.carrier.zeroDelta, true);
  assert.match(targetRace.resume.token, /^sha256-/);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], racedBaselineHead);

  const renewedAdaptation = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', targetRace.resume.token, '--target', retained]);
  assert.equal(renewedAdaptation.status, 'blocked');
  assert.equal(renewedAdaptation.primaryFailure.code, 'task-finish.delivery-adaptation-required');
  assert.equal(renewedAdaptation.carrier.deliveryBaseline.head, racedBaselineHead);

  const second = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', renewedAdaptation.resume.token, '--accept-zero-delta-adaptation', '--target', retained]);

  assert.equal(second.status, 'complete', JSON.stringify(second, null, 2));
  assert.equal(second.reuseMode, 'agent-reviewed-delivery-adaptation');
  assert.equal(second.equivalence.semanticEquivalence, 'agent-reviewed-not-proven-by-buildr');
  assert.equal(second.carrier.zeroDelta, true);
  assert.equal(second.carrier.adaptation.zeroDelta, true);
  assert.deepEqual(second.carrier.changedPaths, []);
  assert.deepEqual(second.carrier.changes, []);
  assert.deepEqual(second.carrier.activationPaths, ['shared.txt']);
  assert.equal(second.carrier.adaptation.compatibilityChecks.status, 'passed');
  assert.equal(second.candidate.identity, frozen.identity);
  assert.equal(second.candidate.generation, 1);
  assert.equal(second.metrics.formalVerificationExecutions, 0);
  assert.equal(second.carrier.deliveryBaseline.head, racedBaselineHead);
  assert.equal(second.carrier.head, racedBaselineHead);
  assert.equal(second.delivery.targetDisposition, 'already-contained');
  assert.equal(second.delivery.containment.proof, 'agent-reviewed-zero-delta');
  assert.equal(second.delivery.remoteAfterRef, racedBaselineHead);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], racedBaselineHead);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'completed');
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'transient', 'task-finish', 'carriers', second.runId)), false);
});

processEnvironmentJourney('真实 code-only 候选完成五阶段且不执行任何 OpenSpec 命令', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-code-only-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  const controller = path.join(fixture, 'controller', 'buildr');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Finish code-only test fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  writeExecutable(controller, fakeBuildr);
  fs.mkdirSync(path.join(seed, 'projects', 'product'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'product', 'verification.yml'), 'schemaVersion: buildr.project-verification/v2\nresources: []\ncapabilities:\n  - id: product.delivery\n');
  fs.writeFileSync(path.join(seed, 'README.md'), '# Code-only Task Finish journey\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'finish-code-only-task';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  const buildrWebChange = path.join(environmentRoot, 'projects', 'product', 'services', 'buildr', 'src', 'interfaces', 'local-app', 'runtime', 'code-only.mjs');
  fs.mkdirSync(path.dirname(buildrWebChange), { recursive: true });
  fs.writeFileSync(buildrWebChange, 'export const finishedWithoutChange = true;\n');
  command(environmentRoot, 'git', ['add', path.relative(environmentRoot, buildrWebChange)]);
  command(environmentRoot, 'git', ['commit', '-m', 'implement code-only candidate']);

  const hostileBin = path.join(fixture, 'hostile-bin');
  writeExecutable(path.join(hostileBin, 'node'), '#!/bin/sh\necho "unexpected incompatible Node" >&2\nexit 91\n');
  const originalPath = process.env.PATH;
  process.env.PATH = `${hostileBin}${path.delimiter}${originalPath || ''}`;
  t.after(() => { process.env.PATH = originalPath; });
  const environment = taskEnvironmentFixture({ task, environmentRoot, retained, controllerCommand: controller, controllerSourceRoot: path.dirname(controller) });
  const runtime = realTaskDevelopmentFixture({ task, environmentRoot, retained, environment, workspaceOnly: true });
  const development = runtime.inspectTaskDevelopment(retained, task).development;
  const handoff = development.receipt.handoffs.at(-1);
  const candidate = development.receipt.candidate;
  assert.equal(development.applicability.handoff, 'current');
  assert.equal(development.receipt.verificationPolicy.declarations.length, 0);
  assert.equal(development.receipt.gates.verification.outcome, 'not-passed');
  assert.equal(development.receipt.decision.risks[0].scope, 'workspace');
  const run = persistTaskFinishRun(runtime, retained, {
      task,
      handoffIdentity: handoff.identity,
      candidateIdentity: candidate.identity,
      candidateGeneration: candidate.generation,
      contentTargetIdentity: candidate.contentTargetIdentity,
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot,
      workspaceRoot: retained,
    }, 'product-code-only-journey');
  /* The helper persists the SQLite current run; the executor owns subsequent checkpoints. */
  const handlers = createTaskFinishProductHandlers({ runtime, root: environmentRoot });
  const observedOperations = [];
  startJourneyBody();
  const result = await executeFinishRun({
    root: retained,
    run,
    handlers,
    runtime,
    observer: {
      runOpened() {},
      phaseStarted() {},
      phaseFinished({ result: phaseResult }) { observedOperations.push(...(phaseResult.operations || [])); },
      finishStopped() {},
    },
  });

  assert.equal(result.status, 'complete', JSON.stringify(result, null, 2));
  assert.equal(result.handoff.identity, handoff.identity);
  assert.equal(result.candidate.identity, candidate.identity);
  assert.equal(result.candidate.generation, 1);
  assert.deepEqual(result.phases.map(({ id, status }) => [id, status]), [
    ['preflight', 'passed'], ['prepare', 'passed'], ['verify', 'passed'], ['deliver', 'passed'], ['cleanup', 'passed'],
  ]);
  assert.ok(result.phases.every((phase) => phase.operations.length === 0));
  assert.equal(observedOperations.some((operation) => operation.id?.includes('openspec') || operation.args?.includes('openspec')), false);
  assert.equal(observedOperations.some((operation) => operation.id === 'deliver-cli-install'), false);
  assert.equal(observedOperations.some((operation) => operation.id === 'deliver-local-app-install'), false);
  assert.equal(result.delivery.runtimeInstall, 'not-applicable');
  assert.equal(result.delivery.localAppDelivery, 'not-applicable');
  assert.equal(fs.existsSync(path.join(retained, 'projects', 'product', 'buildr')), false);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(command(retained, 'git', ['rev-parse', 'HEAD']), result.carrier.head);
  assert.equal(result.completion.receipt, `workspace-sqlite:task-finish-completion/${task}`);
  const completion = runtime.readTaskFinishCompletionPersistence(retained, { taskId: task }, { optional: false }).completion;
  assert.equal(completion.handoffIdentity, handoff.identity);
  assert.equal(completion.candidateIdentity, candidate.identity);
  assert.equal(completion.candidateGeneration, 1);
  assert.equal(completion.contentTargetIdentity, candidate.contentTargetIdentity);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
});

isolatedJourney('多仓库 Task 只交付有贡献 Service 并统一清理无贡献 Workspace', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-multi-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const workspaceSeed = path.join(fixture, 'workspace-seed');
  const workspaceRemote = path.join(fixture, 'workspace-remote.git');
  const retained = path.join(fixture, 'workspace');
  const serviceSeed = path.join(fixture, 'service-seed');
  const serviceRemote = path.join(fixture, 'service-remote.git');
  const serviceRetained = path.join(fixture, 'service');
  for (const repository of [workspaceSeed, serviceSeed]) fs.mkdirSync(repository);

  fs.writeFileSync(path.join(workspaceSeed, 'AGENTS.md'), '# Multi repository Finish fixture\n');
  fs.mkdirSync(path.join(workspaceSeed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(workspaceSeed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(workspaceSeed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  writeExecutable(path.join(workspaceSeed, 'projects', 'product', 'buildr'), fakeBuildr);
  command(workspaceSeed, 'git', ['init', '-b', 'dev']);
  command(workspaceSeed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(workspaceSeed, 'git', ['config', 'user.email', 'journey@example.com']);
  command(workspaceSeed, 'git', ['add', '-A']);
  command(workspaceSeed, 'git', ['commit', '-m', 'workspace baseline message intentionally unrelated']);
  command(fixture, 'git', ['init', '--bare', workspaceRemote]);
  command(workspaceSeed, 'git', ['remote', 'add', 'origin', workspaceRemote]);
  command(workspaceSeed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', workspaceRemote, retained]);

  fs.writeFileSync(path.join(serviceSeed, 'service.txt'), 'service baseline\n');
  command(serviceSeed, 'git', ['init', '-b', 'dev']);
  command(serviceSeed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(serviceSeed, 'git', ['config', 'user.email', 'journey@example.com']);
  command(serviceSeed, 'git', ['add', '-A']);
  command(serviceSeed, 'git', ['commit', '-m', 'service baseline']);
  command(fixture, 'git', ['init', '--bare', serviceRemote]);
  command(serviceSeed, 'git', ['remote', 'add', 'origin', serviceRemote]);
  command(serviceSeed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', serviceRemote, serviceRetained]);
  for (const repository of [retained, serviceRetained]) {
    command(repository, 'git', ['config', 'user.name', 'Buildr Journey']);
    command(repository, 'git', ['config', 'user.email', 'journey@example.com']);
  }

  const task = 'finish-multi-repository-task';
  const workspaceTaskRoot = path.join(retained, '.worktrees', task);
  const serviceTaskRoot = path.join(fixture, 'service-worktree');
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, workspaceTaskRoot, 'dev']);
  command(serviceRetained, 'git', ['worktree', 'add', '-b', `codex/${task}`, serviceTaskRoot, 'dev']);
  fs.writeFileSync(path.join(serviceTaskRoot, 'service.txt'), 'service delivered by Task\n');
  command(serviceTaskRoot, 'git', ['add', 'service.txt']);
  command(serviceTaskRoot, 'git', ['commit', '-m', 'implement service contribution']);
  const serviceTaskHead = command(serviceTaskRoot, 'git', ['rev-parse', 'HEAD']);
  const workspaceRemoteBefore = command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0];

  const controllerCommand = path.join(retained, 'projects', 'product', 'buildr');
  const execution = () => ({
    ready: true,
    taskId: task,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: retained,
    environmentRoot: workspaceTaskRoot,
    validationRoot: workspaceTaskRoot,
    executionRoots: [workspaceTaskRoot, serviceTaskRoot],
    allowedExecutionRoots: [workspaceTaskRoot, serviceTaskRoot],
    controller: { identity: 'fixture-controller', adapter: 'codex' },
    controllerInvocation: { command: process.execPath, argsPrefix: [controllerCommand], sourceRoot: path.dirname(controllerCommand), kind: 'stable-controller' },
    repositories: [
      { selector: 'workspace', sourcePath: '.', sourceRepository: retained, checkoutPath: workspaceTaskRoot, branch: `codex/${task}`, remote: 'origin', startPoint: 'dev', state: 'ready' },
      { selector: 'service:product/service', sourcePath: 'projects/service', sourceRepository: serviceRetained, checkoutPath: serviceTaskRoot, branch: `codex/${task}`, remote: 'origin', startPoint: 'dev', state: 'ready' },
    ],
    scopes: [
      { selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: workspaceTaskRoot, validationRoot: workspaceTaskRoot, shared: false },
      { selector: 'service:product/service', kind: 'service', sourcePath: 'projects/service', executionRoot: serviceTaskRoot, validationRoot: serviceTaskRoot, shared: false },
    ],
    resources: [],
  });
  const environment = {
    resolveTaskEnvironmentExecution: execution,
    resolveTaskEnvironmentCleanupContext: execution,
    cleanupTaskEnvironmentThroughRetainedController: async (workspaceRoot, taskId, authorization) => {
      assert.equal(path.resolve(workspaceRoot), path.resolve(retained));
      assert.equal(taskId, task);
      assert.deepEqual(Object.keys(authorization.deliveries).sort(), ['service:product/service', 'workspace']);
      assert.equal(authorization.integratedContributions.workspace.kind, 'no-contribution');
      assert.equal(authorization.integratedContributions['service:product/service'].kind, 'git-isolated-commit');
      assert.equal(authorization.deliveries.workspace, workspaceRemoteBefore);
      assert.equal(authorization.deliveries['service:product/service'], command(serviceRetained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0]);
      for (const [source, taskRoot] of [[serviceRetained, serviceTaskRoot], [retained, workspaceTaskRoot]]) {
        command(source, 'git', ['worktree', 'remove', '--force', taskRoot]);
        command(source, 'git', ['branch', '-D', `codex/${task}`]);
      }
      return { status: 'cleaned', completedAt: new Date().toISOString(), effects: [{ type: 'git-worktrees-removed', count: 2 }], diagnostic: null };
    },
  };
  const runtime = {
    ...createTaskFinishSqliteRuntime(retained, task),
    ...environment,
    ...taskDevelopmentFixture(),
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? retained : args[index + 1]) };
    },
  };
  registerTaskFinishApplication(runtime);
  startJourneyBody();
  const result = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver service contribution', '--target', retained]);

  assert.equal(result.status, 'complete', JSON.stringify(result, null, 2));
  assert.equal(result.repositories.length, 2);
  const workspace = result.repositories.find((repository) => repository.selector === 'workspace');
  const service = result.repositories.find((repository) => repository.selector === 'service:product/service');
  assert.equal(workspace.disposition, 'not-applicable');
  assert.equal(workspace.deliveryCarrier, null);
  assert.equal(workspace.delivery, null);
  assert.equal(workspace.cleanupProof.kind, 'no-contribution');
  assert.equal(service.disposition, 'applicable');
  assert.equal(service.delivery.status, 'delivered');
  assert.equal(service.deliveryCarrier.repositorySelector, 'service:product/service');
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], workspaceRemoteBefore);
  assert.equal(command(serviceRetained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], service.deliveryCarrier.head);
  assert.notEqual(service.deliveryCarrier.head, serviceTaskHead);
  assert.equal(fs.existsSync(workspaceTaskRoot), false);
  assert.equal(fs.existsSync(serviceTaskRoot), false);
  assert.equal(command(retained, 'git', ['branch', '--list', `codex/${task}`]), '');
  assert.equal(command(serviceRetained, 'git', ['branch', '--list', `codex/${task}`]), '');
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'transient', 'task-finish', 'carriers', result.runId)), false);
});

isolatedJourney('多贡献 repository 在第二个 target advance 后保存部分交付并从最早未完成处恢复', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-partial-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const createRepository = (name, files) => {
    const seed = path.join(fixture, `${name}-seed`);
    const remote = path.join(fixture, `${name}-remote.git`);
    const retainedRepository = path.join(fixture, name);
    fs.mkdirSync(seed);
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(seed, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    command(seed, 'git', ['init', '-b', 'dev']);
    command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
    command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
    command(seed, 'git', ['add', '-A']);
    command(seed, 'git', ['commit', '-m', `${name} baseline`]);
    command(fixture, 'git', ['init', '--bare', remote]);
    command(seed, 'git', ['remote', 'add', 'origin', remote]);
    command(seed, 'git', ['push', '-u', 'origin', 'dev']);
    command(fixture, 'git', ['clone', '--branch', 'dev', remote, retainedRepository]);
    command(retainedRepository, 'git', ['config', 'user.name', 'Buildr Journey']);
    command(retainedRepository, 'git', ['config', 'user.email', 'journey@example.com']);
    return { seed, remote, retained: retainedRepository };
  };
  const workspace = createRepository('workspace', {
    'AGENTS.md': '# Partial multi repository fixture\n',
    '.gitignore': '/.buildr/\n/.worktrees/\n',
    'projects/manifest.yml': 'schemaVersion: buildr.projects/v2\nprojects: {}\n',
    'projects/product/buildr': fakeBuildr,
  });
  fs.chmodSync(path.join(workspace.retained, 'projects', 'product', 'buildr'), 0o755);
  const serviceA = createRepository('service-a', { 'service.txt': 'service A baseline\n' });
  const serviceB = createRepository('service-b', { 'service.txt': 'service B baseline\n' });

  const task = 'finish-partial-multi-task';
  const workspaceTaskRoot = path.join(workspace.retained, '.worktrees', task);
  const serviceATaskRoot = path.join(fixture, 'service-a-worktree');
  const serviceBTaskRoot = path.join(fixture, 'service-b-worktree');
  for (const [repository, taskRoot] of [[workspace, workspaceTaskRoot], [serviceA, serviceATaskRoot], [serviceB, serviceBTaskRoot]]) {
    command(repository.retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, taskRoot, 'dev']);
  }
  for (const [taskRoot, content] of [[serviceATaskRoot, 'service A Task contribution\n'], [serviceBTaskRoot, 'service B Task contribution\n']]) {
    fs.writeFileSync(path.join(taskRoot, 'service.txt'), content);
    command(taskRoot, 'git', ['add', 'service.txt']);
    command(taskRoot, 'git', ['commit', '-m', 'implement Task contribution']);
  }

  const controllerCommand = path.join(workspace.retained, 'projects', 'product', 'buildr');
  const repositories = [
    { selector: 'workspace', sourcePath: '.', sourceRepository: workspace.retained, checkoutPath: workspaceTaskRoot, branch: `codex/${task}`, remote: 'origin', startPoint: 'dev', state: 'ready' },
    { selector: 'service:a', sourcePath: 'projects/service-a', sourceRepository: serviceA.retained, checkoutPath: serviceATaskRoot, branch: `codex/${task}`, remote: 'origin', startPoint: 'dev', state: 'ready' },
    { selector: 'service:b', sourcePath: 'projects/service-b', sourceRepository: serviceB.retained, checkoutPath: serviceBTaskRoot, branch: `codex/${task}`, remote: 'origin', startPoint: 'dev', state: 'ready' },
  ];
  const execution = () => ({
    ready: true,
    taskId: task,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: workspace.retained,
    environmentRoot: workspaceTaskRoot,
    validationRoot: workspaceTaskRoot,
    executionRoots: [workspaceTaskRoot, serviceATaskRoot, serviceBTaskRoot],
    allowedExecutionRoots: [workspaceTaskRoot, serviceATaskRoot, serviceBTaskRoot],
    controller: { identity: 'fixture-controller', adapter: 'codex' },
    controllerInvocation: { command: process.execPath, argsPrefix: [controllerCommand], sourceRoot: path.dirname(controllerCommand), kind: 'stable-controller' },
    repositories,
    scopes: repositories.map((repository) => ({ selector: repository.selector, kind: repository.selector === 'workspace' ? 'workspace' : 'service', sourcePath: repository.sourcePath, executionRoot: repository.checkoutPath, validationRoot: repository.checkoutPath, shared: false })),
    resources: [],
  });
  const development = taskDevelopmentFixture();
  const assertDevelopment = development.assertTaskDevelopmentCarrier;
  let carrierAssertions = 0;
  let advancedServiceB = null;
  development.assertTaskDevelopmentCarrier = (...args) => {
    carrierAssertions += 1;
    if (carrierAssertions === 5) {
      fs.writeFileSync(path.join(serviceB.retained, 'target-advance.txt'), 'advance target after all carriers are verified\n');
      command(serviceB.retained, 'git', ['add', 'target-advance.txt']);
      command(serviceB.retained, 'git', ['commit', '-m', 'advance service B target']);
      command(serviceB.retained, 'git', ['push', 'origin', 'dev']);
      advancedServiceB = command(serviceB.retained, 'git', ['rev-parse', 'HEAD']);
    }
    return assertDevelopment(...args);
  };
  const environment = {
    resolveTaskEnvironmentExecution: execution,
    resolveTaskEnvironmentCleanupContext: execution,
    cleanupTaskEnvironmentThroughRetainedController: async (_workspaceRoot, _taskId, authorization) => {
      assert.equal(authorization.integratedContributions.workspace.kind, 'no-contribution');
      assert.equal(authorization.integratedContributions['service:a'].kind, 'git-isolated-commit');
      assert.equal(authorization.integratedContributions['service:b'].kind, 'git-isolated-commit');
      for (const [repository, taskRoot] of [[serviceA, serviceATaskRoot], [serviceB, serviceBTaskRoot], [workspace, workspaceTaskRoot]]) {
        command(repository.retained, 'git', ['worktree', 'remove', '--force', taskRoot]);
        command(repository.retained, 'git', ['branch', '-D', `codex/${task}`]);
      }
      return { status: 'cleaned', completedAt: new Date().toISOString(), effects: [{ type: 'git-worktrees-removed', count: 3 }], diagnostic: null };
    },
  };
  const runtime = {
    ...createTaskFinishSqliteRuntime(workspace.retained, task),
    ...environment,
    ...development,
    optionValue: (args, name, fallback) => {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget: (args) => {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? workspace.retained : args[index + 1]) };
    },
  };
  registerTaskFinishApplication(runtime);
  startJourneyBody();
  const commitMessage = 'fix(task-finish): deliver multiple repositories';
  const first = await runtime.taskFinish('run', ['--task', task, '--commit-message', commitMessage, '--target', workspace.retained]);

  assert.equal(first.status, 'blocked', JSON.stringify(first, null, 2));
  assert.equal(first.primaryFailure.code, 'task-finish.target-race');
  assert.ok(advancedServiceB);
  const firstA = first.repositories.find((repository) => repository.selector === 'service:a');
  const firstB = first.repositories.find((repository) => repository.selector === 'service:b');
  assert.equal(firstA.delivery.status, 'delivered');
  assert.equal(firstB.delivery, null);
  assert.equal(command(serviceA.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], firstA.deliveryCarrier.head);
  assert.equal(command(serviceB.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], advancedServiceB);

  const second = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', first.resume.token, '--target', workspace.retained]);
  assert.equal(second.status, 'complete', JSON.stringify(second, null, 2));
  const secondA = second.repositories.find((repository) => repository.selector === 'service:a');
  const secondB = second.repositories.find((repository) => repository.selector === 'service:b');
  assert.equal(secondA.delivery.status, 'delivered');
  assert.equal(secondA.delivery.targetDisposition, 'carrier');
  assert.equal(secondA.delivery.containment, null);
  assert.equal(secondA.deliveryCarrier.identity, firstA.deliveryCarrier.identity);
  assert.equal(secondA.deliveryCarrier.head, firstA.deliveryCarrier.head);
  assert.equal(secondA.deliveryCarrier.preparedAt, firstA.deliveryCarrier.preparedAt);
  assert.equal(secondA.delivery.finalRemoteRef, firstA.delivery.finalRemoteRef);
  assert.equal(secondB.delivery.status, 'delivered');
  assert.equal(secondB.deliveryCarrier.expectedTargetRef, advancedServiceB);
  assert.equal(command(serviceB.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], secondB.deliveryCarrier.head);
  assert.equal(fs.existsSync(workspaceTaskRoot), false);
  assert.equal(fs.existsSync(serviceATaskRoot), false);
  assert.equal(fs.existsSync(serviceBTaskRoot), false);
  assert.equal(fs.existsSync(path.join(workspace.retained, '.buildr', 'transient', 'task-finish', 'carriers', second.runId)), false);
});

test('修改进程环境的 Task Finish Journey 保持串行', async (t) => {
  for (const { name, run } of processEnvironmentJourneys) await t.test(name, run);
});

test('使用独立临时根的 Task Finish Journey 保持资源隔离', async (t) => {
  await Promise.all(isolatedJourneys.map(({ name, run }) => t.test(name, run)));
});
