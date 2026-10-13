import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionClient } from '../src/features/connections/api/connection-api.ts';
import { connectionDraft, connectionInput, resultCell } from '../src/features/connections/connection-form.ts';
import { tabForPath } from '../src/app/workspace-pages.ts';
import { navigationState } from '../src/app/navigation.ts';

const connection = {
  id: 'mysql-test', revision: 'sha256-observed', name: '测试数据库', category: 'data-source', type: 'mysql', environment: '客户A测试',
  config: { host: 'localhost', port: 3306, username: 'reader', defaultDatabase: 'orders', selectedDatabases: [] },
  hasCredentials: true, createdAt: '', updatedAt: '',
};

test('连接归入工作空间导航并且可以恢复该页面', () => {
  assert.equal(navigationState('/workspaces/w/connections', '', 'w').area, 'workspace');
  assert.deepEqual(tabForPath('w', '/workspaces/w/connections'), { key: 'dir:connections', kind: 'dir', title: '连接', path: '/workspaces/w/connections' });
  assert.equal(tabForPath('other', '/workspaces/w/connections'), null);
});

test('编辑空白密码保留认证，目标变化必须重新输入，环境可自由填写且默认库可为空', () => {
  const draft = connectionDraft(connection);
  assert.equal(draft.password, '', '已保存密码从未进入表单');
  draft.environment = '  预发 / 客户A  '; draft.defaultDatabase = '  ';
  const input = connectionInput(draft, connection);
  assert.equal(input.environment, '预发 / 客户A');
  assert.equal(input.config.defaultDatabase, null);
  assert.equal(Object.hasOwn(input, 'credentials'), false, '空白编辑不能清空保存的认证');
  for (const patch of [{ host: 'different.invalid' }, { port: 3307 }, { username: 'another' }]) {
    assert.throws(() => connectionInput({ ...draft, ...patch }, connection), /重新填写密码/);
    const explicit = connectionInput({ ...draft, ...patch, password: 'fictional-test-password' }, connection);
    assert.deepEqual(explicit.credentials, { password: 'fictional-test-password' });
  }
  const created = connectionInput({ ...draft, name: '新连接' });
  assert.deepEqual(created.credentials, { password: '' }, '新连接可以显式使用空密码');
  assert.equal(Object.hasOwn(created.config, 'password'), false);
});

test('数据库请求始终绑定自己的工作空间，写入校验观察版本并保留原SQL', async t => {
  const requests = []; let browsingWorkspace = 'first';
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => browsingWorkspace, sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'owned/workspace');
  await client.list(); browsingWorkspace = 'elsewhere';
  const input = connectionInput(connectionDraft(connection), connection);
  await client.update('connection/id', connection.revision, input);
  await client.test({ ...input, id: 'connection/id', expectedRevision: connection.revision });
  await client.databases('connection/id');
  await client.query('connection/id', { sql: 'SELECT id FROM other_db.orders LIMIT 500;', database: 'orders' });
  await client.remove('connection/id', connection.revision);
  await client.query('connection/id', { sql: 'SELECT 1;', database: null });
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/v1/workspaces/owned%2Fworkspace/connections',
    '/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid',
    '/api/v1/workspaces/owned%2Fworkspace/connections/test',
    '/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid/databases',
    '/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid/query',
    '/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid',
    '/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid/query',
  ]);
  assert.equal(requests[0].init.headers.has('x-buildr-session'), false);
  assert.equal(requests[1].init.method, 'PATCH');
  assert.equal(JSON.parse(requests[1].init.body).expectedRevision, connection.revision);
  assert.equal(Object.hasOwn(JSON.parse(requests[1].init.body), 'credentials'), false);
  assert.equal(requests[4].init.headers.get('x-buildr-session'), 'test-session');
  assert.deepEqual(JSON.parse(requests[4].init.body), { sql: 'SELECT id FROM other_db.orders LIMIT 500;', database: 'orders' });
  assert.deepEqual(JSON.parse(requests[5].init.body), { expectedRevision: connection.revision });
  assert.deepEqual(JSON.parse(requests[6].init.body), { sql: 'SELECT 1;', database: null }, '明确未选择当前库时不静默回退连接默认库');
});

test('结果显示保留NULL、小数、大整数文本和JSON值，不再次转成浮点数', () => {
  assert.equal(resultCell(null), 'NULL');
  assert.equal(resultCell('9007199254740993123'), '9007199254740993123');
  assert.equal(resultCell('123456789012345.123456789'), '123456789012345.123456789');
  assert.equal(resultCell({ status: '待处理', count: 2 }), '{"status":"待处理","count":2}');
  assert.equal(resultCell(''), '');
});

test('数据库选择使用独立偏好版本，并绑定工作空间和连接', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return new Response('{"enabledDatabases":[],"currentDatabase":null,"revision":"preference-v1"}', { headers: { 'content-type': 'application/json' } }); });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => 'unrelated', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'owned/workspace');
  const initial = await client.queryPreferences('connection/id');
  assert.deepEqual(initial, { enabledDatabases: [], currentDatabase: null, revision: 'preference-v1' });
  await client.saveQueryPreferences('connection/id', { enabledDatabases: ['orders'], currentDatabase: 'orders', expectedRevision: initial.revision });
  assert.deepEqual(requests.map(request => request.url), Array(2).fill('/api/v1/workspaces/owned%2Fworkspace/connections/connection%2Fid/query-preferences'));
  assert.equal(requests[0].init.headers.has('x-buildr-session'), false);
  assert.equal(requests[1].init.method, 'PUT');
  assert.equal(requests[1].init.headers.get('x-buildr-session'), 'test-session');
  assert.deepEqual(JSON.parse(requests[1].init.body), { enabledDatabases: ['orders'], currentDatabase: 'orders', expectedRevision: 'preference-v1' });
});
