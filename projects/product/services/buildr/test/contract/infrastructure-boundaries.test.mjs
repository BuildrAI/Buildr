import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Infrastructure 只保留技术机制入口，业务 Persistence 归属 Task', () => {
  const sqliteFiles = fs.readdirSync(path.join(root, 'src/infrastructure/sqlite')).filter((name) => name.endsWith('.mjs')).sort();
  assert.deepEqual(sqliteFiles, ['workspace-sqlite.mjs']);
  for (const relative of [
    'src/infrastructure/sqlite/parent-coordination-repository.mjs',
    'src/infrastructure/sqlite/task-development-repository.mjs',
    'src/infrastructure/sqlite/task-environment-repository.mjs',
    'src/infrastructure/sqlite/task-execution-record-repository.mjs',
    'src/infrastructure/sqlite/task-finish-repository.mjs',
    'src/infrastructure/sqlite/task-overview-repository.mjs',
    'src/infrastructure/sqlite/task-retrospective-repository.mjs',
    'src/infrastructure/sqlite/task-review-repository.mjs',
    'src/infrastructure/sqlite/task-verification-repository.mjs',
    'src/infrastructure/filesystem/task-environment-repository.mjs',
    'src/infrastructure/filesystem/task-execution-record-body-store.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  for (const relative of [
    'src/task/persistence/coordination/parent-coordination-repository.mjs',
    'src/task/persistence/development/task-development-repository.mjs',
    'src/task/persistence/environment/task-environment-repository.mjs',
    'src/task/persistence/execution-record/task-execution-record-repository.mjs',
    'src/task/persistence/execution-record/task-execution-record-body-store.mjs',
    'src/task/persistence/finish/task-finish-repository.mjs',
    'src/task/persistence/overview/task-overview-repository.mjs',
    'src/task/persistence/task-retrospective-repository.mjs',
    'src/task/persistence/task-review-repository.mjs',
    'src/task/persistence/verification/task-verification-repository.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
});

test('Bootstrap 通过唯一 Infrastructure 与 Task Persistence 注册入口组装', () => {
  const infrastructure = read('src/infrastructure/index.mjs');
  const persistence = read('src/task/persistence/index.mjs');
  const bootstrap = read('src/bootstrap/legacy-runtime-module.mjs');
  assert.match(infrastructure, /registerWorkspaceInfrastructure/);
  assert.match(infrastructure, /registerWorkspaceSqlite/);
  assert.match(infrastructure, /registerInfrastructure/);
  assert.match(persistence, /registerTaskPersistence/);
  assert.equal(new Set(persistence.match(/register[A-Za-z]+Repository/g) || []).size, 7);
  assert.doesNotMatch(persistence, /registerTaskReviewRepository/);
  assert.doesNotMatch(persistence, /registerTaskRetrospectiveRepository/);
  assert.match(read('src/task/module.mjs'), /registerTaskReviewRepository/);
  assert.match(read('src/task/module.mjs'), /registerTaskRetrospectiveRepository/);
  assert.match(bootstrap, /registerInfrastructure/);
  assert.match(bootstrap, /registerTaskPersistence/);
  assert.doesNotMatch(bootstrap, /infrastructure\/sqlite\/.*repository|infrastructure\/filesystem\/task-/u);
});

test('SQLite migration 仍由 Infrastructure 单一 runner 提供有序脚本', async () => {
  const { loadWorkspaceSqliteMigrations } = await import('../../src/infrastructure/sqlite/workspace-sqlite.mjs');
  const first = loadWorkspaceSqliteMigrations();
  const second = loadWorkspaceSqliteMigrations();
  assert.ok(first.length > 0);
  assert.deepEqual(first.map(({ version, name, checksum }) => ({ version, name, checksum })), second.map(({ version, name, checksum }) => ({ version, name, checksum })));
  assert.deepEqual(first.map((script) => script.version), first.map((_, index) => index));
});
