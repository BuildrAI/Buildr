import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations, registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test Workspace\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 123e4567-e89b-42d3-a456-426614174000
name: SQLite Test
description: SQLite Test Workspace
runtime:
  node:
    version: ${process.versions.node}
`);
  return root;
}

test('fresh Workspace 按完整 SQL scripts 初始化且重复只读打开零写入', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  assert.equal(fs.existsSync(file), false);

  const writable = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(writable.version, 4);
  assert.deepEqual(writable.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })), [
    { version: 0, name: '0000_create_migration_ledger.sql' },
    { version: 1, name: '0001_create_task_store.sql' },
    { version: 2, name: '0002_create_parent_task_relations.sql' },
    { version: 3, name: '0003_inline_parent_task_column.sql' },
    { version: 4, name: '0004_create_task_current_records.sql' },
  ]);
  assert.deepEqual(writable.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name), [
    'schema_migrations', 'task_changes', 'task_development_current', 'task_projects', 'task_review_current', 'task_services', 'task_verification_current', 'tasks',
  ]);
  assert.ok(writable.database.prepare("PRAGMA table_info(tasks)").all().some((row) => row.name === 'parent_task_id' && row.notnull === 0));
  assert.ok(writable.database.prepare("PRAGMA foreign_key_list(tasks)").all().some((row) => row.from === 'parent_task_id' && row.table === 'tasks' && row.on_delete === 'SET NULL'));
  assert.ok(writable.database.prepare("PRAGMA index_list(tasks)").all().some((row) => row.name === 'tasks_parent_task_idx'));
  for (const table of ['task_development_current', 'task_verification_current', 'task_review_current']) {
    assert.ok(writable.database.prepare(`PRAGMA foreign_key_list(${table})`).all().some((row) => row.from === 'task_id' && row.table === 'tasks' && row.on_delete === 'CASCADE'));
  }
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_review_current)').all().map((row) => row.name), ['task_id', 'review_type', 'result_json']);
  writable.database.close();

  const before = fs.statSync(file).mtimeMs;
  const readOnly = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(readOnly.version, 4);
  readOnly.database.close();
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.deepEqual(runtime.inspectWorkspaceStructuredStore(root), { status: 'healthy', version: 4, integrity: 'ok' });
});

test('只读打开未初始化 Workspace 不创建目录或数据库', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  assert.deepEqual(runtime.openWorkspaceStructuredStore(root, { writable: false }), {
    root,
    file: path.join(root, '.buildr', 'local', 'workspace.sqlite'),
    present: false,
    database: null,
    version: null,
    scripts: runtime.loadWorkspaceSqliteMigrations(),
  });
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local')), false);
  assert.deepEqual(runtime.inspectWorkspaceStructuredStore(root), { status: 'uninitialized', version: null, integrity: null });
});

test('operation scope 只复用单次action的canonical与owner Application read model', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  let checkoutObservations = 0;
  registerWorkspaceSqlite(runtime, { observeCheckout: () => { checkoutObservations += 1; return null; } });
  runtime.createTaskRecord(root, { taskId: 'operation-scope', title: 'Operation scope', intent: 'Verify bounded memoization.', projects: [], services: [], changes: [] });
  checkoutObservations = 0;

  let taskReads = 0;
  const readTaskRecordPersistence = runtime.readTaskRecordPersistence;
  runtime.readTaskRecordPersistence = (...args) => { taskReads += 1; return readTaskRecordPersistence(...args); };
  let environmentReads = 0;
  const readTaskEnvironmentPersistence = runtime.readTaskEnvironmentPersistence;
  runtime.readTaskEnvironmentPersistence = (...args) => { environmentReads += 1; return readTaskEnvironmentPersistence(...args); };

  runtime.withWorkspaceStructuredStoreOperation(root, () => {
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.deepEqual(runtime.inspectTaskRecord(root, 'operation-scope'), runtime.inspectTaskRecord(root, 'operation-scope'));
    assert.deepEqual(runtime.inspectTaskEnvironment(root, 'operation-scope'), runtime.inspectTaskEnvironment(root, 'operation-scope'));
  });
  assert.equal(checkoutObservations, 1);
  assert.equal(taskReads, 3, 'Task Record owner read + Environment owner/repository validation');
  assert.equal(environmentReads, 1);

  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.inspectTaskRecord(root, 'operation-scope'));
  assert.equal(checkoutObservations, 2, '下一action必须重新观察canonical Workspace');
  assert.equal(taskReads, 4);

  assert.throws(() => runtime.withWorkspaceStructuredStoreOperation(root, () => {
    runtime.assertCanonicalStructuredWorkspace(root);
    throw new Error('operation failed');
  }), /operation failed/);
  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.assertCanonicalStructuredWorkspace(root));
  assert.equal(checkoutObservations, 4, '异常结束的scope不得泄漏canonical缓存');
  assert.throws(() => runtime.withWorkspaceStructuredStoreOperation(root, () => Promise.resolve()), (error) => error.code === 'workspace_store_operation_scope_async_forbidden');
});

test('version 1 Task Store 原位升级到 latest 且保留既有 Task', (t) => {
  const root = workspace(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  const migrations = loadWorkspaceSqliteMigrations();
  applyWorkspaceSqliteMigration(database, migrations[0]);
  applyWorkspaceSqliteMigration(database, migrations[1]);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at)
    VALUES ('existing-task', 'buildr.task-record/v1', '既有任务', '升级后保留', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`).run();
  database.close();

  const runtime = createRuntime();
  const upgraded = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(upgraded.version, 4);
  assert.equal(upgraded.database.prepare("SELECT title FROM tasks WHERE task_id = 'existing-task'").get().title, '既有任务');
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_parent_relations'").get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT parent_task_id FROM tasks WHERE task_id = 'existing-task'").get().parent_task_id, null);
  upgraded.database.close();
  const record = runtime.readTaskRecordPersistence(root, 'existing-task').record;
  assert.equal(record.parentTaskId, null);
  assert.deepEqual(record.childTaskIds, []);
});

test('version 2 Parent 关系原位迁入 tasks.parent_task_id 并删除关系表', (t) => {
  const root = workspace(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  const migrations = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, 3)) applyWorkspaceSqliteMigration(database, migration);
  const insert = database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at)
    VALUES (?, 'buildr.task-record/v1', ?, ?, 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`);
  insert.run('parent-task', 'Parent', 'Coordinate');
  insert.run('child-task', 'Child', 'Execute');
  database.prepare("INSERT INTO task_parent_relations(child_task_id, parent_task_id) VALUES ('child-task', 'parent-task')").run();
  database.close();

  const runtime = createRuntime();
  const upgraded = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(upgraded.version, 4);
  assert.equal(upgraded.database.prepare("SELECT parent_task_id FROM tasks WHERE task_id = 'child-task'").get().parent_task_id, 'parent-task');
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_parent_relations'").get().count, 0);
  upgraded.database.close();
  assert.equal(runtime.readTaskRecordPersistence(root, 'child-task').record.parentTaskId, 'parent-task');
  assert.deepEqual(runtime.readTaskRecordPersistence(root, 'parent-task').record.childTaskIds, ['child-task']);
});

test('version 3 current schema连续升级且不迁移旧YAML', (t) => {
  const root = workspace(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  const migrations = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, 4)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('existing-task', 'buildr.task-record/v1', 'Existing', 'Upgrade v3', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.close();
  const legacy = path.join(root, '.buildr', 'tasks', 'existing-task', 'development.yml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy: inert\n');

  const runtime = createRuntime();
  const prepared = runtime.prepareTaskRecordPersistence(root, 'existing-task');
  assert.equal(prepared.record.title, 'Existing');
  const upgraded = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(upgraded.version, 4);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_development_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_verification_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 0);
  assert.deepEqual(upgraded.database.prepare("SELECT name, origin FROM pragma_index_list('task_review_current')").all().map((row) => ({ ...row })), [{ name: 'sqlite_autoindex_task_review_current_1', origin: 'pk' }]);
  upgraded.database.close();
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('migration loader 拒绝缺口并以原始 package bytes 计算稳定 checksum', (t) => {
  assert.equal(loadWorkspaceSqliteMigrations(), loadWorkspaceSqliteMigrations(), '默认package migrations复用不可变解析结果');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-sqlite-migrations-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '0000_create_migration_ledger.sql'), 'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT);\n');
  fs.writeFileSync(path.join(root, '0002_gap.sql'), 'SELECT 1;\n');
  assert.throws(() => loadWorkspaceSqliteMigrations(root), (error) => error.code === 'workspace_store_schema_assets_invalid');

  fs.renameSync(path.join(root, '0002_gap.sql'), path.join(root, '0001_next.sql'));
  const first = loadWorkspaceSqliteMigrations(root);
  fs.appendFileSync(path.join(root, '0001_next.sql'), '-- changed\n');
  const second = loadWorkspaceSqliteMigrations(root);
  assert.notEqual(first[1].checksum, second[1].checksum);
});

test('失败 migration 完整 rollback 且不登记 ledger row', () => {
  const database = new DatabaseSync(':memory:');
  const [ledger] = loadWorkspaceSqliteMigrations();
  applyWorkspaceSqliteMigration(database, ledger);
  const failing = { version: 1, name: '0001_failing.sql', checksum: 'sha256-test', sql: 'CREATE TABLE transient_value(id INTEGER); INSERT INTO missing_table(id) VALUES (1);' };
  assert.throws(() => applyWorkspaceSqliteMigration(database, failing), (error) => error.code === 'workspace_store_database_failed');
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'transient_value'").get().count, 0);
  assert.equal(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count, 1);
  database.close();
});

test('checksum 漂移、版本超前和损坏数据库均 fail closed', (t) => {
  const runtime = createRuntime();

  const driftRoot = workspace(t);
  let opened = runtime.openWorkspaceStructuredStore(driftRoot, { writable: true });
  opened.database.prepare(`UPDATE schema_migrations SET checksum = 'sha256-${'0'.repeat(64)}' WHERE version = 1`).run();
  opened.database.close();
  assert.throws(() => runtime.openWorkspaceStructuredStore(driftRoot, { writable: false }), (error) => error.code === 'workspace_store_migration_drift');

  const newerRoot = workspace(t);
  opened = runtime.openWorkspaceStructuredStore(newerRoot, { writable: true });
  opened.database.prepare(`INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (5, '0005_future.sql', 'sha256-${'f'.repeat(64)}', ?)`).run(new Date().toISOString());
  opened.database.close();
  assert.throws(() => runtime.openWorkspaceStructuredStore(newerRoot, { writable: false }), (error) => error.code === 'workspace_store_database_newer_than_runtime');

  const corruptRoot = workspace(t);
  const corruptFile = path.join(corruptRoot, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(corruptFile), { recursive: true });
  fs.writeFileSync(corruptFile, 'not sqlite');
  assert.throws(() => runtime.openWorkspaceStructuredStore(corruptRoot, { writable: false }), (error) => error.code === 'workspace_store_database_corrupt');
});

test('Doctor 区分未初始化、healthy 与 unavailable 且不暴露数据库 path', (t) => {
  const runtime = createRuntime();
  const root = workspace(t);
  let result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root, true);
  assert.deepEqual(result.structuredStore, { status: 'uninitialized', version: null, integrity: null });
  assert.equal(result.findings[0].status, 'info');

  runtime.openWorkspaceStructuredStore(root, { writable: true }).database.close();
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.deepEqual(result.structuredStore, { status: 'healthy', version: 4, integrity: 'ok' });
  assert.deepEqual(result.findings, []);

  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(file, 'broken');
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.equal(result.structuredStore.status, 'unavailable');
  assert.equal(result.findings[0].status, 'error');
  assert.equal(JSON.stringify(result).includes(file), false);
});
