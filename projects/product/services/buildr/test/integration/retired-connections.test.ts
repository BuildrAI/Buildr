import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { retireLegacyConnections } from '../../src/modules/connection-skills/persistence/retired-connections.ts';
import { registerWorkspaceSqlite, applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction } from '../../src/infrastructure/sqlite/transaction.ts';
import { createLocalWorkspaceRequestRouter } from '../../src/web/http/router.ts';
import { printCliError } from '../../src/bootstrap/cli/diagnostics.ts';

function fixture(t: { after(fn: () => void): void }) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retired-connections-'))), root = path.join(base, 'workspace'), profile = path.join(base, 'profile');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr/local'), { recursive: true }); fs.mkdirSync(profile);
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() };
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace: (target: string) => assert.equal(target, root) }));
  const file = path.join(root, '.buildr/local/workspace.sqlite');
  const write = (relative: string, value: string, owner = root) => { const file = path.join(owner, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file; };
  return { base, root, profile, scope, store, file, write, retire: () => retireLegacyConnections(scope, profile, store) };
}

test('retirement drops legacy tables and files while preserving new instances, credentials, preferences and unrelated data; retries are harmless', t => {
  const f = fixture(t), db = new DatabaseSync(f.file);
  for (const script of loadWorkspaceSqliteMigrations().filter((script: { version: number }) => script.version <= 37)) applyWorkspaceSqliteMigration(db, script);
  db.prepare('INSERT INTO external_connection_store VALUES (1, ?, NULL, ?)').run(f.scope.workspaceId, new Date().toISOString());
  db.prepare('INSERT INTO external_connections VALUES (?, ?)').run('old', JSON.stringify({ id: 'old' }));
  db.prepare('INSERT INTO connection_query_preferences VALUES (?, ?, ?, ?)').run('old', '[]', null, 1);
  db.prepare('INSERT INTO mysql_skill_query_preferences VALUES (?, ?, ?, ?, ?, ?)').run(f.scope.workspaceId, 'new', 'binding', '["orders"]', 'orders', 2);
  db.exec('CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES (\'keep\')'); db.close();
  const oldManifest = f.write('connections/manifest.yml', `schemaVersion: buildr.connections/v1\nworkspaceId: ${f.scope.workspaceId}\nconnections: []\n`);
  const newInstance = f.write('connections/instances/mysql-qa--new.yml', 'new-team-authentication');
  const personal = f.write('connection-skills/new-personal.json', 'new-personal-authentication', f.profile);
  const oldCredential = f.write(`external-connections/${f.scope.workspaceId}/${crypto.randomUUID()}.json`, 'old-secret', f.profile);
  const key = f.write('external-connections/credential-key.json', 'old-key', f.profile);
  const other = f.write(`external-connections/${crypto.randomUUID()}/${crypto.randomUUID()}.json`, 'other-workspace-secret', f.profile);
  const uses = ['nacos-publish-authorizations', 'xxl-job-authorizations'].map(name => f.write(`.buildr/local/${name}/${'a'.repeat(64)}.json`, '{}'));
  assert.deepEqual(f.retire(), []);
  for (const file of [oldManifest, oldCredential, ...uses]) assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(newInstance, 'utf8'), 'new-team-authentication'); assert.equal(fs.readFileSync(personal, 'utf8'), 'new-personal-authentication');
  assert.equal(fs.readFileSync(other, 'utf8'), 'other-workspace-secret'); assert.equal(fs.existsSync(key), true);
  const after = new DatabaseSync(f.file);
  assert.equal(after.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('external_connections', 'external_connection_store', 'connection_query_preferences')").get()!.n, 0);
  assert.equal(after.prepare('SELECT current_database FROM mysql_skill_query_preferences').get()!.current_database, 'orders');
  assert.equal(after.prepare('SELECT value FROM unrelated').get()!.value, 'keep'); after.close();
  const before = fs.statSync(f.file).mtimeMs;
  assert.deepEqual(f.retire(), []); assert.equal(fs.statSync(f.file).mtimeMs, before);
  fs.rmSync(path.dirname(other), { recursive: true }); assert.deepEqual(f.retire(), []); assert.equal(fs.existsSync(key), false);
});

test('empty connection discovery does not create a database, credentials or local state', t => {
  const f = fixture(t);
  assert.deepEqual(f.retire(), []);
  assert.equal(fs.existsSync(f.file), false); assert.deepEqual(fs.readdirSync(f.profile), []);
});

test('unsafe legacy paths are reported and preserved without following links; corrected paths can be retried', t => {
  const f = fixture(t), foreign = f.write('foreign.yml', 'keep', f.base);
  fs.mkdirSync(path.join(f.root, 'connections')); fs.symlinkSync(foreign, path.join(f.root, 'connections/manifest.yml'));
  const linkedAuth = path.join(f.profile, 'external-connections', f.scope.workspaceId); fs.mkdirSync(path.dirname(linkedAuth)); fs.symlinkSync(f.base, linkedAuth);
  assert.equal(f.retire().length, 2); assert.equal(fs.readFileSync(foreign, 'utf8'), 'keep');
  fs.unlinkSync(path.join(f.root, 'connections/manifest.yml')); fs.unlinkSync(linkedAuth);
  assert.deepEqual(f.retire(), []);
});

test('unknown credential owner and foreign manifest are diagnosed without deleting their contents', t => {
  const f = fixture(t), unknown = f.write('external-connections/unknown.txt', 'keep', f.profile);
  const manifest = f.write('connections/manifest.yml', 'schemaVersion: someone.else/v1\npassword: do-not-delete\n');
  assert.equal(f.retire().length, 2); assert.equal(fs.readFileSync(unknown, 'utf8'), 'keep');
  assert.match(fs.readFileSync(manifest, 'utf8'), /do-not-delete/);
});

test('retired command reports replacement help and old HTTP operations return 410 without resolving a workspace or executing contributions', async t => {
  let output = ''; t.mock.method(console, 'log', value => { output = String(value); });
  assert.equal(printCliError(['connection', 'mysql', 'query', '--json'], { candidates: [] }), 2);
  const error = JSON.parse(output); assert.equal(error.error.code, 'cli.connection_retired'); assert.ok(error.suggestions.includes('connection-skill --help'));
  let resolved = 0, handled = 0, body = '', status = 0;
  const route = createLocalWorkspaceRequestRouter({ resolveRegisteredWorkspace() { resolved++; throw new Error('must not resolve'); }, taskIdPattern: '[a-z-]+', sessionToken: 'test', origin: () => 'http://127.0.0.1:12345', isClosing: () => false, httpContributions: [{ handle() { handled++; } }] });
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = { writeHead(code: number) { status = code; }, end(value: string) { body = value; }, setHeader() {} };
    await route({ method, headers: { host: '127.0.0.1:12345' }, url: `/api/v1/workspaces/${crypto.randomUUID()}/connections/old/query` }, response);
    assert.equal(status, 410); assert.equal(JSON.parse(body).error.code, 'connection_retired');
  }
  assert.equal(resolved, 0); assert.equal(handled, 0);
});
