import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations, registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');

function workspace(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-sqlite-'));
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

test('fresh Workspace 按完整 SQL scripts 初始化且重复只读打开零写入', (t: any) => {
  const root: any = workspace(t);
  const runtime: any = createRuntime();
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const retiredRecords: any = path.join(root, '.buildr', 'local', 'task-execution-records');
  fs.mkdirSync(retiredRecords, { recursive: true });
  fs.writeFileSync(path.join(retiredRecords, 'retired.txt'), 'retired');
  assert.equal(fs.existsSync(file), false);

  const migrations: any = loadWorkspaceSqliteMigrations();
  const latest: any = migrations.at(-1).version;
  const writable: any = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(writable.version, latest);
  assert.deepEqual(writable.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row: any) => ({ ...row })), migrations.map(({ version, name }: any) => ({ version, name })));
  assert.deepEqual(writable.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row: any) => row.name), [
    'schema_migrations', 'task_changes', 'task_projects', 'task_review_current', 'task_services', 'task_verification_current', 'tasks',
  ]);
  assert.equal(fs.existsSync(retiredRecords), false);
  assert.ok(writable.database.prepare("PRAGMA table_info(tasks)").all().some((row: any) => row.name === 'parent_task_id' && row.notnull === 0));
  assert.equal(writable.database.prepare("PRAGMA table_info(tasks)").all().some((row: any) => ['schema_version', 'result_no_change'].includes(row.name)), false);
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'terminal_contribution_reconciliations'").get().count, 0);
  assert.ok(writable.database.prepare("PRAGMA foreign_key_list(tasks)").all().some((row: any) => row.from === 'parent_task_id' && row.table === 'tasks' && row.on_delete === 'SET NULL'));
  assert.ok(writable.database.prepare("PRAGMA index_list(tasks)").all().some((row: any) => row.name === 'tasks_parent_task_idx'));
  for (const table of ['task_verification_current', 'task_review_current']) {
    assert.ok(writable.database.prepare(`PRAGMA foreign_key_list(${table})`).all().some((row: any) => row.from === 'task_id' && row.table === 'tasks' && row.on_delete === 'CASCADE'));
  }
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_record_consumers'").get().count, 0);
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  assert.equal(writable.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_development_current', 'task_finish_current')").get().count, 0);
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_review_current)').all().map((row: any) => row.name), ['task_id', 'review_type', 'result_json', 'subject_identity', 'outcome', 'updated_at']);
  assert.deepEqual(writable.database.prepare('PRAGMA table_info(task_verification_current)').all().map((row: any) => row.name), ['task_id', 'result_json', 'target_identity', 'outcome', 'updated_at']);
  writable.database.close();

  const before: any = fs.statSync(file).mtimeMs;
  const readOnly: any = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(readOnly.version, latest);
  readOnly.database.close();
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.deepEqual(runtime.inspectWorkspaceStructuredStore(root), { status: 'healthy', version: latest, integrity: 'ok' });
});

test('只读打开未初始化 Workspace 不创建目录或数据库', (t: any) => {
  const root: any = workspace(t);
  const runtime: any = createRuntime();
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

test('候选 runtime 只能写自身 linked validation Workspace，不能污染 retained canonical store', (t: any) => {
  const retained: any = workspace(t);
  const validation: any = workspace(t);
  const peerValidation: any = workspace(t);
  const candidateSource: any = path.join(validation, 'projects', 'product', 'services', 'buildr');
  const peerCandidateSource: any = path.join(peerValidation, 'projects', 'product', 'services', 'buildr');
  const commonDirectory: any = path.join(retained, '.git');
  const checkouts: any = new Map([
    [path.resolve(candidateSource), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(peerCandidateSource), { checkoutRoot: peerValidation, gitDirectory: path.join(commonDirectory, 'worktrees', 'peer-candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(peerValidation), { checkoutRoot: peerValidation, gitDirectory: path.join(commonDirectory, 'worktrees', 'peer-candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const runtime: any = createRuntime();
  registerWorkspaceSqlite(runtime, { sourceRoot: candidateSource, observeCheckout: (root: any) => checkouts.get(path.resolve(root)) || null });
  const retainedStore: any = path.join(retained, '.buildr', 'local', 'workspace.sqlite');

  assert.throws(
    () => runtime.openWorkspaceStructuredStore(retained, { writable: true }),
    (error: any) => error.code === 'workspace_store_writer_provenance_forbidden',
  );
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local')), false);
  assert.equal(fs.existsSync(retainedStore), false);

  const validationStore: any = runtime.openWorkspaceStructuredStore(validation, { writable: true });
  assert.equal(validationStore.version, loadWorkspaceSqliteMigrations().at(-1).version);
  validationStore.database.close();
  runtime.createTask(validation, { taskId: 'candidate-validation-probe', title: 'Candidate validation', intent: 'Verify isolated Task data.', projects: [], services: [], changes: [] });
  assert.equal(runtime.readTask(validation, 'candidate-validation-probe').record.title, 'Candidate validation');
  assert.equal(fs.existsSync(path.join(validation, '.buildr', 'local', 'workspace.sqlite')), true);
  assert.equal(fs.existsSync(retainedStore), false);

  assert.throws(
    () => runtime.openWorkspaceStructuredStore(peerValidation, { writable: true }),
    (error: any) => error.code === 'workspace_store_workspace_not_canonical',
  );
  const peerRuntime: any = createRuntime();
  registerWorkspaceSqlite(peerRuntime, { sourceRoot: peerCandidateSource, observeCheckout: (root: any) => checkouts.get(path.resolve(root)) || null });
  peerRuntime.createTask(peerValidation, { taskId: 'candidate-validation-probe', title: 'Peer candidate validation', intent: 'Verify concurrent isolated Task data.', projects: [], services: [], changes: [] });
  assert.equal(peerRuntime.readTask(peerValidation, 'candidate-validation-probe').record.title, 'Peer candidate validation');
  assert.equal(runtime.readTask(validation, 'candidate-validation-probe').record.title, 'Candidate validation');
  assert.equal(fs.existsSync(path.join(peerValidation, '.buildr', 'local', 'workspace.sqlite')), true);
  assert.equal(fs.existsSync(retainedStore), false);
});

test('候选 runtime 借 installed payload identity 仍不能写 retained canonical store', (t: any) => {
  const retained: any = workspace(t);
  const validation: any = workspace(t);
  const installedPayload: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-installed-payload-'));
  t.after(() => fs.rmSync(installedPayload, { recursive: true, force: true }));
  fs.writeFileSync(path.join(installedPayload, 'application-payload.json'), '{}\n');
  fs.mkdirSync(path.join(installedPayload, 'payload', 'product'), { recursive: true });

  const commonDirectory: any = path.join(retained, '.git');
  const checkouts: any = new Map([
    [path.resolve(SERVICE_ROOT), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const runtime: any = createRuntime();
  const previousPayloadRoot: any = process.env.BUILDR_APPLICATION_PAYLOAD_ROOT;
  process.env.BUILDR_APPLICATION_PAYLOAD_ROOT = installedPayload;
  t.after(() => {
    if (previousPayloadRoot === undefined) delete process.env.BUILDR_APPLICATION_PAYLOAD_ROOT;
    else process.env.BUILDR_APPLICATION_PAYLOAD_ROOT = previousPayloadRoot;
  });
  registerWorkspaceSqlite(runtime, { observeCheckout: (root: any) => checkouts.get(path.resolve(root)) || null });
  assert.equal(runtime.productRoot(), path.join(installedPayload, 'payload', 'product'));
  assert.throws(
    () => runtime.openWorkspaceStructuredStore(retained, { writable: true }),
    (error: any) => error.code === 'workspace_store_writer_provenance_forbidden',
  );
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local')), false);
  assert.equal(fs.existsSync(path.join(retained, '.buildr', 'local', 'workspace.sqlite')), false);
});

test('候选 migration N+1 即使伪造 writerRole 也不能升级 canonical N', (t: any) => {
  const retained: any = workspace(t);
  const validation: any = workspace(t);
  const candidateSource: any = path.join(validation, 'projects', 'product', 'services', 'buildr');
  const commonDirectory: any = path.join(retained, '.git');
  const checkouts: any = new Map([
    [path.resolve(candidateSource), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
    [path.resolve(retained), { checkoutRoot: retained, gitDirectory: commonDirectory, gitCommonDirectory: commonDirectory, linkedWorktree: false }],
    [path.resolve(validation), { checkoutRoot: validation, gitDirectory: path.join(commonDirectory, 'worktrees', 'candidate'), gitCommonDirectory: commonDirectory, linkedWorktree: true }],
  ]);
  const scripts: any = loadWorkspaceSqliteMigrations();
  const retainedStore: any = path.join(retained, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(retainedStore), { recursive: true });
  const database: any = new DatabaseSync(retainedStore);
  for (const script of scripts.slice(0, -1)) applyWorkspaceSqliteMigration(database, script);
  database.close();
  const before: any = fs.readFileSync(retainedStore);

  const candidate: any = createRuntime();
  registerWorkspaceSqlite(candidate, { sourceRoot: candidateSource, observeCheckout: (root: any) => checkouts.get(path.resolve(root)) || null });
  for (const writerRole of ['retained-task-state', 'task-finish-retained']) {
    assert.throws(
      () => candidate.openWorkspaceStructuredStore(retained, { writable: true, writerRole }),
      (error: any) => error.code === 'workspace_store_writer_provenance_forbidden',
    );
  }
  assert.deepEqual(fs.readFileSync(retainedStore), before);
  const retainedRead: any = new DatabaseSync(retainedStore, { readOnly: true });
  assert.equal(retainedRead.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, scripts.at(-2).version);
  retainedRead.close();

  const candidateStore: any = candidate.openWorkspaceStructuredStore(validation, { writable: true });
  assert.equal(candidateStore.version, scripts.at(-1).version);
  candidateStore.database.close();
});

test('candidate/validation 自身 store 可只读打开且不观察 Git', (t: any) => {
  const validation: any = workspace(t);
  const writer: any = createRuntime();
  writer.openWorkspaceStructuredStore(validation, { writable: true }).database.close();

  const reader: any = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('只读 store 不得观察 Git'); } });
  const opened: any = reader.openWorkspaceStructuredStore(validation, { writable: false });
  assert.equal(opened.present, true);
  assert.equal(opened.version, loadWorkspaceSqliteMigrations().at(-1).version);
  opened.database.close();
  assert.equal(reader.inspectWorkspaceStructuredStore(validation).status, 'healthy');
});

test('候选 runtime 对无关普通 Workspace 保持单库写入能力', (t: any) => {
  const root: any = workspace(t);
  const runtime: any = createRuntime();
  const candidateSource: any = path.join(os.tmpdir(), 'candidate-source');
  registerWorkspaceSqlite(runtime, {
    sourceRoot: candidateSource,
    observeCheckout: (target: any) => path.resolve(target) === path.resolve(candidateSource)
      ? { checkoutRoot: candidateSource, gitDirectory: '/tmp/common/worktrees/candidate', gitCommonDirectory: '/tmp/common', linkedWorktree: true }
      : null,
  });

  const opened: any = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.close();
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'workspace.sqlite')), true);
});

test('operation scope 只复用单次action的canonical与owner Application read model', (t: any) => {
  const root: any = workspace(t);
  const runtime: any = createRuntime();
  let checkoutObservations: any = 0;
  registerWorkspaceSqlite(runtime, { observeCheckout: () => { checkoutObservations += 1; return null; } });
  runtime.createTask(root, { taskId: 'operation-scope', title: 'Operation scope', intent: 'Verify bounded memoization.', projects: [], services: [], changes: [] });
  assert.ok(checkoutObservations > 0, 'writable action 必须观察 provenance');
  checkoutObservations = 0;

  let taskReads: any = 0;
  const readTask: any = runtime.readTask;
  runtime.readTask = (...args: any[]) => { taskReads += 1; return readTask(...args); };
  runtime.withWorkspaceStructuredStoreOperation(root, () => {
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.equal(runtime.assertCanonicalStructuredWorkspace(root), root);
    assert.deepEqual(runtime.inspectTask(root, 'operation-scope'), runtime.inspectTask(root, 'operation-scope'));
  });
  assert.equal(checkoutObservations, 0, '只读 action 不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 0, 'Task模块内部读取保持私有且没有跨专业兼容Facade');

  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.inspectTask(root, 'operation-scope'));
  assert.equal(checkoutObservations, 0, '下一只读 action 仍不得观察 canonical Workspace provenance');
  assert.equal(taskReads, 0, '新operation中的Task模块内部读取也不经过可替换的兼容Facade');

  assert.throws(() => runtime.withWorkspaceStructuredStoreOperation(root, () => {
    runtime.assertCanonicalStructuredWorkspace(root);
    throw new Error('operation failed');
  }), /operation failed/);
  runtime.withWorkspaceStructuredStoreOperation(root, () => runtime.assertCanonicalStructuredWorkspace(root));
  assert.equal(checkoutObservations, 0, '异常只读 scope 也不得触发 Git 观察');
  assert.throws(() => runtime.withWorkspaceStructuredStoreOperation(root, () => Promise.resolve()), (error: any) => error.code === 'workspace_store_operation_scope_async_forbidden');
});

test('version 1 Task Store 原位升级到 latest 且保留既有 Task', (t: any) => {
  const root: any = workspace(t);
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database: any = new DatabaseSync(file);
  const migrations: any = loadWorkspaceSqliteMigrations();
  applyWorkspaceSqliteMigration(database, migrations[0]);
  applyWorkspaceSqliteMigration(database, migrations[1]);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at)
    VALUES ('existing-task', 'buildr.task-record/v1', '既有任务', '升级后保留', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`).run();
  database.close();

  const runtime: any = createRuntime();
  const upgraded: any = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(upgraded.version, migrations.at(-1).version);
  assert.equal(upgraded.database.prepare("SELECT title FROM tasks WHERE task_id = 'existing-task'").get().title, '既有任务');
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_parent_relations'").get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT parent_task_id FROM tasks WHERE task_id = 'existing-task'").get().parent_task_id, null);
  upgraded.database.close();
  const record: any = runtime.readTask(root, 'existing-task').record;
  assert.equal(record.parentTaskId, null);
  assert.equal('childTaskIds' in record, false);
});

test('version 2 Parent 关系原位迁入 tasks.parent_task_id 并删除关系表', (t: any) => {
  const root: any = workspace(t);
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database: any = new DatabaseSync(file);
  const migrations: any = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, 3)) applyWorkspaceSqliteMigration(database, migration);
  const insert: any = database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at)
    VALUES (?, 'buildr.task-record/v1', ?, ?, 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`);
  insert.run('parent-task', 'Parent', 'Coordinate');
  insert.run('child-task', 'Child', 'Execute');
  database.prepare("INSERT INTO task_parent_relations(child_task_id, parent_task_id) VALUES ('child-task', 'parent-task')").run();
  database.close();

  const runtime: any = createRuntime();
  const upgraded: any = runtime.openWorkspaceStructuredStore(root, { writable: true });
  assert.equal(upgraded.version, migrations.at(-1).version);
  assert.equal(upgraded.database.prepare("SELECT parent_task_id FROM tasks WHERE task_id = 'child-task'").get().parent_task_id, 'parent-task');
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_parent_relations'").get().count, 0);
  upgraded.database.close();
  assert.equal(runtime.readTask(root, 'child-task').record.parentTaskId, 'parent-task');
  assert.deepEqual(runtime.readTaskView(root, 'parent-task').taskRelations.children.map((child: any) => child.taskId), ['child-task']);
});

test('version 3 current schema连续升级且不迁移旧YAML', (t: any) => {
  const root: any = workspace(t);
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database: any = new DatabaseSync(file);
  const migrations: any = loadWorkspaceSqliteMigrations();
  for (const migration of migrations.slice(0, 4)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('existing-task', 'buildr.task-record/v1', 'Existing', 'Upgrade v3', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.close();
  const legacy: any = path.join(root, '.buildr', 'tasks', 'existing-task', 'development.yml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy: inert\n');

  const runtime: any = createRuntime();
  const prepared: any = runtime.prepareTask(root, 'existing-task');
  assert.equal(prepared.record.title, 'Existing');
  const upgraded: any = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(upgraded.version, migrations.at(-1).version);
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_development_current', 'task_finish_current')").get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_verification_current').get().count, 0);
  assert.equal(upgraded.database.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_retrospective_current', 'task_retrospective_sources')").get().count, 0);
  assert.equal(upgraded.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  assert.ok(upgraded.database.prepare("SELECT name FROM pragma_index_list('task_review_current')").all().some((row: any) => row.name === 'task_review_current_subject_idx'));
  upgraded.database.close();
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('每个既有 migration ledger 版本都可连续升级到当前 schema', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  for (const startingMigration of migrations.slice(0, -1)) {
    const database: any = new DatabaseSync(':memory:');
    for (const migration of migrations.filter((item: any) => item.version <= startingMigration.version)) applyWorkspaceSqliteMigration(database, migration);
    assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, startingMigration.version);
    for (const migration of migrations.filter((item: any) => item.version > startingMigration.version)) applyWorkspaceSqliteMigration(database, migration);
    assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, migrations.at(-1).version);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
    database.close();
  }
});

test('Task Review v2 migration迁移两槽位且遇到不一致历史row完整回滚', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const migration: any = migrations.find((item: any) => item.name === '0027_migrate_task_review_result_v2.sql');
  const createDatabase: any = () => {
    const database: any = new DatabaseSync(':memory:');
    for (const item of migrations.filter((candidate: any) => candidate.version < migration.version)) applyWorkspaceSqliteMigration(database, item);
    database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
      VALUES ('review-migration', 'buildr.task-record/v2', 'Review', 'Migrate review', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
    return database;
  };
  const legacy: any = (reviewType: any, targetIdentity: any, outcome: any, completedAt: any) => JSON.stringify({
    schemaVersion: 'buildr.task-review-result/v1', taskId: 'review-migration', reviewType, targetIdentity,
    method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome, summary: `${reviewType} result` }, completedAt,
  });

  const database: any = createDatabase();
  database.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'planning', legacy('planning', 'plan:v1', 'ready', '2026-08-01T01:00:00.000Z'), 'plan:v1', 'ready', '2026-08-01T01:00:00.000Z');
  database.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'completion', legacy('completion', 'git:content-v1', 'changes-required', '2026-08-01T02:00:00.000Z'), 'git:content-v1', 'changes-required', '2026-08-01T02:00:00.000Z');
  applyWorkspaceSqliteMigration(database, migration);
  const rows: any = database.prepare('SELECT review_type, subject_identity, outcome, result_json FROM task_review_current ORDER BY review_type').all();
  assert.deepEqual(rows.map((row: any) => ({ reviewType: row.review_type, subjectIdentity: row.subject_identity, outcome: row.outcome })), [
    { reviewType: 'completion', subjectIdentity: 'git:content-v1', outcome: 'changes-requested' },
    { reviewType: 'planning', subjectIdentity: 'plan:v1', outcome: 'accepted' },
  ]);
  for (const row of rows) {
    const result: any = JSON.parse(row.result_json);
    assert.equal(result.schemaVersion, 'buildr.task-review-result/v2');
    assert.equal(result.subjectIdentity, row.subject_identity);
    assert.equal('targetIdentity' in result, false);
  }
  database.close();

  const invalid: any = createDatabase();
  invalid.prepare('INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('review-migration', 'planning', legacy('planning', 'plan:json', 'ready', '2026-08-01T01:00:00.000Z'), 'plan:column', 'ready', '2026-08-01T01:00:00.000Z');
  assert.throws(() => applyWorkspaceSqliteMigration(invalid, migration), (error: any) => error.code === 'workspace_store_database_failed');
  assert.deepEqual(invalid.prepare('PRAGMA table_info(task_review_current)').all().map((row: any) => row.name), ['task_id', 'review_type', 'result_json', 'target_identity', 'outcome', 'updated_at']);
  assert.equal(invalid.prepare('SELECT count(*) AS count FROM task_review_current').get().count, 1);
  assert.equal(invalid.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, migration.version - 1);
  invalid.close();
});

test('v19 数据库先升级并观察当前摘要，再完成任务且不绕过并发检查', async (t: any) => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  for (const scenario of [
    { name: '正常完成', status: 'active' },
    { name: '陈旧版本', status: 'active', expectedRecordDigest: 'sha256-stale', error: 'task_record_conflict' },
    { name: '待办可直接形成明确结果', status: 'todo' },
    { name: '升级失败保留任务', status: 'active', failMigration: true, error: 'workspace_store_database_failed' },
  ]) {
    await t.test(scenario.name, (child: any) => {
      const root: any = workspace(child);
      const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const database: any = new DatabaseSync(file);
      let before: any;
      try {
        for (const migration of migrations.filter((item: any) => item.version <= 19)) applyWorkspaceSqliteMigration(database, migration);
        database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
          VALUES ('upgrade-task', 'buildr.task-record/v2', '保留标题', '直接完成旧库任务', ?, NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run(scenario.status);
        if (scenario.failMigration) database.exec('CREATE TABLE terminal_contribution_reconciliations_next(id TEXT);');
        before = database.prepare("SELECT * FROM tasks WHERE task_id = 'upgrade-task'").get();
      } finally { database.close(); }

      const runtime: any = createRuntime();
      assert.throws(() => runtime.inspectTask(root, 'upgrade-task'), (error: any) => error.code === 'workspace_store_migration_required');
      if (scenario.failMigration) {
        assert.throws(() => runtime.prepareTask(root, 'upgrade-task'), (error: any) => error.code === scenario.error);
      } else {
        const prepared: any = runtime.prepareTask(root, 'upgrade-task');
        const complete: any = () => runtime.completeTask(root, 'upgrade-task', {
          expectedRecordDigest: scenario.expectedRecordDigest || prepared.recordDigest,
          summary: '成果已交付',
        });
        if (scenario.error) assert.throws(complete, (error: any) => error.code === scenario.error);
        else {
        const result: any = complete();
        assert.equal(result.record.status, 'completed');
        assert.deepEqual(result.record.result, { summary: '成果已交付' });
        assert.equal(runtime.inspectTask(root, 'upgrade-task').recordDigest, result.recordDigest);
        }
      }
      const after: any = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(after.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, scenario.failMigration ? 19 : migrations.at(-1).version);
        const record: any = after.prepare("SELECT * FROM tasks WHERE task_id = 'upgrade-task'").get();
        if (scenario.error) {
          // Schema upgrades may add columns; a rejected completion must preserve every existing business field.
          const preservedFields: any = scenario.failMigration
            ? Object.keys(before)
            : ['task_id', 'title', 'intent', 'status', 'result_summary', 'created_at', 'updated_at', 'parent_task_id'];
          assert.deepEqual(Object.fromEntries(preservedFields.map((key: any) => [key, record[key]])), Object.fromEntries(preservedFields.map((key: any) => [key, before[key]])));
          if (!scenario.failMigration) {
            assert.equal('schema_version' in record, false);
            assert.equal('result_no_change' in record, false);
            assert.equal(record.is_parent, 0);
            assert.equal(record.parent_completion_json, null);
          }
        } else { assert.equal(record.title, before.title); assert.equal(record.intent, before.intent); }
      } finally { after.close(); }
    });
  }
});

test('migration loader 拒绝缺口并以原始 package bytes 计算稳定 checksum', (t: any) => {
  assert.equal(loadWorkspaceSqliteMigrations(), loadWorkspaceSqliteMigrations(), '默认package migrations复用不可变解析结果');
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-sqlite-migrations-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '0000_create_migration_ledger.sql'), 'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT);\n');
  fs.writeFileSync(path.join(root, '0002_gap.sql'), 'SELECT 1;\n');
  assert.throws(() => loadWorkspaceSqliteMigrations(root), (error: any) => error.code === 'workspace_store_schema_assets_invalid');

  fs.renameSync(path.join(root, '0002_gap.sql'), path.join(root, '0001_next.sql'));
  const first: any = loadWorkspaceSqliteMigrations(root);
  fs.appendFileSync(path.join(root, '0001_next.sql'), '-- changed\n');
  const second: any = loadWorkspaceSqliteMigrations(root);
  assert.notEqual(first[1].checksum, second[1].checksum);
});

test('失败 migration 完整 rollback 且不登记 ledger row', () => {
  const database: any = new DatabaseSync(':memory:');
  const [ledger]: any = loadWorkspaceSqliteMigrations();
  applyWorkspaceSqliteMigration(database, ledger);
  const failing: any = { version: 1, name: '0001_failing.sql', checksum: 'sha256-test', sql: 'CREATE TABLE transient_value(id INTEGER); INSERT INTO missing_table(id) VALUES (1);' };
  assert.throws(() => applyWorkspaceSqliteMigration(database, failing), (error: any) => error.code === 'workspace_store_database_failed');
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'transient_value'").get().count, 0);
  assert.equal(database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count, 1);
  database.close();
});

test('execution record migration建立closed单表、非级联Task FK与完整rollback', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const execution: any = migrations.find((migration: any) => migration.name === '0011_create_task_execution_records.sql');
  const database: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < execution.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('execution-task', 'buildr.task-record/v1', 'Execution', 'Closed record', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  applyWorkspaceSqliteMigration(database, execution);
  const insert: any = database.prepare(`INSERT INTO task_execution_records(
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
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row: any) => row.name === 'task_execution_records_lifecycle_retention_idx'));
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_execution_record_consumers', 'task_lifecycle_current')").get().count, 0);
  database.close();

  const rollback: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < execution.version)) applyWorkspaceSqliteMigration(rollback, migration);
  assert.throws(() => applyWorkspaceSqliteMigration(rollback, { ...execution, checksum: 'sha256-injected', sql: `${execution.sql}\nINSERT INTO missing_execution_table(id) VALUES (1);` }), (error: any) => error.code === 'workspace_store_database_failed');
  assert.equal(rollback.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 0);
  assert.equal(rollback.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, execution.version - 1);
  rollback.close();
});

test('execution invocation migration兼容legacy row并建立active identity索引', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const invocation: any = migrations.find((migration: any) => migration.name === '0014_add_task_execution_invocation_identity.sql');
  const database: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < invocation.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('invocation-task', 'buildr.task-record/v2', 'Invocation', 'Legacy compatibility', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at)
    VALUES ('legacy-record', 'buildr.task-execution-record/v1', 'invocation-task', 'task-verification', 'verification-execution', 'legacy-run', 'target', 'test', 'running', 'open', 'not-required', 'staging', 'reserved', NULL, NULL, 0, 0, 0, 'buildr.task-execution-record-redaction/v1', 16777216, NULL, '2026-08-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z')`).run();
  applyWorkspaceSqliteMigration(database, invocation);
  assert.equal(database.prepare("SELECT invocation_identity FROM task_execution_records WHERE record_id = 'legacy-record'").get().invocation_identity, null);
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row: any) => row.name === 'task_execution_records_active_invocation_idx'));
  assert.throws(() => database.prepare("UPDATE task_execution_records SET invocation_identity = 'sha256-not-a-digest' WHERE record_id = 'legacy-record'").run());
  database.close();
});

test('execution unknown outcome migration保留既有row并扩展单表约束', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const unknown: any = migrations.find((migration: any) => migration.name === '0015_add_task_execution_unknown_outcome.sql');
  const database: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < unknown.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('unknown-task', 'buildr.task-record/v2', 'Unknown', 'Recover open execution', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run();
  const invocationIdentity: any = `sha256-${'a'.repeat(64)}`;
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at, invocation_identity)
    VALUES ('open-before-unknown', 'buildr.task-execution-record/v1', 'unknown-task', 'task-verification', 'verification-execution', 'run-open', 'target', 'test', 'running', 'open', 'not-required', 'staging', 'reserved', NULL, NULL, 0, 0, 0, 'buildr.task-execution-record-redaction/v1', 16777216, NULL, '2026-08-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z', ?)`).run(invocationIdentity);

  applyWorkspaceSqliteMigration(database, unknown);

  assert.deepEqual({ ...database.prepare("SELECT run_identity, invocation_identity, lifecycle_status, outcome FROM task_execution_records WHERE record_id = 'open-before-unknown'").get() }, {
    run_identity: 'run-open', invocation_identity: invocationIdentity, lifecycle_status: 'open', outcome: 'running',
  });
  assert.ok(database.prepare("SELECT name FROM pragma_index_list('task_execution_records')").all().some((row: any) => row.name === 'task_execution_records_active_invocation_idx'));
  database.prepare(`INSERT INTO task_execution_records(record_id, schema_version, task_id, owner, kind, run_identity, invocation_identity, target_identity, producer, outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest, stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until, opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at)
    VALUES ('unknown-terminal', 'buildr.task-execution-record/v1', 'unknown-task', 'task-verification', 'verification-execution', 'run-unknown', ?, 'target', 'test', 'unknown', 'retained', 'acknowledged', 'available', 'charged', '.buildr/local/task-execution-records/task-verification/unknown-terminal/', ?, 10, 10, 0, 'buildr.task-execution-record-redaction/v1', 0, '2026-09-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2026-08-02T00:01:00.000Z', '2026-08-02T00:01:00.000Z', NULL, NULL, NULL, '2026-08-02T00:01:00.000Z')`).run(`sha256-${'b'.repeat(64)}`, `sha256-${'c'.repeat(64)}`);
  assert.equal(database.prepare("SELECT outcome FROM task_execution_records WHERE record_id = 'unknown-terminal'").get().outcome, 'unknown');
  assert.throws(() => database.prepare("UPDATE task_execution_records SET resolution_status = 'pending', resolved_at = NULL WHERE record_id = 'unknown-terminal'").run());
  database.close();
});

test('Task Execution Record退役migration删除整张表', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const retirement: any = migrations.find((migration: any) => migration.name === '0025_drop_task_execution_records.sql');
  const database: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 1);
  applyWorkspaceSqliteMigration(database, retirement);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_execution_records'").get().count, 0);
  database.close();
});

test('Task Verification报告migration保留真实检查并把无检查的历史passed降为incomplete', () => {
  const migrations: any = loadWorkspaceSqliteMigrations();
  const refactor: any = migrations.find((migration: any) => migration.name === '0023_refactor_task_verification_report.sql');
  const database: any = new DatabaseSync(':memory:');
  for (const migration of migrations.filter((item: any) => item.version < refactor.version)) applyWorkspaceSqliteMigration(database, migration);
  for (const taskId of ['legacy-passed', 'legacy-empty']) database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES (?, 'buildr.task-record/v2', 'Legacy verification', 'Migrate verification report', 'active', NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', NULL)`).run(taskId);
  const base: any = { schemaVersion: 'buildr.task-verification-result/v2', target: { identity: 'sha256-target', summary: 'Legacy target' }, declarations: [], coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Legacy passed' }, completedAt: '2026-08-01T01:00:00.000Z' };
  database.prepare('INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy-passed', JSON.stringify({ ...base, capabilities: [{ project: 'demo', capability: 'demo-unit', outcome: 'passed', facts: ['Legacy unit passed'] }] }), 'sha256-target', 'passed', base.completedAt);
  database.prepare('INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy-empty', JSON.stringify({ ...base, capabilities: [] }), 'sha256-target', 'passed', base.completedAt);

  applyWorkspaceSqliteMigration(database, refactor);

  const passed: any = JSON.parse(database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'legacy-passed'").get().result_json);
  assert.equal(passed.conclusion.outcome, 'passed');
  assert.equal(passed.checks.length, 1);
  assert.equal(passed.checks[0].mapStatus, 'map-unavailable');
  assert.ok(passed.gaps.some((gap: any) => gap.testing === 'legacy-verification-map'));
  const incomplete: any = JSON.parse(database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'legacy-empty'").get().result_json);
  assert.equal(incomplete.conclusion.outcome, 'incomplete');
  assert.equal(incomplete.gaps[0].testing, 'legacy-verification-coverage');
  assert.equal(database.prepare("SELECT outcome FROM task_verification_current WHERE task_id = 'legacy-empty'").get().outcome, 'incomplete');
  database.close();
});

test('Task workflow retirement migration删除研发与旧收尾数据且保留其他事实', () => {
  const database: any = new DatabaseSync(':memory:');
  const migrations: any = loadWorkspaceSqliteMigrations();
  const retirement: any = migrations.find((migration: any) => migration.name === '0028_drop_task_development_and_finish_current.sql');
  for (const migration of migrations.filter((item: any) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('retired-workflow', 'buildr.task-record/v2', 'Retire workflow', 'Delete obsolete current rows', 'completed', 'done', 0, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('retired-workflow', '{}')").run();
  const phases: any = JSON.stringify(['preflight', 'prepare', 'verify', 'deliver', 'cleanup'].map((id: any) => ({ id, status: 'passed', attempts: 1 })));
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
  const database: any = new DatabaseSync(':memory:');
  const migrations: any = loadWorkspaceSqliteMigrations();
  const retirement: any = migrations.find((migration: any) => migration.name === '0029_drop_task_environment_current.sql');
  for (const migration of migrations.filter((item: any) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
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

test('Task Retrospective重构migration直接删除旧正文、处置与来源关系', () => {
  const database: any = new DatabaseSync(':memory:');
  const migrations: any = loadWorkspaceSqliteMigrations();
  const retirement: any = migrations.find((migration: any) => migration.name === '0030_refactor_task_retrospective_documents.sql');
  for (const migration of migrations.filter((item: any) => item.version < retirement.version)) applyWorkspaceSqliteMigration(database, migration);
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('retrospective-source', 'buildr.task-record/v2', 'Retrospective source', 'Delete obsolete data', 'completed', 'done', 0, '2026-09-03T00:00:00.000Z', '2026-09-03T01:00:00.000Z', NULL)`).run();
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('retrospective-followup', 'buildr.task-record/v2', 'Retrospective followup', 'Delete obsolete relation', 'todo', NULL, NULL, '2026-09-03T00:00:00.000Z', '2026-09-03T01:00:00.000Z', NULL)`).run();
  database.prepare("INSERT INTO task_retrospective_current(task_id, result_json, disposition_status, disposition_note, disposed_at) VALUES ('retrospective-source', ?, 'handled', '旧处置', '2026-09-03T02:00:00.000Z')").run(JSON.stringify({ schemaVersion: 'buildr.task-retrospective-result/v1', taskId: 'retrospective-source', focus: 'agent-execution-efficiency', reportMarkdown: '# 旧复盘', completedAt: '2026-09-03T01:00:00.000Z' }));
  database.prepare("INSERT INTO task_retrospective_sources(target_task_id, source_task_id, created_at) VALUES ('retrospective-followup', 'retrospective-source', '2026-09-03T02:00:00.000Z')").run();

  applyWorkspaceSqliteMigration(database, retirement);

  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_retrospective_current', 'task_retrospective_sources')").get().count, 0);
  assert.deepEqual({ ...database.prepare("SELECT schema_version, retrospective_state, retrospective_document_digest FROM tasks WHERE task_id = 'retrospective-source'").get() }, {
    schema_version: 'buildr.task-record/v3', retrospective_state: null, retrospective_document_digest: null,
  });
  assert.equal(database.prepare("SELECT status FROM tasks WHERE task_id = 'retrospective-followup'").get().status, 'todo');
  assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, retirement.version);
  database.close();
});

test('Task Record最终收窄migration保留业务事实并删除重复列和旧贡献协调数据', () => {
  const database: any = new DatabaseSync(':memory:');
  const migrations: any = loadWorkspaceSqliteMigrations();
  const finalization: any = migrations.find((migration: any) => migration.name === '0031_finalize_task_record.sql');
  for (const migration of migrations.filter((item: any) => item.version < finalization.version)) applyWorkspaceSqliteMigration(database, migration);
  const history: any = JSON.stringify([{
    status: 'completed', title: '旧标题', intent: '旧目标', parentTaskId: null,
    result: { summary: '旧结果', noChange: false }, recordUpdatedAt: '2026-09-03T00:30:00.000Z',
    correctedAt: '2026-09-03T00:45:00.000Z', reason: '用户更正目标',
  }]);
  database.prepare(`INSERT INTO tasks(
    task_id, schema_version, title, intent, status, result_summary, result_no_change,
    created_at, updated_at, parent_task_id, is_parent, result_history_json,
    retrospective_state, retrospective_document_digest
  ) VALUES (?, 'buildr.task-record/v3', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'final-parent', '最终父任务', '保留目标', 'completed', '当前结果', 0,
    '2026-09-03T00:00:00.000Z', '2026-09-03T01:00:00.000Z', null, 1, history,
    'decided', `sha256-${'a'.repeat(64)}`,
  );
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id)
    VALUES ('final-child', 'buildr.task-record/v3', '子任务', '保留关系', 'active', NULL, NULL, '2026-09-03T00:00:00.000Z', '2026-09-03T01:00:00.000Z', 'final-parent')`).run();
  database.prepare("INSERT INTO task_projects(task_id, project) VALUES ('final-parent', 'product')").run();
  database.prepare("INSERT INTO task_services(task_id, project, service) VALUES ('final-parent', 'product', 'buildr')").run();
  database.prepare("INSERT INTO task_changes(task_id, project, change_name) VALUES ('final-parent', 'product', 'finalize-agent-first-task-system')").run();
  database.prepare("INSERT INTO task_review_current(task_id, review_type, result_json, subject_identity, outcome, updated_at) VALUES ('final-parent', 'planning', '{}', 'plan', 'accepted', '2026-09-03T01:00:00.000Z')").run();
  database.prepare("INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES ('final-parent', '{}', 'content', 'passed', '2026-09-03T01:00:00.000Z')").run();
  database.prepare("INSERT INTO terminal_contribution_reconciliations VALUES ('final-child', 'final-parent', 'plan', 'record', '{}', '2026-09-03T01:00:00.000Z')").run();

  applyWorkspaceSqliteMigration(database, finalization);

  assert.equal(database.prepare("PRAGMA table_info(tasks)").all().some((row: any) => ['schema_version', 'result_no_change'].includes(row.name)), false);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'terminal_contribution_reconciliations'").get().count, 0);
  const parent: any = database.prepare("SELECT * FROM tasks WHERE task_id = 'final-parent'").get();
  assert.equal(parent.title, '最终父任务'); assert.equal(parent.intent, '保留目标'); assert.equal(parent.result_summary, '当前结果');
  assert.equal(parent.is_parent, 1); assert.equal(parent.retrospective_state, 'decided');
  assert.equal(JSON.parse(parent.result_history_json)[0].result.noChange, undefined);
  assert.equal(database.prepare("SELECT parent_task_id FROM tasks WHERE task_id = 'final-child'").get().parent_task_id, 'final-parent');
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_projects WHERE task_id = 'final-parent'").get().count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_services WHERE task_id = 'final-parent'").get().count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_changes WHERE task_id = 'final-parent'").get().count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_review_current WHERE task_id = 'final-parent'").get().count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_verification_current WHERE task_id = 'final-parent'").get().count, 1);
  database.close();
});

test('复盘处置 migration把既有Result初始化为pending并建立三态约束', () => {
  const database: any = new DatabaseSync(':memory:');
  const migrations: any = loadWorkspaceSqliteMigrations();
  const disposition: any = migrations.find((migration: any) => migration.name === '0010_add_task_retrospective_disposition.sql');
  for (const migration of migrations.filter((item: any) => item.version < disposition.version)) applyWorkspaceSqliteMigration(database, migration);
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

test('checksum 漂移、版本超前和损坏数据库均 fail closed', (t: any) => {
  const runtime: any = createRuntime();

  const driftRoot: any = workspace(t);
  let opened: any = runtime.openWorkspaceStructuredStore(driftRoot, { writable: true });
  opened.database.prepare(`UPDATE schema_migrations SET checksum = 'sha256-${'0'.repeat(64)}' WHERE version = 1`).run();
  opened.database.close();
  assert.throws(() => runtime.openWorkspaceStructuredStore(driftRoot, { writable: false }), (error: any) => error.code === 'workspace_store_migration_drift');

  const newerRoot: any = workspace(t);
  opened = runtime.openWorkspaceStructuredStore(newerRoot, { writable: true });
  const futureVersion: any = loadWorkspaceSqliteMigrations().at(-1).version + 1;
  opened.database.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(futureVersion, `${String(futureVersion).padStart(4, '0')}_future.sql`, `sha256-${'f'.repeat(64)}`, new Date().toISOString());
  opened.database.close();
  assert.throws(() => runtime.openWorkspaceStructuredStore(newerRoot, { writable: false }), (error: any) => error.code === 'workspace_store_database_newer_than_runtime');

  const corruptRoot: any = workspace(t);
  const corruptFile: any = path.join(corruptRoot, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(corruptFile), { recursive: true });
  fs.writeFileSync(corruptFile, 'not sqlite');
  assert.throws(() => runtime.openWorkspaceStructuredStore(corruptRoot, { writable: false }), (error: any) => error.code === 'workspace_store_database_corrupt');
});

test('Doctor 区分未初始化、healthy 与 unavailable 且不暴露数据库 path', (t: any) => {
  const runtime: any = createRuntime();
  const root: any = workspace(t);
  let result: any = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root, true);
  assert.deepEqual(result.structuredStore, { status: 'uninitialized', version: null, integrity: null });
  assert.equal(result.findings[0].status, 'info');

  runtime.openWorkspaceStructuredStore(root, { writable: true }).database.close();
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.deepEqual(result.structuredStore, { status: 'healthy', version: loadWorkspaceSqliteMigrations().at(-1).version, integrity: 'ok' });
  assert.deepEqual(result.findings, []);

  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(file, 'broken');
  result = { findings: [], structuredStore: null };
  runtime.diagnoseWorkspaceStructuredStore(result, root);
  assert.equal(result.structuredStore.status, 'unavailable');
  assert.equal(result.findings[0].status, 'error');
  assert.equal(JSON.stringify(result).includes(file), false);
});
