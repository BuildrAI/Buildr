import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { registerWorkspaceRegistryRepository, WORKSPACE_REGISTRY_SCHEMA } from '../../src/workspace/persistence/workspace-registry-repository.mjs';
import { registerWorkspaceManagementFence } from '../../src/workspace/infrastructure/workspace-management-fence.mjs';
import { oppositeWebProfile, resolveWebProfile } from '../../src/system/installation/contracts/web-profile.mjs';

const RELEASED = { channel: 'npm', runtime: { role: 'host' } };
const DEVELOPMENT = { channel: 'development', runtime: { role: 'development' } };

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-management-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const releasedRoot = path.join(base, 'released');
  const developmentRoot = path.join(base, 'development');
  const profiles = {
    released: resolveWebProfile(RELEASED, { dataRoot: releasedRoot }),
    development: resolveWebProfile(DEVELOPMENT, { dataRoot: developmentRoot }),
  };
  return { base, releasedRoot, developmentRoot, profiles };
}

function workspace(base, name, id = crypto.randomUUID()) {
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: ${name}\ndescription: Test Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  return root;
}

function runtimeFor(identity, profile, profiles) {
  const runtime = createRuntime();
  registerWorkspaceRegistryRepository(runtime, { productIdentity: identity, webProfile: profile, resolveWebProfile });
  registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
  return runtime;
}

function register(runtime, root) {
  const before = runtime.listRegisteredWorkspaces();
  return runtime.registerLocalWorkspace({ rootPath: root, revision: before.revision });
}

test('released与development registry隔离，Workspace-local claim阻止双重管理', (t) => {
  const { base, releasedRoot, developmentRoot, profiles } = fixture(t);
  const root = workspace(base, 'workspace');
  const released = runtimeFor(RELEASED, profiles.released, profiles);
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);

  const result = register(released, root);
  assert.equal(result.workspaces.length, 1);
  assert.equal(fs.existsSync(path.join(releasedRoot, 'workspace-registry.json')), true);
  assert.equal(fs.existsSync(path.join(developmentRoot, 'workspace-registry.json')), false);
  const claim = JSON.parse(fs.readFileSync(path.join(root, '.buildr', 'local', 'web-management.json'), 'utf8'));
  assert.equal(claim.owner.profile, 'released');

  assert.throws(
    () => register(development, root),
    (error) => error.code === 'workspace_management_channel_conflict' && error.details.current.profile === 'development',
  );
  assert.equal(fs.existsSync(path.join(developmentRoot, 'workspace-registry.json')), false);
});

test('对侧legacy registry、symlink与损坏registry都在claim前fail closed', (t) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'workspace');
  const link = path.join(base, 'workspace-link');
  fs.symlinkSync(root, link);
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);

  assert.throws(() => register(development, link), (error) => error.code === 'workspace_management_channel_conflict');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);

  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), '{broken\n');
  assert.throws(() => register(development, root), (error) => error.code === 'workspace_management_peer_registry_invalid');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);
});

test('migration前冲突不改变SQLite bytes、mtime或ledger', (t) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'workspace');
  const store = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  const database = new DatabaseSync(store);
  database.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);');
  database.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(0, '0000_fixture.sql', 'sha256-fixture', '2026-08-18T00:00:00.000Z');
  database.close();
  const beforeBytes = fs.readFileSync(store);
  const beforeMtime = fs.statSync(store).mtimeMs;
  const beforeLedger = (() => {
    const reader = new DatabaseSync(store, { readOnly: true });
    try { return reader.prepare('SELECT * FROM schema_migrations').all().map((row) => ({ ...row })); }
    finally { reader.close(); }
  })();

  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  assert.throws(() => development.openWorkspaceStructuredStore(root, { writable: true }), (error) => error.code === 'workspace_management_channel_conflict');
  assert.deepEqual(fs.readFileSync(store), beforeBytes);
  assert.equal(fs.statSync(store).mtimeMs, beforeMtime);
  const reader = new DatabaseSync(store, { readOnly: true });
  try { assert.deepEqual(reader.prepare('SELECT * FROM schema_migrations').all().map((row) => ({ ...row })), beforeLedger); }
  finally { reader.close(); }
});

test('从当前registry移除只清理matching claim且不打开SQLite', (t) => {
  const { base, profiles } = fixture(t);
  const root = workspace(base, 'workspace');
  const runtime = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const registered = register(runtime, root);
  const sqlite = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.writeFileSync(sqlite, 'not-a-sqlite-database\n');
  const before = fs.readFileSync(sqlite);
  const removed = runtime.removeRegisteredWorkspace({ rootPath: root, revision: registered.revision });
  assert.equal(removed.workspaces.length, 0);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'web-management.json')), false);
  assert.deepEqual(fs.readFileSync(sqlite), before);
});

test('Preview只有在closed owner精确匹配Workspace时才跳过ordinary channel fence', (t) => {
  const { base, releasedRoot, profiles } = fixture(t);
  const root = workspace(base, 'workspace');
  const other = workspace(base, 'other');
  fs.mkdirSync(releasedRoot, { recursive: true });
  fs.writeFileSync(path.join(releasedRoot, 'workspace-registry.json'), `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: root }, null, 2)}\n`);
  const development = runtimeFor(DEVELOPMENT, profiles.development, profiles);
  const previous = process.env.BUILDR_LOCAL_APP_PREVIEW;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previous;
  });

  process.env.BUILDR_LOCAL_APP_PREVIEW = 'invalid';
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error) => error.code === 'workspace_management_channel_conflict');

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'task', worktree: other, environmentRoot: other,
  });
  assert.throws(() => development.assertWorkspaceManagementAccess(root), (error) => error.code === 'workspace_management_channel_conflict');

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'task', worktree: root, environmentRoot: root,
  });
  assert.deepEqual(development.assertWorkspaceManagementAccess(root), {
    status: 'preview', claimed: false, identity: null, profile: null,
  });
});
