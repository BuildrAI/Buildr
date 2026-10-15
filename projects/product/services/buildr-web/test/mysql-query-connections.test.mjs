import assert from 'node:assert/strict';
import test from 'node:test';
import { createMySqlQueryClient } from '../src/features/mysql-query/api/mysql-query-api.ts';
import { mysqlQueryTarget } from '../src/features/mysql-query/query-target.ts';
import { resultCell } from '../src/features/mysql-query/result-cell.ts';

const revision = 'opaque-' + 'a'.repeat(64);
const instance = { id: 'qa-db', name: 'QA', environment: 'qa', enabled: true, revision,
  binding: { skillAssetIdentity: 'buildr:skill:mysql-connection', sourceIdentity: 'package:skills/connections/mysql-connection', definitionId: 'mysql', configVersion: 1 } };

test('query selection uses exact builtin source and observed version', () => {
  assert.deepEqual(mysqlQueryTarget(instance), { id: 'qa-db', name: 'QA', environment: 'qa', revision });
  for (const binding of [{ ...instance.binding, sourceIdentity: 'company:other' }, { ...instance.binding, skillAssetIdentity: 'company:mysql' }, { ...instance.binding, configVersion: 2 }]) assert.equal(mysqlQueryTarget({ ...instance, binding }), null);
  assert.equal(mysqlQueryTarget({ ...instance, enabled: false }), null);
  assert.equal(mysqlQueryTarget({ ...instance, revision: 'unavailable' }), null);
  const { binding, ...withoutBinding } = instance;
  assert.equal(mysqlQueryTarget({ ...withoutBinding, category: 'data-source', type: 'mysql', config: { host: 'legacy.example.invalid' } }), null, 'Legacy connection records cannot select a query target.');
});

test('query client pins each request to its target and never receives credentials', async () => {
  const calls = [], api = async (url, options) => { calls.push({ url, options }); return {}; };
  const targets = [mysqlQueryTarget(instance)], client = createMySqlQueryClient(api, 'workspace/id', targets);
  const controller = new AbortController();
  await client.databases('qa-db', controller.signal);
  await client.queryPreferences('qa-db');
  await client.query('qa-db', { sql: 'SELECT 1', database: null });
  await client.saveQueryPreferences('qa-db', { expectedRevision: 'preference-v1', enabledDatabases: ['orders'], currentDatabase: 'orders' });
  assert.match(calls[0].url, /workspaces\/workspace%2Fid\/mysql-query\/connections\/qa-db\/databases\?revision=opaque-/);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(JSON.parse(calls[2].options.body).connectionRevision, revision);
  assert.deepEqual(JSON.parse(calls[3].options.body), { expectedRevision: 'preference-v1', enabledDatabases: ['orders'], currentDatabase: 'orders', connectionRevision: revision });
  targets[0].revision = 'new-observation';
  await client.query('qa-db', { sql: 'SELECT 2' });
  assert.equal(JSON.parse(calls[4].options.body).connectionRevision, revision);
  assert.throws(() => client.query('different', { sql: 'SELECT 1' }), /连接已变化/);
  assert.doesNotMatch(JSON.stringify(calls), /password|username|authentication/);
  assert.ok(calls.every(call => call.url.startsWith('/api/v1/workspaces/workspace%2Fid/mysql-query/connections/')), 'Every operation uses the independent query API.');
});

test('结果显示保留NULL、小数、大整数文本和JSON值，不再次转成浮点数', () => {
  assert.equal(resultCell(null), 'NULL');
  assert.equal(resultCell('9007199254740993123'), '9007199254740993123');
  assert.equal(resultCell('123456789012345.123456789'), '123456789012345.123456789');
  assert.equal(resultCell({ status: '待处理', count: 2 }), '{"status":"待处理","count":2}');
  assert.equal(resultCell(''), '');
});
