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

  const migrations = loadWorkspaceSqliteMigrations();
  const latest = migrations.at(-1).version;
  const writable = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(writable.version, latest);
  assert.deepEqual(writable.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })), migrations.map(({ version, name }) => ({ version, name })));
  assert.deepEqual(writable.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name), [
    'schema_migrations', 'task_changes', 'task_development_current', 'task_environment_current', 'task_finish_completions', 'task_finish_runs', 'task_finish_target_leases', 'task_finish_transient_artifacts', 'task_projects', 'task_retrospective_current', 'task_review_current', 'task_services', 'task_verification_current', 'tasks',
  ]);
  assert.ok(writable.database.prepare("PRAGMA table_info(tasks)").all().some((row) => row.name === 'parent_task_id' && row.notnull === 0));
  assert.ok(writable.database.prepare("PRAGMA foreign_key_list(tasks)").all().some((row) => row.from === 'parent_task_id' && row.table === 'tasks' && row.on_delete === 'SET NULL'));
  assert.ok(writable.database.prepare("PRAGMA index_list(tasks)").all().some((row) => row.name === 'tasks_parent_task_idx'));
  for (const table of ['task_development_current', 'task_verification_current', 'task_review_current', 'task_retrospective_current', 'task_finish_runs', 'task_finish_completions']) {
    assert.ok(writable.database.prepare(`PRAGMA foreign_key_list(${table})`).all().some((row) => row.from === 'task_id' && row.table === 'tasks' && row.on_delete === 'CASCADE'));
  }
  assert.ok(writable.database.prepare('PRAGMA foreign_key_list(task_finish_target_leases)').all().some((row) => row.from === 'task_id' && row.table === 'tasks' && row.on_delete === 'CASCADE'));
  assert.ok(writable.database.prepare('PRAGMA foreign_key_list(task_finish_transient_artifacts)').all().some((row) => row.from === 'run_id' && row.table === 'task_finish_runs' && row.on_delete === 'CASCADE'));
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_development_current)').all().map((row) => row.name), ['task_id', 'record_json', 'applicability_status', 'applicability_json', 'observed_at']);
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_review_current)').all().map((row) => row.name), ['task_id', 'review_type', 'result_json', 'target_identity', 'outcome', 'updated_at']);
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_verification_current)').all().map((row) => row.name), ['task_id', 'result_json', 'target_identity', 'outcome', 'updated_at']);
  writable.database.close();

  const before = fs.statSync(file).mtimeMs;
  const readOnly = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(readOnly.version, latest);
  readOnly.database.close();
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.deepEqual(runtime.inspectWorkspaceStructuredStore(root), { status: 'healthy', version: latest, integrity: 'ok' });
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

test('候选 runtime 只能写自身 linked validation Workspace，不能污染 retained canonical store', (t) => {
  const retained = workspace(t);
  const validation = workspace(t);
  const peerValidation = workspace(t);
  const candidateSource = path.join(validation, 'projects', 'product', 'services', 'buildr');
  const peerCandidateSource = path.join(peerValidation, 'projects', 'product', 'services', 'buildr');
  const commonDirectory = path.join(retained, '.git');
  const checkouts = new Map([
    [path.resolve(candidateSource), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(peerCandidateSource), { checkoutRoot: peerValidation, gitDirectory: path.join(commonDirectory, 'worktrees', 'peer-candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(peerValidation), { checkoutRoot: peerValidation, gitDirectory: path.join(commonDirectory, 'worktrees', 'peer-candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const runtime = createRuntime();
  registerWorkspaceSqlite(runtime, { sourceRoot: candidateSource, observeCheckout: (root) => checkouts.get(path.resolve(root)) || null });
  const retainedStore = path.join(retained, '.buildr', 'local', 'workspace.sqlite');

  assert.throws(
    () => runtime.openWorkspaceStructuredStore(retained, { writable: true }),
    (error) => error.code === 'workspace_store_writer_provenance_forbidden',
  );
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local')), false);
  assert.equal(fs.existsSync(retainedStore), false);

  const validationStore = runtime.openWorkspaceStructuredStore(validation, { writable: true });
  assert.equal(validationStore.version, loadWorkspaceSqliteMigrations().at(-1).version);
  validationStore.database.close();
  runtime.createTaskRecord(validation, { taskId: 'candidate-validation-probe', title: 'Candidate validation', intent: 'Verify isolated Task data.', projects: [], services: [], changes: [] });
  assert.equal(runtime.readTaskRecordPersistence(validation, 'candidate-validation-probe').record.title, 'Candidate validation');
  assert.equal(fs.existsSync(path.join(validation, '.buildr', 'local', 'workspace.sqlite')), true);
  assert.equal(fs.existsSync(retainedStore), false);

  assert.throws(
    () => runtime.openWorkspaceStructuredStore(peerValidation, { writable: true }),
    (error) => error.code === 'workspace_store_workspace_not_canonical',
  );
  const peerRuntime = createRuntime();
  registerWorkspaceSqlite(peerRuntime, { sourceRoot: peerCandidateSource, observeCheckout: (root) => checkouts.get(path.resolve(root)) || null });
  peerRuntime.createTaskRecord(peerValidation, { taskId: 'candidate-validation-probe', title: 'Peer candidate validation', intent: 'Verify concurrent isolated Task data.', projects: [], services: [], changes: [] });
  assert.equal(peerRuntime.readTaskRecordPersistence(peerValidation, 'candidate-validation-probe').record.title, 'Peer candidate validation');
  assert.equal(runtime.readTaskRecordPersistence(validation, 'candidate-validation-probe').record.title, 'Candidate validation');
  assert.equal(fs.existsSync(path.join(peerValidation, '.buildr', 'local', 'workspace.sqlite')), true);
  assert.equal(fs.existsSync(retainedStore), false);
});

test('candidate/validation 自身 store 可只读打开且不观察 Git', (t) => {
  const validation = workspace(t);
  const writer = createRuntime();
  writer.openWorkspaceStructuredStore(validation, { writable: true }).database.close();

  const reader = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('只读 store 不得观察 Git'); } });
  const opened = reader.openWorkspaceStructuredStore(validation, { writable: false });
  assert.equal(opened.present, true);
  assert.equal(opened.version, loadWorkspaceSqliteMigrations().at(-1).version);
  opened.database.close();
  assert.equal(reader.inspectWorkspaceStructuredStore(validation).status, 'healthy');
});

test('候选 runtime 对无关普通 Workspace 保持单库写入能力', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  const candidateSource = path.join(os.tmpdir(), 'candidate-source');
  registerWorkspaceSqlite(runtime, {
    sourceRoot: candidateSource,
    observeCheckout: (target) => path.resolve(target) === path.resolve(candidateSource)
      ? { checkoutRoot: candidateSource, gitDirectory: '/tmp/common/worktrees/candidate', gitCommonDirectory: '/tmp/common', linkedWorktree: true }
      : null,
  });

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.close();
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'workspace.sqlite')), true);
});

test('operation scope 只复用单次action的canonical与owner Application read model', (t) => {
  const root = workspace(t);
  const runtime = createRuntime();
  let checkoutObservations = 0;
  registerWorkspaceSqlite(runtime, { observeCheckout: () => { checkoutObservations += 1; return null; } });
  runtime.createTaskRecord(root, { taskId: 'operation-scope', title: 'Operation scope', intent: 'Verify bounded memoization.', projects: [], services: [], changes: [] });
  assert.ok(checkoutObservations > 0, 'writable action 必须观察 provenance');
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
  assert.equal(checkoutObservations, 0, '只读 action 不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 3, 'Task Record owner read + Environment owner/repository validation');
  assert.equal(environmentReads, 1, 'Local Environment inspect 只查询 SQLite Environment current');

  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.inspectTaskRecord(root, 'operation-scope'));
  assert.equal(checkoutObservations, 0, '下一只读 action 仍不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 4);

  assert.throws(() => runtime.withWorkspaceStructuredStoreOperation(root, () => {
    runtime.assertCanonicalStructuredWorkspace(root);
    throw new Error('operation failed');
  }), /operation failed/);
  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.assertCanonicalStructuredWorkspace(root));
  assert.equal(checkoutObservations, 0, '异常只读 scope 也不得触发 Git 观察');
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
  assert.equal(upgraded.version, migrations.at(-1).version);
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
  assert.equal(upgraded.version, migrations.at(-1).version);
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
  assert.equal(upgraded.version, migrations.at(-1).version);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_development_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_verification_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_retrospective_current').get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  assert.ok(upgraded.database.prepare("SELECT name FROM pragma_index_list('task_review_current')").all().some((row) => row.name === 'task_review_current_target_idx'));
  upgraded.database.close();
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('每个既有 migration ledger 版本都可连续升级到当前 schema', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  for (const startingMigration of migrations.slice(0, -1)) {
    const database = new DatabaseSync(':memory:');
    for (const migration of migrations.filter((item) => item.version <= startingMigration.version)) applyWorkspaceSqliteMigration(database, migration);
    assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, startingMigration.version);
    for (const migration of migrations.filter((item) => item.version > startingMigration.version)) applyWorkspaceSqliteMigration(database, migration);
    assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, migrations.at(-1).version);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
    database.close();
  }
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

test('退役 migration迁移专业查询字段、保留Environment authority并删除Lifecycle副本', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, -1)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('migration-task', 'buildr.task-record/v1', 'Migration', 'Retire lifecycle', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('migration-task', '{}')").run();
  database.prepare("INSERT INTO task_review_current(task_id, review_type, result_json) VALUES ('migration-task', 'planning', ?)").run(JSON.stringify({ targetIdentity: 'sha256-plan', conclusion: { outcome: 'ready' }, completedAt: '2026-08-01T01:00:00.000Z' }));
  database.prepare("INSERT INTO task_verification_current(task_id, result_json) VALUES ('migration-task', ?)").run(JSON.stringify({ target: { identity: 'sha256-target' }, conclusion: { outcome: 'passed' }, completedAt: '2026-08-01T02:00:00.000Z' }));
  database.prepare("INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at) VALUES ('migration-task', 'ready', '{}', '2026-08-01T03:00:00.000Z')").run();
  const association = { schemaVersion: 'buildr.task-terminal-delivery-associations/v1', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, gates: { planning: null, completion: null, verification: null } };
  database.prepare("INSERT INTO task_finish_completions(task_id, run_id, status, result_json, completed_at, updated_at) VALUES ('migration-task', 'migration-run', 'complete', ?, '2026-08-01T05:00:00.000Z', '2026-08-01T05:00:00.000Z')").run(JSON.stringify({ association }));
  database.prepare("INSERT INTO task_lifecycle_current(task_id, model_json) VALUES ('migration-task', ?)").run(JSON.stringify({ development: { applicability: { status: 'developing', reasons: [] }, observedAt: '2026-08-01T04:00:00.000Z' }, environment: { status: 'blocked' }, finish: { association } }));

  applyWorkspaceSqliteMigration(database, migrations.at(-1));
  assert.deepEqual({ ...database.prepare("SELECT applicability_status, observed_at FROM task_development_current WHERE task_id = 'migration-task'").get() }, { applicability_status: 'developing', observed_at: '2026-08-01T04:00:00.000Z' });
  assert.deepEqual({ ...database.prepare("SELECT target_identity, outcome, updated_at FROM task_review_current WHERE task_id = 'migration-task'").get() }, { target_identity: 'sha256-plan', outcome: 'ready', updated_at: '2026-08-01T01:00:00.000Z' });
  assert.deepEqual({ ...database.prepare("SELECT target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = 'migration-task'").get() }, { target_identity: 'sha256-target', outcome: 'passed', updated_at: '2026-08-01T02:00:00.000Z' });
  assert.equal(database.prepare("SELECT status FROM task_environment_current WHERE task_id = 'migration-task'").get().status, 'ready');
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  database.close();
});

test('退役 migration遇到无法证明的terminal association时完整rollback', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, -1)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('terminal-task', 'buildr.task-record/v1', 'Terminal', 'Fail closed', 'completed', 'done', 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  const association = { schemaVersion: 'buildr.task-terminal-delivery-associations/v1', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, gates: { planning: null, completion: null, verification: null } };
  database.prepare("INSERT INTO task_lifecycle_current(task_id, model_json) VALUES ('terminal-task', ?)").run(JSON.stringify({ finish: { association } }));
  assert.throws(() => applyWorkspaceSqliteMigration(database, migrations.at(-1)), (error) => error.code === 'workspace_store_database_failed');
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 1);
  assert.deepEqual(database.prepare('PRAGMA table_info(task_development_current)').all().map((row) => row.name), ['task_id', 'record_json']);
  assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, migrations.at(-2).version);
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
  const futureVersion = loadWorkspaceSqliteMigrations().at(-1).version + 1;
  opened.database.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(futureVersion, `${String(futureVersion).padStart(4, '0')}_future.sql`, `sha256-${'f'.repeat(64)}`, new Date().toISOString());
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
  assert.deepEqual(result.structuredStore, { status: 'healthy', version: loadWorkspaceSqliteMigrations().at(-1).version, integrity: 'ok' });
  assert.deepEqual(result.findings, []);

  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(file, 'broken');
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.equal(result.structuredStore.status, 'unavailable');
  assert.equal(result.findings[0].status, 'error');
  assert.equal(JSON.stringify(result).includes(file), false);
});
