import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  applyWorkspaceSqliteMigration,
  loadWorkspaceSqliteMigrations,
} from '../../src/infrastructure/sqlite/workspace-sqlite.ts';

function databaseBeforeParentHistory() {
  const database = new DatabaseSync(':memory:');
  const migrations = loadWorkspaceSqliteMigrations();
  const migration = migrations.find((item: { name: string }) => item.name === '0026_migrate_legacy_parent_plan_history.sql');
  if (!migration) throw new Error('missing 0026 migration');
  for (const item of migrations.filter((entry: { version: number }) => entry.version < migration.version)) {
    applyWorkspaceSqliteMigration(database, item);
  }
  return { database, migration };
}

function insertTask(database: DatabaseSync, taskId: string) {
  database.prepare(`INSERT INTO tasks(
    task_id, schema_version, title, intent, status, result_summary, result_no_change,
    created_at, updated_at, parent_task_id, is_parent, parent_completion_json, result_history_json
  ) VALUES (?, 'buildr.task-record/v2', 'Parent', 'Preserve historical plan', 'active', NULL, NULL,
    '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL, 1, NULL, '[]')`).run(taskId);
}

test('0026把旧Parent Plan迁入Task-owned历史且保留Development原值', () => {
  const { database, migration } = databaseBeforeParentHistory();
  insertTask(database, 'legacy-parent');
  insertTask(database, 'null-parent');
  const parentPlan = {
    schemaVersion: 'buildr.parent-plan/v2',
    identity: 'sha256-parent-plan',
    outcome: 'Deliver independent results.',
    architectureDecisions: ['Use Task Record relations.'],
    contributions: [],
    finalAcceptance: ['All results reviewed.'],
  };
  const development = JSON.stringify({ schemaVersion: 'buildr.task-development-receipt/v3', parentPlan });
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('legacy-parent', ?)").run(development);
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('null-parent', ?)").run(JSON.stringify({ parentPlan: null }));

  applyWorkspaceSqliteMigration(database, migration);

  const row = database.prepare("SELECT legacy_parent_plan_json FROM tasks WHERE task_id = 'legacy-parent'").get() as { legacy_parent_plan_json: string };
  assert.deepEqual(JSON.parse(row.legacy_parent_plan_json), parentPlan);
  const developmentRow = database.prepare("SELECT record_json FROM task_development_current WHERE task_id = 'legacy-parent'").get() as { record_json: string };
  assert.equal(developmentRow.record_json, development);
  const nullRow = database.prepare("SELECT legacy_parent_plan_json FROM tasks WHERE task_id = 'null-parent'").get() as { legacy_parent_plan_json: string | null };
  assert.equal(nullRow.legacy_parent_plan_json, null);
  database.close();
});

test('0026遇到非对象Parent Plan时完整回滚', () => {
  const { database, migration } = databaseBeforeParentHistory();
  insertTask(database, 'invalid-parent');
  database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES ('invalid-parent', ?)").run(JSON.stringify({ parentPlan: 'invalid' }));

  assert.throws(() => applyWorkspaceSqliteMigration(database, migration));
  const columnRow = database.prepare("SELECT count(*) AS count FROM pragma_table_info('tasks') WHERE name = 'legacy_parent_plan_json'").get() as { count: number };
  const versionRow = database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number };
  assert.equal(columnRow.count, 0);
  assert.equal(versionRow.version, migration.version - 1);
  database.close();
});
