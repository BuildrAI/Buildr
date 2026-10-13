import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { ConnectionsApplication } from '../../src/modules/connections/application/connections-application.ts';
import { ConnectionRepository } from '../../src/modules/connections/persistence/connection-repository.ts';
import { resolveConnectionWorkspace } from '../../src/modules/connections/infrastructure/connection-workspace.ts';
import type { ConnectionProvider } from '../../src/modules/connections/application/connection-provider.ts';
import { connectionFailure, inputObject } from '../../src/modules/connections/domain/connection.ts';
import { createConnectionsModule, CONNECTIONS_APPLICATION } from '../../src/modules/connections/module.ts';
import { registerWorkspaceSqlite, applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction, transactionDatabase } from '../../src/infrastructure/sqlite/transaction.ts';
import { DatabaseSync } from 'node:sqlite';
import { createConnectionsHttpContribution } from '../../src/modules/connections/interfaces/http/connections-http.ts';
import { recordRevision } from '../../src/modules/connections/domain/connection.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_TASK_SUPPORT } from '../../src/modules/workspace/module.ts';

function fixture(t: { after(action: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-unit-')), root = path.join(base, 'workspace'), dataRoot = path.join(base, 'profile'), workspaceId = crypto.randomUUID();
  fs.mkdirSync(root); fs.mkdirSync(dataRoot);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'));
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace: (target: string) => { assert.equal(fs.existsSync(path.join(target, '.buildr')), true); } }));
  const scope = { rootPath: root, workspaceId }, application = new ConnectionsApplication({ dataRoot, store, resolveScope: () => scope });
  return { base, root, dataRoot, workspaceId, scope, store, application };
}
const mysql = { name: '测试 MySQL', category: 'data-source', type: 'mysql', environment: ' 客户A测试 ', config: { host: '127.0.0.1', port: 3306, username: 'test_reader', defaultDatabase: 'orders_demo', selectedDatabases: ['orders_demo'] } };

test('connections composition consumes actual workspace query and application port boundaries', t => {
  const f = fixture(t), module = createConnectionsModule({ readProductIdentity: () => ({}), resolveWebProfile: () => ({ dataRoot: f.dataRoot }) });
  const assembled = module.create({
    [WORKSPACE_QUERY]: { getWorkspace: (root: string) => ({ rootPath: root, workspace: { id: f.workspaceId } }), resolveSourceWorkspaceRoot: (root: string) => root },
    [WORKSPACE_APPLICATION]: { listRegisteredWorkspaces: () => ({ workspaces: [] }) },
    [WORKSPACE_TASK_SUPPORT]: f.store,
  });
  assert.deepEqual(assembled.provides[CONNECTIONS_APPLICATION].list(f.root), { connections: [] });
});

test('SQLite connections are generic, credentials authenticated-encrypted and local, and mutations protect versions', t => {
  const f = fixture(t), password = 'test-secret-' + crypto.randomUUID();
  assert.deepEqual(f.application.list(f.root), { connections: [] }); assert.equal(fs.existsSync(path.join(f.root, 'connections')), false);
  const first = f.application.create(f.root, { ...mysql, credentials: { password } }).connection;
  assert.equal(first.environment, '客户A测试'); assert.equal(first.hasCredentials, true);
  assert.equal('credentialId' in first, false); assert.equal('credentials' in first, false); assert.equal('password' in first, false);
  assert.equal(fs.existsSync(path.join(f.root, 'connections/manifest.yml')), false);
  assert.equal(fs.readFileSync(path.join(f.root, '.buildr/local/workspace.sqlite')).includes(Buffer.from(password)), false);
  const directory = path.join(f.dataRoot, 'external-connections', f.workspaceId);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  const encrypted = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
  assert.equal(encrypted.length, 1);
  const secretFile = path.join(directory, encrypted[0]);
  assert.equal(fs.statSync(secretFile).mode & 0o777, 0o600); assert.equal(fs.readFileSync(secretFile, 'utf8').includes(password), false);
  assert.equal(fs.statSync(path.join(f.dataRoot, 'external-connections/credential-key.json')).mode & 0o777, 0o600);
  const second = f.application.update(f.root, first.id, { expectedRevision: first.revision, name: '已改名' }).connection;
  assert.notEqual(second.revision, first.revision); assert.equal(second.hasCredentials, true);
  assert.throws(() => f.application.update(f.root, first.id, { expectedRevision: first.revision, name: '过期覆盖' }), { code: 'connection_revision_conflict' });
  assert.throws(() => f.application.remove(f.root, first.id, { expectedRevision: first.revision }), { code: 'connection_revision_conflict' });
  assert.throws(() => f.application.update(f.root, first.id, { expectedRevision: second.revision, config: { host: 'other.invalid' } }), { code: 'connection_credentials_required' });
  const third = f.application.update(f.root, first.id, { expectedRevision: second.revision, config: { host: 'other.invalid' }, credentials: { password: '' } }).connection;
  assert.equal(third.hasCredentials, true); assert.equal(fs.existsSync(secretFile), false);
  assert.deepEqual(f.application.remove(f.root, first.id, { expectedRevision: third.revision }), { removedId: first.id });
  assert.deepEqual(fs.readdirSync(directory), []); assert.equal(f.application.list(f.root).connections.length, 0);
});
test('future providers own configuration/authentication and unsupported actions fail locally', async t => {
  const f = fixture(t); let tested = false;
  const provider: ConnectionProvider = {
    category: 'log', type: 'test-log',
    validateConfig(value) { const input = inputObject(value, ['url']); if (typeof input.url !== 'string') throw connectionFailure('invalid_test', 'url'); return { url: input.url }; },
    validateCredentials(value) { return inputObject(value, ['token']); }, authenticationTargetIdentity: config => String(config.url),
    async test(config, credentials) { assert.equal(config.url, 'https://example.invalid'); assert.equal(credentials.token, 'fake-token'); tested = true; return { ok: true, elapsedMs: 1 }; },
  };
  const app = new ConnectionsApplication({ dataRoot: f.dataRoot, store: f.store, resolveScope: () => f.scope, providers: [provider] });
  const record = app.create(f.root, { name: '演示日志', category: 'log', type: 'test-log', environment: 'qa', config: { url: 'https://example.invalid' }, credentials: { token: 'fake-token' } }).connection;
  assert.deepEqual(record.config, { url: 'https://example.invalid' }); assert.equal('host' in record.config, false);
  await app.test(f.root, { id: record.id, expectedRevision: record.revision }); assert.equal(tested, true);
  await assert.rejects(() => app.query(f.root, record.id, { sql: 'SELECT 1' }), { code: 'connection_operation_unsupported' });
  assert.throws(() => f.application.create(f.root, { name: '不支持', category: 'log', type: 'missing', config: {} }), { code: 'connection_type_unsupported' });
  assert.equal(app.list(f.root).connections.length, 1);
});
test('unbound or tampered local credentials fail without hiding target or leaking credential values', async t => {
  const f = fixture(t), record = f.application.create(f.root, mysql).connection;
  assert.equal(record.hasCredentials, false);
  await assert.rejects(() => f.application.test(f.root, { id: record.id, expectedRevision: record.revision }), { code: 'connection_credentials_missing' });
  await assert.rejects(() => f.application.query(f.root, record.id, { sql: 'SELECT 1' }), { code: 'connection_credentials_missing' });
  const bound = f.application.update(f.root, record.id, { expectedRevision: record.revision, credentials: { password: 'only-test-password' } }).connection;
  const repository = new ConnectionRepository(f.dataRoot, f.store), stored = repository.read(f.scope)[0];
  const directory = path.join(f.dataRoot, 'external-connections', f.workspaceId), file = path.join(directory, stored.credentialId + '.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.tag = Buffer.alloc(16).toString('base64'); fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(f.application.list(f.root).connections[0].hasCredentials, false);
  await assert.rejects(() => f.application.test(f.root, { id: bound.id, expectedRevision: bound.revision }), error => (error as { code: string }).code === 'connection_credentials_unavailable' && !String(error).includes('only-test-password'));
});
test('the generic connection layer supports a provider with no authentication requirement', async t => {
  const f = fixture(t);
  const provider: ConnectionProvider = {
    category: 'tool', type: 'public-endpoint-test',
    validateConfig(value) { const config = inputObject(value, ['endpoint']); if (typeof config.endpoint !== 'string') throw connectionFailure('invalid_test', 'endpoint'); return config; },
    validateCredentials(value) { return inputObject(value, []); },
    authenticationTargetIdentity: config => String(config.endpoint),
    async test(config, credentials) { assert.equal(config.endpoint, 'https://example.invalid'); assert.deepEqual(credentials, {}); return { ok: true, elapsedMs: 1 }; },
  };
  const application = new ConnectionsApplication({ dataRoot: f.dataRoot, store: f.store, resolveScope: () => f.scope, providers: [provider] });
  const record = application.create(f.root, { name: '无认证测试工具', category: 'tool', type: 'public-endpoint-test', config: { endpoint: 'https://example.invalid' } }).connection;
  assert.equal(record.hasCredentials, false);
  assert.deepEqual(await application.test(f.root, { id: record.id, expectedRevision: record.revision }), { ok: true, elapsedMs: 1 });
  assert.equal(fs.existsSync(path.join(f.dataRoot, 'external-connections')), false);
});
test('external SQLite changes cannot send an existing credential to another target or provider', async t => {
  const f = fixture(t); let calls = 0;
  const provider: ConnectionProvider = {
    category: 'tool', type: 'credential-binding-test',
    validateConfig(value) { const config = inputObject(value, ['endpoint', 'display']); if (typeof config.endpoint !== 'string') throw connectionFailure('invalid_test', 'endpoint'); return config; },
    validateCredentials(value) { return inputObject(value, ['token']); }, authenticationTargetIdentity: config => String(config.endpoint),
    async test(_config, credentials) { calls++; assert.equal(credentials.token, 'fake-bound-token'); return { ok: true, elapsedMs: 1 }; },
    mysql: {
      async databases() { calls++; return []; }, async tables() { calls++; return []; }, async columns() { calls++; return []; },
      async query() { calls++; return { database: null, submittedSql: 'SELECT 1', executedSql: 'SELECT 1 LIMIT 100', columns: [], rows: [], rowCount: 0, rowLimit: 100, elapsedMs: 1, limitReached: false }; },
    },
  };
  const otherProvider = { ...provider, type: 'other-binding-test' };
  const application = new ConnectionsApplication({ dataRoot: f.dataRoot, store: f.store, resolveScope: () => f.scope, providers: [provider, otherProvider] });
  const created = application.create(f.root, { name: '认证绑定测试', category: provider.category, type: provider.type, config: { endpoint: 'https://first.invalid', display: 'first' }, credentials: { token: 'fake-bound-token' } }).connection;
  await application.test(f.root, { id: created.id, expectedRevision: created.revision }); assert.equal(calls, 1);
  const unchangedTarget = application.update(f.root, created.id, { expectedRevision: created.revision, name: '改名', environment: 'custom', config: { display: 'second' } }).connection;
  assert.equal(unchangedTarget.hasCredentials, true);
  await application.test(f.root, { id: created.id, expectedRevision: unchangedTarget.revision }); assert.equal(calls, 2);
  const repositoryBefore = new ConnectionRepository(f.dataRoot, f.store), original = repositoryBefore.read(f.scope)[0];
  const replace = (record: typeof original) => f.store.runWorkspaceTransaction(f.root, (context: object) => transactionDatabase(context).prepare('UPDATE external_connections SET record_json = ? WHERE connection_id = ?').run(JSON.stringify(record), record.id));
  replace({ ...original, config: { ...original.config, endpoint: 'https://second.invalid' } });
  let current = application.list(f.root).connections[0]; assert.equal(current.hasCredentials, false);
  await assert.rejects(() => application.test(f.root, { id: current.id, expectedRevision: current.revision }), { code: 'connection_credentials_target_changed' });
  await assert.rejects(() => application.databases(f.root, current.id), { code: 'connection_credentials_target_changed' });
  await assert.rejects(() => application.query(f.root, current.id, { sql: 'SELECT 1' }), { code: 'connection_credentials_target_changed' });
  assert.equal(calls, 2, 'no provider call may receive the old token after an external target change');
  replace({ ...original, type: otherProvider.type });
  current = application.list(f.root).connections[0];
  await assert.rejects(() => application.test(f.root, { id: current.id, expectedRevision: current.revision }), { code: 'connection_credentials_target_changed' });
  assert.equal(calls, 2);
  replace(original);
  const repository = new ConnectionRepository(f.dataRoot, f.store), stored = repository.read(f.scope)[0];
  const encryptedFile = path.join(f.dataRoot, 'external-connections', f.workspaceId, stored.credentialId + '.json');
  const legacy = JSON.parse(fs.readFileSync(encryptedFile, 'utf8')); legacy.schemaVersion = 'buildr.connection-credential/v1'; delete legacy.bindingDigest; fs.writeFileSync(encryptedFile, JSON.stringify(legacy));
  await assert.rejects(() => application.test(f.root, { id: unchangedTarget.id, expectedRevision: unchangedTarget.revision }), { code: 'connection_credentials_binding_invalid' });
  assert.equal(calls, 2, 'legacy credentials without a target binding must be rebound before use');
});
test('MySQL credential bindings ignore default and displayed databases but include host, port, and username', t => {
  const f = fixture(t), created = f.application.create(f.root, { ...mysql, credentials: { password: 'binding-test-only' } }).connection;
  const updated = f.application.update(f.root, created.id, { expectedRevision: created.revision, name: '改名', environment: 'other', config: { defaultDatabase: 'billing_demo', selectedDatabases: [] } }).connection;
  assert.equal(updated.hasCredentials, true);
  const original = new ConnectionRepository(f.dataRoot, f.store).read(f.scope)[0];
  for (const [field, value] of [['host', 'other.invalid'], ['port', 3307], ['username', 'other_reader']] as const) {
    const changed = { ...original, config: { ...original.config, [field]: value } };
    f.store.runWorkspaceTransaction(f.root, (context: object) => transactionDatabase(context).prepare('UPDATE external_connections SET record_json = ? WHERE connection_id = ?').run(JSON.stringify(changed), changed.id));
    assert.equal(f.application.list(f.root).connections[0].hasCredentials, false, field + ' must invalidate the existing credential binding');
  }
});
test('linked code worktrees resolve canonical declarations and fail if the source metadata disappears', t => {
  const f = fixture(t), linked = path.join(f.base, 'linked');
  const git = (cwd: string, ...args: string[]) => { const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  fs.writeFileSync(path.join(f.root, '.buildr/workspace.yml'), f.workspaceId);
  git(f.root, 'init', '-q'); git(f.root, 'add', '.'); git(f.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); git(f.root, 'worktree', 'add', '-q', '-b', 'test-linked', linked);
  const reader = {
    resolveSourceWorkspaceRoot: (root: string) => root,
    getWorkspace: (root: string) => ({ rootPath: root, workspace: { id: fs.readFileSync(path.join(root, '.buildr/workspace.yml'), 'utf8') } }),
    listRegisteredWorkspaces: () => ({ workspaces: [] }),
  };
  assert.deepEqual(resolveConnectionWorkspace(linked, reader), { ...f.scope, rootPath: fs.realpathSync(f.root) });
  for (const directory of [f.root, linked]) { fs.mkdirSync(path.join(directory, 'nested/.buildr'), { recursive: true }); fs.writeFileSync(path.join(directory, 'nested/.buildr/workspace.yml'), f.workspaceId); }
  assert.deepEqual(resolveConnectionWorkspace(path.join(linked, 'nested'), reader), { ...f.scope, rootPath: fs.realpathSync(path.join(f.root, 'nested')) });
  fs.rmSync(path.join(f.root, '.buildr/workspace.yml'));
  assert.throws(() => resolveConnectionWorkspace(linked, reader), { code: 'connection_workspace_source_unavailable' });
  fs.writeFileSync(path.join(linked, '.git'), 'gitdir: /nonexistent/buildr-test-only\n');
  assert.throws(() => resolveConnectionWorkspace(linked, reader), { code: 'connection_workspace_source_unavailable' });
});

function legacyFile(f: ReturnType<typeof fixture>, records: unknown[]) {
  const file = path.join(f.root, 'connections/manifest.yml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify({ schemaVersion: 'buildr.connections/v1', workspaceId: f.workspaceId, connections: records }));
  return file;
}
function legacyRecord(index = 1) {
  const stamp = '2026-10-01T09:00:00.000Z';
  return { ...mysql, environment: mysql.environment.trim(), id: 'connection-' + crypto.randomUUID(), credentialId: null, createdAt: stamp, updatedAt: stamp, name: '旧连接 ' + index };
}
function seedSchema35(f: ReturnType<typeof fixture>) {
  const file = path.join(f.root, '.buildr/local/workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  for (const script of loadWorkspaceSqliteMigrations().filter((script: { version: number }) => script.version <= 35)) applyWorkspaceSqliteMigration(database, script);
  database.close(); return file;
}

test('schema35 first read atomically imports legacy records and preserves identity, revision and encrypted authentication', t => {
  const f = fixture(t), created = f.application.create(f.root, { ...mysql, credentials: { password: 'migration-test-only' } }).connection;
  const repository = new ConnectionRepository(f.dataRoot, f.store), original = repository.read(f.scope)[0];
  const encrypted = path.join(f.dataRoot, 'external-connections', f.workspaceId, original.credentialId + '.json'), before = fs.readFileSync(encrypted);
  fs.rmSync(path.join(f.root, '.buildr/local/workspace.sqlite'));
  const databaseFile = seedSchema35(f), file = legacyFile(f, [original]), source = fs.readFileSync(file);
  const migrated = f.application.list(f.root).connections;
  assert.deepEqual(migrated, [created]);
  assert.equal(migrated[0].revision, recordRevision(original));
  assert.deepEqual(repository.read(f.scope), [original]);
  assert.deepEqual(fs.readFileSync(encrypted), before, 'migration does not decrypt or rewrite credentials');
  assert.deepEqual(fs.readFileSync(file), source, 'legacy file is preserved byte for byte');
  const database = new DatabaseSync(databaseFile);
  assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()?.version, 36);
  assert.equal(database.prepare('SELECT count(*) AS count FROM external_connection_store').get()?.count, 1);
  database.exec('BEGIN IMMEDIATE');
  try {
    const pureRead = new ConnectionsApplication({ dataRoot: f.dataRoot, resolveScope: () => f.scope, store: { runWorkspaceSqliteRead: f.store.runWorkspaceSqliteRead, runWorkspaceTransaction() { throw new Error('initialized reads must not request a writer'); } } });
    assert.deepEqual(pureRead.list(f.root).connections, migrated, 'reads remain available under another writer lock');
  } finally { database.exec('ROLLBACK'); database.close(); }
  const updated = f.application.update(f.root, created.id, { expectedRevision: created.revision, name: '数据库中的当前名称' }).connection;
  fs.writeFileSync(file, 'invalid: [');
  assert.equal(f.application.list(f.root).connections[0].name, updated.name, 'initialized store never rereads legacy YAML');
  f.application.remove(f.root, created.id, { expectedRevision: updated.revision });
  legacyFile(f, [original]);
  const reopened = new ConnectionsApplication({ dataRoot: f.dataRoot, store: f.store, resolveScope: () => f.scope });
  assert.deepEqual(reopened.list(f.root).connections, [], 'deleted connections never return from the retained backup');
});

test('invalid legacy imports and SQL failures leave no partial connections or completion marker', t => {
  const f = fixture(t), records = [legacyRecord(1), legacyRecord(2)];
  const file = legacyFile(f, [records[0], { ...records[1], id: records[0].id }]);
  assert.throws(() => f.application.list(f.root), { code: 'connection_manifest_invalid' });
  let database = new DatabaseSync(path.join(f.root, '.buildr/local/workspace.sqlite'));
  assert.equal(database.prepare('SELECT count(*) AS count FROM external_connections').get()?.count, 0);
  assert.equal(database.prepare('SELECT count(*) AS count FROM external_connection_store').get()?.count, 0);
  database.exec("CREATE TRIGGER test_import_failure BEFORE INSERT ON external_connections WHEN json_extract(NEW.record_json, '$.name') = '旧连接 2' BEGIN SELECT RAISE(ABORT, 'test import interrupted'); END"); database.close();
  legacyFile(f, records); const original = fs.readFileSync(file);
  assert.throws(() => f.application.list(f.root), /test import interrupted/);
  database = new DatabaseSync(path.join(f.root, '.buildr/local/workspace.sqlite'));
  assert.equal(database.prepare('SELECT count(*) AS count FROM external_connections').get()?.count, 0);
  assert.equal(database.prepare('SELECT count(*) AS count FROM external_connection_store').get()?.count, 0);
  database.exec('DROP TRIGGER test_import_failure'); database.close();
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(f.application.list(f.root).connections.length, 2);
  assert.equal(f.application.list(f.root).connections.length, 2, 'successful retry is idempotent');
});

test('legacy workspace mismatch, unclaimed records, copied databases and corruption fail without fallback or overwrite', t => {
  const f = fixture(t), record = legacyRecord(), file = legacyFile(f, [record]);
  const document = YAML.parse(fs.readFileSync(file, 'utf8')); document.workspaceId = crypto.randomUUID(); fs.writeFileSync(file, YAML.stringify(document));
  assert.throws(() => f.application.list(f.root), { code: 'connection_manifest_invalid' });
  legacyFile(f, [record]);
  const databaseFile = path.join(f.root, '.buildr/local/workspace.sqlite');
  let database = new DatabaseSync(databaseFile);
  database.prepare('INSERT INTO external_connections(connection_id, record_json) VALUES (?, ?)').run(record.id, JSON.stringify(record)); database.close();
  assert.throws(() => f.application.list(f.root), { code: 'connection_migration_conflict' });
  database = new DatabaseSync(databaseFile); assert.equal(database.prepare('SELECT count(*) AS count FROM external_connections').get()?.count, 1); assert.equal(database.prepare('SELECT count(*) AS count FROM external_connection_store').get()?.count, 0); database.prepare('DELETE FROM external_connections').run(); database.close();
  assert.equal(f.application.list(f.root).connections.length, 1);
  const other = fixture(t); fs.mkdirSync(path.join(other.root, '.buildr/local')); fs.copyFileSync(databaseFile, path.join(other.root, '.buildr/local/workspace.sqlite'));
  assert.throws(() => other.application.list(other.root), { code: 'connection_workspace_mismatch' });
  fs.writeFileSync(databaseFile, 'not a sqlite database');
  assert.throws(() => f.application.list(f.root), { code: 'workspace_store_database_corrupt' });
  assert.equal(fs.readFileSync(databaseFile, 'utf8'), 'not a sqlite database');
});

test('query preferences start empty, persist separately, protect versions, isolate connections and cascade on deletion', t => {
  const f = fixture(t), first = f.application.create(f.root, mysql).connection, second = f.application.create(f.root, { ...mysql, name: '另一个连接' }).connection;
  const initial = f.application.queryPreferences(f.root, first.id);
  assert.deepEqual({ ...initial, revision: undefined }, { enabledDatabases: [], currentDatabase: null, revision: undefined });
  const saved = f.application.saveQueryPreferences(f.root, first.id, { expectedRevision: initial.revision, enabledDatabases: ['orders_demo', 'billing_demo'], currentDatabase: 'orders_demo' });
  assert.deepEqual(f.application.queryPreferences(f.root, first.id), saved);
  assert.equal(f.application.list(f.root).connections[0].revision, first.revision, 'preferences cannot change target version');
  assert.equal(f.application.queryPreferences(f.root, second.id).enabledDatabases.length, 0);
  assert.throws(() => f.application.saveQueryPreferences(f.root, first.id, { expectedRevision: initial.revision, enabledDatabases: [], currentDatabase: null }), { code: 'connection_query_preferences_revision_conflict' });
  assert.throws(() => f.application.saveQueryPreferences(f.root, first.id, { expectedRevision: saved.revision, enabledDatabases: [], currentDatabase: 'orders_demo' }), { code: 'connection_query_preferences_invalid' });
  const cleared = f.application.saveQueryPreferences(f.root, first.id, { expectedRevision: saved.revision, enabledDatabases: [], currentDatabase: null });
  assert.notEqual(cleared.revision, initial.revision, 'returning to the same values cannot accept an obsolete observed version');
  const reopened = new ConnectionsApplication({ dataRoot: f.dataRoot, store: f.store, resolveScope: () => f.scope });
  assert.deepEqual(reopened.queryPreferences(f.root, first.id), cleared);
  f.application.remove(f.root, first.id, { expectedRevision: first.revision });
  const database = new DatabaseSync(path.join(f.root, '.buildr/local/workspace.sqlite'));
  try { assert.equal(database.prepare('SELECT count(*) AS count FROM connection_query_preferences').get()?.count, 0); } finally { database.close(); }
  assert.throws(() => f.application.queryPreferences(f.root, first.id), { code: 'connection_not_found' });
});

test('query preference HTTP contribution uses direct response shape and authorizes writes before body parsing', async t => {
  const f = fixture(t), connection = f.application.create(f.root, mysql).connection;
  const contribution = createConnectionsHttpContribution(f.application);
  const base = { suffix: '/connections/' + connection.id + '/query-preferences', searchParams: new URLSearchParams(), root: f.root, authorizeWrite() {}, async readJsonBody() { throw new Error('read not expected'); } };
  const first = await contribution.handle({ ...base, request: { method: 'GET' } });
  assert.equal(first?.status, 200); assert.equal('preferences' in first!.body, false);
  let parsed = false;
  await assert.rejects(() => contribution.handle({ ...base, request: { method: 'PUT' }, authorizeWrite() { throw new Error('unauthorized'); }, async readJsonBody() { parsed = true; return {}; } }), /unauthorized/);
  assert.equal(parsed, false);
  const saved = await contribution.handle({ ...base, request: { method: 'PUT' }, async readJsonBody() { return { expectedRevision: (first!.body as { revision: string }).revision, enabledDatabases: ['orders_demo'], currentDatabase: 'orders_demo' }; } });
  assert.equal(saved?.status, 200); assert.deepEqual((saved!.body as { enabledDatabases: string[] }).enabledDatabases, ['orders_demo']);
});

test('first connection read cannot use candidate code to upgrade or import a retained workspace', t => {
  const f = fixture(t), candidateRoot = path.join(f.base, 'candidate'), sourceRoot = path.join(candidateRoot, 'projects/product/services/buildr'), common = path.join(f.root, '.git');
  const databaseFile = seedSchema35(f), file = legacyFile(f, [legacyRecord()]), beforeDatabase = fs.readFileSync(databaseFile), beforeLegacy = fs.readFileSync(file);
  const checkouts = new Map([
    [sourceRoot, { checkoutRoot: candidateRoot, gitDirectory: path.join(common, 'worktrees/candidate'), gitCommonDirectory: common, linkedWorktree: true }],
    [f.root, { checkoutRoot: f.root, gitDirectory: common, gitCommonDirectory: common, linkedWorktree: false }],
  ]);
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace() {} }, { sourceRoot, observeCheckout: (root: string) => checkouts.get(path.resolve(root)) || null }));
  const candidate = new ConnectionsApplication({ dataRoot: f.dataRoot, store, resolveScope: () => f.scope });
  assert.throws(() => candidate.list(f.root), { code: 'workspace_store_writer_provenance_forbidden' });
  assert.deepEqual(fs.readFileSync(databaseFile), beforeDatabase);
  assert.deepEqual(fs.readFileSync(file), beforeLegacy);
});

test('failed SQLite writes remove only proven unreferenced new credentials and preserve committed authentication', t => {
  const f = fixture(t);
  f.store.runWorkspaceTransaction(f.root, () => {});
  const databaseFile = path.join(f.root, '.buildr/local/workspace.sqlite');
  let database = new DatabaseSync(databaseFile);
  database.exec("CREATE TRIGGER test_create_failure BEFORE INSERT ON external_connections BEGIN SELECT RAISE(ABORT, 'test create failed'); END"); database.close();
  assert.throws(() => f.application.create(f.root, { ...mysql, credentials: { password: 'first-test-only' } }), /test create failed/);
  const directory = path.join(f.dataRoot, 'external-connections', f.workspaceId);
  assert.deepEqual(fs.readdirSync(directory), []);
  database = new DatabaseSync(databaseFile); database.exec('DROP TRIGGER test_create_failure'); database.close();
  const created = f.application.create(f.root, { ...mysql, credentials: { password: 'committed-test-only' } }).connection;
  const original = new ConnectionRepository(f.dataRoot, f.store).read(f.scope)[0], oldFile = path.join(directory, original.credentialId + '.json'), oldBytes = fs.readFileSync(oldFile);
  database = new DatabaseSync(databaseFile); database.exec("CREATE TRIGGER test_update_failure BEFORE UPDATE ON external_connections BEGIN SELECT RAISE(ABORT, 'test update failed'); END"); database.close();
  assert.throws(() => f.application.update(f.root, created.id, { expectedRevision: created.revision, credentials: { password: 'new-test-only' } }), /test update failed/);
  assert.deepEqual(fs.readdirSync(directory), [original.credentialId + '.json']);
  assert.deepEqual(fs.readFileSync(oldFile), oldBytes);
  assert.deepEqual(f.application.list(f.root).connections, [created]);
  database = new DatabaseSync(databaseFile); database.exec('DROP TRIGGER test_update_failure'); database.close();
  const ambiguousStore = { ...f.store, runWorkspaceTransaction<T>(root: string, action: (context: object) => T): T { f.store.runWorkspaceTransaction(root, action); throw new Error('response interrupted after commit'); } };
  const interrupted = new ConnectionsApplication({ dataRoot: f.dataRoot, store: ambiguousStore, resolveScope: () => f.scope });
  assert.throws(() => interrupted.update(f.root, created.id, { expectedRevision: created.revision, credentials: { password: 'actually-committed-test-only' } }), /response interrupted/);
  const committed = new ConnectionRepository(f.dataRoot, f.store).read(f.scope)[0];
  assert.notEqual(committed.credentialId, original.credentialId);
  assert.equal(fs.existsSync(path.join(directory, committed.credentialId + '.json')), true, 'a committed credential must not be removed even when the caller received an error');
  assert.equal(f.application.list(f.root).connections[0].hasCredentials, true);
});


test('concurrent first reads both upgrade schema35 and import exactly once after waiting for the SQLite writer lock', async t => {
  const f = fixture(t), file = seedSchema35(f), original = legacyRecord();
  // Existing Buildr stores already use WAL; arrange it before the migration barrier.
  const seed = new DatabaseSync(file); seed.exec('PRAGMA journal_mode = WAL'); seed.close();
  legacyFile(f, [original]);
  const moduleUrl = (file: string) => pathToFileURL(path.resolve(import.meta.dirname, '../..', file)).href;
  const code = `
    import { workerData, parentPort } from 'node:worker_threads';
    import { DatabaseSync } from 'node:sqlite';
    import { ConnectionsApplication } from ${JSON.stringify(moduleUrl('src/modules/connections/application/connections-application.ts'))};
    import { registerWorkspaceSqlite } from ${JSON.stringify(moduleUrl('src/infrastructure/sqlite/workspace-sqlite.ts'))};
    import { registerSqliteTransaction } from ${JSON.stringify(moduleUrl('src/infrastructure/sqlite/transaction.ts'))};
    const original = DatabaseSync.prototype.exec;
    let first = true;
    DatabaseSync.prototype.exec = function(sql) {
      if (sql === 'BEGIN IMMEDIATE' && first) {
        first = false;
        const barrier = new Int32Array(workerData.barrier);
        Atomics.add(barrier, 0, 1); Atomics.notify(barrier, 0);
        const deadline = Date.now() + 8000;
        while (Atomics.load(barrier, 0) < 2) {
          if (Date.now() > deadline) throw new Error('first migration barrier timeout');
          Atomics.wait(barrier, 0, 1, 100);
        }
      }
      return original.call(this, sql);
    };
    const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace() {} }));
    const app = new ConnectionsApplication({ dataRoot: workerData.dataRoot, store, resolveScope: () => ({ rootPath: workerData.root, workspaceId: workerData.workspaceId }) });
    try { parentPort.postMessage({ ok: true, connections: app.list(workerData.root).connections }); }
    catch (error) { parentPort.postMessage({ ok: false, code: error.code, message: error.message }); }
  `;
  const barrier = new SharedArrayBuffer(4), workers: Worker[] = [];
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  const outcomes = await Promise.all([0, 1].map(() => new Promise<{ ok: boolean; connections?: { id: string }[]; code?: string; message?: string }>((resolve, reject) => {
    const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(code)), { workerData: { root: f.root, dataRoot: f.dataRoot, workspaceId: f.workspaceId, barrier } });
    workers.push(worker);
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(new Error('migration worker exited ' + code)); });
  })));
  assert.equal(outcomes.filter(outcome => outcome.ok).length, 2, JSON.stringify(outcomes));
  for (const outcome of outcomes) assert.deepEqual(outcome.connections?.map(connection => connection.id), [original.id]);
  const database = new DatabaseSync(file);
  try {
    assert.equal(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()?.version, 36);
    assert.equal(database.prepare('SELECT count(*) AS count FROM external_connection_store').get()?.count, 1);
    assert.equal(database.prepare('SELECT count(*) AS count FROM external_connections').get()?.count, 1);
  } finally { database.close(); }
});


test('an empty SQLite file is initialized while a missing table in a claimed current schema is preserved and rejected', t => {
  const f = fixture(t), file = path.join(f.root, '.buildr/local/workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true }); new DatabaseSync(file).close();
  assert.deepEqual(f.application.list(f.root), { connections: [] });
  const database = new DatabaseSync(file); database.exec('DROP TABLE external_connection_store'); database.close();
  assert.throws(() => f.application.list(f.root), { code: 'connection_storage_invalid' });
  const reopened = new DatabaseSync(file);
  try { assert.equal(reopened.prepare("SELECT name FROM sqlite_master WHERE name = 'external_connection_store'").get(), undefined); } finally { reopened.close(); }
});
