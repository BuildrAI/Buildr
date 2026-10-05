import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createMutationPathGuard } from '../../src/infrastructure/filesystem/workspace-mutation.ts';
import { createWorkspaceManifestRepository } from '../../src/modules/workspace/persistence/workspace-manifest-repository.ts';
import { createWorkspaceRegistryRepository, WORKSPACE_REGISTRY_SCHEMA } from '../../src/modules/workspace/persistence/workspace-registry-repository.ts';
import { registerWorkspaceManagementFence } from '../../src/modules/workspace/infrastructure/workspace-management-fence.ts';
import { registerWorkspaceQueryApplication } from '../../src/modules/workspace/application/workspace-query-application.ts';
import { registerWorkspaceCommandApplication } from '../../src/modules/workspace/application/workspace-command-application.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { buildInstallationInventory } from '../../src/modules/installation/application/product-installation-status.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RELEASED: any = { channel: 'npm', runtime: { role: 'host' } };
const DEVELOPMENT: any = { channel: 'development', runtime: { role: 'development' } };

function fixture(t: any): any  {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-management-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const releasedRoot: any = path.join(base, 'released');
  const developmentRoot: any = path.join(base, 'development');
  const profiles: any = {
    released: resolveWebProfile(RELEASED, { dataRoot: releasedRoot }),
    development: resolveWebProfile(DEVELOPMENT, { dataRoot: developmentRoot }),
  };
  return { base, releasedRoot, developmentRoot, profiles };
}

function workspace(base: any, name: any, id: any = crypto.randomUUID()): any  {
  const root: any = path.join(base, name);
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: ${name}\ndescription: Test Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  return root;
}

function runtimeFor(identity: any, profile: any, profiles: any): any  {
  const runtime: any = createRuntime();
  runtime.workspaceRepository = createWorkspaceManifestRepository(runtime);
  runtime.registryRepository = createWorkspaceRegistryRepository(runtime, { productIdentity: identity, webProfile: profile, resolveWebProfile });
  Object.assign(runtime, runtime.workspaceRepository, runtime.registryRepository);
  registerWorkspaceQueryApplication(runtime);
  registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
  registerWorkspaceCommandApplication(runtime);
  return runtime;
}

function register(runtime: any, root: any): any  {
  const before: any = runtime.listRegisteredWorkspaces();
  return runtime.registerLocalWorkspace({ rootPath: root, revision: before.revision });
}

test('released与development registry隔离，Workspace-local claim阻止双重管理', (t: any) => {
  const { base, releasedRoot, developmentRoot, profiles }: any = fixture(t);
  const root: any = workspace(base, 'workspace');
  const released: any = runtimeFor(RELEASED, profiles.released, profiles);
  const development: any = runtimeFor(DEVELOPMENT, profiles.development, profiles);

  const result: any = register(released, root);
  assert.equal(result.workspaces.length, 1);
  assert.equal(fs.existsSync(path.join(releasedRoot, 'workspace-registry.json')), true);
  assert.equal(fs.existsSync(path.join(developmentRoot, 'workspace-registry.json')), false);
  const claim: any = JSON.parse(fs.readFileSync(path.join(root, '.buildr', 'local', 'web-management.json'), 'utf8'));
  assert.equal(claim.owner.profile, 'released');

  assert.throws(
    () => register(development, root),
    (error: any) => error.code === 'workspace_management_channel_conflict' && error.details.current.profile === 'development',
  );
  assert.equal(fs.existsSync(path.join(developmentRoot, 'workspace-registry.json')), false);
});

test('对侧legacy registry、symlink与损坏registry都在claim前fail closed', (t: any) => {
  const { base, releasedRoot, profiles }: any = fixture(t);
  const root: any = workspace(base, 'workspace');
  const link: any = path.join(base, 'workspace-link');
  fs.symlinkSync(root, link);
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development: any = runtimeFor(DEVELOPMENT, profiles.development, profiles);

  assert.throws(() => register(development, link), (error: any) => error.code === 'workspace_management_channel_conflict');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);

  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), '{broken\n');
  assert.throws(() => register(development, root), (error: any) => error.code === 'workspace_management_peer_registry_invalid');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);
});

test('完全不存在的无关登记不阻断新claim，悬空链接与现存未知身份继续拒绝', (t: any) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'current');
  const peerFile = path.join(releasedRoot, 'workspace-registry.json');
  fs.mkdirSync(releasedRoot, { recursive: true });
  const missing = path.join(base, 'deleted');
  const writePeer = (roots: string[]) => fs.writeFileSync(peerFile, JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots, lastOpenedRoot: null }));
  writePeer([missing]);
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  assert.equal(register(development, root).workspaces.length, 1);
  const peerBefore = fs.readFileSync(peerFile, 'utf8');
  assert.equal(development.assertWorkspaceManagementAccess(root).status, 'ready');
  assert.equal(fs.readFileSync(peerFile, 'utf8'), peerBefore);
  const dangling = path.join(base, 'dangling');
  fs.symlinkSync(missing, dangling);
  const unknown = path.join(base, 'unknown');
  fs.mkdirSync(unknown);
  for (const peer of [dangling, path.join(dangling, 'child'), unknown]) {
    writePeer([peer]);
    const fresh = workspace(base, crypto.randomUUID());
    assert.throws(() => register(development, fresh), (error: any) => error.code === 'workspace_management_peer_identity_unknown');
    assert.equal(fs.existsSync(path.join(fresh, '.buildr', 'local', 'web-management.json')), false);
  }
});

test('matching归属保留当前工作和公共诊断，未知条目之后的真实冲突仍拒绝', (t: any) => {
  const { base, releasedRoot, developmentRoot, profiles } = fixture(t);
  const root = workspace(base, 'current');
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  register(development, root);
  const peerFile = path.join(releasedRoot, 'workspace-registry.json');
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(peerFile, '{broken\n');
  assert.equal(development.assertWorkspaceManagementAccess(root).claimed, true);
  assert.equal(development.withWorkspaceManagementClaim(root, () => 'continued'), 'continued');
  const inventory = buildInstallationInventory(path.resolve(import.meta.dirname, '../..'), {
    installationRegistryFile: path.join(base, 'global-installations.json'),
    instanceDataRoots: { released: releasedRoot, development: developmentRoot },
    launcherTarget: path.join(base, 'unused-launcher'),
    developmentLauncherRoot: path.join(base, 'unused-development-launcher'),
  });
  assert.equal(inventory.workspaceManagement.registries.released.status, 'invalid');
  assert.ok(inventory.workspaceManagement.conflicts.some((entry: any) => entry.type === 'registry-invalid'));
  const fresh = workspace(base, 'new');
  assert.throws(() => register(development, fresh), (error: any) => error.code === 'workspace_management_peer_registry_invalid');
  const unknown = path.join(base, 'unknown');
  fs.mkdirSync(unknown);
  const clone = workspace(base, 'duplicate', development.canonicalWorkspaceManagementIdentity(root).workspaceId);
  fs.writeFileSync(peerFile, JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [unknown, clone], lastOpenedRoot: null }));
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_channel_conflict');
  assert.throws(() => development.withWorkspaceManagementClaim(root, () => 'unsafe'), (error: any) => error.code === 'workspace_management_channel_conflict');
});

test('损坏本机归属不能借对侧故障放行', (t: any) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'current');
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  register(development, root);
  const file = path.join(root, '.buildr', 'local', 'web-management.json');
  fs.writeFileSync(file, '{broken\n');
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), '{broken\n');
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_record_invalid');
});

test('对侧登记访问被拒绝时不能被existsSync误判为不存在并建立新claim', (t: any) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'new');
  const peerFile = path.join(releasedRoot, 'workspace-registry.json');
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const exists = fs.existsSync.bind(fs);
  const read: any = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'existsSync', (file: any) => path.resolve(String(file)) === peerFile ? false : exists(file));
  t.mock.method(fs, 'readFileSync', (file: any, ...args: any[]) => {
    if (path.resolve(String(file)) === peerFile) throw Object.assign(new Error('fixture peer registry access denied'), { code: 'EACCES' });
    return read(file, ...args);
  });
  assert.equal(development.readWorkspaceRegistryFile(peerFile).status, 'invalid');
  assert.throws(() => register(development, root), (error: any) => error.code === 'workspace_management_peer_registry_invalid');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);
});

test('本机归属访问被拒绝或悬空时不能视为未认领并放行读取', (t: any) => {
  const { base, profiles } = fixture(t);
  const root = workspace(base, 'current');
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const file = development.workspaceManagementPath(root);
  const exists = fs.existsSync.bind(fs);
  const read: any = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'existsSync', (candidate: any) => path.resolve(String(candidate)) === file ? false : exists(candidate));
  t.mock.method(fs, 'readFileSync', (candidate: any, ...args: any[]) => {
    if (path.resolve(String(candidate)) === file) throw Object.assign(new Error('fixture local management access denied'), { code: 'EACCES' });
    return read(candidate, ...args);
  });
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_record_invalid');
  t.mock.restoreAll();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.symlinkSync(path.join(base, 'missing-record'), file);
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_record_invalid');
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
});

test('登记锁恢复真实死亡进程，保全活跃持有者、旧空锁和版本冲突', (t: any) => {
  const { base, profiles } = fixture(t);
  const runtime = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const repository = runtime.registryRepository;
  const before = repository.readWorkspaceRegistryPersistence();
  const lockFile = `${before.file}.lock`;
  const source = pathToFileURL(path.resolve(import.meta.dirname, '../../src/infrastructure/filesystem/exclusive-file-lock.ts')).href;
  const exited = spawnSync(process.execPath, ['--input-type=module', '-e', `import { acquireExclusiveFileLock } from ${JSON.stringify(source)}; const held = acquireExclusiveFileLock(${JSON.stringify(lockFile)}, ${JSON.stringify(before.file)}, { timeoutMs: 0 }); console.log(held.record.pid); process.exit(0);`], { encoding: 'utf8' });
  assert.equal(exited.status, 0, exited.stderr);
  const changed = repository.withWorkspaceRegistryMutation(before.revision, (current: any) => ({ ...current, roots: [path.join(base, 'registered')], lastOpenedRoot: null }));
  assert.equal(fs.existsSync(lockFile), false);
  const live = acquireExclusiveFileLock(lockFile, before.file, { timeoutMs: 0 });
  assert.throws(() => repository.withWorkspaceRegistryMutation(changed.revision, (current: any) => current), (error: any) => error.code === 'workspace_registry_revision_conflict');
  assert.equal(fs.existsSync(lockFile), true);
  assert.equal(releaseExclusiveFileLock(live), true);
  fs.writeFileSync(lockFile, '');
  assert.throws(() => repository.withWorkspaceRegistryMutation(changed.revision, (current: any) => current), (error: any) => error.code === 'workspace_registry_revision_conflict');
  assert.equal(fs.readFileSync(lockFile, 'utf8'), '');
  fs.unlinkSync(lockFile);
  const content = fs.readFileSync(before.file, 'utf8');
  assert.throws(() => repository.withWorkspaceRegistryMutation(before.revision, (current: any) => current), (error: any) => error.code === 'workspace_registry_revision_conflict');
  assert.equal(fs.readFileSync(before.file, 'utf8'), content);
});

test('migration前冲突不改变SQLite bytes、mtime或ledger', (t: any) => {
  const { base, releasedRoot, profiles }: any = fixture(t);
  const root: any = workspace(base, 'workspace');
  const store: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  const database: any = new DatabaseSync(store);
  database.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);');
  database.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(0, '0000_fixture.sql', 'sha256-fixture', '2026-08-18T00:00:00.000Z');
  database.close();
  const beforeBytes: any = fs.readFileSync(store);
  const beforeMtime: any = fs.statSync(store).mtimeMs;
  const beforeLedger: any = (() => {
    const reader: any = new DatabaseSync(store, { readOnly: true });
    try { return reader.prepare('SELECT * FROM schema_migrations').all().map((row: any) => ({ ...row })); }
    finally { reader.close(); }
  })();

  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development: any = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  assert.throws(() => development.openWorkspaceStructuredStore(root, { writable: true }), (error: any) => error.code === 'workspace_management_channel_conflict');
  assert.deepEqual(fs.readFileSync(store), beforeBytes);
  assert.equal(fs.statSync(store).mtimeMs, beforeMtime);
  const reader: any = new DatabaseSync(store, { readOnly: true });
  try { assert.deepEqual(reader.prepare('SELECT * FROM schema_migrations').all().map((row: any) => ({ ...row })), beforeLedger); }
  finally { reader.close(); }
});

test('claim 操作失败且目录已替换时保留原错误，不清理另一 Workspace 的匹配记录', (t: any) => {
  const { base, profiles }: any = fixture(t);
  const root = workspace(base, 'workspace');
  const other = workspace(base, 'other');
  const local = path.join(root, '.buildr', 'local');
  const otherLocal = path.join(other, '.buildr', 'local');
  fs.mkdirSync(otherLocal);
  const runtime = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const assertPath = createMutationPathGuard(root);
  const assertSafe = () => assertPath(path.join(local, 'web-management.json'), 'file');
  const primary: any = new Error('operation failed');
  let copied: Buffer;
  assert.throws(() => runtime.withWorkspaceManagementClaim(root, () => {
    copied = fs.readFileSync(path.join(local, 'web-management.json'));
    fs.renameSync(local, `${local}.original`);
    fs.symlinkSync(otherLocal, local, 'dir');
    // Even a matching record at the replacement location is not ours to delete.
    fs.writeFileSync(path.join(otherLocal, 'web-management.json'), copied);
    throw primary;
  }, { assertSafe }), (error: any) => error === primary);
  assert.deepEqual(fs.readFileSync(path.join(otherLocal, 'web-management.json')), copied!);
  assert.deepEqual(fs.readdirSync(otherLocal), ['web-management.json']);
  assert.ok(primary.managementClaimCleanupError instanceof Error);
  assert.ok(primary.lockCleanupError instanceof Error);
  assert.equal(fs.existsSync(path.join(`${local}.original`, 'web-management.json.lock')), true, 'owned lock remains at the original location when cleanup cannot be authorized');
});

test('从当前registry移除只清理matching claim且不打开SQLite', (t: any) => {
  const { base, profiles }: any = fixture(t);
  const root: any = workspace(base, 'workspace');
  const runtime: any = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const registered: any = register(runtime, root);
  const sqlite: any = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(sqlite, 'not-a-sqlite-database\n');
  const before: any = fs.readFileSync(sqlite);
  const removed: any = runtime.removeRegisteredWorkspace({ rootPath: root, revision: registered.revision });
  assert.equal(removed.workspaces.length, 0);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);
  assert.deepEqual(fs.readFileSync(sqlite), before);
});

test('Preview只有在closed owner精确匹配Workspace时才跳过ordinary channel fence', (t: any) => {
  const { base, releasedRoot, profiles }: any = fixture(t);
  const root: any = workspace(base, 'workspace');
  const other: any = workspace(base, 'other');
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development: any = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const previous: any = process.env.BUILDR_LOCAL_APP_PREVIEW;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previous;
  });

  process.env.BUILDR_LOCAL_APP_PREVIEW = 'invalid';
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_channel_conflict');

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'task', worktree: other, environmentRoot: other,
  });
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error: any) => error.code === 'workspace_management_channel_conflict');

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'task', worktree: root, environmentRoot: root,
  });
  assert.deepEqual(development.assertWorkspaceManagementAccess(root), {
    status: 'preview', claimed: false, identity: null, profile: null,
  });
});

test('Workspace runtime port excludes private composition helpers and repositories', () => {
  const runtime = createRuntime();
  for (const name of ['sourceFiles', 'projectRepository', 'serviceRepository', 'readWorkspaceRecord', 'publicWorkspace', 'recoveryPrompt', 'validateServiceRegistryFile', 'cloneSourceRepository']) {
    assert.equal(runtime[name], undefined, name);
  }
  assert.equal(typeof runtime.getWorkspace, 'function');
  assert.equal(typeof runtime.createProject, 'function');
});
