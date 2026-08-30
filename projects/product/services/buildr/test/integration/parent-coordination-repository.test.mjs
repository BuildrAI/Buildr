import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('integration-parent-coordination-repository');

function record(taskId, parentTaskId = null) {
  return {
    schemaVersion: 'buildr.task-record/v2',
    taskId,
    title: taskId,
    intent: 'Verify bounded Parent Coordination reads.',
    scope: { projects: [], services: [] },
    changes: [],
    parentTaskId,
    childTaskIds: [],
    retrospectiveSourceTaskIds: [],
    status: 'active',
    result: null,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function fixture(t, childCount = 32) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-parent-coordination-query-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecordPersistence(root, record('parent-task'));
  for (let index = 0; index < childCount; index += 1) {
    runtime.createTaskRecordPersistence(root, record(`child-${String(index).padStart(2, '0')}`, 'parent-task'));
  }
  return { root: fs.realpathSync(root), runtime };
}

test('Parent Coordination读取次数不随Child数量增长', (t) => {
  const { root, runtime } = fixture(t);
  const persistence = runtime.readParentCoordinationPersistence(root, 'parent-task');
  assert.equal(persistence.queryCount, 2);
  assert.equal(persistence.children.length, 32);
  assert.deepEqual(persistence.children.map((child) => child.task_id), Array.from({ length: 32 }, (_, index) => `child-${String(index).padStart(2, '0')}`));
  runtime.resolveTaskEnvironmentExecution = () => { throw new Error('read model不得执行Environment provider。'); };
  runtime.inspectTaskDevelopment = () => { throw new Error('read model不得逐Child调用Development Application。'); };
  runtime.inspectTaskTerminalDelivery = () => { throw new Error('read model不得逐Child调用Terminal Delivery Application。'); };
  const inspected = runtime.inspectParentCoordination(root, 'parent-task');
  assert.equal(inspected.mode, 'legacy');
  assert.equal(inspected.children.length, 32);
});

test('Parent Coordination缺失Task时返回稳定not-found且不写数据库', (t) => {
  const { root, runtime } = fixture(t, 0);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.statSync(file).mtimeMs;
  assert.throws(() => runtime.readParentCoordinationPersistence(root, 'missing-task'), (error) => error.code === 'task_record_not_found' && error.status === 404);
  assert.equal(fs.statSync(file).mtimeMs, before);
});

test('贡献记录约束升级逐字保留已有历史及唯一关联', (t) => {
  const { root, runtime } = fixture(t, 1);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  try {
    const record = JSON.stringify({ schemaVersion: 'buildr.terminal-contribution-reconciliation/v1', childTaskId: 'child-00', parentTaskId: 'parent-task', parentPlanIdentity: 'plan-old', identity: 'record-old', historical: 'preserve exact bytes' });
    opened.database.prepare('INSERT INTO terminal_contribution_reconciliations VALUES (?, ?, ?, ?, ?, ?)').run('child-00', 'parent-task', 'plan-old', 'record-old', record, '2026-08-08T00:00:00.000Z');
    const before = opened.database.prepare('SELECT * FROM terminal_contribution_reconciliations').all();
    opened.database.exec(fs.readFileSync(path.resolve(import.meta.dirname, '../../src/infrastructure/sqlite/migrations/0020_support_direct_contribution_results.sql'), 'utf8'));
    assert.deepEqual(opened.database.prepare('SELECT * FROM terminal_contribution_reconciliations').all(), before);
    assert.throws(() => opened.database.prepare('INSERT INTO terminal_contribution_reconciliations VALUES (?, ?, ?, ?, ?, ?)').run('child-00', 'parent-task', 'plan-old', 'record-other', record, '2026-08-08T00:00:00.000Z'));
  } finally { opened.database.close(); }
});
