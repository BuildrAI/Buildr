import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Infrastructure 只保留技术机制入口，业务 Persistence 归属 Task', () => {
  const sqliteFiles: any = fs.readdirSync(path.join(root, 'src/infrastructure/sqlite')).filter((name: any) => name.endsWith('.ts')).sort();
  assert.deepEqual(sqliteFiles, ['transaction.ts', 'workspace-sqlite.ts']);
  for (const relative of [
    'src/infrastructure/sqlite/parent-coordination-repository.ts',
    'src/infrastructure/sqlite/task-development-repository.ts',
    'src/infrastructure/sqlite/task-environment-repository.ts',
    'src/infrastructure/sqlite/task-finish-repository.ts',
    'src/infrastructure/sqlite/task-overview-repository.ts',
    'src/infrastructure/sqlite/task-retrospective-repository.ts',
    'src/infrastructure/sqlite/task-review-repository.ts',
    'src/infrastructure/sqlite/task-verification-repository.ts',
    'src/infrastructure/filesystem/task-environment-repository.ts',
    'src/task/persistence/parent-coordination-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  for (const relative of [
    'src/task/persistence/task-repository.ts',
    'src/task/persistence/task-project-repository.ts',
    'src/task/persistence/task-service-repository.ts',
    'src/task/persistence/task-change-repository.ts',
    'src/task/persistence/task-retrospective-document.ts',
    'src/task/persistence/task-review-repository.ts',
    'src/task/persistence/task-verification-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
});

test('Bootstrap 只组装 Infrastructure，Task module 私有组装各自 Persistence', () => {
  const infrastructure: any = read('src/infrastructure/index.ts');
  const bootstrap: any = read('src/bootstrap/runtime.ts');
  const taskModule: any = read('src/task/module.ts');
  assert.match(infrastructure, /registerWorkspaceInfrastructure/);
  assert.match(infrastructure, /registerWorkspaceSqlite/);
  assert.match(infrastructure, /registerSqliteTransaction/);
  assert.match(infrastructure, /registerInfrastructure/);
  assert.equal(fs.existsSync(path.join(root, 'src/task/persistence/index.mjs')), false);
  for (const registration of [
    'registerTaskVerificationRepository',
    'createTaskRepository', 'createTaskProjectRepository', 'createTaskServiceRepository', 'createTaskChangeRepository',
    'registerTaskReviewRepository', 'registerTaskRetrospectiveDocument',
  ]) assert.match(taskModule, new RegExp(registration));
  assert.doesNotMatch(taskModule, /registerParentCoordinationRepository/);
  assert.match(bootstrap, /registerInfrastructure/);
  assert.doesNotMatch(bootstrap, /legacy-runtime-module/);
  assert.doesNotMatch(bootstrap, /registerTaskPersistence|registerTaskDevelopmentRepository/);
  assert.doesNotMatch(bootstrap, /infrastructure\/sqlite\/.*repository|infrastructure\/filesystem\/task-/u);
});

test('Task Record 事务由 Application 编排且 Repository 只访问所属表', () => {
  const command = read('src/task/application/task-command-application.ts');
  assert.match(command, /runWorkspaceTransaction/);
  for (const owner of ['taskRepository', 'taskProjectRepository', 'taskServiceRepository', 'taskChangeRepository']) assert.match(command, new RegExp(owner));
  for (const [file, ownedTable] of [
    ['src/task/persistence/task-repository.ts', 'tasks'],
    ['src/task/persistence/task-project-repository.ts', 'task_projects'],
    ['src/task/persistence/task-service-repository.ts', 'task_services'],
    ['src/task/persistence/task-change-repository.ts', 'task_changes'],
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
