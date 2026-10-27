import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import mysql from 'mysql2';
import type { MySqlProgramContext } from '../../src/modules/mysql-query/interfaces/program/mysql-connection-program.ts';
import { mysqlConfiguration, passwordInput } from '../../src/modules/mysql-query/domain/mysql.ts';
import { createMySqlClient, MYSQL_RESULT_BYTES } from '../../src/modules/mysql-query/infrastructure/mysql-client.ts';

const bin = fileURLToPath(new URL('../../bin/buildr-mysql.mjs', import.meta.url));
async function fixture(t: { after(fn: () => Promise<void>): void }, options: { config?: Record<string, unknown> } = {}) {
  const state = {
    statements: [] as string[], users: [] as string[], reject: false, queryValue: '9007199254740993',
    tables: true, columns: [['id', 'int', 'NO', 'PRI', null, '']] as (string | null)[][],
    indexes: [['PRIMARY', '0', '1', 'id', null]] as (string | null)[][],
    affectedRows: 1, changeError: null as null | { code: number; message: string }, dropOnStatement: false,
  }, sockets = new Set<any>();
  const server = (mysql as any).createServer();
  server.on('connection', (connection: any) => {
    sockets.add(connection); connection.on('error', () => {}); connection.stream.on('close', () => sockets.delete(connection));
    // MySQL command packets restart their sequence at zero. The mysql2 server fixture
    // leaves sequence management to its caller, unlike a real server.
    const handlePacket = connection.handlePacket.bind(connection);
    connection.handlePacket = (packet: { sequenceId: number } | undefined) => { if (packet?.sequenceId === 0) connection._resetSequenceId(); return handlePacket(packet); };
    connection.serverHandshake({ protocolVersion: 10, serverVersion: '8.0.fixture', connectionId: 1, statusFlags: 2, characterSet: 45, capabilityFlags: 0x00000001 | 0x00000200 | 0x00002000 | 0x00008000 | 0x00080000,
      authCallback(input: { user: string }, done: (error: unknown, mysqlError?: unknown) => void) { state.users.push(input.user); done(null, state.reject ? { code: 1045, message: 'remote echoed fixture-private-password' } : undefined); },
    });
    const rows = (name: string, values: string[]) => {
      connection.writeColumns([{ catalog: 'def', schema: '', table: '', orgTable: '', name, orgName: name, characterSet: 45, columnLength: 1024, columnType: 253, flags: 0, decimals: 0 }]);
      for (const value of values) connection.writeTextRow([value]); connection.writeEof();
    };
    const table = (names: string[], values: (string | null)[][]) => {
      connection.writeColumns(names.map(name => ({ catalog: 'def', schema: '', table: '', orgTable: '', name, orgName: name, characterSet: 45, columnLength: 1024, columnType: 253, flags: 0, decimals: 0 })));
      for (const value of values) connection.writeTextRow(value); connection.writeEof();
    };
    const execute = (sql: string) => {
      state.statements.push(sql);
      if (sql === 'SELECT @@SESSION.sql_mode') rows('sql_mode', ['NO_BACKSLASH_ESCAPES,STRICT_TRANS_TABLES']);
      else if (sql.startsWith('SELECT VERSION()')) rows('version', ['8.0.fixture']);
      else if (sql.includes('information_schema.SCHEMATA')) rows('SCHEMA_NAME', ['orders', 'billing']);
      else if (sql.includes('information_schema.TABLES')) table(['TABLE_NAME'], state.tables ? [['orders']] : []);
      else if (sql.includes('information_schema.COLUMNS')) table(['COLUMN_NAME', 'COLUMN_TYPE', 'IS_NULLABLE', 'COLUMN_KEY', 'COLUMN_DEFAULT', 'EXTRA'], state.columns);
      else if (sql.includes('information_schema.STATISTICS')) table(['INDEX_NAME', 'NON_UNIQUE', 'SEQ_IN_INDEX', 'COLUMN_NAME', 'SUB_PART'], state.indexes);
      else if (/^(SET SESSION|START TRANSACTION|COMMIT|ROLLBACK)/.test(sql)) connection.writeOk();
      else if (/^(UPDATE|INSERT|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/iu.test(sql)) {
        if (state.dropOnStatement) { connection.stream.destroy(); return; }
        if (state.changeError) { connection.writeError(state.changeError); return; }
        if (/^ALTER\b/iu.test(sql)) state.columns = [...state.columns, ['note', 'varchar(10)', 'YES', '', null, '']];
        if (/^DROP TABLE\b/iu.test(sql)) state.tables = false;
        if (/^CREATE TABLE\b/iu.test(sql)) state.tables = true;
        connection.writeOk({ affectedRows: state.affectedRows });
      }
      else if (/^SELECT\b/.test(sql)) rows('sample', [state.queryValue]);
      else connection.writeError({ code: 1064, message: 'Unexpected fixture query' });
    };
    connection.on('query', execute); connection.on('stmt_prepare', execute);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server._server.address().port as number;
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(resolve)); });
  const context: MySqlProgramContext = { protocolVersion: 'buildr.connection-context/v1', callId: 'local-protocol-fixture', definition: { definitionId: 'mysql' }, connections: { primary: { id: 'qa-local', config: { host: '127.0.0.1', port, defaultDatabase: 'orders', ...options.config }, authentication: { source: 'personal', values: { username: 'fixture_personal', password: 'fixture-private-password' } } } } };
  return { state, context };
}
function run(command: string | string[], context: MySqlProgramContext, input = 'unused-business-input'): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = Array.isArray(command) ? command : [command, '--json'];
    const child = fork(bin, args, { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [] }); let stdout = '', stderr = '';
    child.stdout!.on('data', chunk => stdout += chunk.toString()); child.stderr!.on('data', chunk => stderr += chunk.toString());
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('MySQL fixture program timed out')); }, 15_000);
    child.on('message', message => {
      const value = message as { type?: string; requestId?: string };
      if (value?.type === 'buildr.connection-revalidate') child.send({ type: 'buildr.connection-revalidated', requestId: value.requestId, ok: true });
    });
    child.on('spawn', () => { child.send({ type: 'buildr.connection-context', context }); child.stdin!.end(input); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}
test('installed MySQL program receives private IPC, uses packaged mysql2 and read-only session, and redacts remote authentication errors', async t => {
  const f = await fixture(t);
  const tested = await run('test', f.context); assert.equal(tested.code, 0, tested.stderr + tested.stdout); assert.equal(JSON.parse(tested.stdout).status, 'success');
  const discovered = await run('databases', f.context); assert.equal(discovered.code, 0, discovered.stderr + discovered.stdout); assert.deepEqual(JSON.parse(discovered.stdout).options, [{ value: 'orders', label: 'orders' }, { value: 'billing', label: 'billing' }]);
  assert.deepEqual(f.state.users, ['fixture_personal', 'fixture_personal']);
  assert.equal(f.state.statements.filter(sql => sql === 'START TRANSACTION READ ONLY').length, 2);
  assert.equal(f.state.statements.filter(sql => sql === 'ROLLBACK').length, 2);
  assert.ok(f.state.statements.some(sql => sql.includes("SET SESSION sql_mode = 'STRICT_TRANS_TABLES'")));
  assert.ok(f.state.statements.every(sql => !sql.includes('fixture-private-password') && !sql.includes('unused-business-input')));
  f.state.reject = true;
  const denied = await run('test', f.context); assert.equal(denied.code, 1); assert.equal(JSON.parse(denied.stdout).error.code, 'mysql_access_denied');
  assert.equal([tested, discovered, denied].some(result => (result.stdout + result.stderr).includes('fixture-private-password')), false);
});
test('the shared MySQL client preserves precise results and read-only session boundaries and rejects oversized results', async t => {
  const f = await fixture(t), selected = f.context.connections.primary;
  const config = mysqlConfiguration({ ...selected.config, username: selected.authentication.values.username });
  const credentials = { password: passwordInput(selected.authentication.values.password) }, client = createMySqlClient();
  const result = await client.query(config, credentials, { sql: 'SELECT 9007199254740993 AS sample', database: null });
  assert.deepEqual(result.rows, [['9007199254740993']]); assert.equal(result.database, null);
  assert.equal(result.rowCount, 1); assert.equal(result.rowLimit, 100); assert.match(result.executedSql, /LIMIT 100$/);
  assert.equal(f.state.statements.filter(sql => sql === 'START TRANSACTION READ ONLY').length, 1);
  assert.equal(f.state.statements.filter(sql => sql === 'ROLLBACK').length, 1);
  const calls = f.state.users.length;
  await assert.rejects(client.query(config, credentials, { sql: 'UPDATE orders SET id = 1' }), { code: 'mysql_query_readonly' });
  assert.equal(f.state.users.length, calls, 'unsafe SQL is rejected before opening a database connection');
  f.state.queryValue = 'x'.repeat(MYSQL_RESULT_BYTES);
  await assert.rejects(client.query(config, credentials, { sql: 'SELECT 1 AS sample' }), { code: 'mysql_result_too_large', status: 413 });
  assert.equal(f.state.statements.filter(sql => sql === 'START TRANSACTION READ ONLY').length, 2);
  assert.equal(f.state.statements.some(sql => sql.includes('fixture-private-password')), false);
});

type TestContext = { after(fn: () => void): void };
function statementFile(t: TestContext, sql: string): string {
  const file = path.join(os.tmpdir(), `mysql-change-${randomUUID()}.sql`);
  fs.writeFileSync(file, sql);
  t.after(() => fs.rmSync(file, { force: true }));
  return file;
}
function withConfig(context: MySqlProgramContext, config: Record<string, unknown>): MySqlProgramContext {
  return { ...context, connections: { primary: { ...context.connections.primary, config: { ...context.connections.primary.config, ...config } } } };
}
async function observe(context: MySqlProgramContext): Promise<string> {
  const observed = await run(['fingerprint', '--table', 'orders', '--json'], context);
  assert.equal(observed.code, 0, observed.stderr + observed.stdout);
  const fingerprint = JSON.parse(observed.stdout).fingerprint as string;
  assert.match(fingerprint, /^sha256-[a-f0-9]{64}$/u);
  return fingerprint;
}
test('controlled change works without an environment declaration and reports commit, rollback and structure facts', async t => {
  const f = await fixture(t), fingerprint = await observe(f.context);
  f.state.affectedRows = 1;
  const undeclared = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], f.context);
  assert.equal(undeclared.code, 0, undeclared.stderr + undeclared.stdout);
  assert.equal(JSON.parse(undeclared.stdout).environment, 'undeclared', '未声明环境按非生产执行并明确标注');
  const qa = withConfig(f.context, { targetEnvironment: 'qa' });
  f.state.affectedRows = 2;
  const dml = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], qa);
  assert.equal(dml.code, 0, dml.stderr + dml.stdout);
  const committed = JSON.parse(dml.stdout);
  assert.equal(committed.status, 'success'); assert.equal(committed.committed, true); assert.equal(committed.rollbackable, true);
  assert.equal(committed.affectedRows, 2); assert.equal(committed.environment, 'qa'); assert.equal(committed.fingerprintAfter, fingerprint);
  assert.ok(f.state.statements.includes('START TRANSACTION')); assert.ok(f.state.statements.includes('COMMIT'));
  f.state.affectedRows = 99;
  const exceeded = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '10', '--json'], qa);
  assert.equal(exceeded.code, 1); assert.equal(JSON.parse(exceeded.stdout).error.code, 'mysql_change_affected_rows_exceeded');
  assert.equal(f.state.statements.filter(sql => sql === 'COMMIT').length, 2, '未声明环境与 qa 各自提交一次');
  assert.equal(f.state.statements.filter(sql => sql === 'ROLLBACK').length, 1);
  const alter = await run(['apply', '--statement-file', statementFile(t, 'ALTER TABLE orders ADD COLUMN note varchar(10)'), '--expected-fingerprint', fingerprint, '--json'], qa);
  assert.equal(alter.code, 0, alter.stderr + alter.stdout);
  const structure = JSON.parse(alter.stdout);
  assert.equal(structure.rollbackable, false); assert.equal(structure.affectedRows, null);
  assert.notEqual(structure.fingerprintAfter, fingerprint);
  assert.deepEqual(structure.readback, { exists: true, columns: 2, indexes: 1 });
  const denied = await run(['apply', '--statement-file', statementFile(t, 'DROP TABLE orders'), '--expected-fingerprint', structure.fingerprintAfter, '--json'], qa);
  assert.equal(denied.code, 1); assert.equal(JSON.parse(denied.stdout).error.code, 'mysql_change_destructive_denied');
  assert.equal(f.state.statements.some(sql => /^DROP TABLE/u.test(sql)), false);
  const permissive = withConfig(f.context, { targetEnvironment: 'qa', allowDestructive: true });
  const dropped = await run(['apply', '--statement-file', statementFile(t, 'DROP TABLE orders'), '--expected-fingerprint', structure.fingerprintAfter, '--json'], permissive);
  assert.equal(dropped.code, 0, dropped.stderr + dropped.stdout);
  assert.deepEqual(JSON.parse(dropped.stdout).readback, { exists: false, columns: 0, indexes: 0 });
});
test('controlled change rejects production, forbidden statements, missing conditions and stale structure before writing', async t => {
  const f = await fixture(t), fingerprint = await observe(f.context), qa = withConfig(f.context, { targetEnvironment: 'qa' });
  const prohibited = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], withConfig(f.context, { targetEnvironment: 'prod' }));
  assert.equal(prohibited.code, 1); assert.equal(JSON.parse(prohibited.stdout).error.code, 'mysql_change_environment_prohibited');
  const forbidden = await run(['apply', '--statement-file', statementFile(t, 'GRANT ALL ON *.* TO fixture_personal'), '--expected-fingerprint', fingerprint, '--json'], qa);
  assert.equal(forbidden.code, 1); assert.equal(JSON.parse(forbidden.stdout).error.code, 'mysql_change_forbidden');
  const unscoped = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], qa);
  assert.equal(unscoped.code, 1); assert.equal(JSON.parse(unscoped.stdout).error.code, 'mysql_change_where_required');
  const stale = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', 'sha256-' + '0'.repeat(64), '--max-affected-rows', '5', '--json'], qa);
  assert.equal(stale.code, 1); assert.equal(JSON.parse(stale.stdout).error.code, 'mysql_change_fingerprint_mismatch');
  const cappedStructure = await run(['apply', '--statement-file', statementFile(t, 'ALTER TABLE orders ADD COLUMN note varchar(10)'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], qa);
  assert.equal(cappedStructure.code, 1); assert.equal(JSON.parse(cappedStructure.stdout).error.code, 'mysql_change_limit_invalid');
  assert.equal(f.state.statements.some(sql => /^(UPDATE|ALTER|GRANT)/u.test(sql)), false);
});
test('a lost response after submission is reported as unknown and never retried', async t => {
  const f = await fixture(t, { config: { targetEnvironment: 'qa' } }), fingerprint = await observe(f.context);
  f.state.dropOnStatement = true;
  const result = await run(['apply', '--statement-file', statementFile(t, 'UPDATE orders SET status = 1 WHERE id = 2'), '--expected-fingerprint', fingerprint, '--max-affected-rows', '5', '--json'], f.context);
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'unknown'); assert.equal(output.committed, null); assert.equal(output.error.code, 'mysql_change_outcome_unknown');
  assert.equal(f.state.statements.filter(sql => /^UPDATE/u.test(sql)).length, 1);
});
