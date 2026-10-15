import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import { createMySqlClient } from '../../src/modules/mysql-query/infrastructure/mysql-client.ts';
import { mysqlConfiguration, passwordInput } from '../../src/modules/mysql-query/domain/mysql.ts';

// Opt in with the dedicated local fixture; ordinary suites never connect to an external account.
const file = process.env.BUILDR_TEST_MYSQL_CONNECTION_FILE;
test('dedicated local MySQL adapter verifies actual context, precision, empty headers, and byte limits', { skip: !file }, async () => {
  const input = JSON.parse(fs.readFileSync(file!, 'utf8'));
  assert.ok(['127.0.0.1', '::1', 'localhost'].includes(input.host), '仅允许显式准备的本机测试数据库');
  const config = mysqlConfiguration({ host: input.host, port: input.port, username: input.username, defaultDatabase: input.defaultDatabase });
  const client = createMySqlClient(), credentials = { password: passwordInput(input.password) };
  assert.equal((await client.test(config, credentials)).ok, true);
  await assert.rejects(() => client.test({ ...config, defaultDatabase: 'buildr_missing_' + crypto.randomUUID().replaceAll('-', '') }, credentials), error => ['mysql_database_missing', 'mysql_access_denied'].includes((error as { code: string }).code));
  await assert.rejects(() => client.query(config, credentials, { database: null, sql: 'SELECT * FROM orders' }), { code: 'mysql_database_required', status: 400 });
  const values = await client.query(config, credentials, { database: null, sql: "SELECT CAST('9007199254740993' AS UNSIGNED) AS id, CAST('12345678901234567.890123' AS DECIMAL(30,6)) AS amount, NULL AS empty_value" });
  assert.deepEqual(values.rows[0], ['9007199254740993', '12345678901234567.890123', null]);
  const duplicate = await client.query(config, credentials, { database: null, sql: 'SELECT 1 AS id, 2 AS id' });
  assert.deepEqual(duplicate.columns.map(column => column.name), ['id', 'id']); assert.deepEqual(duplicate.rows, [['1', '2']]);
  const empty = await client.query(config, credentials, { database: null, sql: 'SELECT 1 AS id WHERE 1 = 0' });
  assert.equal(empty.rowCount, 0); assert.equal(empty.columns[0].name, 'id');
  await assert.rejects(() => client.query(config, credentials, { database: null, sql: "SELECT REPEAT('a', 5000000) AS payload" }), { code: 'mysql_result_too_large', status: 413 });
});
