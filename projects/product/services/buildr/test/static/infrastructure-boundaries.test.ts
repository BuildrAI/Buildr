import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Task Record 事务由 Application 编排且 Repository 只访问所属表', () => {
  for (const [file, ownedTable] of [
    ['src/modules/task/persistence/task-repository.ts', 'tasks'],
    ['src/modules/task/persistence/task-project-repository.ts', 'task_projects'],
    ['src/modules/task/persistence/task-service-repository.ts', 'task_services'],
    ['src/modules/task/persistence/task-change-repository.ts', 'task_changes'],
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /BEGIN IMMEDIATE|COMMIT|ROLLBACK/);
    for (const table of ['tasks', 'task_projects', 'task_services', 'task_changes']) {
      if (table !== ownedTable) assert.doesNotMatch(source, new RegExp(`\\b${table}\\b`), `${file} must not access ${table}`);
    }
  }
});

test('SQLite migration 仍由 Infrastructure 单一 runner 提供有序脚本', async () => {
  const { loadWorkspaceSqliteMigrations }: any = await import('../../src/infrastructure/sqlite/workspace-sqlite.ts');
  const first: any = loadWorkspaceSqliteMigrations();
  const second: any = loadWorkspaceSqliteMigrations();
  assert.ok(first.length > 0);
  assert.deepEqual(first.map(({ version, name, checksum }: any) => ({ version, name, checksum })), second.map(({ version, name, checksum }: any) => ({ version, name, checksum })));
  assert.deepEqual(first.map((script: any) => script.version), first.map((_: any, index: any) => index));
});
