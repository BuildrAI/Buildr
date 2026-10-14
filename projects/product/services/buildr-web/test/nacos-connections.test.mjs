import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionClient } from '../src/features/connections/api/connection-api.ts';
import { isEditableConnection, isNacosConnection } from '../src/features/connections/connection-types.ts';
import { connectionSearchText, connectionTypeLabel } from '../src/features/connections/connection-presentation.ts';
import { nacosConnectionDraft, nacosConnectionInput, nacosConsoleHref } from '../src/features/connections/nacos-connection-form.ts';

const connection = {
  id: 'nacos-test', revision: 'sha256-observed', name: '配置中心', category: 'configuration', type: 'nacos', environment: '生产',
  config: { consoleUrl: 'https://nacos.example.test/nacos/#/', username: 'operator', namespaceId: 'public', defaultGroup: 'DEFAULT_GROUP', production: true, apiVersion: 'auto' },
  hasCredentials: true, createdAt: '', updatedAt: '',
};

test('Nacos 表单默认生产、public 和 DEFAULT_GROUP，环境文本不代替生产标识', () => {
  const initial = nacosConnectionDraft();
  assert.equal(initial.production, true);
  assert.equal(initial.namespaceId, 'public');
  assert.equal(initial.defaultGroup, 'DEFAULT_GROUP');
  assert.equal(initial.apiVersion, 'auto');
  assert.throws(() => nacosConnectionInput(initial), /请填写/);
  const draft = { ...initial, name: '  测试配置中心  ', environment: '  qa  ', consoleUrl: connection.config.consoleUrl, username: '  operator  ', password: 'fictional-password' };
  const created = nacosConnectionInput(draft);
  assert.equal(created.name, '测试配置中心');
  assert.equal(created.environment, 'qa');
  assert.equal(created.config.production, true, '不会根据 qa 名称自动放宽生产授权');
  assert.deepEqual(created.credentials, { password: 'fictional-password' });
  assert.equal(Object.hasOwn(created.config, 'password'), false);
  assert.equal(nacosConnectionInput({ ...draft, production: false }).config.production, false);
  assert.throws(() => nacosConnectionInput({ ...draft, password: '' }), /登录密码/);
  const defaults = nacosConnectionInput({ ...draft, namespaceId: '', defaultGroup: '' });
  assert.equal(defaults.config.namespaceId, 'public');
  assert.equal(defaults.config.defaultGroup, 'DEFAULT_GROUP');
});

test('编辑保留凭据，真实认证目标变化必须重新提供密码，锚点或专业范围变化不丢凭据', () => {
  const draft = nacosConnectionDraft(connection);
  assert.equal(draft.password, '');
  const unchanged = nacosConnectionInput({ ...draft, consoleUrl: 'https://nacos.example.test/nacos#/configuration', namespaceId: 'team-a', defaultGroup: 'TEAM_GROUP', production: false, apiVersion: 'v2' }, connection);
  assert.equal(Object.hasOwn(unchanged, 'credentials'), false);
  assert.equal(unchanged.config.namespaceId, 'team-a');
  assert.equal(Object.hasOwn(nacosConnectionInput({ ...draft, consoleUrl: 'https://nacos.example.test/#/' }, connection), 'credentials'), false, '服务器根入口与默认 /nacos 接口属于同一认证目标');
  for (const patch of [{ consoleUrl: 'https://other.example.test/nacos/#/' }, { consoleUrl: 'https://nacos.example.test/another/#/' }, { username: 'another' }]) {
    assert.throws(() => nacosConnectionInput({ ...draft, ...patch }, connection), /重新填写密码/);
    assert.deepEqual(nacosConnectionInput({ ...draft, ...patch, password: 'replacement-password' }, connection).credentials, { password: 'replacement-password' });
  }
  assert.throws(() => nacosConnectionInput(draft, { ...connection, hasCredentials: false }), /登录密码/);
});

test('原网站链接保留网页锚点，不接受脚本、网址凭据或查询令牌', () => {
  assert.equal(nacosConsoleHref(connection), connection.config.consoleUrl);
  assert.equal(isNacosConnection(connection), true);
  assert.equal(isEditableConnection(connection), true);
  assert.equal(isNacosConnection({ ...connection, category: 'data-source' }), false);
  assert.equal(isEditableConnection({ ...connection, type: 'unknown' }), false);
  for (const consoleUrl of ['javascript:alert(1)', 'file:///tmp/config', 'https://operator:secret@example.test/nacos/#/', 'https://example.test/nacos/?accessToken=secret', 'https://exa\nmple.test/nacos/']) {
    const invalid = { ...connection, config: { ...connection.config, consoleUrl } };
    assert.equal(nacosConsoleHref(invalid), null);
    assert.throws(() => nacosConnectionInput(nacosConnectionDraft(invalid), invalid));
  }
  assert.equal(connectionTypeLabel(connection), 'Nacos');
  const text = connectionSearchText({ ...connection, config: { ...connection.config, namespaceId: 'ns-team-a', defaultGroup: 'TEAM_GROUP' } });
  for (const term of ['配置中心', 'nacos.example.test', 'ns-team-a', 'TEAM_GROUP']) assert.ok(text.includes(term), term);
});

test('Nacos 保存与测试沿用工作空间接口及观察版本，认证只进入请求正文', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => 'unrelated', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'owned/workspace');
  const input = nacosConnectionInput({ ...nacosConnectionDraft(connection), password: 'fictional-password' }, connection);
  await client.create(input);
  await client.update(connection.id, connection.revision, input);
  await client.test({ ...input, id: connection.id, expectedRevision: connection.revision });
  assert.deepEqual(requests.map(request => request.url), [
    '/api/v1/workspaces/owned%2Fworkspace/connections',
    '/api/v1/workspaces/owned%2Fworkspace/connections/nacos-test',
    '/api/v1/workspaces/owned%2Fworkspace/connections/test',
  ]);
  for (const { url, init } of requests) {
    assert.equal(url.includes('fictional-password'), false);
    assert.equal(init.headers.get('x-buildr-session'), 'test-session');
    const body = JSON.parse(init.body);
    assert.equal(body.category, 'configuration');
    assert.equal(body.type, 'nacos');
    assert.equal(body.config.consoleUrl, connection.config.consoleUrl);
    assert.deepEqual(body.credentials, { password: 'fictional-password' });
  }
  assert.equal(JSON.parse(requests[1].init.body).expectedRevision, connection.revision);
  assert.equal(JSON.parse(requests[2].init.body).expectedRevision, connection.revision);
});
