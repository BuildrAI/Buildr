import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionClient } from '../src/features/connections/api/connection-api.ts';
import { isEditableConnection, isXxlJobConnection } from '../src/features/connections/connection-types.ts';
import { connectionSearchText, connectionTypeLabel } from '../src/features/connections/connection-presentation.ts';
import { xxlJobConnectionDraft, xxlJobConnectionInput, xxlJobConsoleHref, xxlJobWebsiteIdentity } from '../src/features/connections/xxl-job-connection-form.ts';

const connection = {
  id: 'xxl-job-test', revision: 'sha256-observed', name: '调度中心', category: 'scheduling', type: 'xxl-job', environment: 'qa',
  config: { consoleUrl: 'https://scheduler.example.test/proxy/xxl-job-admin/', username: 'operator', production: false, apiVersion: '2.3.0', serviceBindings: [{ serviceId: 'freshx-nm', executorId: 6, appName: 'saas-freshx-nm-biz' }] },
  hasCredentials: true, createdAt: '', updatedAt: '',
};

test('新建连接无需手填执行器，环境名称不替代生产标识', () => {
  const initial = xxlJobConnectionDraft();
  assert.equal(initial.production, true);
  assert.equal(initial.apiVersion, 'auto');
  assert.deepEqual(initial.serviceBindings, []);
  assert.throws(() => xxlJobConnectionInput(initial), /请填写/);
  const draft = { ...initial, name: ' 测试调度中心 ', environment: ' qa ', consoleUrl: connection.config.consoleUrl, username: ' operator ', password: 'fictional-password' };
  const created = xxlJobConnectionInput(draft);
  assert.equal(created.name, '测试调度中心');
  assert.equal(created.environment, 'qa');
  assert.equal(created.config.production, true);
  assert.deepEqual(created.config.serviceBindings, []);
  assert.deepEqual(created.credentials, { password: 'fictional-password' });
  assert.equal(Object.hasOwn(created.config, 'password'), false);
  assert.equal(xxlJobConnectionInput({ ...draft, production: false }).config.production, false);
  assert.throws(() => xxlJobConnectionInput({ ...draft, password: '' }), /登录密码/);
  assert.throws(() => xxlJobConnectionInput({ ...draft, apiVersion: '3.5.0' }), /接口版本/);
});

test('编辑保持已核实关联与版本，认证目标变化必须重新提供密码', () => {
  const draft = xxlJobConnectionDraft(connection);
  assert.equal(draft.password, '');
  const input = xxlJobConnectionInput({ ...draft, name: '新名称', environment: '自定义环境', production: true }, connection);
  assert.equal(Object.hasOwn(input, 'credentials'), false);
  assert.equal(input.config.apiVersion, '2.3.0');
  assert.deepEqual(input.config.serviceBindings, connection.config.serviceBindings);
  assert.notEqual(input.config.serviceBindings, connection.config.serviceBindings);
  assert.equal(Object.hasOwn(xxlJobConnectionInput({ ...draft, consoleUrl: connection.config.consoleUrl.replace(/\/$/u, '') }, connection), 'credentials'), false);
  assert.equal(xxlJobWebsiteIdentity('https://scheduler.example.test:443/'), 'https://scheduler.example.test');
  assert.equal(xxlJobWebsiteIdentity('https://scheduler.example.test/proxy/xxl-job-admin/'), 'https://scheduler.example.test/proxy/xxl-job-admin');
  for (const patch of [{ consoleUrl: 'https://other.example.test/proxy/xxl-job-admin/' }, { consoleUrl: 'https://scheduler.example.test/another/' }, { username: 'another' }]) {
    assert.throws(() => xxlJobConnectionInput({ ...draft, ...patch }, connection), /重新填写密码/);
    const changed = xxlJobConnectionInput({ ...draft, ...patch, password: 'replacement-password' }, connection);
    assert.deepEqual(changed.credentials, { password: 'replacement-password' });
    assert.deepEqual(changed.config.serviceBindings, patch.username ? connection.config.serviceBindings : [], '网站身份变化重新核实关联，账号变化保留服务范围');
  }
  assert.throws(() => xxlJobConnectionInput(draft, { ...connection, hasCredentials: false }), /登录密码/);
});

test('原网站入口保留完整部署路径，拒绝带认证或临时状态的网址', () => {
  assert.equal(xxlJobConsoleHref(connection), connection.config.consoleUrl);
  assert.equal(isXxlJobConnection(connection), true);
  assert.equal(isEditableConnection(connection), true);
  assert.equal(isXxlJobConnection({ ...connection, category: 'configuration' }), false);
  assert.equal(isEditableConnection({ ...connection, type: 'unknown' }), false);
  for (const consoleUrl of ['javascript:alert(1)', 'file:///tmp/job', 'https://operator:secret@example.test/xxl-job-admin/', 'https://example.test/xxl-job-admin/?token=secret', 'https://example.test/xxl-job-admin/#jobinfo', 'https://exa\nmple.test/xxl-job-admin/', 'https://example.test/\ud800']) {
    const invalid = { ...connection, config: { ...connection.config, consoleUrl } };
    assert.equal(xxlJobConsoleHref(invalid), null, consoleUrl);
    assert.throws(() => xxlJobConnectionInput(xxlJobConnectionDraft(invalid), invalid));
  }
  assert.equal(connectionTypeLabel(connection), 'XXL-JOB');
  const search = connectionSearchText(connection);
  for (const term of ['调度中心', 'qa', 'scheduler.example.test', 'freshx-nm', 'saas-freshx-nm-biz']) assert.ok(search.includes(term), term);
});

test('保存和只读测试绑定工作空间与观察版本，认证不进入网址', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response('{"ok":true,"elapsedMs":1,"xxlJob":{"apiVersion":"2.3.0","readVerified":true,"executorCount":6,"warnings":[]}}', { headers: { 'content-type': 'application/json' } });
  });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => 'unrelated', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'owned/workspace');
  const input = xxlJobConnectionInput({ ...xxlJobConnectionDraft(connection), password: 'fictional-password' }, connection);
  await client.create(input);
  await client.update(connection.id, connection.revision, input);
  const result = await client.test({ ...input, id: connection.id, expectedRevision: connection.revision });
  assert.equal(result.xxlJob.executorCount, 6);
  assert.deepEqual(requests.map(request => request.url), [
    '/api/v1/workspaces/owned%2Fworkspace/connections',
    '/api/v1/workspaces/owned%2Fworkspace/connections/xxl-job-test',
    '/api/v1/workspaces/owned%2Fworkspace/connections/test',
  ]);
  for (const { url, init } of requests) {
    assert.equal(url.includes('fictional-password'), false);
    assert.equal(init.headers.get('x-buildr-session'), 'test-session');
    const body = JSON.parse(init.body);
    assert.equal(body.category, 'scheduling');
    assert.equal(body.type, 'xxl-job');
    assert.equal(body.config.consoleUrl, connection.config.consoleUrl);
    assert.deepEqual(body.config.serviceBindings, connection.config.serviceBindings);
    assert.deepEqual(body.credentials, { password: 'fictional-password' });
  }
  assert.equal(JSON.parse(requests[1].init.body).expectedRevision, connection.revision);
  assert.equal(JSON.parse(requests[2].init.body).expectedRevision, connection.revision);
});
