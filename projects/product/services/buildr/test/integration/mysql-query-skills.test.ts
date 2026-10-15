import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { digest } from '../../src/modules/connection-skills/persistence/files.ts';
import type { MySqlConnectionClient, MySqlQueryClient } from '../../src/modules/mysql-query/domain/mysql.ts';
import { registerWorkspaceSqlite, applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { DatabaseSync } from 'node:sqlite';
import { registerSqliteTransaction, transactionDatabase } from '../../src/infrastructure/sqlite/transaction.ts';
import { MySqlQueryApplication } from '../../src/modules/mysql-query/application/mysql-query-application.ts';
import { createMySqlQueryHttp } from '../../src/modules/mysql-query/interfaces/http/mysql-query-http.ts';
import { createMySqlQueryCli } from '../../src/modules/mysql-query/interfaces/cli/mysql-query-cli.ts';
import { executeMySqlConnectionCommand, type MySqlProgramContext } from '../../src/modules/mysql-query/interfaces/program/mysql-connection-program.ts';

const skillSource = fileURLToPath(new URL('../../resources/workspace/skills/connections/mysql-connection/', import.meta.url));
const bin = fileURLToPath(new URL('../../bin/buildr-mysql.mjs', import.meta.url));
function fixture(t: { after(fn: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-mysql-skill-')), root = path.join(base, 'workspace'), skill = path.join(root, 'skills/connections/mysql-connection');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true }); fs.cpSync(skillSource, skill, { recursive: true });
  let sourceIdentity = 'package:skills/connections/mysql-connection', enabled = true;
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'mysql-connection', path: 'connections/mysql-connection', assetIdentity: 'buildr:skill:mysql-connection', sourceIdentity, enabled, connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: (_root, _skill, relative) => { const content = fs.readFileSync(path.join(skill, relative), 'utf8'); return { content, digest: digest(content), directory: skill, absolutePath: path.join(skill, relative) }; },
  } });
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() }, connections = new ConnectionSkillsApplication({ dataRoot: path.join(base, 'profile'), catalog, resolveScope: () => scope });
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace: (target: string) => { assert.equal(target, root); } }));
  const entry = connections.definitions(root).definitions[0]!, binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity, definitionId: 'mysql', configVersion: 1 };
  const create = (id = 'qa-mysql') => connections.save(root, null, { id, name: 'QA MySQL', binding, config: { host: 'qa.invalid', port: 3306, defaultDatabase: 'orders' }, authentication: { intent: 'replace', values: { username: 'team_reader', password: 'fixture-team-secret' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const access: { username?: unknown; password?: unknown; sql?: unknown; database?: unknown }[] = [];
  const mysql: MySqlQueryClient = {
    async databases(config, credentials) { access.push({ username: config.username, password: credentials.password }); return ['orders', 'billing']; },
    async tables(config, credentials, database) { access.push({ username: config.username, password: credentials.password, database }); return [{ name: 'order_header', type: 'BASE TABLE' }]; },
    async columns(config, credentials, database) { access.push({ username: config.username, password: credentials.password, database }); return [{ name: 'id', type: 'bigint', nullable: false, key: 'PRI', comment: '' }]; },
    async query(config, credentials, input) { access.push({ username: config.username, password: credentials.password, ...input }); return { database: input.database === undefined ? 'orders' : input.database as string | null, submittedSql: String(input.sql), executedSql: 'SELECT 1 LIMIT 100', columns: [{ name: '1', type: 'LONG' }], rows: [[1]], rowCount: 1, rowLimit: 100, elapsedMs: 1, limitReached: false }; },
  };
  const application = new MySqlQueryApplication({ store, useConnection: (selectedRoot, selection, consume) => connections.useSelected(selectedRoot, selection, consume), mysql });
  return { base, root, skill, scope, connections, store, binding, create, access, application, source(value: string) { sourceIdentity = value; }, enabled(value: boolean) { enabled = value; } };
}
test('independent MySQL query consumes selected instance revision and complete personal group without exposing credentials', async t => {
  const f = fixture(t), created = f.create();
  assert.match(created.revision, /^opaque-[a-f0-9]{64}$/);
  const team = await f.application.databases(f.root, created.id, created.revision); assert.deepEqual(team.databases, ['orders', 'billing']);
  assert.deepEqual(f.access[0], { username: 'team_reader', password: 'fixture-team-secret' });
  f.connections.saveAuth(f.root, created.id, { intent: 'replace', values: { username: 'personal_reader', password: 'fixture-personal-secret' }, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision, localRevision: created.localRevision } });
  const current = f.connections.get(f.root, created.id).instance;
  await assert.rejects(f.application.query(f.root, created.id, { connectionRevision: created.revision, sql: 'SELECT 1' }), { code: 'connection_skill_revision_conflict' });
  const result = await f.application.query(f.root, created.id, { connectionRevision: current.revision, sql: 'SELECT 1', database: null });
  assert.deepEqual(result.rows, [[1]]); assert.equal(result.database, null); assert.deepEqual(f.access.at(-1), { username: 'personal_reader', password: 'fixture-personal-secret', sql: 'SELECT 1', database: null });
  assert.equal(JSON.stringify(result).includes('fixture-personal-secret'), false);
  await assert.rejects(f.application.tables(f.root, created.id, current.revision, 'orders\0invalid'), { code: 'connection_input_invalid' });
  await assert.rejects(f.application.databases(f.root, created.id, undefined), { code: 'connection_skill_revision_required' });
});
test('source, target, definition, disabled and broken personal observations fail before remote calls without fallback', async t => {
  const f = fixture(t), created = f.create();
  f.source('source:replacement');
  await assert.rejects(f.application.databases(f.root, created.id, created.revision)); assert.equal(f.access.length, 0);
  f.source('package:skills/connections/mysql-connection'); f.enabled(false);
  await assert.rejects(f.application.databases(f.root, created.id, f.connections.get(f.root, created.id).instance.revision), { code: 'connection_skill_definition_unavailable' });
  f.enabled(true);
  const file = path.join(f.root, created.sourcePath), raw = YAML.parse(fs.readFileSync(file, 'utf8')); raw.config.host = 'changed.invalid'; fs.writeFileSync(file, YAML.stringify(raw));
  await assert.rejects(f.application.databases(f.root, created.id, f.connections.get(f.root, created.id).instance.revision), { code: 'connection_skill_auth_target_changed' });
  raw.config.host = 'qa.invalid'; fs.writeFileSync(file, YAML.stringify(raw));
  const current = f.connections.get(f.root, created.id).instance;
  f.connections.files.writeLocal(f.scope, created.id, { targetBinding: 'invalid', values: { username: 'person' } }, current.localRevision);
  await assert.rejects(f.application.databases(f.root, created.id, f.connections.get(f.root, created.id).instance.revision), { code: 'connection_skill_auth_target_changed' });
  assert.equal(f.access.length, 0);
});
test('new MySQL preferences use independent SQLite identity, survive reopening and guard stale concurrent updates', t => {
  const f = fixture(t), created = f.create(), another = f.create('qa-mysql-two');
  const before = fs.readFileSync(path.join(f.root, created.sourcePath));
  const empty = f.application.queryPreferences(f.root, created.id, created.revision), otherEmpty = f.application.queryPreferences(f.root, another.id, another.revision);
  assert.equal(fs.existsSync(path.join(f.root, '.buildr/local/workspace.sqlite')), false, 'reading preferences never creates or migrates the local store');
  const saved = f.application.saveQueryPreferences(f.root, created.id, { connectionRevision: created.revision, expectedRevision: empty.revision, enabledDatabases: ['orders'], currentDatabase: 'orders' });
  assert.notEqual(saved.revision, empty.revision); assert.deepEqual(saved.enabledDatabases, ['orders']);
  assert.throws(() => f.application.saveQueryPreferences(f.root, created.id, { connectionRevision: created.revision, expectedRevision: empty.revision, enabledDatabases: ['billing'], currentDatabase: 'billing' }), { code: 'connection_query_preferences_revision_conflict' });
  const reopened = new MySqlQueryApplication({ store: f.store, useConnection: (root, selection, consume) => f.connections.useSelected(root, selection, consume) });
  assert.deepEqual(reopened.queryPreferences(f.root, created.id, created.revision), saved);
  assert.deepEqual(f.application.queryPreferences(f.root, another.id, another.revision), otherEmpty);
  assert.deepEqual(fs.readFileSync(path.join(f.root, created.sourcePath)), before);
  assert.equal(f.connections.get(f.root, created.id).instance.revision, created.revision);
  f.store.runWorkspaceTransaction(f.root, context => {
    const database = transactionDatabase(context);
    assert.equal(database.prepare('SELECT count(*) AS n FROM mysql_skill_query_preferences').get()!.n, 1);
  });
  assert.equal(fs.readFileSync(path.join(f.root, '.buildr/local/workspace.sqlite')).includes(Buffer.from('fixture-team-secret')), false);
});
test('schema36 preferences and ordinary reads stay read-only until the first explicit preference save', t => {
  const f = fixture(t), created = f.create(), directory = path.join(f.root, '.buildr/local'), file = path.join(directory, 'workspace.sqlite');
  fs.mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(file);
  for (const script of loadWorkspaceSqliteMigrations().filter((script: { version: number }) => script.version <= 36)) applyWorkspaceSqliteMigration(database, script);
  database.close(); const before = fs.readFileSync(file);
  const preference = f.application.queryPreferences(f.root, created.id, created.revision);
  assert.deepEqual(preference.enabledDatabases, []); assert.equal(preference.currentDatabase, null);
  f.store.runWorkspaceSqliteRead(f.root, context => {
    const db = transactionDatabase(context);
    assert.equal(db.prepare('SELECT max(version) AS version FROM schema_migrations').get()!.version, 36);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='mysql_skill_query_preferences'").get(), undefined);
  });
  assert.deepEqual(fs.readFileSync(file), before, 'new and existing reads preserve canonical SQLite bytes');
  const saved = f.application.saveQueryPreferences(f.root, created.id, { connectionRevision: created.revision, expectedRevision: preference.revision, enabledDatabases: ['orders'], currentDatabase: 'orders' });
  assert.deepEqual(saved.enabledDatabases, ['orders']);
  f.store.runWorkspaceSqliteRead(f.root, context => assert.equal(transactionDatabase(context).prepare('SELECT max(version) AS version FROM schema_migrations').get()!.version, 38));
});
test('a replacement source masquerading as MySQL cannot route another declared program into the builtin query capability', async t => {
  const f = fixture(t), created = f.create(), definitionFile = path.join(f.skill, 'assets/connection.yml'), definition = YAML.parse(fs.readFileSync(definitionFile, 'utf8'));
  definition.programs.cli.executable = 'node'; fs.writeFileSync(definitionFile, YAML.stringify(definition));
  const changed = f.connections.get(f.root, created.id).instance;
  const rebound = f.connections.save(f.root, created.id, { name: created.name, binding: f.binding, config: created.config, authentication: { intent: 'replace', values: { username: 'replacement_reader', password: 'replacement-secret' } }, expected: { teamRevision: changed.teamRevision, definitionRevision: changed.definitionRevision } }).instance;
  await assert.rejects(f.application.databases(f.root, created.id, rebound.revision), { code: 'mysql_query_connection_unsupported' });
  assert.equal(f.access.length, 0);
});
test('same-named organization source using the same mysql program remains outside the builtin query identity after explicit rebinding', async t => {
  const f = fixture(t), created = f.create();
  f.source('organization:skills/connections/mysql-connection');
  const changed = f.connections.get(f.root, created.id).instance;
  const rebound = f.connections.save(f.root, created.id, { name: created.name, binding: { ...f.binding, sourceIdentity: 'organization:skills/connections/mysql-connection' }, config: created.config, authentication: { intent: 'replace', values: { username: 'organization_reader', password: 'organization-secret' } }, expected: { teamRevision: changed.teamRevision, definitionRevision: changed.definitionRevision } }).instance;
  assert.match(rebound.revision, /^opaque-[a-f0-9]{64}$/);
  await assert.rejects(f.application.databases(f.root, created.id, rebound.revision), { code: 'mysql_query_connection_unsupported' });
  assert.equal(f.access.length, 0);
});
test('independent query HTTP and CLI share the same selected revision and local preference application', async t => {
  const f = fixture(t), created = f.create(), http = createMySqlQueryHttp(f.application), cli = createMySqlQueryCli(f.application)[0]!; let writes = 0;
  const request = (method: string, operation: string, query = '', input: unknown = {}) => http.handle({ request: { method }, root: f.root, suffix: `/mysql-query/connections/${created.id}/${operation}`, searchParams: new URLSearchParams(query), authorizeWrite: () => { writes++; }, readJsonBody: async () => input });
  const result = await request('GET', 'databases', new URLSearchParams({ revision: created.revision }).toString()); assert.deepEqual((result!.body as { databases: string[] }).databases, ['orders', 'billing']);
  await assert.rejects(request('GET', 'databases', `revision=${created.revision}&revision=${created.revision}`), { code: 'mysql_query_input_invalid' });
  await assert.rejects(request('POST', 'query', '', { connectionRevision: created.revision, sql: 'SELECT 1', password: 'never-accepted' }), { code: 'connection_input_invalid' });
  assert.equal(writes, 1);
  const output = await cli.run(null, { argv: ['node', 'buildr', 'mysql-query', 'query', '--connection', created.id, '--expected-revision', created.revision, '--target', f.root, '--sql', 'SELECT 1', '--json'] });
  assert.equal(output.operation, 'query'); assert.deepEqual((output as { rows: unknown[] }).rows, [[1]]);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'mysql-query', 'databases', '--connection', created.id] }), { code: 'connection_skill_revision_required' });
});
test('installed MySQL connection program is offline for help/version, rejects query and only exposes bounded connection facts', async () => {
  for (const args of [['--help'], ['--version']]) {
    const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: 10_000 }); assert.equal(result.status, 0, result.stderr);
    assert.ok(args[0] === '--version' ? result.stdout.includes('1.0.0') : JSON.parse(result.stdout).help.length);
  }
  const unsupported = spawnSync(process.execPath, [bin, 'query', '--sql', 'SELECT never_run'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(unsupported.status, 1); assert.equal(JSON.parse(unsupported.stdout).error.code, 'mysql_command_unsupported'); assert.equal(unsupported.stdout.includes('never_run'), false);
  const direct = spawnSync(process.execPath, [bin, 'test'], { encoding: 'utf8', timeout: 10_000 }); assert.equal(JSON.parse(direct.stdout).error.code, 'mysql_context_required');
  const context: MySqlProgramContext = { protocolVersion: 'buildr.connection-context/v1', callId: 'fixture', definition: { definitionId: 'mysql' }, connections: { primary: { id: 'qa', config: { host: 'qa.invalid', port: 3306 }, authentication: { source: 'personal', values: { username: 'person', password: 'never-print' } } } } };
  const client: MySqlConnectionClient = {
    async test(config, credentials) { assert.equal(config.username, 'person'); assert.equal(credentials.password, 'never-print'); return { ok: true, serverVersion: '8.fixture', elapsedMs: 1 }; },
    async databases(config, credentials) { assert.equal(config.username, 'person'); assert.equal(credentials.password, 'never-print'); return ['orders']; },
  };
  const tested = await executeMySqlConnectionCommand('test', context, client), discovered = await executeMySqlConnectionCommand('databases', context, client);
  assert.equal(tested.status, 'success'); assert.deepEqual(discovered.options, [{ value: 'orders', label: 'orders' }]); assert.equal(JSON.stringify([tested, discovered]).includes('never-print'), false);
  await assert.rejects(executeMySqlConnectionCommand('query', context, client), { code: 'mysql_command_unsupported' });
  const longVersion = await executeMySqlConnectionCommand('test', context, { ...client, async test() { return { ok: true, serverVersion: 'v'.repeat(250) + 'never-print', elapsedMs: 1 }; } });
  assert.equal(longVersion.serverVersion, 'v'.repeat(250) + '[已隐藏]', 'redact the complete remote value before bounding it, so a cut secret prefix cannot escape');
  const overlapping = structuredClone(context); overlapping.connections.primary.authentication.values.password = 'ord';
  const overlaps = { ...client, async databases() { return ['orders']; } };
  await assert.rejects(executeMySqlConnectionCommand('databases', overlapping, overlaps), { code: 'mysql_discovery_output_protected' });
});
