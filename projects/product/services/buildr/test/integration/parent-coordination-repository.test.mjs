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

test('父子摘要批量读取真实记录，不随子任务数量增加查询或调用专业流程', (t) => {
  const { root, runtime } = fixture(t, 1);
  const open = runtime.openWorkspaceStructuredStore;
  let queries = [];
  runtime.openWorkspaceStructuredStore = (...args) => {
    const opened = open(...args);
    if (!opened.database) return opened;
    return { ...opened, database: new Proxy(opened.database, {
      get(database, key) {
        if (key === 'prepare') return (sql) => { queries.push(sql); return database.prepare(sql); };
        const value = Reflect.get(database, key);
        return typeof value === 'function' ? value.bind(database) : value;
      },
    }) };
  };
  runtime.resolveTaskEnvironmentExecution = () => { throw new Error('摘要不得执行环境。'); };
  runtime.inspectTaskDevelopment = () => { throw new Error('摘要不得逐子任务调用研发。'); };
  runtime.inspectTaskTerminalDelivery = () => { throw new Error('摘要不得逐子任务检查交付。'); };
  const one = runtime.inspectParentCoordination(root, 'parent-task');
  const oneCount = queries.length;
  assert.equal(one.children.length, 1);
  for (let index = 1; index < 32; index += 1) runtime.createTaskRecordPersistence(root, record(`child-${String(index).padStart(2, '0')}`, 'parent-task'));
  queries = [];
  const many = runtime.inspectParentCoordination(root, 'parent-task');
  assert.equal(queries.length, oneCount);
  assert.equal(many.children.length, 32);
  assert.deepEqual(many.children.map((child) => child.taskId), Array.from({ length: 32 }, (_, index) => `child-${String(index).padStart(2, '0')}`));
  assert.equal(queries.some((sql) => /task_finish_current|task_review_current|task_environment_current|terminal_contribution_reconciliations/.test(sql)), false);
  for (const name of ['readParentCoordinationPersistence', 'readTerminalContributionReconciliationContext', 'writeTerminalContributionReconciliationPersistence']) {
    assert.equal(runtime[name], undefined);
  }
});

test('Parent Coordination缺失Task时返回稳定not-found且不写数据库', (t) => {
  const { root, runtime } = fixture(t, 0);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.statSync(file).mtimeMs;
  assert.throws(() => runtime.readParentTaskContext(root, 'missing-task'), (error) => error.code === 'task_record_not_found' && error.status === 404);
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
