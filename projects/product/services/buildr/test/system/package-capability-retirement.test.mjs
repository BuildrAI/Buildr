import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import YAML from 'yaml';

import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const LEGACY = [
  { version: 1, description: '管理任务 worktree 的放置、保留和安全清理。' },
  { version: 2, description: '管理单仓或多仓 task environment 的放置、执行边界、保留和安全清理。' },
];
let pristineFixture = null;

test.after(() => {
  if (pristineFixture) fs.rmSync(pristineFixture.base, { recursive: true, force: true });
  pristineFixture = null;
});

function run(args) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
}

function fixtureRoot(t) {
  if (!pristineFixture) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-retirement-pristine-'));
    const root = path.join(base, 'workspace');
    const initialized = run(['init', '--target', root, '--name', 'retirement', '--description', 'Capability retirement fixture', '--profile', 'team']);
    assert.equal(initialized.status, 0, initialized.stderr);
    pristineFixture = { base, root };
  }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capability-retirement-'));
  const root = path.join(base, 'workspace');
  fs.cpSync(pristineFixture.root, root, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return root;
}

function injectLegacy(root) {
  const manifestFile = path.join(root, 'skills', 'manifest.yml');
  const manifest = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  for (const item of LEGACY) {
    const relative = `contracts/buildr/task-worktree-lifecycle/v${item.version}.md`;
    manifest.contracts.push({ id: 'buildr.task-worktree-lifecycle', version: item.version, path: relative, description: item.description });
    manifest.bindings.push({ capability: 'buildr.task-worktree-lifecycle', version: item.version, provider: 'task-worktree' });
    const target = path.join(root, 'skills', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(PRODUCT_ROOT, 'test', 'fixtures', `legacy-task-worktree-contract-v${item.version}.md`), target);
  }
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  return manifestFile;
}

function injectLegacyAssetReviewContract(root) {
  const target = path.join(root, 'skills', 'contracts', 'buildr', 'task-asset-review', 'v1.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(PRODUCT_ROOT, 'test', 'fixtures', 'legacy-task-asset-review-contract-v1.md'), target);
  return target;
}

function seedMigrationV4(root) {
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  for (const migration of loadWorkspaceSqliteMigrations().slice(0, 5)) applyWorkspaceSqliteMigration(database, migration);
  database.close();
  return file;
}

test('sync 只在旧 contract、binding 与文件 identity 匹配时完整退休旧 authority', (t) => {
  const root = fixtureRoot(t);
  injectLegacy(root);
  const synced = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const manifest = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  assert.equal(manifest.contracts.some((item) => item.id === 'buildr.task-worktree-lifecycle'), false);
  assert.equal(manifest.bindings.some((item) => item.capability === 'buildr.task-worktree-lifecycle'), false);
  for (const item of LEGACY) assert.equal(fs.existsSync(path.join(root, 'skills', 'contracts', 'buildr', 'task-worktree-lifecycle', `v${item.version}.md`)), false);
});

test('旧 contract 文件漂移时 sync 在任何退休 mutation 前阻断', (t) => {
  const root = fixtureRoot(t);
  const manifestFile = injectLegacy(root);
  const v2 = path.join(root, 'skills', 'contracts', 'buildr', 'task-worktree-lifecycle', 'v2.md');
  fs.appendFileSync(v2, '\n本地修改必须保留。\n');
  const manifestBefore = fs.readFileSync(manifestFile);
  const v1 = path.join(root, 'skills', 'contracts', 'buildr', 'task-worktree-lifecycle', 'v1.md');
  const v1Before = fs.readFileSync(v1);
  const v2Before = fs.readFileSync(v2);
  const synced = run(['sync', 'codex', '--target', root]);
  assert.notEqual(synced.status, 0);
  assert.match(`${synced.stderr}\n${synced.stdout}`, /Capability retirement file has drifted/);
  assert.deepEqual(fs.readFileSync(manifestFile), manifestBefore);
  assert.deepEqual(fs.readFileSync(v1), v1Before);
  assert.deepEqual(fs.readFileSync(v2), v2Before);
});

test('sync 清退 package 已不再声明的 Buildr-owned contract 与 binding', (t) => {
  const root = fixtureRoot(t);
  const manifestFile = path.join(root, 'skills', 'manifest.yml');
  const manifest = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  const relative = 'contracts/buildr/retired-example/v1.md';
  manifest.contracts.push({ id: 'buildr.retired-example', version: 1, path: relative, description: 'Retired Buildr capability.' });
  manifest.bindings.push({ capability: 'buildr.retired-example', version: 1, provider: 'retired-provider' });
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  const target = path.join(root, 'skills', relative);
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

  const synced = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const updated = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(updated.contracts.some((item) => item.id === 'buildr.retired-example'), false);
  assert.equal(updated.bindings.some((item) => item.capability === 'buildr.retired-example'), false);
  assert.equal(fs.existsSync(target), false);
});

test('sync 不读取、迁移或删除既有 Task Asset Review observation 数据', (t) => {
  const root = fixtureRoot(t);
  const legacy = path.join(root, '.buildr', 'asset-review', 'inbox', 'legacy.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  const before = Buffer.from('legacy observation bytes\n\u0000preserved');
  fs.writeFileSync(legacy, before);

  const synced = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  assert.deepEqual(fs.readFileSync(legacy), before);
});

test('sync 接受已登记的历史 Task Asset Review contract 并安全退休', (t) => {
  const root = fixtureRoot(t);
  const target = injectLegacyAssetReviewContract(root);
  const synced = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  assert.equal(fs.existsSync(target), false);
});

test('sync 在源资产 mutation 前升级 pending SQLite migrations', (t) => {
  const root = fixtureRoot(t);
  const file = seedMigrationV4(root);
  const synced = run(['sync', 'codex', '--target', root]);
  assert.equal(synced.status, 0, synced.stderr || synced.stdout);
  const database = new DatabaseSync(file, { readOnly: true });
  const expectedMigrations = loadWorkspaceSqliteMigrations().map(({ version, name }) => ({ version, name }));
  assert.deepEqual(database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })), expectedMigrations);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_retrospective_current', 'task_lifecycle_current')").get().count, 2);
  database.close();
});

test('sync 的 SQLite migration 失败时不写源资产', (t) => {
  const root = fixtureRoot(t);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not a sqlite database\n');
  const manifestFile = path.join(root, 'skills', 'manifest.yml');
  const manifestBefore = fs.readFileSync(manifestFile);
  const synced = run(['sync', 'codex', '--target', root]);
  assert.notEqual(synced.status, 0);
  assert.match(`${synced.stderr}\n${synced.stdout}`, /Workspace structured store/);
  assert.deepEqual(fs.readFileSync(manifestFile), manifestBefore);
});
