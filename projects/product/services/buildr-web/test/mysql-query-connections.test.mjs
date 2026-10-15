import assert from 'node:assert/strict';
import test from 'node:test';
import { createMySqlQueryClient } from '../src/features/mysql-query/api/mysql-query-api.ts';
import { mysqlQueryTarget } from '../src/features/mysql-query/query-target.ts';

const revision = 'opaque-' + 'a'.repeat(64);
const instance = { id: 'qa-db', name: 'QA', environment: 'qa', enabled: true, revision,
  binding: { skillAssetIdentity: 'buildr:skill:mysql-connection', sourceIdentity: 'package:skills/connections/mysql-connection', definitionId: 'mysql', configVersion: 1 } };

test('query selection uses exact builtin source and observed version', () => {
  assert.deepEqual(mysqlQueryTarget(instance), { id: 'qa-db', name: 'QA', environment: 'qa', revision });
  for (const binding of [{ ...instance.binding, sourceIdentity: 'company:other' }, { ...instance.binding, skillAssetIdentity: 'company:mysql' }, { ...instance.binding, configVersion: 2 }]) assert.equal(mysqlQueryTarget({ ...instance, binding }), null);
  assert.equal(mysqlQueryTarget({ ...instance, enabled: false }), null);
  assert.equal(mysqlQueryTarget({ ...instance, revision: 'unavailable' }), null);
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
});
