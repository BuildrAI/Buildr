import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after } from 'node:test';
import YAML from 'yaml';

import { taskDevelopmentDigest } from '../../src/task/domain/task-development.mjs';
import { verificationCapabilityIdentity } from '../../src/verification/infrastructure/preparation-admission.mjs';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const test = createBuildrApplicationTest('integration-verification-execution-record-application');

after(() => cleanupLocalTaskLifecycleSystemContext());

function capability(id, script) {
  return {
    id,
    title: id,
    scope: { project: 'demo', services: [] },
    proves: [id],
    evidence: ['unit'],
    usableFor: ['task-delivery'],
    discovery: { sources: ['**'] },
    invocation: { affected: { kind: 'command', argv: [process.execPath, '-e', script], cwd: '.' }, full: { kind: 'command', argv: [process.execPath, '-e', script], cwd: '.' } },
    environment: { requires: ['node'] },
    effects: { writes: [], externalSystems: [], authorization: 'implicit' },
    resourceClaims: [],
  };
}

function setup(t, name = 'verification-execution-record') {
  const root = fs.realpathSync(copyTaskLifecycleWorkspace(t, name).root);
  const runtime = t.buildrContexts.application;
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
  return { root, runtime, taskId, candidateIdentity: taskDevelopmentDigest(`${taskId}:candidate`), candidateGeneration: 1, projectRoot: path.join(root, 'projects', 'demo') };
}

function declare(projectRoot, capabilities) {
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({ schemaVersion: 'buildr.project-verification/v3', resources: [], capabilities }));
}

function plan(current, id) {
  const targetIdentity = `target:${id}`;
  const payload = current.runtime.verificationPlan([
    '--project', 'demo', '--target-kind', 'task-delivery', '--selection-scope', 'affected',
    '--target-identity', targetIdentity, '--changed-path', 'src/example.mjs', '--target', current.root,
  ]);
  const planPath = path.join(current.root, `.verification-plan-${id.replaceAll(/[^A-Za-z0-9._-]/g, '-')}.json`);
  fs.writeFileSync(planPath, JSON.stringify(payload));
  return { planPath, targetIdentity };
}

async function run(current, id, extra = []) {
  const previousLog = console.log;
  console.log = () => {};
  process.exitCode = 0;
  try {
    const planned = plan(current, id);
    return await current.runtime.verificationRun([
      '--project', 'demo', '--plan', planned.planPath, '--target-identity', planned.targetIdentity, '--target', current.root,
      '--candidate-identity', current.candidateIdentity, '--candidate-generation', String(current.candidateGeneration),
      '--environment', current.taskId, '--workspace', current.root,
      ...extra,
    ]);
  } finally {
    console.log = previousLog;
    process.exitCode = 0;
  }
}

async function runWithExit(current, id, extra = []) {
  const previousLog = console.log;
  console.log = () => {};
  process.exitCode = 0;
  try {
    const planned = plan(current, id);
    const payload = await current.runtime.verificationRun([
      '--project', 'demo', '--plan', planned.planPath, '--target-identity', planned.targetIdentity, '--target', current.root,
      '--candidate-identity', current.candidateIdentity, '--candidate-generation', String(current.candidateGeneration),
      '--environment', current.taskId, '--workspace', current.root,
      ...extra,
    ]);
    return { payload, exitCode: process.exitCode || 0 };
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

test('Formal preparation blocked时在Execution Record和process副作用前返回closed恢复请求', async (t) => {
  const current = setup(t, 'verification-preparation-blocked');
  const marker = path.join(current.projectRoot, 'must-not-start.txt');
  const selected = capability('demo.prepared', `require("fs").writeFileSync(${JSON.stringify(marker)}, "started")`);
  selected.environment.preparation = [{ project: 'demo', recipe: 'demo.prepare' }];
  declare(current.projectRoot, [selected]);
  fs.writeFileSync(path.join(current.projectRoot, 'preparation.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [{
      id: 'demo.prepare', scope: { kind: 'project' }, required: true,
      steps: [{ id: 'prepare', cwd: '.', executable: { kind: 'workspace-foundation', name: 'node' }, args: ['prepare.mjs'], inputs: ['prepare.mjs'], outputs: [{ path: '.prepared', kind: 'file' }], required: true, timeoutMs: 10_000 }],
    }],
  }));
  current.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true,
    taskId: current.taskId,
    environmentRoot: current.root,
    workspaceRoot: current.root,
    scopes: [],
    allowedExecutionRoots: [current.root],
    preparationPlan: { identity: 'sha256-plan', projects: [{ project: 'demo', source: { kind: 'project-declaration', identity: 'sha256-preparation' }, scopes: [{ selector: 'project:demo', disposition: 'not-applicable', reason: 'No base preparation.', recipes: [] }] }], capabilityPreparation: [] },
    preparationRecipes: [],
    receiptIdentity: 'sha256-receipt',
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
  });
  let opens = 0;
  const originalOpen = current.runtime.openTaskExecutionRecord;
  current.runtime.openTaskExecutionRecord = (...args) => { opens += 1; return originalOpen(...args); };
  await assert.rejects(() => run(current, selected.id), (error) => {
    assert.equal(error.code, 'verification.preparation_blocked');
    assert.equal(error.verificationAdmission.status, 'blocked');
    assert.equal(error.verificationAdmission.recovery.changesTaskScope, false);
    assert.deepEqual(error.verificationAdmission.recovery.planRequest.auxiliaryPreparation.map((item) => item.recipe), ['demo.prepare']);
    return true;
  });
  assert.equal(opens, 0);
  assert.equal(fs.existsSync(marker), false);
});

test('Formal Plan preview零副作用返回完整request，prepare后同一envelope首次run直接执行', async (t) => {
  const current = setup(t, 'verification-preparation-preview');
  const selected = capability('demo.prepared', 'void 0');
  selected.environment.preparation = [{ project: 'demo', recipe: 'demo.prepare' }];
  declare(current.projectRoot, [selected]);
  fs.writeFileSync(path.join(current.projectRoot, 'preparation.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [{
      id: 'demo.prepare', scope: { kind: 'project' }, required: true,
      steps: [{ id: 'prepare', cwd: '.', executable: { kind: 'workspace-foundation', name: 'node' }, args: ['prepare.mjs'], inputs: ['prepare.mjs'], outputs: [{ path: '.prepared', kind: 'file' }], required: true, timeoutMs: 10_000 }],
    }],
  }));
  const capabilityIdentity = verificationCapabilityIdentity(selected);
  let prepared = false;
  current.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true, taskId: current.taskId, environmentRoot: current.root, workspaceRoot: current.root,
    scopes: [], allowedExecutionRoots: [current.root],
    preparationPlan: {
      identity: prepared ? 'sha256-plan-prepared' : 'sha256-plan-base',
      projects: [{ project: 'demo', source: { kind: 'project-declaration', identity: 'sha256-preparation' }, scopes: [{ selector: 'project:demo', disposition: 'not-applicable', reason: 'No base preparation.', recipes: [] }] }],
      capabilityPreparation: prepared ? [{ capability: selected.id, capabilityIdentity, project: 'demo', selector: 'project:demo', recipe: { id: 'demo.prepare' } }] : [],
    },
    preparationRecipes: prepared ? [{ scope: 'project:demo', recipe: 'demo.prepare', status: 'ready', identity: 'sha256-recipe', preparedIdentity: 'sha256-recipe', diagnostic: null }] : [],
    receiptIdentity: prepared ? 'sha256-receipt-prepared' : 'sha256-receipt-base',
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
    controllerInvocation: { kind: 'stable-controller', command: process.execPath, argsPrefix: ['-e', 'process.exit(99)'], sourceRoot: path.join(current.root, 'retained-product') },
  });
  let opens = 0;
  const originalOpen = current.runtime.openTaskExecutionRecord;
  current.runtime.openTaskExecutionRecord = (...args) => { opens += 1; return originalOpen(...args); };
  const planArgs = [
    '--project', 'demo', '--target-kind', 'task-delivery', '--selection-scope', 'affected', '--target-identity', 'target:preview',
    '--changed-path', 'projects/demo/src/example.mjs', '--target', current.root,
    '--environment', current.taskId, '--workspace', current.root,
  ];
  const preview = current.runtime.verificationPlan(planArgs);
  assert.equal(preview.schemaVersion, 'buildr.verification-plan-result/v1');
  assert.equal(preview.preparation.status, 'action-required');
  assert.deepEqual(preview.preparation.planRequest.auxiliaryPreparation.map((item) => item.recipe), ['demo.prepare']);
  assert.equal(opens, 0);

  prepared = true;
  const ready = current.runtime.verificationPlan(planArgs);
  assert.equal(ready.preparation.status, 'ready');
  assert.equal(ready.preparation.planRequest, null);
  const planPath = path.join(current.root, '.verification-plan-preview.json');
  fs.writeFileSync(planPath, JSON.stringify(ready));
  current.runtime.productRoot = () => path.join(current.root, 'retained-product');
  const execution = await current.runtime.verificationRun([
    '--project', 'demo', '--plan', planPath, '--target-identity', 'target:preview', '--target', current.root,
    '--candidate-identity', current.candidateIdentity, '--candidate-generation', '1',
    '--environment', current.taskId, '--workspace', current.root,
  ]);
  assert.equal(execution.status, 'passed');
  assert.equal(opens, 1);
});

test('Formal preparation binding在首次副作用前漂移时fail closed', async (t) => {
  const current = setup(t, 'verification-preparation-race');
  const marker = path.join(current.projectRoot, 'must-not-start-race.txt');
  const selected = capability('demo.prepared', `require("fs").writeFileSync(${JSON.stringify(marker)}, "started")`);
  selected.environment.preparation = [{ project: 'demo', recipe: 'demo.prepare' }];
  declare(current.projectRoot, [selected]);
  fs.writeFileSync(path.join(current.projectRoot, 'preparation.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [{ id: 'demo.prepare', scope: { kind: 'project' }, required: true, steps: [{ id: 'prepare', cwd: '.', executable: { kind: 'workspace-foundation', name: 'node' }, args: ['prepare.mjs'], inputs: ['prepare.mjs'], outputs: [{ path: '.prepared', kind: 'file' }], required: true, timeoutMs: 10_000 }] }],
  }));
  const capabilityIdentity = verificationCapabilityIdentity(selected);
  let reads = 0;
  current.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true, taskId: current.taskId, environmentRoot: current.root, workspaceRoot: current.root, scopes: [], allowedExecutionRoots: [current.root],
    preparationPlan: { identity: 'sha256-plan', projects: [{ project: 'demo', source: { kind: 'project-declaration', identity: 'sha256-preparation' }, scopes: [{ selector: 'project:demo', disposition: 'not-applicable', reason: 'No base preparation.', recipes: [] }] }], capabilityPreparation: [{ capability: selected.id, capabilityIdentity, project: 'demo', selector: 'project:demo', recipe: { id: 'demo.prepare' } }] },
    preparationRecipes: [{ scope: 'project:demo', recipe: 'demo.prepare', status: 'ready', identity: 'sha256-recipe', preparedIdentity: 'sha256-recipe', diagnostic: null }],
    receiptIdentity: reads++ === 0 ? 'sha256-receipt-before' : 'sha256-receipt-after',
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
  });
  let opens = 0;
  const originalOpen = current.runtime.openTaskExecutionRecord;
  current.runtime.openTaskExecutionRecord = (...args) => { opens += 1; return originalOpen(...args); };
  await assert.rejects(() => run(current, selected.id), (error) => error.code === 'verification.preparation_drifted');
  assert.equal(opens, 0);
  assert.equal(fs.existsSync(marker), false);
});

test('Execution Record打开后admission漂移仍在capability副作用前停止', async (t) => {
  const current = setup(t, 'verification-preparation-post-open-race');
  const marker = path.join(current.projectRoot, 'must-not-start-post-open.txt');
  const selected = capability('demo.prepared', `require("fs").writeFileSync(${JSON.stringify(marker)}, "started")`);
  selected.environment.preparation = [{ project: 'demo', recipe: 'demo.prepare' }];
  declare(current.projectRoot, [selected]);
  fs.writeFileSync(path.join(current.projectRoot, 'preparation.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [{ id: 'demo.prepare', scope: { kind: 'project' }, required: true, steps: [{ id: 'prepare', cwd: '.', executable: { kind: 'workspace-foundation', name: 'node' }, args: ['prepare.mjs'], inputs: ['prepare.mjs'], outputs: [{ path: '.prepared', kind: 'file' }], required: true, timeoutMs: 10_000 }] }],
  }));
  const capabilityIdentity = verificationCapabilityIdentity(selected);
  let reads = 0;
  current.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true, taskId: current.taskId, environmentRoot: current.root, workspaceRoot: current.root, scopes: [], allowedExecutionRoots: [current.root],
    preparationPlan: { identity: 'sha256-plan', projects: [{ project: 'demo', source: { kind: 'project-declaration', identity: 'sha256-preparation' }, scopes: [{ selector: 'project:demo', disposition: 'not-applicable', reason: 'No base preparation.', recipes: [] }] }], capabilityPreparation: [{ capability: selected.id, capabilityIdentity, project: 'demo', selector: 'project:demo', recipe: { id: 'demo.prepare' } }] },
    preparationRecipes: [{ scope: 'project:demo', recipe: 'demo.prepare', status: 'ready', identity: 'sha256-recipe', preparedIdentity: 'sha256-recipe', diagnostic: null }],
    receiptIdentity: reads++ < 2 ? 'sha256-receipt-before' : 'sha256-receipt-after',
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
  });
  let opens = 0;
  const originalOpen = current.runtime.openTaskExecutionRecord;
  current.runtime.openTaskExecutionRecord = (...args) => { opens += 1; return originalOpen(...args); };
  await assert.rejects(() => run(current, selected.id), (error) => error.code === 'verification.preparation_drifted' && error.verificationExecutionRecord.lifecycleStatus === 'open');
  assert.equal(opens, 1);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records[0].lifecycleStatus, 'open');
});

test('相同terminal verification默认复用原record且只有retry或identity变化才执行', async (t) => {
  const current = setup(t, 'verification-terminal-reuse');
  const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-terminal-reuse-'));
  t.after(() => fs.rmSync(markerRoot, { recursive: true, force: true }));
  const marker = path.join(markerRoot, 'executions.txt');
  declare(current.projectRoot, [capability('demo.pass', `require("fs").appendFileSync(${JSON.stringify(marker)}, "original\\n")`)]);

  const first = await run(current, 'demo.pass');
  const reused = await run(current, 'demo.pass');
  assert.equal(first.status, 'passed');
  assert.equal(reused.status, 'passed');
  assert.equal(reused.timingSource, 'not-started-existing-terminal');
  assert.equal(reused.durationMs, 0);
  assert.deepEqual(reused.checks, []);
  assert.equal(reused.executionIdentity, null);
  assert.equal(reused.evidenceReference, null);
  assert.equal(reused.executionRecord.recordId, first.executionRecord.recordId);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'original\n');
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 1);

  const retried = await run(current, 'demo.pass', ['--retry']);
  assert.equal(retried.status, 'passed');
  assert.notEqual(retried.executionRecord.recordId, first.executionRecord.recordId);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'original\noriginal\n');

  declare(current.projectRoot, [capability('demo.pass', `require("fs").appendFileSync(${JSON.stringify(marker)}, "changed-declaration\\n")`)]);
  const changedIdentity = await run(current, 'demo.pass');
  assert.equal(changedIdentity.status, 'passed');
  assert.notEqual(changedIdentity.invocationIdentity, first.invocationIdentity);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'original\noriginal\nchanged-declaration\n');
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 3);
});

test('terminal outcome与lifecycle readback全覆盖且负向或attention保持非零退出', async (t) => {
  const matrix = [
    ['passed', 'retained', 'passed', 0],
    ['failed', 'cleanup_pending', 'failed', 1],
    ['blocked', 'cleaned', 'failed', 1],
    ['cancelled', 'retained', 'failed', 1],
    ['passed', 'attention', 'failed', 1],
  ];
  for (const [index, [outcome, lifecycleStatus, status, exitCode]] of matrix.entries()) {
    const current = setup(t, `verification-terminal-${index}`);
    const marker = path.join(current.projectRoot, 'unexpected-execution.txt');
    declare(current.projectRoot, [capability('demo.terminal', `require("fs").writeFileSync(${JSON.stringify(marker)}, "executed")`)]);
    current.runtime.openTaskExecutionRecord = (_root, _taskId, input) => ({
      status: 'existing-terminal',
      record: {
        recordId: `task-exec-terminal-${index}`,
        runIdentity: `run-terminal-${index}`,
        invocationIdentity: input.invocationIdentity,
        targetIdentity: input.targetIdentity,
        outcome,
        lifecycleStatus,
        body: { digest: `sha256-${String(index + 5).repeat(64)}`, storedSizeBytes: 1, originalSizeBytes: 1, truncated: false },
      },
    });
    const observed = await runWithExit(current, 'demo.terminal');
    assert.equal(observed.payload.status, status);
    assert.equal(observed.exitCode, exitCode);
    assert.equal(observed.payload.executionRecord.outcome, outcome);
    assert.equal(observed.payload.executionRecord.lifecycleStatus, lifecycleStatus);
    assert.equal(observed.payload.timingSource, 'not-started-existing-terminal');
    assert.equal(fs.existsSync(marker), false);
  }
});

test('failed terminal verification默认保持失败且不重复process', async (t) => {
  const current = setup(t, 'verification-terminal-failed');
  const marker = path.join(current.projectRoot, 'failed-executions.txt');
  declare(current.projectRoot, [capability('demo.fail-once', `require("fs").appendFileSync(${JSON.stringify(marker)}, "run\\n"); process.exit(3)`)]);
  const first = await runWithExit(current, 'demo.fail-once');
  const reused = await runWithExit(current, 'demo.fail-once');
  assert.equal(first.payload.status, 'failed');
  assert.equal(reused.payload.status, 'failed');
  assert.equal(reused.exitCode, 1);
  assert.equal(reused.payload.executionRecord.recordId, first.payload.executionRecord.recordId);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'run\n');
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 1);
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
    delegated = { context, args, planPath: args[3], plan: JSON.parse(fs.readFileSync(args[3], 'utf8')) };
    return { status: 'delegated' };
  };

  const targetIdentity = 'target:demo.pass';
  const envelope = current.runtime.verificationPlan([
    '--project', 'demo', '--target-kind', 'task-delivery', '--selection-scope', 'affected',
    '--target-identity', targetIdentity, '--changed-path', 'src/example.mjs', '--target', current.root,
    '--environment', current.taskId, '--workspace', current.root,
  ]);
  const envelopePath = path.join(current.root, '.verification-plan-envelope.json');
  fs.writeFileSync(envelopePath, JSON.stringify(envelope));
  const payload = await current.runtime.verificationRun([
    '--project', 'demo', '--plan', envelopePath, '--target-identity', targetIdentity, '--target', current.root,
    '--candidate-identity', current.candidateIdentity, '--candidate-generation', String(current.candidateGeneration),
    '--environment', current.taskId, '--workspace', current.root,
  ]);
  assert.equal(payload.status, 'delegated');
  assert.equal(delegated.context.controllerInvocation.sourceRoot, retainedSource);
  assert.deepEqual(delegated.args.slice(0, 3), ['--project', 'demo', '--plan']);
  assert.equal(path.basename(delegated.args[3]), 'plan.json');
  assert.equal(delegated.plan.schemaVersion, 'buildr.verification-plan/v1');
  assert.equal(fs.existsSync(delegated.planPath), false);
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
    assert.equal(Object.hasOwn(payload.checks[0], 'stdout'), false);
    assert.equal(Object.hasOwn(payload.checks[0], 'stderr'), false);
    assert.doesNotMatch(JSON.stringify(payload), /very-secret|\/private\/local\/path/);
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
  const planned = plan(current, 'demo.blocked');
  await assert.rejects(() => current.runtime.verificationRun([
    '--project', 'demo', '--plan', planned.planPath, '--target-identity', planned.targetIdentity, '--target', current.root,
    '--candidate-identity', current.candidateIdentity, '--candidate-generation', String(current.candidateGeneration),
    '--environment', current.taskId, '--workspace', current.root,
  ]), (caught) => caught.verificationExecutionRecord.status === 'blocked');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(current.runtime.listTaskExecutionRecords(current.root, current.taskId).records.length, 0);
});

test('seal失败保留open record与transient evidence供恢复', async (t) => {
  const current = setup(t, 'verification-seal-failure');
  const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-recover-'));
  t.after(() => fs.rmSync(markerRoot, { recursive: true, force: true }));
  const marker = path.join(markerRoot, 'recover-executions.txt');
  declare(current.projectRoot, [capability('demo.pass', `require("fs").appendFileSync(${JSON.stringify(marker)}, "run\\n")`)]);
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

  const mismatchedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-run-'));
  t.after(() => fs.rmSync(mismatchedRoot, { recursive: true, force: true }));
  const mismatchedPath = path.join(mismatchedRoot, 'summary.json');
  const mismatched = JSON.parse(fs.readFileSync(payload.evidenceReference, 'utf8'));
  mismatched.executionRecord.recordId = 'task-exec-mismatched';
  mismatched.evidenceReference = mismatchedPath;
  mismatched.evidenceLifecycle.cleanupReference = mismatchedRoot;
  mismatched.evidenceLifecycle.summaryPath = mismatchedPath;
  fs.writeFileSync(mismatchedPath, `${JSON.stringify(mismatched, null, 2)}\n`);
  const blockedRecovery = spawnSync(process.execPath, [BUILDR, 'task', 'execution-record', 'recover', '--task', current.taskId, '--record', payload.executionRecord.recordId, '--summary', mismatchedPath, '--target', current.root, '--json'], { encoding: 'utf8' });
  assert.equal(blockedRecovery.status, 1, blockedRecovery.stderr || blockedRecovery.stdout);
  assert.equal(JSON.parse(blockedRecovery.stdout).diagnostic.code, 'task_execution_record_recovery_identity_mismatch');
  assert.equal(current.runtime.inspectTaskExecutionRecord(current.root, payload.executionRecord.recordId).record.lifecycleStatus, 'open');

  const recoveryProcess = spawnSync(process.execPath, [BUILDR, 'task', 'execution-record', 'recover', '--task', current.taskId, '--record', payload.executionRecord.recordId, '--summary', payload.evidenceReference, '--target', current.root, '--json'], { encoding: 'utf8' });
  assert.equal(recoveryProcess.status, 0, recoveryProcess.stderr || recoveryProcess.stdout);
  const recovered = JSON.parse(recoveryProcess.stdout);
  assert.equal(recovered.status, 'recovered');
  assert.equal(recovered.mode, 'terminal-evidence');
  assert.equal(recovered.record.outcome, 'passed');
  assert.equal(recovered.record.lifecycleStatus, 'retained');
  assert.equal(recovered.transientCleanup.status, 'cleaned');
  assert.equal(fs.existsSync(payload.evidenceReference), false);

  const reused = await run(current, 'demo.pass');
  assert.equal(reused.status, 'passed');
  assert.equal(reused.executionRecord.recordId, payload.executionRecord.recordId);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'run\n');
});
