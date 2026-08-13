import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';

after(() => cleanupLocalTaskLifecycleSystemContext());

function capability(id, script) {
  return {
    id,
    title: id,
    scope: { project: 'demo', services: [] },
    invocation: { kind: 'command', argv: [process.execPath, '-e', script], cwd: '.' },
    applicability: { paths: ['**'], conditions: [] },
    proves: [id],
    requiredForDelivery: true,
    environment: { requires: ['node'] },
    effects: { writes: [], externalSystems: [], authorization: 'implicit' },
    resourceClaims: [],
  };
}

function setup(t, name = 'verification-execution-record') {
  const root = fs.realpathSync(copyTaskLifecycleWorkspace(t, name).root);
  const runtime = createRuntime();
  const taskId = `${name}-task`;
  runtime.createTaskRecord(root, { taskId, title: 'Verification records', intent: 'Exercise formal verification record retention.', projects: ['demo'], services: [], changes: [] });
  runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true,
    taskId,
    environmentRoot: root,
    workspaceRoot: root,
    scopes: [],
    allowedExecutionRoots: [root],
  });
  return { root, runtime, taskId, projectRoot: path.join(root, 'projects', 'demo') };
}

function declare(projectRoot, capabilities) {
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({ schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities }));
}

async function run(current, id, extra = []) {
  const previousLog = console.log;
  console.log = () => {};
  process.exitCode = 0;
  try {
    return await current.runtime.verificationRun([
      '--project', 'demo', '--capability', id, '--target-identity', `target:${id}`, '--target', current.root,
      '--environment', current.taskId, '--workspace', current.root,
      ...extra,
    ]);
  } finally {
    console.log = previousLog;
    process.exitCode = 0;
  }
}

test('session丢失后相同验证返回active record且零执行，显式retry才重跑', async (t) => {
  const current = setup(t, 'verification-active-reuse');
  const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-active-reuse-'));
  t.after(() => fs.rmSync(markerRoot, { recursive: true, force: true }));
  const marker = path.join(markerRoot, 'executions.txt');
  declare(current.projectRoot, [capability('demo.long', `require("fs").appendFileSync(${JSON.stringify(marker)}, "run\\n")`)]);
  const seal = current.runtime.sealTaskExecutionRecord;
  current.runtime.sealTaskExecutionRecord = () => {
    const error = new Error('session lost before seal');
    error.code = 'verification_test_session_lost';
    throw error;
  };
  const interrupted = await run(current, 'demo.long');
  current.runtime.sealTaskExecutionRecord = seal;
  assert.equal(interrupted.executionRecord.lifecycleStatus, 'open');

  const recovered = await run(current, 'demo.long');
  assert.equal(recovered.status, 'active');
  assert.equal(recovered.executionRecord.recordId, interrupted.executionRecord.recordId);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'run\n');

  const retried = await run(current, 'demo.long', ['--retry']);
  assert.equal(retried.status, 'passed');
  assert.equal(fs.readFileSync(marker, 'utf8'), 'run\nrun\n');
  const records = current.runtime.listTaskExecutionRecords(current.root, current.taskId).records;
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.lifecycleStatus).sort(), ['open', 'retained']);
});

test('候选 Verification 通过 Receipt 固定的 retained controller 编排 canonical record', async (t) => {
  const current = setup(t, 'verification-retained-controller');
  declare(current.projectRoot, [capability('demo.pass', 'process.stdout.write("candidate")')]);
  const candidateSource = path.join(current.root, 'candidate-product');
  const retainedSource = path.join(current.root, 'retained-product');
  fs.mkdirSync(candidateSource);
  fs.mkdirSync(retainedSource);
  current.runtime.productRoot = () => candidateSource;
  current.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true,
    taskId: current.taskId,
    environmentRoot: current.root,
    workspaceRoot: current.root,
    scopes: [],
    allowedExecutionRoots: [current.root],
    controllerInvocation: { command: process.execPath, argsPrefix: ['retained-buildr.mjs'], sourceRoot: retainedSource, kind: 'stable-controller' },
  });
  let delegated = null;
  current.runtime.runVerificationThroughRetainedController = (context, args) => {
    delegated = { context, args };
    return { status: 'delegated' };
  };

  const payload = await run(current, 'demo.pass');
  assert.equal(payload.status, 'delegated');
  assert.equal(delegated.context.controllerInvocation.sourceRoot, retainedSource);
  assert.deepEqual(delegated.args.slice(0, 4), ['--project', 'demo', '--capability', 'demo.pass']);
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 0);
});

test('formal Verification 为passed/failed/retry/drift/cancelled保留独立execution records', async (t) => {
  const current = setup(t);
  const selfSignalOutcome = process.platform === 'win32' ? 'failed' : 'cancelled';
  const cases = [
    ['demo.pass', 'process.stdout.write("token=very-secret /private/local/path")', 'passed'],
    ['demo.fail', 'process.stderr.write("fail"); process.exit(3)', 'failed'],
    ['demo.fail', 'process.stderr.write("retry"); process.exit(3)', 'failed'],
    ['demo.drift', 'require("fs").writeFileSync("drift.txt", "changed")', 'failed'],
    ['demo.cancel', 'process.kill(process.pid, "SIGTERM")', selfSignalOutcome],
  ];
  for (const [id, script, outcome] of cases) {
    declare(current.projectRoot, [capability(id, script)]);
    const payload = await run(current, id);
    assert.equal(payload.executionRecord.status, 'retained');
    assert.equal(payload.executionRecord.outcome, outcome);
    assert.equal(payload.executionRecord.lifecycleStatus, 'retained');
    assert.equal(payload.executionRecord.body.locator, undefined);
    assert.equal(fs.existsSync(payload.evidenceReference), false);
  }
  const listed = current.runtime.listTaskExecutionRecords(current.root, current.taskId, { owner: 'task-verification', kind: 'verification-execution' });
  assert.equal(listed.records.length, cases.length);
  assert.equal(new Set(listed.records.map((record) => record.runIdentity)).size, cases.length);
  assert.deepEqual(listed.records.map((record) => record.outcome).sort(), [selfSignalOutcome, 'failed', 'failed', 'failed', 'passed'].sort());
  const passedRecord = listed.records.find((record) => record.outcome === 'passed');
  const retainedStdout = fs.readFileSync(path.join(current.root, passedRecord.body.locator, 'stdout.txt'), 'utf8');
  assert.doesNotMatch(retainedStdout, /very-secret|\/private\/local\/path/);
  assert.match(retainedStdout, /token=<redacted>|<redacted-path>/);
});

test('quota/backpressure在runner启动前阻塞且不创建transient evidence', async (t) => {
  const current = setup(t, 'verification-backpressure');
  const marker = path.join(current.projectRoot, 'started.txt');
  declare(current.projectRoot, [capability('demo.blocked', `require("fs").writeFileSync(${JSON.stringify(marker)}, "started")`)]);
  const error = new Error('quota exhausted');
  error.code = 'task_execution_record_task_owner_quota_exhausted';
  error.taskExecutionRecordBusiness = true;
  error.nextAction = 'cleanup eligible records';
  current.runtime.openTaskExecutionRecord = () => { throw error; };
  await assert.rejects(() => current.runtime.verificationRun([
    '--project', 'demo', '--capability', 'demo.blocked', '--target-identity', 'target:blocked', '--target', current.root,
    '--environment', current.taskId, '--workspace', current.root,
  ]), (caught) => caught.verificationExecutionRecord.status === 'blocked');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 0);
});

test('seal失败保留open record与transient evidence供恢复', async (t) => {
  const current = setup(t, 'verification-seal-failure');
  declare(current.projectRoot, [capability('demo.pass', 'process.stdout.write("pass")')]);
  const seal = current.runtime.sealTaskExecutionRecord;
  current.runtime.sealTaskExecutionRecord = () => {
    const error = new Error('seal unavailable');
    error.code = 'verification_test_seal_failed';
    throw error;
  };
  const payload = await run(current, 'demo.pass');
  current.runtime.sealTaskExecutionRecord = seal;
  assert.equal(payload.status, 'failed');
  assert.equal(payload.executionRecord.status, 'attention');
  assert.equal(payload.executionRecord.lifecycleStatus, 'open');
  assert.equal(fs.existsSync(payload.evidenceReference), true);
  const listed = current.runtime.listTaskExecutionRecords(current.root, current.taskId);
  assert.equal(listed.records.length, 1);
  assert.equal(listed.records[0].lifecycleStatus, 'open');
});
