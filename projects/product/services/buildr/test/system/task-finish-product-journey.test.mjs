import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { registerTaskDevelopmentApplication } from '../../src/application/task-development/task-development-application.mjs';
import { registerTaskFinishApplication } from '../../src/application/task-finish/task-finish-application.mjs';
import { createTaskFinishProductHandlers } from '../../src/application/task-finish/task-finish-product-executor.mjs';
import { executeFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';
import { registerContentTargetObserver } from '../../src/infrastructure/content/content-target-observer.mjs';
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
else if (args[0] === 'app' && args[1] === 'launcher' && ['install', 'status'].includes(args[2])) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  output({
    schemaVersion: 'buildr.launcher-status/v1', platform: 'darwin', channel: 'development',
    target: '/Applications/Buildr Dev.app', installed: true,
    identity: { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', source: 'checkout', buildId: head.slice(0, 12) + '-fixture', checkout: { head, dirty: false } },
  });
}
else if (args[0] === 'verification' && args[1] === 'run') {
  const targetIdentity = option('--target-identity');
  const checks = options('--capability').map((id) => ({ id, title: id, status: 'passed', exitCode: 0, durationMs: 7, stdout: '', stderr: '' }));
  output({
    schemaVersion: 'buildr.verification-execution/v1', status: 'passed', target: { identity: targetIdentity, stable: true },
    workspaceNode: { identity: { digest: 'sha256-workspace-node', version: '22.4.1' } },
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
  const candidate = { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content-target', taskContextIdentity: 'sha256-task-context', policyIdentity: 'sha256-policy' };
  const gates = {
    planning: { targetIdentity: 'sha256-planning-target', resultDigest: 'sha256-planning', outcome: 'ready' },
    verification: { targetIdentity: 'sha256-verification-target', resultDigest: 'sha256-verification', outcome: 'passed' },
    completion: { targetIdentity: 'sha256-completion-target', resultDigest: 'sha256-completion', outcome: 'ready' },
  };
  const decision = { outcome: 'proceed', candidateIdentity: candidate.identity, summary: 'ready', risks: [] };
  const handoff = { identity: 'sha256-handoff', candidate, gates, decision };
  const receipt = { candidate, gates, decision, handoffs: [handoff] };
  let taskRecord = null;
  return {
    inspectTaskRecord: (_root, task) => ({ record: taskRecord || { taskId: task, status: 'active', result: null } }),
    completeTaskRecordFromFinish: (_root, task) => {
      if (!taskRecord) taskRecord = { taskId: task, status: 'active', result: null };
      if (taskRecord.status === 'active') taskRecord = { ...taskRecord, status: 'completed', result: { summary: 'Formal Task Finish 已完成交付与环境清理。', noChange: false } };
      return { operation: 'complete', status: 'completed', taskId: task, record: taskRecord, recordDigest: taskDevelopmentDigest(taskRecord), effects: [{ type: 'updated', taskId: task }] };
    },
    inspectTaskDevelopment: () => ({ development: { receipt, applicability: { handoff: 'current' } } }),
    assertTaskDevelopmentCarrier: () => ({ status: 'equivalent', development: { receipt, applicability: { handoff: 'current' } }, effects: [] }),
  };
}

function realTaskDevelopmentFixture({ task, environmentRoot, retained, environment }) {
  let receipt = null;
  let savedObservation = null;
  let taskRecord = { taskId: task, intent: 'Reuse the same Candidate after Delivery Baseline advance.', scope: { projects: ['product'], services: [] }, changes: [], status: 'active', result: null };
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
      if (changed) taskRecord = { ...taskRecord, status: 'completed', result: { summary: 'Formal Task Finish 已完成交付与环境清理。', noChange: false } };
      return { operation: 'complete', status: 'completed', taskId: task, record: taskRecord, recordDigest: taskDevelopmentDigest(taskRecord), effects: changed ? [{ type: 'updated', taskId: task }] : [] };
    },
    observeTaskVerificationDeclarations: () => [{
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
        capabilities: [{ project: 'product', capability: 'product.delivery', outcome: 'passed', facts: ['Passed.'] }],
        coverageGaps: [], conclusion: { outcome: 'passed' },
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
  runtime.recordTaskDevelopmentPolicy(retained, task, { capabilities: [{ project: 'product', capability: 'product.delivery', required: true }], coverageGaps: [], overrides: [] });
  runtime.freezeTaskDevelopmentCandidate(retained, task, { planningTargetIdentity });
  runtime.decideTaskDevelopment(retained, task, { outcome: 'proceed', summary: 'Current gates.', risks: [] });
  runtime.createTaskDevelopmentHandoff(retained, task);
  const before = runtime.inspectTaskDevelopment(retained, task);
  assert.equal(before.development.applicability.handoff, 'current');
  return runtime;
}

test('retained Doctor阻塞后经自举后继commit恢复同一run并完成cleanup', async (t) => {
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
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' }, executable: process.execPath }),
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
  const retainedHeadBeforeBackpressure = command(retained, 'git', ['rev-parse', 'HEAD']);
  runtime.openTaskExecutionRecord = () => { throw Object.assign(new Error('Injected execution record quota backpressure.'), { code: 'task_execution_record_quota_exceeded', nextAction: 'cleanup eligible execution records' }); };
  const backpressure = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver journey candidate', '--target', retained]);
  assert.equal(backpressure.status, 'blocked');
  assert.equal(backpressure.runId, null);
  assert.equal(backpressure.executionRecord.status, 'blocked');
  assert.equal(runtime.readTaskFinishRunPersistence(retained, { taskId: task }, { optional: true }), null);
  assert.equal(command(retained, 'git', ['rev-parse', 'HEAD']), retainedHeadBeforeBackpressure);
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'task-finish', 'carriers')), false);
  assert.equal(fs.existsSync(environmentRoot), true);
  runtime.openTaskExecutionRecord = openTaskExecutionRecord;
  const doctorBlocked = await runtime.taskFinish('run', ['--task', task, '--commit-message', 'fix(task-finish): deliver journey candidate', '--target', retained]);
  assert.equal(doctorBlocked.status, 'blocked');
  assert.equal(doctorBlocked.primaryFailure.operation, 'retained-doctor');
  assert.equal(doctorBlocked.primaryFailure.code, 'task-finish.retained-doctor-failed');
  assert.equal(doctorBlocked.delivery.status, 'activation-blocked');
  assert.equal(doctorBlocked.delivery.remoteAfterRef, doctorBlocked.carrier.head);
  assert.equal(doctorBlocked.delivery.retainedDoctor, 'blocked');
  assert.deepEqual(doctorBlocked.phases.find((phase) => phase.id === 'deliver').operations, []);
  assert.equal(doctorBlocked.executionRecord.status, 'retained');
  const frozenBeforeOverride = runtime.readTaskFinishRunPersistence(retained, { taskId: task }).run;
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--run', doctorBlocked.runId, '--resume', doctorBlocked.resume.token, '--commit-message', 'fix(task-finish): override frozen message', '--target', retained]),
    (error) => error.code === 'task_finish.commit_message_override',
  );
  const frozenAfterOverride = runtime.readTaskFinishRunPersistence(retained, { taskId: task }).run;
  assert.equal(frozenAfterOverride.identityDigest, frozenBeforeOverride.identityDigest);
  assert.equal(frozenAfterOverride.deliveryCommit.identity, frozenBeforeOverride.deliveryCommit.identity);
  assert.equal(frozenAfterOverride.resume.token, frozenBeforeOverride.resume.token);
  assert.equal(doctorBlocked.executionRecord.outcome, 'blocked');
  const firstRecords = runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records;
  assert.equal(firstRecords.length, 1);
  const firstBodyRoot = path.join(retained, firstRecords[0].body.locator);
  const firstSummary = JSON.parse(fs.readFileSync(path.join(firstBodyRoot, 'summary.json'), 'utf8'));
  assert.deepEqual(firstSummary.phases.find((phase) => phase.id === 'deliver').operations.filter((operation) => operation.id === 'deliver-push' || operation.id === 'deliver-target-readback').map((operation) => operation.id), ['deliver-push', 'deliver-target-readback']);
  const firstBodyText = ['summary.json', 'timeline.json', 'diagnostics.json', 'stdout.txt', 'stderr.txt'].map((name) => fs.readFileSync(path.join(firstBodyRoot, name), 'utf8')).join('\n');
  assert.equal(firstBodyText.includes(retained), false);
  assert.equal(firstBodyText.includes(environmentRoot), false);
  assert.equal(firstBodyText.includes(doctorBlocked.resume.token), false);
  assert.doesNotMatch(JSON.stringify(firstSummary), /"(?:command|args|cwd|workspaceRoot|environmentRoot|resumeToken)"\s*:/);
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'transient', 'task-finish', 'diagnostics', firstRecords[0].runIdentity)), false);
  assert.equal(fs.existsSync(environmentRoot), true);
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'active');
  await assert.rejects(
    runtime.taskFinish('run', ['--task', task, '--run', doctorBlocked.runId, '--resume', 'sha256-wrong-resume-token', '--target', retained]),
    (error) => error.code === 'task_finish.resume_token_mismatch',
  );
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 1);

  fs.unlinkSync(path.join(retained, '.doctor-not-ready'));
  command(retained, 'git', ['add', '.doctor-not-ready']);
  command(retained, 'git', ['commit', '-m', 'activate self-bootstrap runtime']);
  const activationHead = command(retained, 'git', ['rev-parse', 'HEAD']);
  command(retained, 'git', ['push', 'origin', 'dev']);
  const cleanupBlocked = await runtime.taskFinish('run', ['--task', task, '--run', doctorBlocked.runId, '--resume', doctorBlocked.resume.token, '--target', retained]);
  assert.equal(cleanupBlocked.status, 'cleanup_pending');
  assert.equal(cleanupBlocked.primaryFailure.code, 'task_record_write_failed');
  assert.equal(cleanupBlocked.delivery.targetDisposition, 'already-contained');
  assert.equal(cleanupBlocked.delivery.carrierRef, doctorBlocked.carrier.head);
  assert.equal(cleanupBlocked.delivery.finalRemoteRef, activationHead);
  assert.equal(cleanupBlocked.executionRecord.status, 'retained');
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'active');
  const sealTaskExecutionRecord = runtime.sealTaskExecutionRecord;
  runtime.sealTaskExecutionRecord = () => { throw Object.assign(new Error('Injected execution record seal failure.'), { code: 'task_execution_record_seal_injected' }); };
  const result = await runtime.taskFinish('run', ['--task', task, '--run', cleanupBlocked.runId, '--resume', cleanupBlocked.resume.token, '--target', retained]);
  runtime.sealTaskExecutionRecord = sealTaskExecutionRecord;

  assert.equal(result.status, 'complete', JSON.stringify(result, null, 2));
  assert.deepEqual(result.phases.map(({ id, status }) => [id, status]), [
    ['preflight', 'passed'], ['prepare', 'passed'], ['verify', 'passed'], ['deliver', 'passed'], ['cleanup', 'passed'],
  ]);
  assert.equal(result.metrics.canonicalCliInvocations, 3);
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
  assert.equal(result.delivery.targetDisposition, 'already-contained');
  assert.equal(result.delivery.remoteAfterRef, activationHead);
  assert.equal(result.delivery.finalRemoteRef, activationHead);
  assert.equal(result.carrier.deliveryBaseline.head, advancedBaselineHead);
  assert.notEqual(result.carrier.head, candidateHead);
  assert.deepEqual(result.phases.find((phase) => phase.id === 'deliver').operations, []);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(command(retained, 'git', ['rev-parse', 'HEAD']), activationHead);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], activationHead);
  assert.equal(command(retained, 'git', ['show', `${result.carrier.head}:.buildr/tracked-metadata.json`]), 'baseline metadata');
  assert.equal(command(retained, 'git', ['show', `${result.carrier.head}:baseline-advance.txt`]), 'new delivery baseline');
  assert.equal(result.carrier.changedPaths.includes('.buildr/tracked-metadata.json'), false);
  assert.equal(result.carrier.changedPaths.some((changedPath) => changedPath.split('/').includes('.buildr')), false);
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${result.carrier.head}:projects/product/openspec/changes/archive/finish-journey/.buildr/convergence-receipt.json`], { cwd: retained }).status, 0);
  assert.equal(result.completion.receipt, `workspace-sqlite:task-finish-completion/${task}`);
  const completion = runtime.readTaskFinishCompletionPersistence(retained, { taskId: task }, { optional: false }).completion;
  assert.equal(completion.status, 'complete');
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'task-finish', 'carriers', result.runId)), false);
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'completed');
  assert.deepEqual(runtime.inspectTaskRecord(retained, task).record.result, { summary: 'Formal Task Finish 已完成交付与环境清理。', noChange: false });
  assert.equal(result.executionRecord.status, 'attention');
  assert.equal(result.executionRecord.lifecycleStatus, 'open');
  const finishRecords = runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records;
  assert.equal(finishRecords.length, 3);
  assert.equal(new Set(finishRecords.map((record) => record.runIdentity)).size, 3);
  assert.equal(finishRecords.filter((record) => record.outcome === 'blocked').length, 2);
  assert.equal(finishRecords.filter((record) => record.outcome === 'running').length, 1);
  assert.ok(finishRecords.every((record) => record.runIdentity !== result.runId));
  const openRecord = finishRecords.find((record) => record.lifecycleStatus === 'open');
  assert.ok(openRecord);
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'transient', 'task-finish', 'diagnostics', openRecord.runIdentity)), true);
  const noOp = await runtime.taskFinish('run', ['--run', result.runId, '--target', retained]);
  assert.equal(noOp.status, 'complete');
  assert.equal(noOp.executionRecord.status, 'not-opened');
  assert.equal(runtime.listTaskExecutionRecords(retained, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 3);
});

test('同路径基线冲突保留current Candidate并经Agent-reviewed Delivery Adaptation恢复交付', async (t) => {
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
  Object.assign(runtime, {
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' }, executable: process.execPath }),
    runTaskFinishCarrierCompatibility: ({ carrier }) => ({ status: compatibilityStatus, checks: [{ id: 'product.delivery-carrier-compatibility', status: compatibilityStatus, carrierTree: carrier.tree }], evidenceIdentity: `compatibility-${carrier.tree}-${compatibilityStatus}` }),
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

  fs.writeFileSync(path.join(first.carrier.root, 'shared.txt'), 'agent-reviewed compatible meaning\n');
  command(first.carrier.root, 'git', ['add', 'shared.txt']);
  command(first.carrier.root, 'git', ['commit', '-F', '-'], { input: `${firstSubject}\n\nBuildr-Task: ${task}\n` });
  const compatibilityFailure = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', first.resume.token, '--target', retained]);
  assert.equal(compatibilityFailure.status, 'blocked');
  assert.equal(compatibilityFailure.primaryFailure.code, 'task-finish.compatibility-checks-failed');
  assert.equal(compatibilityFailure.delivery, null);
  assert.equal(fs.existsSync(environmentRoot), true);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], advancedBaselineHead);

  compatibilityStatus = 'passed';
  const second = await runtime.taskFinish('run', ['--task', task, '--run', first.runId, '--resume', compatibilityFailure.resume.token, '--target', retained]);

  assert.equal(second.status, 'complete', JSON.stringify(second, null, 2));
  assert.equal(second.reuseMode, 'agent-reviewed-delivery-adaptation');
  assert.equal(second.equivalence.semanticEquivalence, 'agent-reviewed-not-proven-by-buildr');
  assert.equal(second.carrier.adaptation.compatibilityChecks.status, 'passed');
  assert.equal(second.candidate.identity, frozen.identity);
  assert.equal(second.candidate.generation, 1);
  assert.equal(second.metrics.formalVerificationExecutions, 0);
  assert.equal(second.carrier.deliveryBaseline.head, advancedBaselineHead);
  assert.equal(second.delivery.remoteAfterRef, second.carrier.head);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], second.carrier.head);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(runtime.inspectTaskRecord(retained, task).record.status, 'completed');
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'task-finish', 'carriers', second.runId)), false);
});

test('真实 code-only 候选完成五阶段且不执行任何 OpenSpec 命令', async (t) => {
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
  const localAppChange = path.join(environmentRoot, 'projects', 'product', 'services', 'buildr', 'src', 'interfaces', 'local-app', 'runtime', 'code-only.mjs');
  fs.mkdirSync(path.dirname(localAppChange), { recursive: true });
  fs.writeFileSync(localAppChange, 'export const finishedWithoutChange = true;\n');
  command(environmentRoot, 'git', ['add', path.relative(environmentRoot, localAppChange)]);
  command(environmentRoot, 'git', ['commit', '-m', 'implement code-only candidate']);

  const hostileBin = path.join(fixture, 'hostile-bin');
  writeExecutable(path.join(hostileBin, 'node'), '#!/bin/sh\necho "unexpected incompatible Node" >&2\nexit 91\n');
  const originalPath = process.env.PATH;
  process.env.PATH = `${hostileBin}${path.delimiter}${originalPath || ''}`;
  t.after(() => { process.env.PATH = originalPath; });
  const sqliteRuntime = createTaskFinishSqliteRuntime(retained, task);
  const runtime = {
    ...sqliteRuntime,
    ...taskEnvironmentFixture({ task, environmentRoot, retained, controllerCommand: controller, controllerSourceRoot: path.dirname(controller) }),
    ...taskDevelopmentFixture(),
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' }, executable: process.execPath }),
  };
  const run = persistTaskFinishRun(runtime, retained, {
      task,
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot,
      workspaceRoot: retained,
      workspaceNodeIdentity: 'sha256-workspace-node',
    }, 'product-code-only-journey');
  /* The helper persists the SQLite current run; the executor owns subsequent checkpoints. */
  const handlers = createTaskFinishProductHandlers({ runtime, root: environmentRoot });
  const observedOperations = [];
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
  assert.equal(result.handoff.identity, 'sha256-handoff');
  assert.equal(result.candidate.identity, 'sha256-candidate');
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
  assert.equal(completion.handoffIdentity, 'sha256-handoff');
  assert.equal(completion.candidateIdentity, 'sha256-candidate');
  assert.equal(completion.candidateGeneration, 1);
  assert.equal(completion.contentTargetIdentity, 'sha256-content-target');
});
