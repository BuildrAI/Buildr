import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { registerTaskFinishApplication } from '../../src/application/task-finish/task-finish-application.mjs';
import { createFinishRun, executeFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';
import { createTaskFinishSqliteRuntime } from '../helpers/task-finish-sqlite-fixture.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function providerFailure() {
  return {
    phase: 'prepare', origin: 'product-phase-provider', operation: 'carrier-preparation', check: null,
    failureClass: 'product-execution-failure', code: 'task-finish.injected-retained-provider-defect', status: 'failed', exitCode: null,
    message: 'retained provider is defective', findings: [], diagnostic: null,
  };
}

test('full retained Application在Execution Record gate后写同一run并只给candidate allowlisted runtime', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-bootstrap-application-'));
  const environmentRoot = `${root}-task`;
  t.after(() => {
    try { spawnSync('git', ['worktree', 'remove', '--force', environmentRoot], { cwd: root }); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(environmentRoot, { recursive: true, force: true });
  });
  const task = 'bootstrap-application';
  const runtime = createTaskFinishSqliteRuntime(root, task);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr@example.com']);
  const provider = 'projects/product/services/buildr/src/application/task-finish/task-finish-product-executor.mjs';
  write(path.join(root, provider), 'export function createTaskFinishProductHandlers() { throw new Error("retained provider defect"); }\n');
  git(root, ['add', provider]);
  git(root, ['commit', '-m', 'base']);
  git(root, ['worktree', 'add', '-b', 'codex/bootstrap-application', environmentRoot, 'dev']);
  write(path.join(environmentRoot, provider), `
export function createTaskFinishProductHandlers({ runtime }) {
  if (Object.keys(runtime).length !== 6) throw new Error('runtime facade is not closed');
  if ('readTaskFinishRunPersistence' in runtime) throw new Error('canonical repository leaked to candidate provider');
  return {
    preflight: async () => ({ status: 'passed' }),
    prepare: async () => ({ status: 'passed', output: { deliveryCarrier: { identity: 'sha256-capsule-carrier' }, bootstrapRecovery: { identity: 'candidate-must-not-write-this' } } }),
    verify: async () => ({ status: 'blocked', failure: { operation: 'fixture-stop', failureClass: 'transient-external-condition', code: 'task-finish.fixture-stop', message: 'stop after provider proof' } }),
    deliver: async () => ({ status: 'failed' }),
    cleanup: async () => ({ status: 'failed' }),
  };
}
`);
  git(environmentRoot, ['add', provider]);
  git(environmentRoot, ['commit', '-m', 'fix provider']);

  Object.assign(runtime, {
    optionValue(args, name, fallback) {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget(args) {
      const index = args.indexOf('--target');
      return { args, targetRoot: path.resolve(index === -1 ? root : args[index + 1]) };
    },
    assertTaskDevelopmentCarrier() { return { status: 'equivalent', development: { receipt: { handoffs: [] } }, effects: [] }; },
    inspectTaskEnvironment() {
      return { status: 'ready', environment: { workspace: { root }, scopes: [{ selector: 'workspace', validationRoot: environmentRoot }] } };
    },
    cleanupTaskEnvironmentThroughRetainedController() {},
    completeTaskRecordFromFinish() {},
    resolveTaskEnvironmentCleanupContext() {},
    resolveTaskEnvironmentExecution() {},
    runTaskFinishCarrierCompatibility() {},
  });

  const identity = {
    task, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 4,
    contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: 'origin',
    environmentRoot, workspaceRoot: root,
  };
  const run = createFinishRun({ root, identity, runId: 'bootstrap-application-20260814000000-deadbeef', runtime });
  const injected = providerFailure();
  run.status = 'failed';
  run.primaryFailure = injected;
  run.phases[0].status = 'passed';
  run.phases[0].attempts = 1;
  run.phases[1].status = 'failed';
  run.phases[1].attempts = 1;
  run.phases[1].failure = injected;
  runtime.writeTaskFinishRunPersistence(root, run);

  registerTaskFinishApplication(runtime);
  const result = await runtime.taskFinish('run', ['--run', run.runId, '--bootstrap-recovery', '--target', root]);
  assert.equal(result.status, 'blocked');
  assert.equal(result.runId, run.runId);
  assert.equal(result.primaryFailure.phase, 'verify');
  assert.equal(result.primaryFailure.code, 'task-finish.fixture-stop');
  assert.equal(result.bootstrapRecovery.originalAttempt.primaryFailure.code, 'task-finish.injected-retained-provider-defect');
  assert.equal(result.phases.find((phase) => phase.id === 'prepare').status, 'passed');
  assert.equal(result.metrics.bootstrapRecoveryExecutions, 1);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
  const persisted = runtime.readTaskFinishRunPersistence(root, { runId: run.runId });
  assert.equal(persisted.run.runId, run.runId);
  assert.notEqual(persisted.run.bootstrapRecovery.identity, 'candidate-must-not-write-this');
  assert.equal(persisted.run.bootstrapRecovery.capsule.revocation.status, 'active');
  const resumed = await runtime.taskFinish('run', ['--run', run.runId, '--resume', result.resume.token, '--bootstrap-recovery', '--target', root]);
  assert.equal(resumed.runId, run.runId);
  assert.equal(resumed.bootstrapRecovery.identity, result.bootstrapRecovery.identity);
  assert.equal(resumed.phases.find((phase) => phase.id === 'verify').attempts, 2);
  assert.equal(runtime.listTaskExecutionRecords(root, task, { owner: 'task-finish', kind: 'finish-diagnostics' }).records.length, 2);
});

test('Execution Record拒绝时不创建bootstrap capsule', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-bootstrap-record-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const task = 'bootstrap-record-gate';
  const runtime = createTaskFinishSqliteRuntime(root, task);
  Object.assign(runtime, {
    optionValue(args, name, fallback) {
      const index = args.indexOf(name);
      return index === -1 ? fallback : args[index + 1];
    },
    withResolvedTarget(args) { return { args, targetRoot: root }; },
    assertTaskDevelopmentCarrier() { return { status: 'equivalent' }; },
    openTaskExecutionRecord() { throw Object.assign(new Error('record capacity exhausted'), { code: 'execution_record_capacity_exhausted' }); },
  });
  const identity = {
    task, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: 'origin',
    environmentRoot: path.join(root, '.worktrees', task), workspaceRoot: root,
  };
  const run = createFinishRun({ root, identity, runId: 'bootstrap-record-gate-20260814000000-deadbeef', runtime });
  const injected = providerFailure();
  run.status = 'failed';
  run.primaryFailure = injected;
  run.phases[0].status = 'passed';
  run.phases[0].attempts = 1;
  run.phases[1].status = 'failed';
  run.phases[1].attempts = 1;
  run.phases[1].failure = injected;
  runtime.writeTaskFinishRunPersistence(root, run);
  registerTaskFinishApplication(runtime);
  for (const selector of ['--source', '--module', '--manifest', '--tarball']) {
    await assert.rejects(
      () => runtime.taskFinish('run', ['--run', run.runId, '--bootstrap-recovery', selector, '/tmp/caller-code', '--target', root]),
      (error) => error.code === 'task_finish.unknown_parameter',
    );
  }
  const result = await runtime.taskFinish('run', ['--run', run.runId, '--bootstrap-recovery', '--target', root]);
  assert.equal(result.status, 'blocked');
  assert.equal(result.executionRecord.status, 'blocked');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'transient', 'task-finish', 'bootstrap-recovery')), false);
});

test('cleanup已passed后先撤销capsule authority；terminal写入失败仍以同一run恢复', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-bootstrap-terminal-resume-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const task = 'bootstrap-terminal-resume';
  const runtime = createTaskFinishSqliteRuntime(root, task);
  const identity = {
    task, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: 'origin',
    environmentRoot: path.join(root, '.worktrees', task), workspaceRoot: root,
  };
  const run = createFinishRun({ root, identity, runId: 'bootstrap-terminal-resume-20260814000000-deadbeef', runtime });
  for (const phase of run.phases) {
    phase.status = 'passed';
    phase.attempts = 1;
  }
  run.bootstrapRecovery = { identity: 'sha256-bootstrap', capsule: { revocation: { status: 'active' } } };
  runtime.writeTaskFinishRunPersistence(root, run);
  let terminalAttempts = 0;
  runtime.finalizeTaskFinishPersistence = () => {
    terminalAttempts += 1;
    if (terminalAttempts === 1) throw Object.assign(new Error('injected terminal write failure'), { code: 'task-finish.injected-terminal-write-failure' });
  };
  const revoke = (current) => ({ ...current.bootstrapRecovery, capsule: { revocation: { status: 'revoked' } } });
  const first = await executeFinishRun({ root, run, handlers: {}, runtime, bootstrapRecoveryFinalizer: revoke });
  assert.equal(first.status, 'cleanup_pending');
  assert.equal(first.bootstrapRecovery.capsule.revocation.status, 'revoked');
  assert.equal(first.nextAction, 'repeat-task-finish-run-with-bootstrap-recovery-and-resume-token');
  const persisted = runtime.readTaskFinishRunPersistence(root, { runId: run.runId }).run;
  assert.equal(persisted.runId, run.runId);
  assert.equal(persisted.bootstrapRecovery.capsule.revocation.status, 'revoked');
  const resumed = await executeFinishRun({ root, run: persisted, handlers: {}, resumeToken: persisted.resume.token, runtime, bootstrapRecoveryFinalizer: revoke });
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.runId, run.runId);
  assert.equal(terminalAttempts, 2);
});
