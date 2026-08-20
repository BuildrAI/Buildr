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
  const unknown = runtime.inspectTaskVerification(root, 'demo-task').slot.applicability;
  assert.equal(unknown.status, 'unknown');
  assert.deepEqual(unknown.reasons.map((reason) => reason.code), ['target-identity-not-provided', 'declaration-identities-not-provided']);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:two' }).slot.applicability.status, 'stale');

  const changed = declaration();
  changed.capabilities[0].proves = ['Changed declaration'];
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(changed));
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.applicability.status, 'unknown');
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
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarations: recorded.slot.result.declarations }).slot.applicability.status, 'current');
  assert.throws(() => runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarationRoot: candidateRoot }), (error) => error.code === 'task_verification_field_forbidden');
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

test('workspace-only Result写入同一SQLite authority，scope变化后兼容读取并派生stale', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'workspace-task', title: 'Workspace only', intent: 'Persist a typed workspace coverage gap.', projects: [], services: [], changes: [] });
  const recorded = runtime.recordTaskVerification(root, 'workspace-task', {
    targetIdentity: 'workspace:one', targetSummary: 'Workspace target', capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }],
    conclusion: { outcome: 'not-passed', summary: 'Workspace coverage gap remains.' }, declarationRoot: root,
  });
  assert.equal(recorded.slot.path, 'workspace-sqlite:task-verification/workspace-task');
  assert.deepEqual(recorded.slot.result.declarations, []);
  assert.equal(recorded.slot.result.conclusion.outcome, 'not-passed');

  const current = runtime.readTaskRecordPersistence(root, 'workspace-task').record;
  runtime.writeTaskRecordPersistence(root, {
    ...current,
    scope: { projects: ['demo'], services: [] },
    updatedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString(),
  });
  assert.deepEqual(runtime.readTaskVerificationResultPersistence(root, 'workspace-task').result.declarations, [], 'old self-described Result remains readable');
  const declarations = runtime.observeTaskVerificationDeclarations(root, 'workspace-task', root).map(({ project, path: declarationPath, identity }) => ({ project, path: declarationPath, identity }));
  const inspected = runtime.inspectTaskVerification(root, 'workspace-task', { targetIdentity: 'workspace:one', declarations });
  assert.equal(inspected.slot.applicability.declarations.status, 'stale');
  assert.equal(inspected.slot.applicability.status, 'stale');
  assert.ok(inspected.slot.applicability.reasons.some((reason) => reason.code === 'project-scope-added' && reason.project === 'demo'));
});

test('Project Task repository仍拒绝空 declarations workspace shape', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  assert.throws(() => runtime.writeTaskVerificationResultPersistence(root, {
    schemaVersion: 'buildr.task-verification-result/v1', taskId: 'demo-task',
    target: { identity: 'workspace:forged', summary: 'Forged workspace target' }, declarations: [], capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'Must not bypass Project declarations.' }],
    conclusion: { outcome: 'not-passed', summary: 'Forged.' }, completedAt: '2026-08-12T00:00:00.000Z',
  }), (error) => error.code === 'task_verification_write_failed' && /有效 Project 集合/.test(error.message));
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.present, false);
});
