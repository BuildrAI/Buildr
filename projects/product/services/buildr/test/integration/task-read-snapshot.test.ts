import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createTransactionManager, runSqliteRead, type SqliteContext } from '../../src/infrastructure/sqlite/transaction.ts';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerTaskQueryApplication } from '../../src/modules/task/application/task-query-application.ts';
import { Task } from '../../src/modules/task/domain/task.ts';
import { TaskProject } from '../../src/modules/task/domain/task-project.ts';
import { TaskService } from '../../src/modules/task/domain/task-service.ts';
import { TaskChange } from '../../src/modules/task/domain/task-change.ts';
import { createTaskRepository } from '../../src/modules/task/persistence/task-repository.ts';
import { createTaskListRepository } from '../../src/modules/task/persistence/task-list-repository.ts';
import { createTaskProjectRepository } from '../../src/modules/task/persistence/task-project-repository.ts';
import { createTaskServiceRepository } from '../../src/modules/task/persistence/task-service-repository.ts';
import { createTaskChangeRepository } from '../../src/modules/task/persistence/task-change-repository.ts';

const TASK_ID = 'snapshot-task';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-read-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'workspace.sqlite');
  const database = new DatabaseSync(file);
  try {
    database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON');
    for (const migration of loadWorkspaceSqliteMigrations()) applyWorkspaceSqliteMigration(database, migration);
  } finally { database.close(); }

  const store = {
    assertCanonicalStructuredWorkspace(targetRoot: string) {
      assert.equal(targetRoot, root);
      return root;
    },
    openWorkspaceStructuredStore(targetRoot: string, { writable }: { writable: boolean }) {
      assert.equal(targetRoot, root);
      const database = new DatabaseSync(file, { readOnly: !writable });
      database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
      return { present: true, database };
    },
  };
  const transactions = createTransactionManager(store);
  const tasks = createTaskRepository();
  const projects = createTaskProjectRepository();
  const services = createTaskServiceRepository();
  const changes = createTaskChangeRepository();
  let afterTaskRead: (() => void) | null = null;
  let afterSummaryRead: (() => void) | null = null;
  const queries = registerTaskQueryApplication({
    ...store,
    prepareWorkspaceStructuredStore() { throw new Error('读取不能准备或迁移数据库'); },
    runWorkspaceSqliteRead<T>(targetRoot: string, action: (context: SqliteContext) => T): T {
      return runSqliteRead(store, targetRoot, action);
    },
    taskRepository: {
      ...tasks,
      read(context, taskId) {
        const task = tasks.read(context, taskId);
        const action = afterTaskRead;
        afterTaskRead = null;
        action?.();
        return task;
      },
      readSummaries(context, input) {
        const result = tasks.readSummaries(context, input);
        const action = afterSummaryRead;
        afterSummaryRead = null;
        action?.();
        return result;
      },
    },
    taskListRepository: createTaskListRepository(),
    taskProjectRepository: projects,
    taskServiceRepository: services,
    taskChangeRepository: changes,
    readProjectRegistryRecord() { throw new Error('存储查询不能读取文件登记'); },
    readServiceRegistryRecord() { throw new Error('存储查询不能读取文件登记'); },
    resolveTaskScopedChange() { throw new Error('存储查询不能解析变更'); },
    readTaskRetrospectiveDocumentPersistence() { throw new Error('存储查询不能读取复盘文件'); },
  });

  function task(taskId: string, title: string, updatedAt: string, parentTaskId: string | null = null) {
    return new Task({
      taskId, title, intent: '验证同一当前记录', brief: null, status: 'active', parentTaskId,
      isParent: false, result: null, resultHistory: [], retrospective: null,
      createdAt: '2026-10-04T00:00:00.000Z', updatedAt,
    });
  }

  function replaceScope(context: SqliteContext, project: string) {
    projects.replace(context, TASK_ID, [new TaskProject(TASK_ID, project)]);
    services.replace(context, TASK_ID, [new TaskService(TASK_ID, project, 'service')]);
    changes.replace(context, TASK_ID, [new TaskChange(TASK_ID, project, 'change')]);
  }

  transactions.run(root, (context) => {
    tasks.insert(context, task(TASK_ID, '旧标题', '2026-10-04T00:00:00.000Z'));
    replaceScope(context, 'old-project');
  });

  function commitUpdatedTask(addChild = false) {
    // 独立连接在读取已发生后提交，复现原先旧标题与新范围被拼为同一记录的错误。
    transactions.run(root, (context) => {
      tasks.update(context, task(TASK_ID, '新标题', '2026-10-05T00:00:00.000Z'));
      replaceScope(context, 'new-project');
      if (addChild) tasks.insert(context, task('snapshot-child', '新子任务', '2026-10-04T01:00:00.000Z', TASK_ID));
    });
  }

  return {
    root, queries, commitUpdatedTask,
    afterTaskRead(action: () => void) { afterTaskRead = action; },
    afterSummaryRead(action: () => void) { afterSummaryRead = action; },
  };
}

function assertTaskVersion(record: { title: string; scope: { projects: string[]; services: unknown[] }; changes: unknown[] }, version: 'old' | 'new') {
  const project = `${version}-project`;
  assert.equal(record.title, version === 'old' ? '旧标题' : '新标题');
  assert.deepEqual(record.scope, { projects: [project], services: [{ project, service: 'service' }] });
  assert.deepEqual(record.changes, [{ project, change: 'change' }]);
}

test('任务详情在并发提交后仍返回同一已提交版本，后续读取看到新版本', (t) => {
  const value = fixture(t);
  const original = value.queries.readTaskView(value.root, TASK_ID);
  let independentRead: ReturnType<typeof value.queries.readTaskView>;
  value.afterTaskRead(() => {
    value.commitUpdatedTask(true);
    independentRead = value.queries.readTaskView(value.root, TASK_ID);
  });
  const observed = value.queries.readTaskView(value.root, TASK_ID);
  assertTaskVersion(observed.record, 'old');
  assert.equal(observed.recordDigest, original.recordDigest);
  assert.deepEqual(observed.taskRelations.children, []);
  assertTaskVersion(independentRead!.record, 'new');

  const current = value.queries.readTaskView(value.root, TASK_ID);
  assertTaskVersion(current.record, 'new');
  assert.notEqual(current.recordDigest, original.recordDigest);
  assert.deepEqual(current.taskRelations.children, [{ taskId: 'snapshot-child', title: '新子任务', status: 'active' }]);
});

test('任务分页列表的记录、关系、计数与筛选项来自同一快照', (t) => {
  const value = fixture(t);
  const original = value.queries.queryTasks(value.root, { pageSize: '1' });
  value.afterSummaryRead(() => value.commitUpdatedTask(true));
  const observed = value.queries.queryTasks(value.root, { pageSize: '1' });
  assert.equal(observed.tasks.length, 1);
  assertTaskVersion(observed.tasks[0].record, 'old');
  assert.equal(observed.tasks[0].recordDigest, original.tasks[0].recordDigest);
  assert.deepEqual(observed.tasks[0].taskRelations.children, []);
  assert.equal(observed.totalTaskCount, 1);
  assert.equal(observed.matchingTaskCount, 1);
  assert.equal(observed.hasMore, false);
  assert.deepEqual(observed.filterOptions, { projects: ['old-project'], services: ['old-project/service'] });

  const current = value.queries.queryTasks(value.root, { pageSize: '1' });
  assertTaskVersion(current.tasks[0].record, 'new');
  assert.notEqual(current.tasks[0].recordDigest, original.tasks[0].recordDigest);
  assert.deepEqual(current.tasks[0].taskRelations.children, [{ taskId: 'snapshot-child', title: '新子任务', status: 'active' }]);
  assert.equal(current.totalTaskCount, 2);
  assert.equal(current.matchingTaskCount, 2);
  assert.equal(current.hasMore, true);
  assert.deepEqual(current.filterOptions, { projects: ['new-project'], services: ['new-project/service'] });
});
