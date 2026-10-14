import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionClient } from '../src/features/connections/api/connection-api.ts';
import { isEditableConnection, isKibanaConnection } from '../src/features/connections/connection-types.ts';
import { connectionSearchText, connectionTypeLabel } from '../src/features/connections/connection-presentation.ts';
import { createConnectionRequestScope } from '../src/features/connections/connection-request-scope.ts';
import { kibanaConnectionDraft, kibanaConnectionDraftUpdate, kibanaConnectionInput, kibanaConsoleHref, kibanaWebsiteTarget } from '../src/features/connections/kibana-connection-form.ts';

const connection = {
  id: 'kibana-test', revision: 'sha256-observed', name: '测试日志', category: 'logs', type: 'kibana', environment: '客户A测试',
  config: { consoleUrl: 'https://logs.example.test/proxy/s/team/app/discover', username: 'reader', dataViewId: 'logs-view' },
  hasCredentials: true, createdAt: '', updatedAt: '',
};

test('Kibana 草稿可先登记空视图，认证只在专用请求中提交', () => {
  const initial = kibanaConnectionDraft();
  assert.equal(initial.dataViewId, null);
  assert.throws(() => kibanaConnectionInput(initial), /请填写/);
  const draft = { ...initial, name: '  测试日志  ', environment: '  客户A测试  ', consoleUrl: 'https://logs.example.test/proxy/s/team', username: '  reader  ', password: 'fictional-password' };
  const input = kibanaConnectionInput(draft);
  assert.deepEqual(input, { name: '测试日志', environment: '客户A测试', category: 'logs', type: 'kibana', config: { consoleUrl: connection.config.consoleUrl, username: 'reader', dataViewId: null }, credentials: { password: 'fictional-password' } });
  assert.throws(() => kibanaConnectionInput({ ...draft, password: '' }), /登录密码/);
  assert.throws(() => kibanaConnectionInput({ ...draft, username: 'reader:extra' }), /用户名无效/);
  assert.throws(() => kibanaConnectionInput({ ...draft, dataViewId: '测'.repeat(400) }), /编号无效/);
  assert.equal(kibanaConnectionInput({ ...draft, dataViewId: ' exact remote id ' }).config.dataViewId, ' exact remote id ', '真实编号不会被名称规范化替换');
});

test('网站入口去浏览器查询状态，保留代理前缀和空间，认证目标等价地址保持一致', () => {
  const target = kibanaWebsiteTarget('https://logs.example.test/proxy/s/team/app/discover/?access_token=fictional-token#/?_a=query');
  assert.deepEqual(target, { apiBaseUrl: 'https://logs.example.test/proxy/s/team', consoleUrl: connection.config.consoleUrl });
  assert.deepEqual(kibanaWebsiteTarget('https://logs.example.test/proxy/s/team/'), target);
  assert.deepEqual(kibanaWebsiteTarget('https://logs.example.test'), { apiBaseUrl: 'https://logs.example.test', consoleUrl: 'https://logs.example.test/app/discover' });
  assert.equal(kibanaConsoleHref({ ...connection, config: { ...connection.config, consoleUrl: `${connection.config.consoleUrl}?password=fictional-password#temporary` } }), connection.config.consoleUrl);
  assert.equal(kibanaWebsiteTarget('http://logs.example.test:5601/kibana').consoleUrl, 'http://logs.example.test:5601/kibana/app/discover');
});

test('拒绝含认证、不识别应用和不明确路径的网站，链接不携带认证', () => {
  for (const consoleUrl of ['javascript:alert(1)', 'file:///tmp/log', 'https://reader:fictional-password@logs.example.test', 'https://logs.example.test/app/dashboard', 'https://logs.example.test/api/data_views', 'https://logs.example.test/internal/search', 'https://logs.example.test/app', 'https://logs.example.test/s', 'https://logs.example.test/s/team/path', 'https://logs.example.test/a%2Fb', 'https://logs.example.test/a%5Cb', 'https://logs.example.test/a\\b', 'https://lo\ngs.example.test']) {
    assert.throws(() => kibanaWebsiteTarget(consoleUrl), consoleUrl);
    assert.equal(kibanaConsoleHref({ ...connection, config: { ...connection.config, consoleUrl } }), null, consoleUrl);
  }
});

test('编辑留空密码保持认证，改网站、空间、代理前缀和用户必须重新认证', () => {
  const draft = kibanaConnectionDraft(connection);
  assert.equal(draft.password, '');
  const unchanged = kibanaConnectionInput({ ...draft, name: '新名称', environment: '自定义环境', dataViewId: null, consoleUrl: 'https://logs.example.test/proxy/s/team/?query=temporary' }, connection);
  assert.equal(Object.hasOwn(unchanged, 'credentials'), false);
  assert.equal(unchanged.config.dataViewId, null);
  for (const patch of [{ consoleUrl: 'https://other.example.test/proxy/s/team' }, { consoleUrl: 'http://logs.example.test/proxy/s/team' }, { consoleUrl: 'https://logs.example.test:5601/proxy/s/team' }, { consoleUrl: 'https://logs.example.test/other/s/team' }, { consoleUrl: 'https://logs.example.test/proxy/s/other' }, { username: 'other' }]) {
    assert.throws(() => kibanaConnectionInput({ ...draft, ...patch }, connection), /重新填写密码/);
    assert.deepEqual(kibanaConnectionInput({ ...draft, ...patch, password: 'replacement-password' }, connection).credentials, { password: 'replacement-password' });
  }
  assert.throws(() => kibanaConnectionInput(draft, { ...connection, hasCredentials: false }), /登录密码/);
});

test('日志类型和实际视图编号进入既有列表搜索及环境属性', () => {
  assert.equal(isKibanaConnection(connection), true);
  assert.equal(isEditableConnection(connection), true);
  assert.equal(isKibanaConnection({ ...connection, category: 'configuration' }), false);
  assert.equal(isEditableConnection({ ...connection, type: 'unknown' }), false);
  assert.equal(connectionTypeLabel(connection), 'Kibana');
  const search = connectionSearchText(connection);
  for (const term of ['测试日志', '客户A测试', 'logs.example.test', 'logs-view', 'logs', 'kibana']) assert.ok(search.includes(term));
  assert.equal(search.includes('fictional-password'), false);
});

test('草稿认证目标变化清除旧默认视图，密码和浏览器临时条件变化保留真实编号', () => {
  const draft = kibanaConnectionDraft(connection);
  assert.equal(kibanaConnectionDraftUpdate(draft, 'consoleUrl', 'https://other.example.test/proxy/s/team').dataViewId, null);
  assert.equal(kibanaConnectionDraftUpdate(draft, 'username', 'other-reader').dataViewId, null);
  assert.equal(kibanaConnectionDraftUpdate(draft, 'consoleUrl', '').dataViewId, null);
  assert.equal(kibanaConnectionDraftUpdate(draft, 'consoleUrl', `${connection.config.consoleUrl}?temporary=1#state`).dataViewId, 'logs-view');
  assert.equal(kibanaConnectionDraftUpdate(draft, 'password', 'replacement-password').dataViewId, 'logs-view');
  assert.equal(kibanaConnectionDraftUpdate(draft, 'environment', 'another').dataViewId, 'logs-view');
});

test('草稿发现沿用会话和版本，名称筛选、分页与认证只进入请求正文', async t => {
  const requests = [];
  const response = { dataViews: [{ id: 'logs-view', name: '日志视图', title: 'logs-*' }], total: 150, offset: 100, limit: 100, limitReached: false, warnings: [] };
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }); });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => 'unrelated', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'owned/workspace');
  const input = { ...kibanaConnectionInput(kibanaConnectionDraft(connection), connection), id: connection.id, expectedRevision: connection.revision };
  const controller = new AbortController();
  assert.deepEqual(await client.discoverKibanaViews({ ...input, viewName: '日志', offset: 100, limit: 100 }, controller.signal), response);
  await client.test(input, controller.signal);
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/workspaces/owned%2Fworkspace/connections/kibana/data-views', '/api/v1/workspaces/owned%2Fworkspace/connections/test']);
  assert.deepEqual(JSON.parse(requests[0].init.body), { ...input, viewName: '日志', offset: 100, limit: 100 });
  for (const { url, init } of requests) {
    assert.equal(init.method, 'POST'); assert.equal(init.headers.get('x-buildr-session'), 'test-session');
    assert.equal(init.signal, controller.signal);
    const body = JSON.parse(init.body);
    assert.equal(body.name, connection.name); assert.equal(body.expectedRevision, connection.revision);
    assert.equal(Object.hasOwn(body, 'credentials'), false); assert.equal(url.includes('reader'), false);
  }
});

test('发现失败后合法草稿和视图选择仍可保存，失败不产生虚假查询成功', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(url.endsWith('/data-views') ? '{"error":"远端不可用"}' : '{"connection":{}}', { status: url.endsWith('/data-views') ? 503 : 200, headers: { 'content-type': 'application/json' } });
  });
  const client = createConnectionClient(createApiClient({ getWorkspaceId: () => 'workspace', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test-session' }) } }), 'workspace');
  const draft = { ...kibanaConnectionDraft(connection), dataViewId: null };
  await assert.rejects(() => client.discoverKibanaViews({ ...kibanaConnectionInput(draft, connection), id: connection.id, expectedRevision: connection.revision }));
  await client.update(connection.id, connection.revision, kibanaConnectionInput(draft, connection));
  assert.equal(requests[1].init.method, 'PATCH');
  assert.equal(JSON.parse(requests[1].init.body).config.dataViewId, null);
  assert.equal(Object.hasOwn(JSON.parse(requests[1].init.body), 'credentials'), false);
});

test('密码/草稿变更、目标切换及关闭使迟到发现和测试响应失效', async () => {
  for (const reason of ['密码变更', '地址变更', '账号变更', '目标切换', '关闭抽屉']) {
    const scope = createConnectionRequestScope(), request = scope.begin();
    let resolve;
    const remote = new Promise(done => { resolve = done; });
    let shown;
    const pending = remote.then(value => { if (request.isCurrent()) shown = value; });
    scope.invalidate(); resolve({ dataViews: ['old-view'], queryVerified: true }); await pending;
    assert.equal(request.signal.aborted, true, reason);
    assert.equal(shown, undefined, reason);
  }
  const scope = createConnectionRequestScope(), first = scope.begin(), next = scope.begin();
  assert.equal(first.isCurrent(), false); assert.equal(first.signal.aborted, true);
  assert.equal(next.isCurrent(), true); assert.equal(next.signal.aborted, false);
});
