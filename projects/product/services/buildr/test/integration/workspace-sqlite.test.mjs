import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations, registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');

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
  const retiredRecords = path.join(root, '.buildr', 'local', 'task-execution-records');
  fs.mkdirSync(retiredRecords, { recursive: true });
  fs.writeFileSync(path.join(retiredRecords, 'retired.txt'), 'retired');
  assert.equal(fs.existsSync(file), false);

  const migrations = loadWorkspaceSqliteMigrations();
  const latest = migrations.at(-1).version;
  const writable = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(writable.version, latest);
  assert.deepEqual(writable.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })), migrations.map(({ version, name }) => ({ version, name })));
  assert.deepEqual(writable.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name), [
    'schema_migrations', 'task_changes', 'task_projects', 'task_retrospective_current', 'task_retrospective_sources', 'task_review_current', 'task_services', 'task_verification_current', 'tasks', 'terminal_contribution_reconciliations',
  ]);
  assert.equal(fs.existsSync(retiredRecords), false);
  assert.ok(writable.database.prepare("PRAGMA table_info(tasks)").all().some((row) => row.name === 'parent_task_id' && row.notnull === 0));
  assert.ok(writable.database.prepare("PRAGMA foreign_key_list(tasks)").all().some((row) => row.from === 'parent_task_id' && row.table === 'tasks' && row.on_delete === 'SET NULL'));
  assert.ok(writable.database.prepare("PRAGMA index_list(tasks)").all().some((row) => row.name === 'tasks_parent_task_idx'));
  for (const table of ['task_verification_current', 'task_review_current', 'task_retrospective_current']) {
    assert.ok(writable.database.prepare(`PRAGMA foreign_key_list(${table})`).all().some((row) => row.from === 'task_id' && row.table === 'tasks' && row.on_delete === 'CASCADE'));
  }
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_record_consumers'").get().count, 0);
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_development_current', 'task_finish_current')").get().count, 0);
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_review_current)').all().map((row) => row.name), ['task_id', 'review_type', 'result_json', 'subject_identity', 'outcome', 'updated_at']);
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

test('候选 runtime 借 installed payload identity 仍不能写 retained canonical store', (t) => {
  const retained = workspace(t);
  const validation = workspace(t);
  const installedPayload = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-installed-payload-'));
  t.after(() => fs.rmSync(installedPayload, { recursive: true, force: true }));
  fs.writeFileSync(path.join(installedPayload, 'application-payload.json'), '{}\n');
  fs.mkdirSync(path.join(installedPayload, 'payload', 'product'), { recursive: true });

  const commonDirectory = path.join(retained, '.git');
  const checkouts = new Map([
    [path.resolve(SERVICE_ROOT), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const runtime = createRuntime();
  const previousPayloadRoot = process.env.BUILDR_APPLICATION_PAYLOAD_ROOT;
  process.env.BUILDR_APPLICATION_PAYLOAD_ROOT = installedPayload;
  t.after(() => {
    if (previousPayloadRoot === undefined) delete process.env.BUILDR_APPLICATION_PAYLOAD_ROOT;
    else process.env.BUILDR_APPLICATION_PAYLOAD_ROOT = previousPayloadRoot;
  });
  registerWorkspaceSqlite(runtime, { observeCheckout: (root) => checkouts.get(path.resolve(root)) || null });
  assert.equal(runtime.productRoot(), path.join(installedPayload, 'payload', 'product'));
  assert.throws(
    () => runtime.openWorkspaceStructuredStore(retained, { writable: true }),
    (error) => error.code === 'workspace_store_writer_provenance_forbidden',
  );
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local')), false);
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local', 'workspace.sqlite')), false);
});

test('候选 migration N+1 即使伪造 writerRole 也不能升级 canonical N', (t) => {
  const retained = workspace(t);
  const validation = workspace(t);
  const candidateSource = path.join(validation, 'projects', 'product', 'services', 'buildr');
  const commonDirectory = path.join(retained, '.git');
  const checkouts = new Map([
    [path.resolve(candidateSource), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const scripts = loadWorkspaceSqliteMigrations();
  const retainedStore = path.join(retained, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(retainedStore), { recursive: true });
  const database = new DatabaseSync(retainedStore);
  for (const script of scripts.slice(0, -1)) applyWorkspaceSqliteMigration(database, script);
  database.close();
  const before = fs.readFileSync(retainedStore);

  const candidate = createRuntime();
  registerWorkspaceSqlite(candidate, { sourceRoot: candidateSource, observeCheckout: (root) => checkouts.get(path.resolve(root)) || null });
  for (const writerRole of ['retained-task-state', 'task-finish-retained']) {
    assert.throws(
      () => candidate.openWorkspaceStructuredStore(retained, { writable: true, writerRole }),
      (error) => error.code === 'workspace_store_writer_provenance_forbidden',
    );
  }
  assert.deepEqual(fs.readFileSync(retainedStore), before);
  const retainedRead = new DatabaseSync(retainedStore, { readOnly: true });
  assert.equal(retainedRead.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, scripts.at(-2).version);
  retainedRead.close();

  const candidateStore = candidate.openWorkspaceStructuredStore(validation, { writable: true });
  assert.equal(candidateStore.version, scripts.at(-1).version);
  candidateStore.database.close();
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
  runtime.withWorkspaceStructuredStoreOperation(root, () => {
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.deepEqual(runtime.inspectTaskRecord(root, 'operation-scope'), runtime.inspectTaskRecord(root, 'operation-scope'));
  });
  assert.equal(checkoutObservations, 0, '只读 action 不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 0, 'Task模块内部读取保持私有且没有跨专业兼容Facade');

  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.inspectTaskRecord(root, 'operation-scope'));
  assert.equal(checkoutObservations, 0, '下一只读 action 仍不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 0, '新operation中的Task模块内部读取也不经过可替换的兼容Facade');

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
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_development_current', 'task_finish_current')").get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_verification_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_retrospective_current').get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  assert.ok(upgraded.database.prepare("SELECT name FROM pragma_index_list('task_review_current')").all().some((row) => row.name === 'task_review_current_subject_idx'));
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

test('Task Review v2 migration迁移两槽位且遇到不一致历史row完整回滚', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const migration = migrations.find((item) => item.name === '0027_migrate_task_review_result_v2.sql');
  const createDatabase = () => {
    const database = new DatabaseSync(':memory:');
    for (const item of migrations.filter((candidate) => candidate.version < migration.version)) applyWorkspaceSqliteMigration(database, item);
    database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
      VALUES ('review-migration', 'buildr.task-record/v2', 'Review', 'Migrate review', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
    return database;
  };
  const legacy = (reviewType, targetIdentity, outcome, completedAt) => JSON.stringify({
    schemaVersion: 'buildr.task-review-result/v1', taskId: 'review-migration', reviewType, targetIdentity,
    method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome, summary: `${reviewType} result` }, completedAt,
  });

  const database = createDatabase();
  database.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'planning', legacy('planning', 'plan:v1', 'ready', '2026-08-01T01:00:00.000Z'), 'plan:v1', 'ready', '2026-08-01T01:00:00.000Z');
  database.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'completion', legacy('completion', 'git:content-v1', 'changes-required', '2026-08-01T02:00:00.000Z'), 'git:content-v1', 'changes-required', '2026-08-01T02:00:00.000Z');
  applyWorkspaceSqliteMigration(database, migration);
  const rows = database.prepare('SELECT review_type, subject_identity, outcome, result_json FROM task_review_current ORDER BY review_type').all();
  assert.deepEqual(rows.map((row) => ({ reviewType: row.review_type, subjectIdentity: row.subject_identity, outcome: row.outcome })), [
    { reviewType: 'completion', subjectIdentity: 'git:content-v1', outcome: 'changes-requested' },
    { reviewType: 'planning', subjectIdentity: 'plan:v1', outcome: 'accepted' },
  ]);
  for (const row of rows) {
    const result = JSON.parse(row.result_json);
    assert.equal(result.schemaVersion, 'buildr.task-review-result/v2');
    assert.equal(result.subjectIdentity, row.subject_identity);
    assert.equal('targetIdentity' in result, false);
  }
  database.close();

  const invalid = createDatabase();
  invalid.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'planning', legacy('planning', 'plan:json', 'ready', '2026-08-01T01:00:00.000Z'), 'plan:column', 'ready', '2026-08-01T01:00:00.000Z');
  assert.throws(() => applyWorkspaceSqliteMigration(invalid, migration), (error) => error.code === 'workspace_store_database_failed');
  assert.deepEqual(invalid.prepare('PRAGMA table_info(task_review_current)').all().map((row) => row.name), ['task_id', 'review_type', 'result_json', 'target_identity', 'outcome', 'updated_at']);
  assert.equal(invalid.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 1);
  assert.equal(invalid.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, migration.version - 1);
  invalid.close();
});

test('v19 数据库可直接完成任务，升级不绕过版本和状态检查', async (t) => {
  const migrations = loadWorkspaceSqliteMigrations();
  for (const scenario of [
    { name: '正常完成', status: 'active' },
    { name: '陈旧版本', status: 'active', expectedRecordDigest: 'sha256-stale', error: 'task_record_conflict' },
    { name: '待办不得报告有改动完成', status: 'todo', error: 'task_record_todo_completion_requires_no_change' },
    { name: '升级失败保留任务', status: 'active', failMigration: true, error: 'workspace_store_database_failed' },
  ]) {
    await t.test(scenario.name, (child) => {
      const root = workspace(child);
      const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const database = new DatabaseSync(file);
      let before;
      try {
        for (const migration of migrations.filter((item) => item.version <= 19)) applyWorkspaceSqliteMigration(database, migration);
        database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
          VALUES ('upgrade-task', 'buildr.task-record/v2', '保留标题', '直接完成旧库任务', ?, NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run(scenario.status);
        if (scenario.failMigration) database.exec('CREATE TABLE terminal_contribution_reconciliations_next(id TEXT);');
        before = database.prepare("SELECT * FROM tasks WHERE task_id = 'upgrade-task'").get();
      } finally { database.close(); }

      const runtime = createRuntime();
      assert.throws(() => runtime.inspectTaskRecord(root, 'upgrade-task'), (error) => error.code === 'workspace_store_migration_required');
      const complete = () => runtime.completeTaskRecord(root, 'upgrade-task', {
        summary: '成果已交付', noChange: false,
        ...(scenario.expectedRecordDigest ? { expectedRecordDigest: scenario.expectedRecordDigest } : {}),
      });
      if (scenario.error) assert.throws(complete, (error) => error.code === scenario.error);
      else {
        const result = complete();
        assert.equal(result.record.status, 'completed');
        assert.deepEqual(result.record.result, { summary: '成果已交付', noChange: false });
        assert.equal(runtime.inspectTaskRecord(root, 'upgrade-task').recordDigest, result.recordDigest);
      }
      const after = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(after.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, scenario.failMigration ? 19 : migrations.at(-1).version);
        const record = after.prepare("SELECT * FROM tasks WHERE task_id = 'upgrade-task'").get();
        if (scenario.error) {
          // Schema upgrades may add columns; a rejected completion must preserve every existing business field.
          assert.deepEqual(Object.fromEntries(Object.keys(before).map((key) => [key, record[key]])), { ...before });
          if (!scenario.failMigration) {
            assert.equal(record.is_parent, 0);
            assert.equal(record.parent_completion_json, null);
          }
        } else { assert.equal(record.title, before.title); assert.equal(record.intent, before.intent); }
      } finally { after.close(); }
    });
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

test('execution record migration建立closed单表、非级联Task FK与完整rollback', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const execution = migrations.find((migration) => migration.name === '0011_create_task_execution_records.sql');
  const database = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < execution.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('execution-task', 'buildr.task-record/v1', 'Execution', 'Closed record', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  applyWorkspaceSqliteMigration(database, execution);
  const insert = database.prepare(`INSERT INTO task_execution_records(
    record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer,
    outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
    stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
    opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
  ) VALUES (?, 'buildr.task-execution-record/v1', 'execution-task', ?, ?, ?, 'target-1', 'test',
    'running', 'open', 'not-required', 'staging', 'reserved', NULL, NULL, 0, 0, 0,
    'buildr.task-execution-record-redaction/v1', 16777216, NULL, '2026-08-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z')`);
  insert.run('record-valid', 'task-verification', 'verification-execution', 'run-valid');
  assert.throws(() => insert.run('record-owner', 'task-review', 'review-execution', 'run-owner'));
  assert.throws(() => insert.run('record-kind', 'task-verification', 'finish-diagnostics', 'run-kind'));
  assert.throws(() => database.prepare("UPDATE task_execution_records SET lifecycle_status = 'cleaned' WHERE record_id = 'record-valid'").run());
  assert.throws(() => database.prepare("DELETE FROM tasks WHERE task_id = 'execution-task'").run());
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row) => row.name === 'task_execution_records_lifecycle_retention_idx'));
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_execution_record_consumers', 'task_lifecycle_current')").get().count, 0);
  database.close();

  const rollback = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < execution.version)) applyWorkspaceSqliteMigration(rollback, migration);
  assert.throws(() => applyWorkspaceSqliteMigration(rollback, { ...execution, checksum: 'sha256-injected', sql: `${execution.sql}\nINSERT INTO missing_execution_table(id) VALUES (1);` }), (error) => error.code === 'workspace_store_database_failed');
  assert.equal(rollback.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 0);
  assert.equal(rollback.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, execution.version - 1);
  rollback.close();
});

test('execution invocation migration兼容legacy row并建立active identity索引', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const invocation = migrations.find((migration) => migration.name === '0014_add_task_execution_invocation_identity.sql');
  const database = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < invocation.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('invocation-task', 'buildr.task-record/v2', 'Invocation', 'Legacy compatibility', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at)
    VALUES ('legacy-record', 'buildr.task-execution-record/v1', 'invocation-task', 'task-verification', 'verification-execution', 'legacy-run', 'target', 'test', 'running', 'open', 'not-required', 'staging', 'reserved', NULL, NULL, 0, 0, 0, 'buildr.task-execution-record-redaction/v1', 16777216, NULL, '2026-08-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z')`).run();
  applyWorkspaceSqliteMigration(database, invocation);
  assert.equal(database.prepare("SELECT invocation_identity FROM task_execution_records WHERE record_id = 'legacy-record'").get().invocation_identity, null);
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row) => row.name === 'task_execution_records_active_invocation_idx'));
  assert.throws(() => database.prepare("UPDATE task_execution_records SET invocation_identity = 'sha256-not-a-digest' WHERE record_id = 'legacy-record'").run());
  database.close();
});

test('execution unknown outcome migration保留既有row并扩展单表约束', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const unknown = migrations.find((migration) => migration.name === '0015_add_task_execution_unknown_outcome.sql');
  const database = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < unknown.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('unknown-task', 'buildr.task-record/v2', 'Unknown', 'Recover open execution', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  const invocationIdentity = `sha256-${'a'.repeat(64)}`;
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at, invocation_identity)
    VALUES ('open-before-unknown', 'buildr.task-execution-record/v1', 'unknown-task', 'task-verification', 'verification-execution', 'run-open', 'target', 'test', 'running', 'open', 'not-required', 'staging', 'reserved', NULL, NULL, 0, 0, 0, 'buildr.task-execution-record-redaction/v1', 16777216, NULL, '2026-08-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z', ?)`).run(invocationIdentity);

  applyWorkspaceSqliteMigration(database, unknown);

  assert.deepEqual({ ...database.prepare("SELECT run_identity, invocation_identity, lifecycle_status, outcome FROM task_execution_records WHERE record_id = 'open-before-unknown'").get() }, {
    run_identity: 'run-open', invocation_identity: invocationIdentity, lifecycle_status: 'open', outcome: 'running',
  });
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row) => row.name === 'task_execution_records_active_invocation_idx'));
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at)
    VALUES ('unknown-terminal', 'buildr.task-execution-record/v1', 'unknown-task', 'task-verification', 'verification-execution', 'run-unknown', ?, 'target', 'test', 'unknown', 'retained', 'acknowledged', 'available', 'charged', '.buildr/local/task-execution-records/task-verification/unknown-terminal/', ?, 10, 10, 0, 'buildr.task-execution-record-redaction/v1', 0, '2026-09-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2026-08-02T00:01:00.000Z', '2026-08-02T00:01:00.000Z', NULL, NULL, NULL, '2026-08-02T00:01:00.000Z')`).run(`sha256-${'b'.repeat(64)}`, `sha256-${'c'.repeat(64)}`);
  assert.equal(database.prepare("SELECT outcome FROM task_execution_records WHERE record_id = 'unknown-terminal'").get().outcome, 'unknown');
  assert.throws(() => database.prepare("UPDATE task_execution_records SET resolution_status = 'pending', resolved_at = NULL WHERE record_id = 'unknown-terminal'").run());
  database.close();
});

test('Task Execution Record退役migration删除整张表', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const retirement = migrations.find((migration) => migration.name === '0025_drop_task_execution_records.sql');
  const database = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 1);
  applyWorkspaceSqliteMigration(database, retirement);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 0);
  database.close();
});

test('Task Verification报告migration保留真实检查并把无检查的历史passed降为incomplete', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const refactor = migrations.find((migration) => migration.name === '0023_refactor_task_verification_report.sql');
  const database = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item) => item.version < refactor.version)) applyWorkspaceSqliteMigration(database, migration);
  for (const taskId of ['legacy-passed', 'legacy-empty']) database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES (?, 'buildr.task-record/v2', 'Legacy verification', 'Migrate verification report', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run(taskId);
  const base = { schemaVersion: 'buildr.task-verification-result/v2', target: { identity: 'sha256-target', summary: 'Legacy target' }, declarations: [], coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Legacy passed' }, completedAt: '2026-08-01T01:00:00.000Z' };
  database.prepare('INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy-passed', JSON.stringify({ ...base, capabilities: [{ project: 'demo', capability: 'demo-unit', outcome: 'passed', facts: ['Legacy unit passed'] }] }), 'sha256-target', 'passed', base.completedAt);
  database.prepare('INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy-empty', JSON.stringify({ ...base, capabilities: [] }), 'sha256-target', 'passed', base.completedAt);

  applyWorkspaceSqliteMigration(database, refactor);

  const passed = JSON.parse(database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'legacy-passed'").get().result_json);
  assert.equal(passed.conclusion.outcome, 'passed');
  assert.equal(passed.checks.length, 1);
  assert.equal(passed.checks[0].mapStatus, 'map-unavailable');
  assert.ok(passed.gaps.some((gap) => gap.testing === 'legacy-verification-map'));
  const incomplete = JSON.parse(database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'legacy-empty'").get().result_json);
  assert.equal(incomplete.conclusion.outcome, 'incomplete');
  assert.equal(incomplete.gaps[0].testing, 'legacy-verification-coverage');
  assert.equal(database.prepare("SELECT outcome FROM task_verification_current WHERE task_id = 'legacy-empty'").get().outcome, 'incomplete');
  database.close();
});

test('Task workflow retirement migration删除研发与旧收尾数据且保留其他事实', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  const retirement = migrations.find((migration) => migration.name === '0028_drop_task_development_and_finish_current.sql');
  for (const migration of migrations.filter((item) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('retired-workflow', 'buildr.task-record/v2', 'Retire workflow', 'Delete obsolete current rows', 'completed', 'done', 0, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('retired-workflow', '{}')").run();
  const phases = JSON.stringify(['preflight', 'prepare', 'verify', 'deliver', 'cleanup'].map((id) => ({ id, status: 'passed', attempts: 1 })));
  database.prepare(`INSERT INTO task_finish_current(
    task_id, run_id, schema_version, status, identity_digest, current_phase,
    handoff_identity, candidate_identity, candidate_generation, content_target_identity,
    phases_json, payload_json, created_at, updated_at, completed_at
  ) VALUES ('retired-workflow', 'retired-run', 'buildr.task-finish-current/v2', 'complete', 'sha256-run', 'cleanup',
    'sha256-handoff', 'sha256-candidate', 1, 'sha256-content', ?, '{}',
    '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z', '2026-09-02T01:00:00.000Z')`).run(phases);

  applyWorkspaceSqliteMigration(database, retirement);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_development_current', 'task_finish_current')").get().count, 0);
  assert.equal(database.prepare("SELECT status FROM tasks WHERE task_id = 'retired-workflow'").get().status, 'completed');
  assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, retirement.version);
  database.close();
});

test('Task Environment retirement migration直接删除旧数据且保留其他Task专业事实', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  const retirement = migrations.find((migration) => migration.name === '0029_drop_task_environment_current.sql');
  for (const migration of migrations.filter((item) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('environment-retirement', 'buildr.task-record/v2', 'Retire environment', 'Delete obsolete environment data', 'completed', 'delivered', 0, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at) VALUES ('environment-retirement', 'ready', '{\"legacy\":true}', '2026-09-02T01:00:00.000Z')").run();
  database.prepare("INSERT INTO task_review_current(task_id, review_type, result_json, subject_identity, outcome, updated_at) VALUES ('environment-retirement', 'completion', '{}', 'sha256-subject', 'accepted', '2026-09-02T01:00:00.000Z')").run();

  applyWorkspaceSqliteMigration(database, retirement);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_environment_current'").get().count, 0);
  assert.equal(database.prepare("SELECT status FROM tasks WHERE task_id = 'environment-retirement'").get().status, 'completed');
  assert.equal(database.prepare("SELECT outcome FROM task_review_current WHERE task_id = 'environment-retirement'").get().outcome, 'accepted');
  assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, retirement.version);
  database.close();
});

test('复盘处置 migration把既有Result初始化为pending并建立三态约束', () => {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  const disposition = migrations.find((migration) => migration.name === '0010_add_task_retrospective_disposition.sql');
  for (const migration of migrations.filter((item) => item.version < disposition.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('retrospective-task', 'buildr.task-record/v1', 'Retrospective', 'Disposition migration', 'completed', 'done', 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_retrospective_current(task_id, result_json) VALUES ('retrospective-task', ?)").run(JSON.stringify({
    schemaVersion: 'buildr.task-retrospective-result/v1', taskId: 'retrospective-task', focus: 'agent-execution-efficiency', reportMarkdown: '# 复盘', completedAt: '2026-08-01T01:00:00.000Z',
  }));

  applyWorkspaceSqliteMigration(database, disposition);
  assert.deepEqual({ ...database.prepare("SELECT disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = 'retrospective-task'").get() }, {
    disposition_status: 'pending', disposition_note: null, disposed_at: null,
  });
  assert.throws(() => database.prepare("UPDATE task_retrospective_current SET disposition_status = 'handled' WHERE task_id = 'retrospective-task'").run());
  assert.throws(() => database.prepare("UPDATE task_retrospective_current SET disposition_note = '不应保留' WHERE task_id = 'retrospective-task'").run());
  database.prepare("UPDATE task_retrospective_current SET disposition_status = 'no-action', disposition_note = '无需行动', disposed_at = '2026-08-01T02:00:00.000Z' WHERE task_id = 'retrospective-task'").run();
  assert.equal(database.prepare("SELECT disposition_status FROM task_retrospective_current WHERE task_id = 'retrospective-task'").get().disposition_status, 'no-action');
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
