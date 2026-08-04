import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
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
  assert.equal(writable.version, 2);
  assert.deepEqual(writable.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })), [
    { version: 0, name: '0000_create_migration_ledger.sql' },
    { version: 1, name: '0001_create_task_store.sql' },
    { version: 2, name: '0002_create_parent_task_relations.sql' },
  ]);
  assert.deepEqual(writable.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name), [
    'schema_migrations', 'task_changes', 'task_parent_relations', 'task_projects', 'task_services', 'tasks',
  ]);
  writable.database.close();

  const before = fs.statSync(file).mtimeMs;
  const readOnly = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(readOnly.version, 2);
  readOnly.database.close();
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.deepEqual(runtime.inspectWorkspaceStructuredStore(root), { status: 'healthy', version: 2, integrity: 'ok' });
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

test('version 1 Task Store 原位升级到 version 2 且保留既有 Task', (t) => {
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
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.database.prepare("SELECT title FROM tasks WHERE task_id = 'existing-task'").get().title, '既有任务');
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_parent_relations'").get().count, 1);
  upgraded.database.close();
  const record = runtime.readTaskRecordPersistence(root, 'existing-task').record;
  assert.equal(record.parentTaskId, null);
  assert.deepEqual(record.childTaskIds, []);
});

test('migration loader 拒绝缺口并以原始 package bytes 计算稳定 checksum', (t) => {
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
  opened.database.prepare(`INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (3, '0003_future.sql', 'sha256-${'f'.repeat(64)}', ?)`).run(new Date().toISOString());
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
  assert.deepEqual(result.structuredStore, { status: 'healthy', version: 2, integrity: 'ok' });
  assert.deepEqual(result.findings, []);

  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(file, 'broken');
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.equal(result.structuredStore.status, 'unavailable');
  assert.equal(result.findings[0].status, 'error');
  assert.equal(JSON.stringify(result).includes(file), false);
});
