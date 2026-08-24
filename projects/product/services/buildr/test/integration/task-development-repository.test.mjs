import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { taskDevelopmentDigest } from '../../src/task/domain/task-development.mjs';

const test = createBuildrApplicationTest('integration-task-development-repository');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v2', taskId: 'demo-task', title: 'Demo', intent: 'Verify Development SQLite authority',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
  });
  return { root: fs.realpathSync(root), runtime };
}

function receipt(updatedAt = '2026-08-04T00:00:00.000Z') {
  const taskContextPayload = { taskId: 'demo-task', intent: 'Portable docs', scope: { projects: ['docs'], services: [] }, changes: [] };
  const taskContext = { identity: taskDevelopmentDigest(taskContextPayload), ...taskContextPayload };
  return {
    schemaVersion: 'buildr.task-development-receipt/v2', taskId: 'demo-task',
    environment: { taskId: 'demo-task', receiptSchema: 'buildr.task-environment-receipt/v2' }, taskContext,
    planning: { identity: taskDevelopmentDigest({ targetIdentity: null, nodes: [] }), targetIdentity: null, nodes: [] },
    contentTarget: null, verificationPolicy: null, generation: 0, candidate: null,
    gates: { planning: null, verification: null, completion: null }, decision: null, handoffs: [],
    createdAt: '2026-08-04T00:00:00.000Z', updatedAt,
  };
}

function stored(runtime, root) {
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  try { return opened.database.prepare("SELECT record_json FROM task_development_current WHERE task_id = 'demo-task'").get()?.record_json ?? null; }
  finally { opened.database.close(); }
}

function observation(status = 'planning', observedAt = '2026-08-04T00:00:00.000Z') {
  return { applicability: { status, taskContext: 'current', planning: 'current', contentTarget: 'missing', policy: 'missing', candidate: 'missing', handoff: 'missing', gates: { planning: null, verification: null, completion: null }, reasons: [] }, observedAt };
}

function workspaceReceipt() {
  const taskContextPayload = { taskId: 'demo-task', intent: 'Workspace-only content', scope: { projects: [], services: [] }, changes: [] };
  const components = [{ selector: 'workspace', kind: 'workspace', sourcePath: '.', observer: 'fixture.filesystem/v1', identity: taskDevelopmentDigest('workspace-content') }];
  const policyPayload = { declarations: [], capabilities: [], coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }], overrides: [] };
  return {
    ...receipt(),
    taskContext: { identity: taskDevelopmentDigest(taskContextPayload), ...taskContextPayload },
    contentTarget: { identity: taskDevelopmentDigest({ components }), components },
    verificationPolicy: { identity: taskDevelopmentDigest(policyPayload), ...policyPayload },
  };
}

test('Development current Receipt 只在SQLite写入、替换和读取，旧YAML保持inert', (t) => {
  const { root, runtime } = fixture(t);
  const legacy = path.join(root, '.buildr', 'tasks', 'demo-task', 'development.yml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy: inert\n');

  assert.equal(runtime.readTaskDevelopmentPersistence(root, 'demo-task', { optional: true }), null);
  const first = runtime.writeTaskDevelopmentPersistence(root, receipt(), observation());
  assert.equal(first.created, true);
  assert.equal(first.file, 'workspace-sqlite:task-development/demo-task');
  assert.match(first.receiptDigest, /^sha256-/);
  const persisted = JSON.parse(stored(runtime, root));
  assert.equal(persisted.schemaVersion, 'buildr.task-development-receipt/v3');
  assert.equal(persisted.parentPlan, null);
  assert.deepEqual(persisted.plannedContributions, []);
  assert.equal(persisted.parentAcceptance, null);

  const second = runtime.writeTaskDevelopmentPersistence(root, receipt('2026-08-04T00:01:00.000Z'), observation('planning', '2026-08-04T00:01:00.000Z'));
  assert.equal(second.created, false);
  assert.notEqual(second.receiptDigest, first.receiptDigest);
  assert.equal(runtime.readTaskDevelopmentPersistence(root, 'demo-task', { optional: false }).receipt.updatedAt, '2026-08-04T00:01:00.000Z');
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('Development serialization或SQLite mutation失败时保留最后有效current', (t) => {
  const { root, runtime } = fixture(t);
  runtime.writeTaskDevelopmentPersistence(root, receipt(), observation());
  const original = stored(runtime, root);

  runtime.taskDevelopmentSerialize = () => { throw new Error('serialization failed'); };
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, receipt('2026-08-04T00:01:00.000Z'), observation()), (error) => error.code === 'task_development_write_failed' && error.details.stage === 'serialization');
  runtime.taskDevelopmentSerialize = null;
  assert.equal(stored(runtime, root), original);

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_development_update BEFORE UPDATE ON task_development_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, receipt('2026-08-04T00:02:00.000Z'), observation()), (error) => error.code === 'task_development_write_failed' && error.details.stage === 'mutation' && error.details.rollback.status === 'restored');
  assert.equal(stored(runtime, root), original);
});

test('Development repository拒绝不存在Task且不产生orphan row', (t) => {
  const { root, runtime } = fixture(t);
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, { ...receipt(), taskId: 'missing-task' }, observation()), (error) => error.code === 'task_record_not_found');
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(opened.database.prepare('SELECT count(*) AS count FROM task_development_current').get().count, 0);
  opened.database.close();
});

test('workspace-only Development policy兼容读取，但scope变化后拒绝作为新current写回', (t) => {
  const { root, runtime } = fixture(t);
  runtime.writeTaskDevelopmentPersistence(root, workspaceReceipt(), observation('developing'));
  assert.deepEqual(runtime.readTaskDevelopmentPersistence(root, 'demo-task').receipt.verificationPolicy.declarations, []);
  const task = runtime.readTaskRecordPersistence(root, 'demo-task').record;
  runtime.writeTaskRecordPersistence(root, {
    ...task,
    scope: { projects: ['docs'], services: [] },
    updatedAt: '2026-08-04T00:01:00.000Z',
  });
  assert.deepEqual(runtime.readTaskDevelopmentPersistence(root, 'demo-task').receipt.verificationPolicy.declarations, [], 'old self-described policy remains readable');
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, workspaceReceipt(), observation('developing', '2026-08-04T00:01:00.000Z')), (error) => error.code === 'task_development_write_failed' && /有效 Project 集合/.test(error.message));
});
