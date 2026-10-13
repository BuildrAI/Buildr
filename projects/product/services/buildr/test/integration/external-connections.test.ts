import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionsApplication } from '../../src/modules/connections/application/connections-application.ts';
import { ConnectionRepository } from '../../src/modules/connections/persistence/connection-repository.ts';
import { resolveConnectionWorkspace } from '../../src/modules/connections/infrastructure/connection-workspace.ts';
import type { ConnectionProvider } from '../../src/modules/connections/application/connection-provider.ts';
import { connectionFailure, inputObject } from '../../src/modules/connections/domain/connection.ts';
import { createConnectionsModule, CONNECTIONS_APPLICATION } from '../../src/modules/connections/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../../src/modules/workspace/module.ts';

function fixture(t: { after(action: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-unit-')), root = path.join(base, 'workspace'), dataRoot = path.join(base, 'profile'), workspaceId = crypto.randomUUID();
  fs.mkdirSync(root); fs.mkdirSync(dataRoot);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scope = { rootPath: root, workspaceId }, application = new ConnectionsApplication({ dataRoot, resolveScope: () => scope });
  return { base, root, dataRoot, workspaceId, scope, application };
}
const mysql = { name: '测试 MySQL', category: 'data-source', type: 'mysql', environment: ' 客户A测试 ', config: { host: '127.0.0.1', port: 3306, username: 'test_reader', defaultDatabase: 'orders_demo', selectedDatabases: ['orders_demo'] } };

test('connections composition consumes actual workspace query and application port boundaries', t => {
  const f = fixture(t), module = createConnectionsModule({ readProductIdentity: () => ({}), resolveWebProfile: () => ({ dataRoot: f.dataRoot }) });
  const assembled = module.create({
    [WORKSPACE_QUERY]: { getWorkspace: (root: string) => ({ rootPath: root, workspace: { id: f.workspaceId } }), resolveSourceWorkspaceRoot: (root: string) => root },
    [WORKSPACE_APPLICATION]: { listRegisteredWorkspaces: () => ({ workspaces: [] }) },
  });
  assert.deepEqual(assembled.provides[CONNECTIONS_APPLICATION].list(f.root), { connections: [] });
});

test('connection declarations are generic, credentials authenticated-encrypted and local, and mutations protect versions', t => {
  const f = fixture(t), password = 'test-secret-' + crypto.randomUUID();
  assert.deepEqual(f.application.list(f.root), { connections: [] }); assert.equal(fs.existsSync(path.join(f.root, 'connections')), false);
  const first = f.application.create(f.root, { ...mysql, credentials: { password } }).connection;
  assert.equal(first.environment, '客户A测试'); assert.equal(first.hasCredentials, true);
  assert.equal('credentialId' in first, false); assert.equal('credentials' in first, false); assert.equal('password' in first, false);
  const manifest = fs.readFileSync(path.join(f.root, 'connections/manifest.yml'), 'utf8');
  assert.equal(manifest.includes(password), false); assert.equal(manifest.includes('password:'), false);
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
  const app = new ConnectionsApplication({ dataRoot: f.dataRoot, resolveScope: () => f.scope, providers: [provider] });
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
  const repository = new ConnectionRepository(f.dataRoot), stored = repository.read(f.scope)[0];
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
  const application = new ConnectionsApplication({ dataRoot: f.dataRoot, resolveScope: () => f.scope, providers: [provider] });
  const record = application.create(f.root, { name: '无认证测试工具', category: 'tool', type: 'public-endpoint-test', config: { endpoint: 'https://example.invalid' } }).connection;
  assert.equal(record.hasCredentials, false);
  assert.deepEqual(await application.test(f.root, { id: record.id, expectedRevision: record.revision }), { ok: true, elapsedMs: 1 });
  assert.equal(fs.existsSync(path.join(f.dataRoot, 'external-connections')), false);
});
test('external manifest changes cannot send an existing credential to another target or provider', async t => {
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
  const application = new ConnectionsApplication({ dataRoot: f.dataRoot, resolveScope: () => f.scope, providers: [provider, otherProvider] });
  const created = application.create(f.root, { name: '认证绑定测试', category: provider.category, type: provider.type, config: { endpoint: 'https://first.invalid', display: 'first' }, credentials: { token: 'fake-bound-token' } }).connection;
  await application.test(f.root, { id: created.id, expectedRevision: created.revision }); assert.equal(calls, 1);
  const unchangedTarget = application.update(f.root, created.id, { expectedRevision: created.revision, name: '改名', environment: 'custom', config: { display: 'second' } }).connection;
  assert.equal(unchangedTarget.hasCredentials, true);
  await application.test(f.root, { id: created.id, expectedRevision: unchangedTarget.revision }); assert.equal(calls, 2);
  const file = path.join(f.root, 'connections/manifest.yml'), original = fs.readFileSync(file, 'utf8');
  const changedTarget = YAML.parse(original); changedTarget.connections[0].config.endpoint = 'https://second.invalid'; fs.writeFileSync(file, YAML.stringify(changedTarget));
  let current = application.list(f.root).connections[0]; assert.equal(current.hasCredentials, false);
  await assert.rejects(() => application.test(f.root, { id: current.id, expectedRevision: current.revision }), { code: 'connection_credentials_target_changed' });
  await assert.rejects(() => application.databases(f.root, current.id), { code: 'connection_credentials_target_changed' });
  await assert.rejects(() => application.query(f.root, current.id, { sql: 'SELECT 1' }), { code: 'connection_credentials_target_changed' });
  assert.equal(calls, 2, 'no provider call may receive the old token after an external target change');
  const changedProvider = YAML.parse(original); changedProvider.connections[0].type = otherProvider.type; fs.writeFileSync(file, YAML.stringify(changedProvider));
  current = application.list(f.root).connections[0];
  await assert.rejects(() => application.test(f.root, { id: current.id, expectedRevision: current.revision }), { code: 'connection_credentials_target_changed' });
  assert.equal(calls, 2);
  fs.writeFileSync(file, original);
  const repository = new ConnectionRepository(f.dataRoot), stored = repository.read(f.scope)[0];
  const encryptedFile = path.join(f.dataRoot, 'external-connections', f.workspaceId, stored.credentialId + '.json');
  const legacy = JSON.parse(fs.readFileSync(encryptedFile, 'utf8')); legacy.schemaVersion = 'buildr.connection-credential/v1'; delete legacy.bindingDigest; fs.writeFileSync(encryptedFile, JSON.stringify(legacy));
  await assert.rejects(() => application.test(f.root, { id: unchangedTarget.id, expectedRevision: unchangedTarget.revision }), { code: 'connection_credentials_binding_invalid' });
  assert.equal(calls, 2, 'legacy credentials without a target binding must be rebound before use');
});
test('MySQL credential bindings ignore default and displayed databases but include host, port, and username', t => {
  const f = fixture(t), created = f.application.create(f.root, { ...mysql, credentials: { password: 'binding-test-only' } }).connection;
  const updated = f.application.update(f.root, created.id, { expectedRevision: created.revision, name: '改名', environment: 'other', config: { defaultDatabase: 'billing_demo', selectedDatabases: [] } }).connection;
  assert.equal(updated.hasCredentials, true);
  const file = path.join(f.root, 'connections/manifest.yml'), original = fs.readFileSync(file, 'utf8');
  for (const [field, value] of [['host', 'other.invalid'], ['port', 3307], ['username', 'other_reader']] as const) {
    const document = YAML.parse(original); document.connections[0].config[field] = value; fs.writeFileSync(file, YAML.stringify(document));
    assert.equal(f.application.list(f.root).connections[0].hasCredentials, false, field + ' must invalidate the existing credential binding');
  }
});
test('linked code worktrees resolve canonical declarations and fail if the source metadata disappears', t => {
  const f = fixture(t), linked = path.join(f.base, 'linked');
  const git = (cwd: string, ...args: string[]) => { const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  fs.mkdirSync(path.join(f.root, '.buildr')); fs.writeFileSync(path.join(f.root, '.buildr/workspace.yml'), f.workspaceId);
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
