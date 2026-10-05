// @ts-nocheck -- Existing behavioral suite migrated with its implementation; typing the fixture framework is outside this change.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskBriefDigest } from '../../src/modules/task/domain/task.ts';
import { renderAssetCatalog } from '../../src/modules/workspace/persistence/asset-catalog-repository.ts';
import { createBuildrApplicationTest } from '../context/buildr-node-test.ts';

const test = createBuildrApplicationTest('integration-parent-coordination-repository');

function record(taskId, parentTaskId = null) {
  return {
    schemaVersion: 'buildr.task-record/v4',
    taskId,
    title: taskId,
    intent: 'Verify bounded Parent Coordination reads.',
    brief: null,
    scope: { projects: [], services: [] },
    changes: [],
    parentTaskId,
    retrospective: null,
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
  for (const [relative, content] of Object.entries(renderAssetCatalog({ projects: [], services: [], repositories: [] }))) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  runtime.createTaskPersistence(root, record('parent-task'));
  for (let index = 0; index < childCount; index += 1) {
    runtime.createTaskPersistence(root, record(`child-${String(index).padStart(2, '0')}`, 'parent-task'));
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
  for (let index = 1; index < 32; index += 1) runtime.createTaskPersistence(root, record(`child-${String(index).padStart(2, '0')}`, 'parent-task'));
  queries = [];
  const many = runtime.inspectParentCoordination(root, 'parent-task');
  assert.equal(queries.length, oneCount);
  assert.equal(many.children.length, 32);
  assert.deepEqual(many.children.map((child) => child.taskId), Array.from({ length: 32 }, (_, index) => `child-${String(index).padStart(2, '0')}`));
  assert.equal(queries.some((sql) => /task_finish_current|task_review_current|task_environment_current|task_development_current|terminal_contribution_reconciliations/.test(sql)), false);
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

test('父子读取与普通完成不物化大量无关任务，验收观察保持同一内容', (t) => {
  const { root, runtime } = fixture(t, 2);
  runtime.createTaskPersistence(root, record('ordinary-task'));
  const before = runtime.readParentTaskContext(root, 'parent-task');
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  try {
    // Seed only this owned fixture; unrelated long briefs should never be materialized by these operations.
    const brief = 'large unrelated brief ' + 'x'.repeat(8000);
    opened.database.prepare(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 2000)
      INSERT INTO tasks(task_id, title, intent, brief, brief_digest, status, result_summary, created_at, updated_at, parent_task_id, is_parent, parent_completion_json, result_history_json, result_history_digest, retrospective_state, retrospective_document_digest)
      SELECT 'unrelated-' || n.value, title, intent, ?, ?, status, result_summary, created_at, updated_at, NULL, 0, parent_completion_json, result_history_json, result_history_digest, retrospective_state, retrospective_document_digest
      FROM tasks CROSS JOIN n WHERE task_id = 'parent-task'`).run(brief, taskBriefDigest(brief));
  } finally { opened.database.close(); }
  const open = runtime.openWorkspaceStructuredStore;
  const rowsRead = [];
  runtime.openWorkspaceStructuredStore = (...args) => {
    const opened = open(...args);
    if (!opened.database) return opened;
    return { ...opened, database: new Proxy(opened.database, {
      get(database, key) {
        if (key === 'prepare') return (sql) => {
          const statement = database.prepare(sql);
          return new Proxy(statement, {
            get(statement, method) {
              if (method === 'all') return (...parameters) => {
                const rows = statement.all(...parameters);
                if (/\bFROM tasks\b/u.test(sql)) rowsRead.push(...rows);
                return rows;
              };
              const value = Reflect.get(statement, method);
              return typeof value === 'function' ? value.bind(statement) : value;
            },
          });
        };
        const value = Reflect.get(database, key);
        return typeof value === 'function' ? value.bind(database) : value;
      },
    }) };
  };
  const after = runtime.readParentTaskContext(root, 'parent-task');
  assert.equal(after.snapshotIdentity, before.snapshotIdentity);
  assert.deepEqual(after.children.map(child => child.taskId), ['child-00', 'child-01']);
  const ordinary = runtime.inspectTask(root, 'ordinary-task');
  const complete = runtime.completeTask(root, 'ordinary-task', { expectedRecordDigest: ordinary.recordDigest, summary: 'Done' });
  assert.equal(complete.record.status, 'completed');
  assert.equal(rowsRead.some(row => String(row.task_id || row.related_task_id || '').startsWith('unrelated-')), false);
  assert.ok(rowsRead.length < 20, `Only related rows should be read; observed ${rowsRead.length}.`);
});
