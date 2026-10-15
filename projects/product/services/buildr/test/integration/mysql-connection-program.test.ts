import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import mysql from 'mysql2';
import type { MySqlProgramContext } from '../../src/modules/mysql-query/interfaces/program/mysql-connection-program.ts';

const bin = fileURLToPath(new URL('../../bin/buildr-mysql.mjs', import.meta.url));
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const state = { statements: [] as string[], users: [] as string[], reject: false }, sockets = new Set<any>();
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
    const execute = (sql: string) => {
      state.statements.push(sql);
      if (sql === 'SELECT @@SESSION.sql_mode') rows('sql_mode', ['NO_BACKSLASH_ESCAPES,STRICT_TRANS_TABLES']);
      else if (sql.startsWith('SELECT VERSION()')) rows('version', ['8.0.fixture']);
      else if (sql.includes('information_schema.SCHEMATA')) rows('SCHEMA_NAME', ['orders', 'billing']);
      else if (/^(SET SESSION|START TRANSACTION READ ONLY|ROLLBACK)/.test(sql)) connection.writeOk();
      else connection.writeError({ code: 1064, message: 'Unexpected fixture query' });
    };
    connection.on('query', execute); connection.on('stmt_prepare', execute);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server._server.address().port as number;
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(resolve)); });
  const context: MySqlProgramContext = { protocolVersion: 'buildr.connection-context/v1', callId: 'local-protocol-fixture', definition: { definitionId: 'mysql' }, connections: { primary: { id: 'qa-local', config: { host: '127.0.0.1', port }, authentication: { source: 'personal', values: { username: 'fixture_personal', password: 'fixture-private-password' } } } } };
  return { state, context };
}
function run(command: string, context: MySqlProgramContext): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = fork(bin, [command, '--json'], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [] }); let stdout = '', stderr = '';
    child.stdout!.on('data', chunk => stdout += chunk.toString()); child.stderr!.on('data', chunk => stderr += chunk.toString());
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('MySQL fixture program timed out')); }, 5000);
    child.on('spawn', () => { child.send({ type: 'buildr.connection-context', context }); child.stdin!.end('unused-business-input'); });
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
