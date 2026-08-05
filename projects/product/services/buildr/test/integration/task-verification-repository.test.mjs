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
function run(args) { const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' }); assert.equal(result.status, 0, `buildr ${args.join(' ')}\n${result.stdout}\n${result.stderr}`); }
function declaration() {
  return { schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities: [{ id: 'demo.unit', title: 'Demo unit', scope: { project: 'demo', services: [] }, invocation: { kind: 'command', argv: ['node', '-e', 'void 0'], cwd: '.' }, applicability: { paths: ['**'], conditions: [] }, proves: ['Demo unit behavior'], requiredForDelivery: true, environment: { requires: ['node'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [] }] };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  run(['init', '--target', root, '--name', 'Verification', '--description', 'Task Verification fixture']);
  run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo Project']);
  run(['task', 'create', 'demo-task', '--title', 'Demo', '--intent', 'Verify current Result authority', '--project', 'demo', '--target', root]);
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration()));
  return fs.realpathSync(root);
}
function input(overrides = {}) { return { targetIdentity: 'target:one', targetSummary: 'Demo delivery target', capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'passed', facts: ['unit passed'] }], coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Demo verified' }, ...overrides }; }
function stored(runtime, root) { const opened = runtime.openWorkspaceStructuredStore(root, { writable: false }); try { return opened.database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'demo-task'").get()?.result_json ?? null; } finally { opened.database.close(); } }

test('Verification current Result只写SQLite并保持target/declaration applicability', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const legacy = path.join(root, '.buildr', 'tasks', 'demo-task', 'verification.yml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy: inert\n');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.present, false);

  const recorded = runtime.recordTaskVerification(root, 'demo-task', input());
  assert.equal(recorded.slot.path, 'workspace-sqlite:task-verification/demo-task');
  assert.equal(recorded.slot.applicability.status, 'current');
  assert.equal(recorded.slot.applicability.declarations.status, 'current');
  assert.doesNotMatch(stored(runtime, root), /resultDigest|applicability|revision|requiredAssurance|stdout|stderr/);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.applicability.status, 'unknown');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:two' }).slot.applicability.status, 'stale');

  const changed = declaration();
  changed.capabilities[0].proves = ['Changed declaration'];
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(changed));
  assert.ok(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.applicability.reasons.some((reason) => reason.code === 'declaration-identity-changed'));
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('Verification只从canonical或matching ready Task Environment观察declaration', (t) => {
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
  assert.equal(recorded.slot.result.declarations[0].path, 'projects/demo/verification.yml');
  assert.equal(JSON.stringify(recorded.slot.result).includes(candidateRoot), false);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarationRoot: candidateRoot }).slot.applicability.status, 'current');
});

test('Verification serialization或SQLite mutation失败保留last-valid current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  runtime.recordTaskVerification(root, 'demo-task', input());
  const original = stored(runtime, root);
  runtime.taskVerificationSerialize = () => { throw new Error('serialization failure'); };
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:serialization' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'serialization');
  runtime.taskVerificationSerialize = null;
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_verification_update BEFORE UPDATE ON task_verification_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input({ targetIdentity: 'target:mutation' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'mutation' && error.details.rollback.status === 'restored');
  assert.equal(stored(runtime, root), original);
});

test('terminal Task仍可读取既有Verification且拒绝新写入', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  runtime.recordTaskVerification(root, 'demo-task', input());
  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, { ...task.record, status: 'completed', result: { summary: 'done', noChange: false }, updatedAt: new Date(Date.parse(task.record.createdAt) + 1000).toISOString() });
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.present, true);
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', input()), (error) => error.code === 'task_verification_task_terminal');
});
