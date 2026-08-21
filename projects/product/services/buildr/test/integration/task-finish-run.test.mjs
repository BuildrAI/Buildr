import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import {
  createFinishRun as createFinishRunWithSqlite,
  executeFinishRun as executeFinishRunWithSqlite,
  FINISH_PHASES,
  finishResult,
  inspectFinishRun as inspectFinishRunWithSqlite,
  readTaskFinishResults as readTaskFinishResultsWithSqlite,
  readFinishRun as readFinishRunWithSqlite,
} from '../../src/task/application/finish/task-finish-run.mjs';
import { normalizeTaskFinishRepositorySet } from '../../src/task/application/finish/task-finish-repository-set.mjs';

const runtimes = new Map();

function runtimeFor(root, task = null) {
  let runtime = runtimes.get(root);
  if (!runtime) {
    runtime = createRuntime();
    runtimes.set(root, runtime);
  }
  if (task && !runtime.__finishTestTasks?.has(task)) {
    runtime.__finishTestTasks ||= new Set();
    runtime.createTaskRecord(root, { taskId: task, title: `Finish ${task}`, intent: 'SQLite-only Finish test.', projects: [], services: [], changes: [] });
    runtime.__finishTestTasks.add(task);
  }
  return runtime;
}

function createFinishRun(options) {
  return createFinishRunWithSqlite({ ...options, runtime: options.runtime || runtimeFor(options.root, options.identity.task) });
}

function executeFinishRun(options) {
  return executeFinishRunWithSqlite({ ...options, runtime: options.runtime || runtimeFor(options.root, options.run.identity.task) });
}

function readFinishRun(options) {
  return readFinishRunWithSqlite({ ...options, runtime: options.runtime || runtimeFor(options.root) });
}

function inspectFinishRun(options) {
  return inspectFinishRunWithSqlite({ ...options, runtime: options.runtime || runtimeFor(options.root) });
}

function readTaskFinishResults(options) {
  return readTaskFinishResultsWithSqlite({ ...options, runtime: options.runtime || runtimeFor(options.root, options.taskId) });
}

test('Finish query ignores old File Store and reads only SQLite completion', (t) => {
  const root = fixture(t);
  const task = 'terminal-task';
  runtimeFor(root, task);
  const oldRoot = path.join(root, '.buildr', 'task-finish');
  const runs = path.join(oldRoot, 'runs');
  const completed = path.join(oldRoot, 'completed');
  fs.mkdirSync(runs, { recursive: true });
  fs.mkdirSync(completed, { recursive: true });
  fs.writeFileSync(path.join(runs, 'old.json'), '{"schemaVersion":"buildr.task-finish-run/v1"}\n');
  fs.writeFileSync(path.join(completed, 'old.json'), '{"schemaVersion":"buildr.task-finish-completion/v1"}\n');
  const query = readTaskFinishResults({ root, taskId: task });
  assert.deepEqual(query.results, []);
  assert.deepEqual(query.diagnostics, []);
  assert.equal(fs.existsSync(path.join(runs, 'old.json')), true);
  assert.equal(fs.existsSync(path.join(completed, 'old.json')), true);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Finish SQLite Test\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174002\nname: Finish SQLite Test\ndescription: Finish SQLite Test\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  return root;
}

function identity(root, task = 'finish-handoff') {
  return {
    task,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content-target',
    agent: 'codex',
    targetBranch: 'dev',
    remote: null,
    environmentRoot: root,
    workspaceRoot: root,
  };
}

function passingHandlers(calls = [], carrierHead = 'abc') {
  return Object.fromEntries(FINISH_PHASES.map((phase) => [phase, async () => {
    calls.push(phase);
    if (phase === 'prepare') return { status: 'passed', output: { deliveryCarrier: { identity: `carrier-${carrierHead}`, head: carrierHead, tree: `tree-${carrierHead}`, branch: 'codex/finish-handoff' } } };
    if (phase === 'verify') return { status: 'passed', output: { equivalence: { status: 'equivalent', formalVerificationExecutions: 0, carrierIdentity: `carrier-${carrierHead}` } } };
    if (phase === 'deliver') return { status: 'passed', output: { delivery: { status: 'delivered', carrierRef: carrierHead } } };
    if (phase === 'cleanup') return { status: 'passed', output: { completion: { status: 'complete', receipt: '/tmp/complete.json' } } };
    return { status: 'passed' };
  }]));
}

test('单次产品调用消费 handoff 并完成五阶段，formal Verification 恒为零', async (t) => {
  const root = fixture(t);
  const calls = [];
  const result = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'normal', identity: identity(root) }), handlers: passingHandlers(calls) });
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v3');
  assert.equal(result.status, 'complete', JSON.stringify(result.primaryFailure));
  assert.deepEqual(calls, FINISH_PHASES);
  assert.deepEqual(result.phases.map((phase) => phase.id), FINISH_PHASES);
  assert.equal(result.handoff.identity, 'sha256-handoff');
  assert.deepEqual(result.resolvedContext.capability, { id: 'buildr.task-finish', version: 1 });
  assert.deepEqual(result.resolvedContext.task, { taskId: 'finish-handoff' });
  assert.deepEqual(result.resolvedContext.handoff, { identity: 'sha256-handoff' });
  assert.deepEqual(result.resolvedContext.candidate, { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content-target' });
  assert.equal(result.resolvedContext.environment, undefined);
  assert.deepEqual(result.resolvedContext.delivery, { agent: 'codex', targetBranch: 'dev', remote: null, repositorySetIdentity: null, repositories: [] });
  assert.match(result.resolvedContext.identity, /^sha256-/);
  assert.deepEqual(result.candidate, { identity: 'sha256-candidate', generation: 1, contentTargetIdentity: 'sha256-content-target' });
  assert.equal(result.carrier.identity, 'carrier-abc');
  assert.equal(result.equivalence.status, 'equivalent');
  assert.equal(result.metrics.formalVerificationExecutions, 0);
  assert.match(result.nextAction, /是否进行任务复盘.*Token 数据仅在 Agent 可取得时记录/);
  assert.equal(Object.hasOwn(result.identity, 'project'), false);
  assert.equal(Object.hasOwn(result.identity, 'change'), false);
});

test('resolvedContext identity只由run identity确定，terminal legacy v2保持只读兼容', (t) => {
  const root = fixture(t);
  const runtime = runtimeFor(root, 'resolved-context');
  const run = createFinishRun({ root, runId: 'resolved-context', identity: identity(root, 'resolved-context'), runtime });
  runtime.writeTaskFinishRunPersistence(root, run);
  const first = inspectFinishRun({ root, runId: run.runId, runtime });
  const second = inspectFinishRun({ root, runId: run.runId, runtime });
  assert.deepEqual(first.resolvedContext, second.resolvedContext);

  const legacy = { ...first };
  delete legacy.resolvedContext;
  runtime.finalizeTaskFinishPersistence(root, { run: { ...run, status: 'complete', completedAt: run.updatedAt }, result: legacy, completion: null });
  const inspected = inspectFinishRun({ root, runId: run.runId, runtime });
  assert.equal(inspected.resolvedContext, null);
  const queried = readTaskFinishResults({ root, taskId: 'resolved-context', runtime });
  assert.equal(queried.results[0].result.resolvedContext, null);
});

test('run identity 强制绑定 Development handoff/Candidate/Content Target，且不回退旧文件协议', (t) => {
  const root = fixture(t);
  const runtime = runtimeFor(root, 'finish-handoff');
  const run = createFinishRun({ root, runId: 'current', identity: identity(root), runtime });
  assert.equal(run.schemaVersion, 'buildr.task-finish-run/v3');
  for (const field of ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity']) {
    const invalid = identity(root);
    delete invalid[field];
    assert.throws(() => createFinishRun({ root, runId: `missing-${field.toLowerCase()}`, identity: invalid }), new RegExp(field));
  }
  fs.mkdirSync(path.join(root, '.buildr', 'task-finish', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'task-finish', 'runs', 'old-v1.json'), JSON.stringify({ schemaVersion: 'buildr.task-finish-run/v1', runId: 'old-v1', phases: [] }));
  assert.throws(() => readFinishRun({ root, runId: 'old-v1' }), /Unknown Task Finish run/);
  runtime.writeTaskFinishRunPersistence(root, run);
  const changed = { ...identity(root), candidateIdentity: 'sha256-candidate-2', candidateGeneration: 2 };
  assert.throws(
    () => createFinishRun({ root, runId: 'different', identity: changed, runtime }),
    (error) => error.code === 'task_finish.current_run_identity_conflict'
      && error.details.currentRunId === 'current'
      && error.details.currentIdentityDigest !== error.details.requestedIdentityDigest,
  );
});

test('bounded v2 current run 继续由 legacy singleton handler 恢复', async (t) => {
  const root = fixture(t);
  const calls = [];
  const run = createFinishRun({ root, runId: 'legacy-v2-resume', identity: identity(root, 'legacy-v2-resume') });
  run.schemaVersion = 'buildr.task-finish-run/v2';
  const result = await executeFinishRun({ root, run, handlers: passingHandlers(calls, 'legacy-head') });
  assert.equal(result.status, 'complete');
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v3');
  assert.deepEqual(calls, FINISH_PHASES);
  assert.equal(result.carrier.head, 'legacy-head');
});

test('多仓库 Result 为 self-bootstrap 选择唯一 Workspace carrier 而不伪装聚合 carrier', (t) => {
  const root = fixture(t);
  const task = 'finish-workspace-carrier-projection';
  const contribution = (selector) => ({
    identity: `sha256-${selector}-contribution`,
    originalBaseline: { head: `${selector}-before`, tree: `${selector}-before-tree` },
    source: { head: `${selector}-after`, tree: `${selector}-after-tree` },
  });
  const repositories = normalizeTaskFinishRepositorySet([
    {
      selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot: path.join(root, '.worktrees', task),
      environmentBranch: `codex/${task}`, targetBranch: 'dev', remote: 'origin', disposition: 'applicable', reason: null,
      taskContribution: contribution('workspace'),
    },
    {
      selector: 'service:example', sourcePath: 'projects/example', retainedRoot: path.join(root, 'projects/example'), taskRoot: path.join(root, '.worktrees', task, 'projects/example'),
      environmentBranch: `codex/${task}`, targetBranch: 'dev-service', remote: 'upstream', disposition: 'applicable', reason: null,
      taskContribution: contribution('service'),
    },
  ]);
  const run = createFinishRun({
    root,
    runId: 'workspace-carrier-projection',
    identity: { ...identity(root, task), targetBranch: null, remote: null, repositories },
  });
  for (const state of run.repositories) {
    state.deliveryCarrier = { identity: `sha256-${state.selector}-carrier`, repositorySelector: state.selector, head: `${state.selector}-head`, activationPaths: state.selector === 'workspace' ? ['projects/product/services/buildr/src/example.mjs'] : ['service.txt'] };
    state.equivalence = { status: 'equivalent', selector: state.selector };
    state.delivery = { status: 'delivered', selector: state.selector, carrierRef: state.deliveryCarrier.head, finalRemoteRef: state.deliveryCarrier.head, remoteAfterRef: state.deliveryCarrier.head };
  }
  run.status = 'complete';
  run.completedAt = run.updatedAt;
  run.phases.forEach((phase) => { phase.status = 'passed'; });

  const result = finishResult(run);
  assert.equal(result.carrier.repositorySelector, 'workspace');
  assert.equal(result.delivery.selector, 'workspace');
  assert.equal(result.identity.targetBranch, 'dev');
  assert.equal(result.identity.remote, 'origin');
  assert.equal(result.repositories.length, 2);
  assert.equal(result.carrierSetIdentity === result.carrier.identity, false);
});

test('carrier equivalence 缺陷终止 run 并返回 Task Development', async (t) => {
  const root = fixture(t);
  const calls = [];
  const handlers = passingHandlers(calls);
  handlers.verify = async () => {
    calls.push('verify');
    return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Carrier content changed.' } };
  };
  const result = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'defect', identity: identity(root, 'defect') }), handlers });
  assert.equal(result.status, 'failed');
  assert.equal(result.nextWorkflow, 'task-development');
  assert.equal(result.nextAction, null);
  assert.equal(result.primaryFailure.phase, 'verify');
  assert.deepEqual(calls, ['preflight', 'prepare', 'verify']);
  assert.equal(result.resume, null);
  assert.equal(result.metrics.formalVerificationExecutions, 0);
});

test('连续 target race 每次使用新精确 token 重建 carrier，复用 Candidate 且不执行 formal Verification', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.deliver = async () => {
    firstCalls.push('deliver');
    return { status: 'blocked', failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target changed.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'target-race', identity: identity(root, 'target-race') }), handlers });
  assert.equal(first.status, 'blocked');
  assert.equal(first.nextWorkflow, null);
  assert.equal(first.nextAction, 'repeat-task-finish-run-with-resume-token');
  assert.match(first.resume.token, /^sha256-/);
  assert.deepEqual(firstCalls, ['preflight', 'prepare', 'verify', 'deliver']);
  const secondCalls = [];
  const secondHandlers = passingHandlers(secondCalls, 'def');
  secondHandlers.deliver = async () => {
    secondCalls.push('deliver');
    return { status: 'blocked', failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target changed again.' } };
  };
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'target-race' }), handlers: secondHandlers, resumeToken: first.resume.token });
  assert.equal(second.status, 'blocked');
  assert.deepEqual(secondCalls, ['prepare', 'verify', 'deliver']);
  assert.match(second.resume.token, /^sha256-/);
  assert.notEqual(second.resume.token, first.resume.token);
  const thirdCalls = [];
  const third = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'target-race' }), handlers: passingHandlers(thirdCalls, 'ghi'), resumeToken: second.resume.token });
  assert.equal(third.status, 'complete');
  assert.deepEqual(thirdCalls, ['prepare', 'verify', 'deliver', 'cleanup']);
  assert.equal(third.candidate.identity, 'sha256-candidate');
  assert.equal(third.candidate.generation, 1);
  assert.equal(third.carrier.head, 'ghi');
  assert.equal(third.phases.find((phase) => phase.id === 'preflight').attempts, 1);
  assert.equal(third.phases.find((phase) => phase.id === 'prepare').attempts, 3);
  assert.equal(third.phases.find((phase) => phase.id === 'verify').attempts, 3);
  assert.equal(third.phases.find((phase) => phase.id === 'deliver').attempts, 3);
  assert.equal(third.metrics.formalVerificationExecutions, 0);
  assert.match(third.nextAction, /任务复盘/);
  assert.equal(inspectFinishRun({ root, runId: 'target-race' }).status, 'complete');
});

test('retained Doctor blocked保留partial delivery并只恢复deliver与cleanup', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.deliver = async () => {
    firstCalls.push('deliver');
    return {
      status: 'blocked',
      failure: { operation: 'retained-doctor', failureClass: 'transient-external-condition', code: 'task-finish.retained-doctor-failed', message: 'Selected Agent Doctor is not ready.' },
      output: {
        delivery: {
          status: 'activation-blocked',
          targetDisposition: 'carrier',
          carrierRef: 'abc',
          remoteAfterRef: 'abc',
          finalRemoteRef: 'abc',
          activation: { status: 'blocked', doctorCode: 'task-finish.retained-doctor-failed' },
          retainedDoctor: 'blocked',
        },
      },
    };
  };

  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'doctor-resume', identity: identity(root, 'doctor-resume') }), handlers });
  assert.equal(first.status, 'blocked');
  assert.equal(first.primaryFailure.operation, 'retained-doctor');
  assert.equal(first.delivery.status, 'activation-blocked');
  assert.equal(first.delivery.remoteAfterRef, 'abc');
  assert.equal(first.phases.find((phase) => phase.id === 'cleanup').status, 'pending');
  assert.match(first.resume.token, /^sha256-/);

  const secondCalls = [];
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'doctor-resume' }), handlers: passingHandlers(secondCalls), resumeToken: first.resume.token });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['deliver', 'cleanup']);
  assert.equal(second.delivery.status, 'delivered');
  assert.equal(second.phases.find((phase) => phase.id === 'prepare').attempts, 1);
  assert.equal(second.phases.find((phase) => phase.id === 'verify').attempts, 1);
  assert.equal(second.phases.find((phase) => phase.id === 'deliver').attempts, 2);
  assert.equal(second.metrics.formalVerificationExecutions, 0);
});

test('cleanup 暂态阻塞恢复只重试 cleanup', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.cleanup = async () => {
    firstCalls.push('cleanup');
    return { status: 'blocked', failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: 'task-finish.environment-busy', message: 'Task-owned process is still running.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'cleanup-resume', identity: identity(root, 'cleanup-resume') }), handlers });
  assert.equal(first.status, 'cleanup_pending');
  const secondCalls = [];
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'cleanup-resume' }), handlers: passingHandlers(secondCalls), resumeToken: first.resume.token });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['cleanup']);
  assert.equal(second.phases.find((phase) => phase.id === 'verify').attempts, 1);
  assert.equal(second.metrics.formalVerificationExecutions, 0);
});
