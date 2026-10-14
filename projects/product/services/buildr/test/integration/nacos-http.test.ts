import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { createNacosProvider } from '../../src/modules/connections/infrastructure/nacos-provider.ts';
import { nacosApiBase, nacosConfiguration, type NacosApiVersion } from '../../src/modules/connections/domain/nacos-connection.ts';

const md5 = (value: string) => crypto.createHash('md5').update(value, 'utf8').digest('hex');
const longId = '完整配置名-' + 'a'.repeat(180) + '.yaml';
const original = '\uFEFF中文: "保留空白"\r\n\r\n  list: [1, 2]\r\n';
const candidate = '\uFEFF中文: "修改之后"\r\n\r\n  list: [1, 2, 3]\r\n';
type Request = { pathname: string; query: URLSearchParams; form: URLSearchParams; headers: http.IncomingHttpHeaders };
async function fixture(t: { after(action: () => Promise<void>): void }, apiVersion: NacosApiVersion = 'v3') {
  const state = { content: original, version: apiVersion === 'v3' ? '3.1.1' : '2.4.3', tokenCount: 0, writes: 0, failReadAfterPublish: false, mismatchReadAfterPublish: false, failFirstRead: false, publishUnknown: false, race: false, missing: false, pageSize: 20, totalCount: 42, requests: [] as Request[], override: null as ((request: Request, response: http.ServerResponse) => boolean | Promise<boolean>) | null };
  const metadata = { type: 'yaml', appName: '订单系统', desc: '完整说明', configTags: 'sales,qa', use: '配置用途', effect: '配置效果', schema: '自定义格式' };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://127.0.0.1');
    let body = ''; for await (const chunk of request) body += chunk.toString('utf8');
    const current: Request = { pathname: url.pathname.replace('/gateway/nacos', ''), query: url.searchParams, form: new URLSearchParams(body), headers: request.headers };
    state.requests.push(current);
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json;charset=UTF-8' }); response.end(JSON.stringify(value)); };
    if (await state.override?.(current, response)) return;
    if (current.pathname.endsWith('/login')) {
      if (current.pathname.startsWith('/v3/') && apiVersion !== 'v3') { json({ status: 404 }, 404); return; }
      assert.equal(current.form.get('username'), 'reader'); assert.equal(current.form.get('password'), 'only-fixture-secret');
      state.tokenCount++; json({ accessToken: 'fixture-token-' + state.tokenCount, tokenTtl: 300 }); return;
    }
    if (current.pathname.endsWith('/state')) { json(current.pathname.startsWith('/v3/') ? { code: 0, data: { version: state.version || undefined } } : { version: state.version || undefined }); return; }
    if (!current.headers.authorization) { json({ code: 10001 }, 403); return; }
    const prefix = '/' + apiVersion + '/';
    const legacyManagement = apiVersion === 'v2' && current.pathname === '/v1/cs/configs' && current.query.get('show') === 'all';
    if (!current.pathname.startsWith(prefix) && !legacyManagement) { json({ status: 404 }, 404); return; }
    if (current.pathname.includes('/namespace')) { json({ code: apiVersion === 'v1' ? 200 : 0, data: [{ namespace: apiVersion === 'v1' ? '' : 'public', namespaceShowName: 'public', configCount: 42 }] }); return; }
    if (request.method === 'GET' && (current.pathname.endsWith('/list') || current.pathname.endsWith('/searchDetail') || current.query.has('search'))) {
      const pageNo = Number(current.query.get('pageNo')), pageSize = Number(current.query.get('pageSize')); state.pageSize = pageSize;
      const page = { totalCount: state.totalCount, pageNumber: pageNo, pagesAvailable: Math.ceil(state.totalCount / pageSize), pageItems: [{ dataId: longId, group: 'DEFAULT_GROUP', tenant: apiVersion === 'v1' ? '' : 'public', type: 'yaml', md5: md5(state.content) }] };
      json(apiVersion === 'v3' ? { code: 0, data: page } : page); return;
    }
    if (request.method === 'GET') {
      if (state.failFirstRead) { state.failFirstRead = false; json({ code: 401, message: 'expired' }, 401); return; }
      if (state.missing) { json({ code: 20004, message: 'config not exist' }, 404); return; }
      if (state.failReadAfterPublish && state.writes) { json({ code: 503 }, 503); return; }
      const content = state.mismatchReadAfterPublish && state.writes ? original : state.content;
      response.setHeader('Content-MD5', md5(content)); response.setHeader('Config-Type', 'yaml');
      if (apiVersion === 'v3') json({ code: 0, data: { namespaceId: 'public', dataId: longId, groupName: 'DEFAULT_GROUP', content, md5: md5(content), ...metadata } });
      else if (current.query.get('show') === 'all') json({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content, md5: md5(content), ...metadata });
      else if (apiVersion === 'v2') json({ code: 0, data: content });
      else response.end(content);
      return;
    }
    if (request.method === 'POST') {
      state.writes++;
      if (state.race) state.content = '其他入口最新内容\n';
      if (current.headers.casmd5 && current.headers.casmd5 !== md5(state.content)) { json({ code: 20005, message: 'Cas publish fail, server md5 may have changed.' }, 500); return; }
      state.content = current.form.get('content')!;
      if (state.publishUnknown) { response.end('not a supported result'); return; }
      if (apiVersion === 'v1') response.end('true'); else json({ code: 0, data: true });
      return;
    }
    json({ status: 404 }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address() as { port: number };
  const config = nacosConfiguration({ consoleUrl: `http://127.0.0.1:${address.port}/gateway/nacos/#/`, username: 'reader', production: false, apiVersion });
  const credentials = { password: 'only-fixture-secret' }, provider = createNacosProvider();
  return { state, config, credentials, provider, metadata };
}

test('Nacos configuration retains the website, canonicalizes only the authentication target, and defaults to production', () => {
  const provider = createNacosProvider(), config = nacosConfiguration({ consoleUrl: 'https://nacos.example.invalid:443/proxy/nacos/#/', username: 'reader' });
  assert.equal(config.production, true); assert.equal(config.namespaceId, 'public'); assert.equal(config.defaultGroup, 'DEFAULT_GROUP'); assert.equal(config.apiVersion, 'auto');
  assert.equal(config.consoleUrl, 'https://nacos.example.invalid/proxy/nacos/#/'); assert.equal(nacosApiBase(config.consoleUrl), 'https://nacos.example.invalid/proxy/nacos');
  assert.equal(provider.authenticationTargetIdentity(config), provider.authenticationTargetIdentity({ ...config, consoleUrl: 'https://nacos.example.invalid/proxy/nacos#other' }));
  for (const consoleUrl of ['file:///nacos', 'https://secret:password@nacos.example.invalid/nacos/#/', 'https://nacos.example.invalid/nacos/?accessToken=secret']) assert.throws(() => nacosConfiguration({ consoleUrl, username: 'reader' }), { code: 'nacos_url_invalid' });
  assert.throws(() => nacosConfiguration({ ...config, production: 'false' }), { code: 'nacos_input_invalid' });
});

for (const version of ['v1', 'v2', 'v3'] as const) {
  test(`Nacos ${version} keeps UTF-8 BOM, CRLF, trailing whitespace and complete configuration identities`, async t => {
    const f = await fixture(t, version);
    const detail = await f.provider.nacos.get(f.config, f.credentials, { dataId: longId });
    assert.equal(detail.content, original); assert.equal(detail.dataId, longId); assert.equal(detail.md5, md5(original)); assert.equal(detail.type, 'yaml'); assert.equal(detail.apiVersion, version);
    const read = f.state.requests.find(request => request.query.get('dataId') === longId)!;
    assert.equal(read.query.get(version === 'v1' ? 'tenant' : 'namespaceId'), version === 'v1' ? '' : 'public');
    assert.equal(read.query.get(version === 'v3' ? 'groupName' : 'group'), 'DEFAULT_GROUP');
    const namespaces = await f.provider.nacos.namespaces(f.config, f.credentials); assert.equal(namespaces[0].namespaceId, 'public');
    const page = await f.provider.nacos.configs(f.config, f.credentials, { dataId: '完整*', pageNo: 2, pageSize: 2 });
    assert.equal(page.items[0].dataId, longId); assert.equal(page.totalCount, 42); assert.equal(page.pageNo, 2); assert.equal(page.pagesAvailable, 21); assert.equal(page.items.length, 1);
    const list = f.state.requests.find(request => request.query.has('search'))!;
    if (version === 'v2') assert.equal(list.query.get('config_detail'), '');
    assert.equal(f.state.writes, 0);
  });
  test(`Nacos ${version} publishes using atomic native CAS and retains type and existing metadata`, async t => {
    const f = await fixture(t, version);
    const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
    assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.md5, md5(candidate)); assert.equal(result.concurrencyProtection, 'native-cas'); assert.match(result.upstreamCasLimit!, /并发删除/u);
    const write = f.state.requests.find(request => request.form.has('content'))!;
    assert.equal(write.headers.casmd5, md5(original)); assert.equal(write.form.get('content'), candidate); assert.equal(write.form.get('type'), 'yaml');
    assert.equal(write.form.get('desc'), f.metadata.desc); assert.equal(write.form.get('appName'), f.metadata.appName); assert.equal(write.form.get(version === 'v1' ? 'config_tags' : 'configTags'), f.metadata.configTags);
    assert.equal(f.state.writes, 1); assert.equal(f.state.content, candidate);
  });
}

test('Nacos auto discovers available read APIs without downgrading an authentication denial', async t => {
  const f = await fixture(t, 'v2');
  const result = await f.provider.nacos.get({ ...f.config, apiVersion: 'auto' }, f.credentials, { dataId: longId });
  assert.equal(result.apiVersion, 'v2'); assert.equal(result.content, original);
  f.state.override = (request, response) => { if (!request.pathname.endsWith('/login')) return false; response.writeHead(403); response.end('only-fixture-secret should never leak'); return true; };
  await assert.rejects(() => f.provider.nacos.get({ ...f.config, apiVersion: 'auto' }, f.credentials, { dataId: longId }), error => (error as { code: string }).code === 'nacos_access_denied' && !String(error).includes(f.credentials.password));
});
test('Nacos legacy reads without a type header return complete management observations for get and diff', async t => {
  for (const version of ['v1', 'v2'] as const) {
    const f = await fixture(t, version);
    f.state.override = (request, response) => {
      if (request.query.get('dataId') !== longId) return false;
      if (request.query.get('show') === 'all') response.end(JSON.stringify({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: candidate, md5: md5(candidate), ...f.metadata }));
      else {
        response.setHeader('Content-MD5', md5(original));
        response.end(version === 'v2' ? JSON.stringify({ code: 0, data: original }) : original);
      }
      return true;
    };
    const detail = await f.provider.nacos.get(f.config, f.credentials, { dataId: longId });
    assert.equal(detail.content, candidate); assert.equal(detail.md5, md5(candidate)); assert.equal(detail.type, 'yaml'); assert.equal(detail.apiVersion, version);
    assert.equal(detail.metadata?.appName, f.metadata.appName); assert.equal(detail.metadata?.desc, f.metadata.desc); assert.equal(detail.metadata?.configTags, f.metadata.configTags);
    const supplemental = f.state.requests.filter(request => request.query.get('show') === 'all');
    assert.equal(supplemental.length, 1); assert.equal(supplemental[0].query.get('tenant'), ''); assert.equal(f.state.writes, 0);
  }
});
test('Nacos legacy reads keep the original read result when supplemental management details are unavailable', async t => {
  for (const version of ['v1', 'v2'] as const) {
    const f = await fixture(t, version);
    f.state.override = (request, response) => {
      if (request.query.get('dataId') !== longId) return false;
      if (request.query.get('show') === 'all') { response.writeHead(503); response.end('management unavailable'); }
      else response.end(version === 'v2' ? JSON.stringify({ code: 0, data: original }) : original);
      return true;
    };
    const detail = await f.provider.nacos.get(f.config, f.credentials, { dataId: longId });
    assert.equal(detail.content, original); assert.equal(detail.md5, md5(original)); assert.equal(detail.type, null); assert.equal(detail.apiVersion, version); assert.equal(detail.metadata, undefined);
    assert.equal(f.state.requests.filter(request => request.query.get('show') === 'all').length, 1); assert.equal(f.state.writes, 0);
  }
});
test('Nacos refreshes rejected reads, while writes are not automatically retried', async t => {
  const f = await fixture(t); f.state.failFirstRead = true;
  assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original); assert.equal(f.state.tokenCount, 2);
  f.state.override = (request, response) => { if (!request.form.has('content')) return false; f.state.writes++; response.writeHead(401); response.end(); return true; };
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_access_denied' }); assert.equal(f.state.writes, 1);
});
test('Nacos v1 login tries users/login only after the standard route returns 404', async t => {
  const f = await fixture(t, 'v1');
  f.state.override = (request, response) => {
    if (request.pathname !== '/v1/auth/login') return false;
    response.writeHead(404); response.end(); return true;
  };
  assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original);
  assert.deepEqual(f.state.requests.filter(request => request.pathname.endsWith('/login')).map(request => request.pathname), ['/v1/auth/login', '/v1/auth/users/login']);
  const alias = f.state.requests.find(request => request.pathname === '/v1/auth/users/login')!;
  assert.equal(alias.form.get('username'), 'reader'); assert.equal(alias.form.get('password'), f.credentials.password);
});
test('Nacos v1 login never tries the alias after authentication denial or an uncertain response', async t => {
  const f = await fixture(t, 'v1');
  for (const status of [401, 403, 500]) {
    f.state.requests.length = 0;
    f.state.override = (request, response) => { if (!request.pathname.endsWith('/login')) return false; response.writeHead(status); response.end(); return true; };
    await assert.rejects(() => f.provider.nacos.get(f.config, f.credentials, { dataId: longId }), { code: status === 500 ? 'nacos_auth_failed' : 'nacos_access_denied' });
    assert.deepEqual(f.state.requests.filter(request => request.pathname.endsWith('/login')).map(request => request.pathname), ['/v1/auth/login']);
  }
});
test('Nacos refuses redirects before forwarding credentials and never exposes them in an error', async t => {
  const f = await fixture(t); let leaked = 0;
  const other = http.createServer((_request, response) => { leaked++; response.end('unexpected'); });
  await new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve));
  t.after(async () => { other.closeAllConnections(); await new Promise<void>(resolve => other.close(() => resolve())); });
  f.state.override = (request, response) => { if (!request.pathname.endsWith('/login')) return false; response.writeHead(307, { Location: `http://127.0.0.1:${(other.address() as { port: number }).port}/login` }); response.end(); return true; };
  await assert.rejects(() => f.provider.nacos.get(f.config, f.credentials, { dataId: longId }), error => (error as { code: string }).code === 'nacos_redirect_rejected' && !String(error).includes(f.credentials.password));
  assert.equal(leaked, 0);
});
test('Nacos rejects stale observations locally and server-side CAS catches a race after the read', async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5('stale') }), { code: 'nacos_config_conflict' }); assert.equal(f.state.writes, 0);
  f.state.race = true;
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_config_conflict' });
  assert.equal(f.state.content, '其他入口最新内容\n'); assert.equal(f.state.writes, 1);
});
test('Nacos v1 recognizes the exact plain-text CAS failure as a definite rejection', async t => {
  const f = await fixture(t, 'v1');
  f.state.override = (request, response) => {
    if (!request.form.has('content')) return false;
    f.state.writes++; response.writeHead(500, { 'Content-Type': 'text/plain;charset=UTF-8' });
    response.end('Cas publish fail, server md5 may have changed.\n'); return true;
  };
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_config_conflict', status: 409 });
  assert.equal(f.state.writes, 1); assert.equal(f.state.content, original);
});
test('Nacos keeps unrelated 500 responses and network failures unknown and does not repeat a write', async t => {
  for (const body of ['server error: only-fixture-secret', 'gateway mentioned: Cas publish fail, server md5 may have changed.', null]) {
    const f = await fixture(t, 'v1');
    f.state.override = (request, response) => {
      if (!request.form.has('content')) return false;
      f.state.writes++;
      if (body === null) response.destroy(); else { response.writeHead(500, { 'Content-Type': 'text/plain;charset=UTF-8' }); response.end(body); }
      return true;
    };
    await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), error => (error as { code: string }).code === 'nacos_publish_outcome_unknown' && !String(error).includes(f.credentials.password));
    assert.equal(f.state.writes, 1); assert.equal(f.state.content, original);
  }
});
test('Nacos rejects an observed type that changed without a content MD5 change', async t => {
  const f = await fixture(t);
  f.metadata.type = 'json';
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original), type: 'yaml' }), { code: 'nacos_config_conflict' });
  assert.equal(f.state.writes, 0); assert.equal(f.state.content, original);
});
test('Nacos rejects a type change observed in the later v1 management detail', async t => {
  const f = await fixture(t, 'v1'); f.metadata.type = 'json';
  // The runtime header still reports the previously observed yaml type while the
  // later management detail reflects another entry point's type-only update.
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original), type: 'yaml' }), { code: 'nacos_config_conflict' });
  assert.equal(f.state.writes, 0); assert.equal(f.state.content, original);
});
test('Nacos missing, old and custom version labels use ordinary publishing with explicit recheck protection', async t => {
  for (const apiVersion of ['v1', 'v2', 'v3'] as const) {
    const f = await fixture(t, apiVersion);
    for (const version of ['', '2.3.1', '4.6.0-SNAPSHOT', '3.1.1-custom']) {
      f.state.version = version; f.state.content = original; f.state.requests.length = 0;
      assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original);
      const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
      assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.md5, md5(candidate)); assert.equal(result.concurrencyProtection, 'preflight-recheck');
      assert.match(result.concurrencyWarning!, /并非原子操作/u); assert.equal(result.upstreamCasLimit, undefined);
      const write = f.state.requests.find(request => request.form.has('content'))!;
      assert.equal(write.headers.casmd5, undefined); assert.equal(write.form.get('content'), candidate); assert.equal(write.form.get('type'), 'yaml'); assert.equal(write.form.get('desc'), f.metadata.desc);
      assert.equal(f.state.content, candidate);
      const writeIndex = f.state.requests.indexOf(write), fresh = f.state.requests[writeIndex - 1];
      assert.equal(fresh.query.get('dataId'), longId); assert.equal(fresh.pathname, apiVersion === 'v3' ? '/v3/admin/cs/config' : '/v1/cs/configs');
      if (apiVersion !== 'v3') assert.equal(fresh.query.get('show'), 'all', '写入前最后请求应读管理详情，不能使用运行时缓存');
    }
    assert.equal(f.state.writes, 4);
    f.state.missing = true;
    await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_config_missing' }); assert.equal(f.state.writes, 4);
  }
});
test('Nacos native and ordinary publication both reject content or type drift observed by the final management read', async t => {
  for (const apiVersion of ['v1', 'v2', 'v3'] as const) for (const protection of ['native', 'ordinary']) for (const change of ['content', 'type']) {
    const f = await fixture(t, apiVersion);
    if (protection === 'ordinary') f.state.version = '4.6.0-SNAPSHOT';
    let managementReads = 0;
    f.state.override = (request, response) => {
      const management = request.query.get('dataId') === longId && !request.form.has('content') && (apiVersion === 'v3' ? request.pathname === '/v3/admin/cs/config' : request.query.get('show') === 'all');
      if (!management || ++managementReads !== 2) return false;
      if (change === 'content') f.state.content = '\uFEFF其他入口最新配置\r\n'; else f.metadata.type = 'json';
      const detail = { dataId: longId, group: 'DEFAULT_GROUP', tenant: '', namespaceId: 'public', content: f.state.content, md5: md5(f.state.content), ...f.metadata };
      response.end(JSON.stringify(apiVersion === 'v3' ? { code: 0, data: detail } : detail)); return true;
    };
    await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_config_conflict' }, `${apiVersion} ${protection} ${change}`);
    assert.equal(managementReads, 2); assert.equal(f.state.writes, 0); assert.equal(f.state.content, change === 'content' ? '\uFEFF其他入口最新配置\r\n' : original);
  }
});
test('Nacos ordinary publication rereads management content instead of mistaking a stale v1 runtime cache for failure', async t => {
  const f = await fixture(t, 'v1'); f.state.version = '2.3.1';
  f.state.override = (request, response) => {
    if (!f.state.writes || request.query.get('dataId') !== longId || request.query.get('show') === 'all' || request.form.has('content')) return false;
    response.setHeader('Content-MD5', md5(original)); response.setHeader('Config-Type', 'yaml'); response.end(original); return true;
  };
  const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
  assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.md5, md5(candidate)); assert.equal(result.concurrencyProtection, 'preflight-recheck');
  const writeIndex = f.state.requests.findIndex(request => request.form.has('content'));
  assert.equal(f.state.requests[writeIndex + 1].query.get('show'), 'all');
  assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original, '普通读取仍保持既有运行时路径；不把缓存状态当作服务加载状态');
  assert.equal(f.state.writes, 1);
});
test('Nacos official stable 2.3.2 uses the CAS backport while 2.3.1 publishes without the buggy CAS header', async t => {
  const f = await fixture(t, 'v1');
  f.state.version = '2.3.1';
  const ordinary = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
  assert.equal(ordinary.published, true); assert.equal(ordinary.verified, true); assert.equal(ordinary.concurrencyProtection, 'preflight-recheck'); assert.equal(f.state.writes, 1);
  assert.equal(f.state.requests.find(request => request.form.has('content'))!.headers.casmd5, undefined);
  f.state.version = '2.3.2'; f.state.content = original; f.state.requests.length = 0;
  const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
  assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.concurrencyProtection, 'native-cas'); assert.equal(f.state.writes, 2);
  assert.equal(f.state.requests.find(request => request.form.has('content'))!.headers.casmd5, md5(original));
});
test('Nacos keeps the accepted publication fact when rereading fails or observes a different value', async t => {
  const f = await fixture(t); f.state.failReadAfterPublish = true;
  const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
  assert.equal(result.published, true); assert.equal(result.verified, false); assert.equal(result.md5, null); assert.ok(result.verificationError); assert.equal(f.state.writes, 1);
  f.state.failReadAfterPublish = false; f.state.mismatchReadAfterPublish = true; f.state.content = original;
  const second = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
  assert.equal(second.published, true); assert.equal(second.verified, false); assert.equal(second.verificationError?.code, 'nacos_verification_mismatch'); assert.equal(f.state.writes, 2);
});
test('Nacos unknown write responses require observation and are never blindly retried', async t => {
  const f = await fixture(t); f.state.publishUnknown = true;
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_publish_outcome_unknown' });
  assert.equal(f.state.writes, 1); assert.equal(f.state.content, candidate);
});
test('Nacos missing metadata and unconfirmed types block publication while preserving read access', async t => {
  const f = await fixture(t, 'v1');
  f.state.override = (request, response) => { if (request.query.get('show') !== 'all') return false; response.writeHead(404); response.end(); return true; };
  assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original);
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_metadata_unavailable' });
  f.state.override = (request, response) => {
    if (request.query.get('dataId') !== longId) return false;
    if (request.query.get('show') === 'all') response.end(JSON.stringify({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: original, md5: md5(original), type: 'custom-type' }));
    else { response.setHeader('Content-MD5', md5(original)); response.setHeader('Config-Type', 'custom-type'); response.end(original); }
    return true;
  };
  assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).type, 'custom-type');
  await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_type_unsupported' }); assert.equal(f.state.writes, 0);
});
test('Nacos does not accept response identities outside the selected namespace', async t => {
  const f = await fixture(t);
  f.state.override = (request, response) => {
    if (request.query.get('dataId') !== longId) return false;
    response.end(JSON.stringify({ code: 0, data: { namespaceId: 'another-namespace', groupName: 'DEFAULT_GROUP', dataId: longId, content: original, md5: md5(original), type: 'yaml' } })); return true;
  };
  await assert.rejects(() => f.provider.nacos.get(f.config, f.credentials, { dataId: longId }), { code: 'nacos_scope_mismatch' }); assert.equal(f.state.writes, 0);
});
test('Nacos authoritative missing-config responses do not silently fall through to another API', async t => {
  const f = await fixture(t); f.state.missing = true;
  await assert.rejects(() => f.provider.nacos.get({ ...f.config, apiVersion: 'auto' }, f.credentials, { dataId: longId }), { code: 'nacos_config_missing' });
  assert.equal(f.state.requests.filter(request => request.query.get('dataId') === longId).length, 1);
});
test('Nacos refuses oversized, incomplete and invalid UTF-8 responses without truncating successful data', async t => {
  const f = await fixture(t), small = createNacosProvider({ maxResponseBytes: 1024 });
  f.state.content = '内容'.repeat(1000);
  await assert.rejects(() => small.nacos.get(f.config, f.credentials, { dataId: longId }), { code: 'nacos_response_too_large' });
  f.state.override = (request, response) => { if (request.query.get('dataId') !== longId) return false; response.end(Buffer.from([0xc3, 0x28])); return true; };
  await assert.rejects(() => f.provider.nacos.get(f.config, f.credentials, { dataId: longId }), { code: 'nacos_response_invalid' });
  f.state.override = (request, response) => { if (!request.query.has('search')) return false; response.end(JSON.stringify({ code: 0, data: { totalCount: 100, pageNumber: 1, pageItems: [] } })); return true; };
  await assert.rejects(() => f.provider.nacos.configs(f.config, f.credentials, {}), { code: 'nacos_response_invalid' });
});
test('Nacos timeout ends one request and sanitizes its diagnostic', async t => {
  const f = await fixture(t), short = createNacosProvider({ timeoutMs: 30 });
  f.state.override = () => true;
  await assert.rejects(() => short.nacos.get(f.config, f.credentials, { dataId: longId }), error => (error as { code: string }).code === 'nacos_timeout' && !String(error).includes(f.credentials.password));
  assert.equal(f.state.requests.length, 1);
});
