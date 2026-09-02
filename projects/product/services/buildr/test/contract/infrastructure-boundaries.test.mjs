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
    'src/infrastructure/sqlite/task-finish-repository.mjs',
    'src/infrastructure/sqlite/task-overview-repository.ts',
    'src/infrastructure/sqlite/task-retrospective-repository.mjs',
    'src/infrastructure/sqlite/task-review-repository.ts',
    'src/infrastructure/sqlite/task-verification-repository.mjs',
    'src/infrastructure/filesystem/task-environment-repository.mjs',
    'src/task/persistence/parent-coordination-repository.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  for (const relative of [
    'src/task/persistence/task-record-repository.ts',
    'src/task/persistence/task-development-repository.mjs',
    'src/task/persistence/task-environment-repository.mjs',
    'src/task/persistence/task-finish-repository.mjs',
    'src/task/persistence/task-overview-repository.ts',
    'src/task/persistence/task-retrospective-repository.mjs',
    'src/task/persistence/task-review-repository.ts',
    'src/task/persistence/task-verification-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
});

test('Bootstrap 只组装 Infrastructure，Task module 私有组装各自 Persistence', () => {
  const infrastructure = read('src/infrastructure/index.mjs');
  const bootstrap = read('src/bootstrap/runtime.mjs');
  const taskModule = read('src/task/module.mjs');
  assert.match(infrastructure, /registerWorkspaceInfrastructure/);
  assert.match(infrastructure, /registerWorkspaceSqlite/);
  assert.match(infrastructure, /registerInfrastructure/);
  assert.equal(fs.existsSync(path.join(root, 'src/task/persistence/index.mjs')), false);
  for (const registration of [
    'registerTaskEnvironmentRepository',
    'registerTaskVerificationRepository', 'registerTaskDevelopmentRepository',
    'registerTaskRecordRepository', 'registerTaskOverviewRepository',
    'registerTaskReviewRepository', 'registerTaskRetrospectiveRepository',
  ]) assert.match(taskModule, new RegExp(registration));
  assert.doesNotMatch(taskModule, /registerParentCoordinationRepository/);
  assert.match(bootstrap, /registerInfrastructure/);
  assert.doesNotMatch(bootstrap, /legacy-runtime-module/);
  assert.doesNotMatch(bootstrap, /registerTaskPersistence|registerTaskEnvironmentRepository|registerTaskDevelopmentRepository/);
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
