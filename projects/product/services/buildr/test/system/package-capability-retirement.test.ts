import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import YAML from 'yaml';

import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
function run(args: any): any  {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
}

function fixtureRoot(t: any): any  {
  return copyPreparedWorkspace(t, 'capability-retirement').root;
}

function injectLegacyAssetReviewContract(root: any): any  {
  const target: any = path.join(root, 'skills', 'contracts', 'buildr', 'task-asset-review', 'v1.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(PRODUCT_ROOT, 'test', 'fixtures', 'legacy-task-asset-review-contract-v1.md'), target);
  return target;
}

function injectLegacyTaskVerificationV3(root: any): any  {
  const manifestFile: any = path.join(root, 'skills', 'manifest.yml');
  const manifest: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  const relative: any = 'contracts/buildr/task-verification/v3.md';
  manifest.contracts.push({
    id: 'buildr.task-verification', version: 3, path: relative,
    description: '执行 Project 已声明的验证能力，并维护 Task-scoped Workspace-local current Verification Result。',
  });
  manifest.bindings.push({ capability: 'buildr.task-verification', version: 3, provider: 'task-verification' });
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  const target: any = path.join(root, 'skills', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(PRODUCT_ROOT, 'test', 'fixtures', 'legacy-task-verification-contract-v3.md'), target);
  return target;
}

function injectLegacyTaskRecordV2(root: any): any  {
  const manifestFile: any = path.join(root, 'skills', 'manifest.yml');
  const manifest: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.contracts = manifest.contracts.filter((item: any) => item.id !== 'buildr.task-record');
  manifest.bindings = manifest.bindings.filter((item: any) => item.capability !== 'buildr.task-record');
  manifest.contracts.push({
    id: 'buildr.task-record',
    version: 2,
    path: 'contracts/buildr/task-record/v2.md',
    description: '管理 canonical Workspace 中待办与正式 Task 的最小顶层记录及复盘来源。',
  });
  manifest.bindings.push({ capability: 'buildr.task-record', version: 2, provider: 'task-manager' });
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  const target: any = path.join(root, 'skills', 'contracts', 'buildr', 'task-record', 'v2.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(PRODUCT_ROOT, 'test', 'fixtures', 'legacy-task-record-contract-v2.md'), target);
}

function seedMigrationV4(root: any): any  {
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database: any = new DatabaseSync(file);
  for (const migration of loadWorkspaceSqliteMigrations().slice(0, 5)) applyWorkspaceSqliteMigration(database, migration);
  database.close();
  return file;
}

function seedBeforeRetrospectiveRefactor(root: any): any  {
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  for (const candidate of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(candidate, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database: any = new DatabaseSync(file);
  for (const migration of loadWorkspaceSqliteMigrations().filter((item: any) => item.version < 30)) applyWorkspaceSqliteMigration(database, migration);
  database.close();
}

test('sync 清退 package 已不再声明的 Buildr-owned contract 与 binding', (t: any) => {
  const root: any = fixtureRoot(t);
  const manifestFile: any = path.join(root, 'skills', 'manifest.yml');
  const manifest: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  const relative: any = 'contracts/buildr/retired-example/v1.md';
  manifest.contracts.push({ id: 'buildr.retired-example', version: 1, path: relative, description: 'Retired Buildr capability.' });
  manifest.bindings.push({ capability: 'buildr.retired-example', version: 1, provider: 'retired-provider' });
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  const target: any = path.join(root, 'skills', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---
schemaVersion: buildr.capability-contract/v1
id: buildr.retired-example
version: 1
---

# Retired Buildr capability

## Purpose

Fixture.

## Consumer Obligations

Fixture.

## Minimum Guarantees

Fixture.

## Effects and Authorization

Fixture.

## Result Evidence

Fixture.

## Decision Points

Fixture.

## Allowed Variations

Fixture.
`);

  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const updated: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(updated.contracts.some((item: any) => item.id === 'buildr.retired-example'), false);
  assert.equal(updated.bindings.some((item: any) => item.capability === 'buildr.retired-example'), false);
  assert.equal(fs.existsSync(target), false);
});

test('sync 直接删除既有 Task Asset Review observation 数据', (t: any) => {
  const root: any = fixtureRoot(t);
  seedBeforeRetrospectiveRefactor(root);
  const legacy: any = path.join(root, '.buildr', 'asset-review', 'inbox', 'legacy.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, Buffer.from('legacy observation bytes\n\u0000retired'));

  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'asset-review')), false);
});

test('sync 不跟随 Task Asset Review 符号链接删除外部数据', (t: any) => {
  if (process.platform === 'win32') return t.skip('symlink ownership boundary is covered on POSIX');
  const root: any = fixtureRoot(t);
  seedBeforeRetrospectiveRefactor(root);
  const external: any = path.join(path.dirname(root), 'external-asset-review');
  fs.mkdirSync(external);
  const externalFile: any = path.join(external, 'keep.txt');
  fs.writeFileSync(externalFile, 'external');
  fs.symlinkSync(external, path.join(root, '.buildr', 'asset-review'));

  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.notEqual(synced.status, 0);
  assert.match(`${synced.stderr}\n${synced.stdout}`, /旧本机数据目录清理失败/);
  assert.equal(fs.readFileSync(externalFile, 'utf8'), 'external');
});

test('sync 接受已登记的历史 Task Asset Review contract 并安全退休', (t: any) => {
  const root: any = fixtureRoot(t);
  const target: any = injectLegacyAssetReviewContract(root);
  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  assert.equal(fs.existsSync(target), false);
});

test('sync 接受上一版 Task Verification contract metadata 并安全升级到v4', (t: any) => {
  const root: any = fixtureRoot(t);
  const legacy: any = injectLegacyTaskVerificationV3(root);
  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const manifest: any = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  assert.equal(manifest.contracts.some((item: any) => item.id === 'buildr.task-verification' && item.version === 3), false);
  assert.equal(manifest.contracts.some((item: any) => item.id === 'buildr.task-verification' && item.version === 4), true);
  assert.equal(fs.existsSync(legacy), false);
});

test('sync 接受上一版 Task Record contract metadata 并安全升级到v3', (t: any) => {
  const root: any = fixtureRoot(t);
  injectLegacyTaskRecordV2(root);
  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const manifest: any = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  assert.equal(manifest.contracts.some((item: any) => item.id === 'buildr.task-record' && item.version === 2), false);
  assert.equal(manifest.contracts.some((item: any) => item.id === 'buildr.task-record' && item.version === 3), true);
  assert.equal(manifest.bindings.some((item: any) => item.capability === 'buildr.task-record' && item.version === 2), false);
});

test('sync 在源资产 mutation 前升级 pending SQLite migrations', (t: any) => {
  const root: any = fixtureRoot(t);
  const file: any = seedMigrationV4(root);
  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const database: any = new DatabaseSync(file, { readOnly: true });
  const expectedMigrations: any = loadWorkspaceSqliteMigrations().map(({ version, name }: any) => ({ version, name }));
  assert.deepEqual(database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row: any) => ({ ...row })), expectedMigrations);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_retrospective_current', 'task_retrospective_sources')").get().count, 0);
  assert.equal(database.prepare("PRAGMA table_info(tasks)").all().some((row: any) => ['schema_version', 'result_no_change'].includes(row.name)), false);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_lifecycle_current'").get().count, 0);
  database.close();
});

test('sync 的 SQLite migration 失败时不写源资产', (t: any) => {
  const root: any = fixtureRoot(t);
  const file: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not a sqlite database\n');
  const manifestFile: any = path.join(root, 'skills', 'manifest.yml');
  const manifestBefore: any = fs.readFileSync(manifestFile);
  const synced: any = run(['sync', 'codex', '--target', root]);
  assert.notEqual(synced.status, 0);
  assert.match(`${synced.stderr}\n${synced.stdout}`, /Workspace structured store/);
  assert.deepEqual(fs.readFileSync(manifestFile), manifestBefore);
});
