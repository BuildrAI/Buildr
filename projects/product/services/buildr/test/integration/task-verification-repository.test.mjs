import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `buildr ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}

function declaration() {
  return {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: 'demo.unit',
      title: 'Demo unit',
      scope: { project: 'demo', services: [] },
      invocation: { kind: 'command', argv: ['node', '-e', 'void 0'], cwd: '.' },
      applicability: { paths: ['**'], conditions: [] },
      proves: ['Demo unit behavior'],
      requiredForDelivery: true,
      environment: { requires: ['node'] },
      effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    }],
  };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-repository-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  run(['init', '--target', root, '--name', 'Verification', '--description', 'Task Verification fixture']);
  run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo Project']);
  run(['task', 'create', 'demo-task', '--title', 'Demo', '--intent', 'Verify current Result authority', '--project', 'demo', '--target', root]);
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration()));
  return fs.realpathSync(root);
}

function input(overrides = {}) {
  return {
    targetIdentity: 'target:one',
    targetSummary: 'Demo delivery target',
    capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'passed', facts: ['unit passed'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: 'Demo verified' },
    ...overrides,
  };
}

function injectedIo(overrides = {}) {
  return {
    existsSync: fs.existsSync,
    lstatSync: fs.lstatSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
    ...overrides,
  };
}

test('Application 维护单一 current Result 并派生 target/declaration applicability', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const empty = runtime.inspectTaskVerification(root, 'demo-task');
  assert.equal(empty.slot.present, false);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'demo-task', 'verification.yml')), false);

  const recorded = runtime.recordTaskVerification(root, 'demo-task', input());
  assert.equal(recorded.slot.applicability.status, 'current');
  assert.equal(recorded.slot.applicability.declarations.status, 'current');
  assert.match(recorded.slot.resultDigest, /^sha256-/);
  const file = recorded.slot.path;
  const bytes = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(bytes, /resultDigest|applicability|revision|requiredAssurance|stdout|stderr/);

  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.applicability.status, 'unknown');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:two' }).slot.applicability.status, 'stale');
  const changed = declaration();
  changed.capabilities[0].proves = ['Changed declaration'];
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(changed));
  const stale = runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.applicability;
  assert.equal(stale.status, 'stale');
  assert.ok(stale.reasons.some((reason) => reason.code === 'declaration-identity-changed'));
});

test('Application 只从 canonical 或 matching ready Task Environment 观察 declaration', (t) => {
  const root = fixture(t);
  const candidateRoot = `${root}-candidate`;
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-foreign-'));
  t.after(() => fs.rmSync(candidateRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(foreignRoot, { recursive: true, force: true }));
  fs.cpSync(root, candidateRoot, { recursive: true });
  const candidateDeclaration = declaration();
  candidateDeclaration.capabilities[0].proves = ['Candidate declaration'];
  fs.writeFileSync(path.join(candidateRoot, 'projects', 'demo', 'verification.yml'), YAML.stringify(candidateDeclaration));

  const runtime = createRuntime();
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ declarationRoot: foreignRoot })), (error) => error.code === 'task_verification_declaration_root_unowned');
  runtime.resolveTaskEnvironmentExecution = () => ({ ready: true, environmentRoot: candidateRoot });
  const recorded = runtime.recordTaskVerification(root, 'demo-task', input({ declarationRoot: candidateRoot }));
  assert.equal(recorded.slot.applicability.status, 'current');
  assert.equal(recorded.slot.result.declarations[0].path, 'projects/demo/verification.yml');
  assert.equal(JSON.stringify(recorded.slot.result).includes(candidateRoot), false);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.applicability.status, 'stale');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarationRoot: candidateRoot }).slot.applicability.status, 'current');
});

test('coverage gap、closed schema 与 terminal Task 都不会覆盖 current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const recorded = runtime.recordTaskVerification(root, 'demo-task', input());
  const file = recorded.slot.path;
  const original = fs.readFileSync(file, 'utf8');
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({
    capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'failed', facts: ['failed'] }],
    conclusion: { outcome: 'passed', summary: 'inconsistent' },
  })), (error) => error.code === 'task_verification_conclusion_inconsistent');
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  fs.rmSync(path.join(root, 'projects', 'demo', 'verification.yml'));
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input()), (error) => error.code === 'task_verification_coverage_gap_required');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const gap = runtime.recordTaskVerification(root, 'demo-task', input({
    targetIdentity: 'target:no-declaration',
    capabilities: [],
    coverageGaps: [{ scope: 'project:demo', summary: 'Project has no declared verification capability' }],
    conclusion: { outcome: 'not-passed', summary: 'Coverage gap remains' },
  }));
  assert.equal(gap.slot.result.declarations[0].identity, 'absent');

  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  const completedAt = new Date(Date.parse(task.record.createdAt) + 1000).toISOString();
  runtime.writeTaskRecordPersistence(root, { ...task.record, status: 'completed', result: { summary: 'done', noChange: false }, updatedAt: completedAt });
  const terminalBytes = fs.readFileSync(file, 'utf8');
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input()), (error) => error.code === 'task_verification_task_terminal');
  assert.equal(fs.readFileSync(file, 'utf8'), terminalBytes);
});

test('serialization、temporary write、rename 与 post-read failure 都恢复原 current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const recorded = runtime.recordTaskVerification(root, 'demo-task', input());
  const file = recorded.slot.path;
  const original = fs.readFileSync(file);

  runtime.taskVerificationSerialize = () => { throw new Error('injected serialization failure'); };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:serialization' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'serialization');
  runtime.taskVerificationSerialize = null;

  runtime.taskVerificationIo = injectedIo({
    writeFileSync(target, ...args) {
      if (String(target).includes('.verification.yml.buildr-tmp-')) throw new Error('injected temporary write failure');
      return fs.writeFileSync(target, ...args);
    },
  });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:write' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'temporary-write');

  runtime.taskVerificationIo = injectedIo({
    renameSync(source, destination) {
      if (destination === file && String(source).includes('.verification.yml.buildr-tmp-')) throw new Error('injected rename failure');
      return fs.renameSync(source, destination);
    },
  });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:rename' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'rename');

  let replaced = false;
  let failedPostRead = false;
  runtime.taskVerificationIo = injectedIo({
    renameSync(source, destination) {
      const value = fs.renameSync(source, destination);
      if (destination === file && String(source).includes('.verification.yml.buildr-tmp-')) replaced = true;
      return value;
    },
    readFileSync(target, ...args) {
      if (replaced && !failedPostRead && target === file && args[0] === 'utf8') {
        failedPostRead = true;
        throw new Error('injected post-read failure');
      }
      return fs.readFileSync(target, ...args);
    },
  });
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:post-read' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'post-read' && error.details.rollback.status === 'restored');
  runtime.taskVerificationIo = null;
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.includes('.buildr-tmp-')), false);
});
