import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const skillRoot = new URL('../../resources/workspace/skills/connections/nacos-connection/', import.meta.url);
const { createNacosProvider } = await import(new URL('scripts/lib/operations.mjs', skillRoot).href);
const { createNacosWorkflow, compareContents } = await import(new URL('scripts/lib/workflow.mjs', skillRoot).href);
const { createOutputProtection } = await import(new URL('scripts/lib/output.mjs', skillRoot).href);
const { nacosApiBase, nacosConfiguration } = await import(new URL('scripts/lib/configuration.mjs', skillRoot).href);
type NacosApiVersion = 'v1' | 'v2' | 'v3';

const md5 = (value: string) => crypto.createHash('md5').update(value, 'utf8').digest('hex');
const longId = '完整配置名-' + 'a'.repeat(180) + '.yaml';
const original = '\uFEFF中文: "保留空白"\r\n\r\n  list: [1, 2]\r\n';
const candidate = '\uFEFF中文: "修改之后"\r\n\r\n  list: [1, 2, 3]\r\n';
type Request = { pathname: string; query: URLSearchParams; form: URLSearchParams; headers: http.IncomingHttpHeaders };
async function fixture(t: { after(action: () => Promise<void>): void }, apiVersion: NacosApiVersion = 'v3', dataId = longId) {
  const state = { content: original, version: apiVersion === 'v3' ? '3.1.1' : '2.4.3', tokenCount: 0, writes: 0, failReadAfterPublish: false, mismatchReadAfterPublish: false, failFirstRead: false, publishUnknown: false, race: false, missing: false, pageSize: 20, totalCount: 42, requests: [] as Request[], override: null as ((request: Request, response: http.ServerResponse) => boolean | Promise<boolean>) | null };
  const metadata: { type: string; appName: string | null; desc: string | null; configTags: string | null; use: string | null; effect: string | null; schema: string | null } = { type: 'yaml', appName: '订单系统', desc: '完整说明', configTags: 'sales,qa', use: '配置用途', effect: '配置效果', schema: '自定义格式' };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://127.0.0.1');
    let body = ''; for await (const chunk of request) body += chunk.toString('utf8');
    const current: Request = { pathname: url.pathname.replace('/gateway/nacos', ''), query: url.searchParams, form: new URLSearchParams(body), headers: request.headers };
    state.requests.push(current);
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json;charset=UTF-8' }); response.end(JSON.stringify(value, (_key, item) => item === null ? undefined : item)); };
    if (await state.override?.(current, response)) return;
    if (current.pathname.endsWith('/login')) {
      if (current.pathname.startsWith('/v3/') && apiVersion !== 'v3') { json({ status: 404 }, 404); return; }
      assert.equal(current.form.get('username'), 'reader'); assert.equal(current.form.get('password'), 'only-fixture-secret');
      state.tokenCount++; json({ accessToken: 'fixture-token-' + state.tokenCount, tokenTtl: 300 }); return;
    }
    if (current.pathname.endsWith('/state')) { json(current.pathname.startsWith('/v3/') ? { code: 0, data: { version: state.version || undefined } } : { version: state.version || undefined }); return; }
    if (!current.headers.authorization) { json({ code: 10001 }, 403); return; }
    const prefix = '/' + apiVersion + '/';
    const legacyManagement = apiVersion !== 'v1' && current.pathname === '/v1/cs/configs' && current.query.get('show') === 'all';
    if (!current.pathname.startsWith(prefix) && !legacyManagement) { json({ status: 404 }, 404); return; }
    if (current.pathname.includes('/namespace')) { json({ code: apiVersion === 'v1' ? 200 : 0, data: [{ namespace: apiVersion === 'v1' ? '' : 'public', namespaceShowName: 'public', configCount: 42 }] }); return; }
    if (request.method === 'GET' && (current.pathname.endsWith('/list') || current.pathname.endsWith('/searchDetail') || current.query.has('search'))) {
      const pageNo = Number(current.query.get('pageNo')), pageSize = Number(current.query.get('pageSize')); state.pageSize = pageSize;
      const page = { totalCount: state.totalCount, pageNumber: pageNo, pagesAvailable: Math.ceil(state.totalCount / pageSize), pageItems: [{ dataId, group: 'DEFAULT_GROUP', tenant: apiVersion === 'v1' ? '' : 'public', type: 'yaml', md5: md5(state.content) }] };
      json(apiVersion === 'v3' ? { code: 0, data: page } : page); return;
    }
    if (request.method === 'GET') {
      if (state.failFirstRead) { state.failFirstRead = false; json({ code: 401, message: 'expired' }, 401); return; }
      if (state.missing) { json({ code: 20004, message: 'config not exist' }, 404); return; }
      if (state.failReadAfterPublish && state.writes) { json({ code: 503 }, 503); return; }
      const content = state.mismatchReadAfterPublish && state.writes ? original : state.content;
      response.setHeader('Content-MD5', md5(content)); response.setHeader('Config-Type', 'yaml');
      if (current.query.get('show') === 'all') json({ dataId, group: 'DEFAULT_GROUP', tenant: '', content, md5: md5(content), createTime: 1, modifyTime: 2, ...metadata });
      else if (apiVersion === 'v3') { const { use, effect, schema, ...v3Metadata } = metadata; json({ code: 0, data: { namespaceId: 'public', dataId, groupName: 'DEFAULT_GROUP', content, md5: md5(content), ...v3Metadata } }); }
      else if (apiVersion === 'v2') json({ code: 0, data: content });
      else response.end(content);
      return;
    }
    if (request.method === 'POST') {
      state.writes++;
      if (state.race) state.content = '其他入口最新内容\n';
      if (current.headers.casmd5 && current.headers.casmd5 !== md5(state.content)) { json({ code: 20005, message: 'Cas publish fail, server md5 may have changed.' }, 500); return; }
      state.content = current.form.get('content')!;
      for (const key of ['appName', 'desc', 'configTags', 'use', 'effect', 'schema'] as const) metadata[key] = current.form.get(key === 'configTags' && apiVersion === 'v1' ? 'config_tags' : key);
      metadata.type = current.form.get('type')!;
      if (state.publishUnknown) { response.end('not a supported result'); return; }
      if (apiVersion === 'v1') response.end('true'); else json({ code: 0, data: true });
      return;
    }
    json({ status: 404 }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address() as { port: number };
  const config = nacosConfiguration({ apiBaseUrl: `http://127.0.0.1:${address.port}/gateway/nacos/`, consoleUrl: 'http://console.example.invalid:8080/next/#/', username: 'reader', production: false, apiVersion });
  const credentials = { password: 'only-fixture-secret' }, provider = createNacosProvider();
  return { state, config, credentials, provider, metadata };
}

test('Nacos configuration separates the exact API base and optional website without inferring ports or paths', () => {
  const provider = createNacosProvider(), config = nacosConfiguration({ apiBaseUrl: 'https://api.example.invalid:8848/proxy/nacos/', consoleUrl: 'https://console.example.invalid:8080/next/#/', username: 'reader' });
  assert.equal(config.production, true); assert.equal(config.namespaceId, 'public'); assert.equal(config.defaultGroup, 'DEFAULT_GROUP'); assert.equal(config.apiVersion, 'auto');
  assert.equal(config.apiBaseUrl, 'https://api.example.invalid:8848/proxy/nacos'); assert.equal(config.consoleUrl, 'https://console.example.invalid:8080/next/#/');
  assert.equal(nacosApiBase('https://api.example.invalid/'), 'https://api.example.invalid');
  assert.equal(provider.authenticationTargetIdentity(config), provider.authenticationTargetIdentity({ ...config, consoleUrl: 'https://another-console.example.invalid:8080/' }));
  assert.notEqual(provider.authenticationTargetIdentity(config), provider.authenticationTargetIdentity({ ...config, apiBaseUrl: 'https://different-api.example.invalid/' }));
  assert.equal(nacosConfiguration({ apiBaseUrl: 'https://api.example.invalid/', username: 'reader' }).consoleUrl, undefined);
  for (const apiBaseUrl of ['file:///nacos', 'https://secret:password@api.example.invalid/nacos/', 'https://api.example.invalid/nacos/?accessToken=secret', 'https://api.example.invalid/nacos/#/']) assert.throws(() => nacosConfiguration({ apiBaseUrl, username: 'reader' }), { code: 'nacos_url_invalid' });
  assert.throws(() => nacosConfiguration({ consoleUrl: 'https://console.example.invalid:8080/', username: 'reader' }), { code: 'nacos_input_invalid' });
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
    const expectedMetadata = { ...f.metadata };
    const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
    assert.deepEqual(f.metadata, expectedMetadata); assert.equal(result.metadataVerified, true); assert.equal(result.typeVerified, true);
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

test('Nacos only sends authentication and management traffic to the exact API base, including a root context', async () => {
  const requests: string[] = [];
  const provider = createNacosProvider({ fetch: async (url: URL) => {
    requests.push(url.href);
    if (url.pathname.endsWith('/login')) return Response.json({ accessToken: 'fixture-api-token', tokenTtl: 300 });
    return Response.json({ code: 0, data: { dataId: 'test', groupName: 'DEFAULT_GROUP', namespaceId: 'public', content: original, md5: md5(original), type: 'yaml' } });
  } });
  const config = nacosConfiguration({ apiBaseUrl: 'https://api.example.invalid:8848/', consoleUrl: 'https://console.example.invalid:8080/next/', username: 'reader', apiVersion: 'v3' });
  assert.equal((await provider.nacos.get(config, { password: 'fixture-password' }, { dataId: 'test' })).content, original);
  assert.deepEqual(requests.map(value => new URL(value).pathname), ['/v3/auth/user/login', '/v3/admin/cs/config']);
  assert.ok(requests.every(value => new URL(value).origin === 'https://api.example.invalid:8848'));
});

test('Nacos v3 requires the full management model while preserving its independent read route', async t => {
  for (const failure of ['missing-route', 'wrong-dto', 'incomplete-model'] as const) {
    const f = await fixture(t);
    f.state.override = (request, response) => {
      if (request.query.get('show') !== 'all') return false;
      if (failure === 'missing-route') { response.writeHead(404); response.end(); }
      else if (failure === 'wrong-dto') response.end(JSON.stringify({ code: 0, data: { dataId: longId, groupName: 'DEFAULT_GROUP', namespaceId: 'public', content: original, md5: md5(original), type: 'yaml' } }));
      else response.end(JSON.stringify({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: original, md5: md5(original), type: 'yaml', createTime: 1 }));
      return true;
    };
    const detail = await f.provider.nacos.get(f.config, f.credentials, { dataId: longId });
    assert.equal(detail.content, original); assert.equal(detail.metadata?.use, undefined, '真实 v3 DTO 不提供旧管理字段');
    await assert.rejects(() => f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) }), { code: 'nacos_metadata_unavailable' });
    assert.equal(f.state.writes, 0); assert.equal((await f.provider.nacos.get(f.config, f.credentials, { dataId: longId })).content, original);
  }
});

test('Nacos full management optional nulls may be explicit or omitted without inventing v3 metadata', async t => {
  for (const explicit of [false, true]) {
    const f = await fixture(t);
    for (const key of ['appName', 'desc', 'configTags', 'use', 'effect', 'schema'] as const) f.metadata[key] = null;
    if (explicit) f.state.override = (request, response) => {
      if (request.query.get('show') !== 'all') return false;
      response.end(JSON.stringify({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: f.state.content, md5: md5(f.state.content), createTime: 1, modifyTime: 2, ...f.metadata })); return true;
    };
    const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
    assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.metadataVerified, true);
    assert.ok(['appName', 'desc', 'configTags', 'use', 'effect', 'schema'].every(key => !f.state.requests.find(request => request.form.has('content'))!.form.has(key)));
  }
});

test('Nacos accepted publication reports a type or metadata readback mismatch separately from matching content', async t => {
  for (const changed of ['type', 'use'] as const) {
    const f = await fixture(t);
    f.state.override = (request, response) => {
      if (!f.state.writes || request.query.get('show') !== 'all') return false;
      response.end(JSON.stringify({ dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: f.state.content, md5: md5(f.state.content), createTime: 1, modifyTime: 2, ...f.metadata, [changed]: 'changed-by-another-entry' })); return true;
    };
    const result = await f.provider.nacos.publish(f.config, f.credentials, { dataId: longId, content: candidate, expectedMd5: md5(original) });
    assert.equal(result.published, true); assert.equal(result.verified, false); assert.equal(result.contentVerified, true);
    assert.equal(result.typeVerified, changed !== 'type'); assert.equal(result.metadataVerified, changed !== 'use');
    assert.equal(result.verificationError?.code, 'nacos_verification_mismatch'); assert.equal(f.state.writes, 1);
  }
});
test('Nacos auto rejects malformed successful login responses without trying another authentication API', async t => {
  const f = await fixture(t);
  for (const body of ['<html>gateway login only-fixture-secret</html>', '{incomplete-json', '[]', '{"code":0,"data":{}}']) {
    f.state.requests.length = 0;
    f.state.override = (request, response) => {
      if (request.pathname !== '/v3/auth/user/login') return false;
      response.writeHead(200); response.end(body); return true;
    };
    await assert.rejects(() => f.provider.nacos.get({ ...f.config, apiVersion: 'auto' }, f.credentials, { dataId: longId }), error => (error as { code: string }).code === 'nacos_auth_failed' && !String(error).includes(f.credentials.password));
    assert.deepEqual(f.state.requests.map(request => request.pathname), ['/v3/auth/user/login']);
    assert.equal(f.state.writes, 0);
  }
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
      assert.equal(fresh.query.get('dataId'), longId); assert.equal(fresh.pathname, '/v1/cs/configs');
      assert.equal(fresh.query.get('show'), 'all', '写入前最后请求应读完整管理详情，不能使用正文DTO或运行时缓存');
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
      const management = request.query.get('dataId') === longId && !request.form.has('content') && request.query.get('show') === 'all';
      if (!management || ++managementReads !== 2) return false;
      if (change === 'content') f.state.content = '\uFEFF其他入口最新配置\r\n'; else f.metadata.type = 'json';
      const detail = { dataId: longId, group: 'DEFAULT_GROUP', tenant: '', content: f.state.content, md5: md5(f.state.content), createTime: 1, modifyTime: 2, ...f.metadata };
      response.end(JSON.stringify(detail)); return true;
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

function temporaryState(t: { after(action: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-nacos-skill-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function workflowContext(f: Awaited<ReturnType<typeof fixture>>, directory: string, production = false) {
  const { username, ...config } = f.config;
  return { protocolVersion: 'buildr.connection-context/v1', callId: crypto.randomUUID(), workspace: { id: crypto.randomUUID(), root: directory }, definition: { skillAssetIdentity: 'fixture:nacos', definitionId: 'nacos', revision: 'definition-observation' }, connections: { primary: { id: 'connection-' + crypto.randomUUID(), revision: 'opaque-observed-revision', config: { ...config, production }, authentication: { source: 'personal', values: { username, password: f.credentials.password } }, authenticationRevision: 'opaque-local-observation' } }, privateStateRoot: directory };
}
function runClient(args: string[], context?: unknown, input = '', revalidation?: () => boolean, entryFile = fileURLToPath(new URL('scripts/nacos-client.mjs', skillRoot))): Promise<{ code: number | null; stdout: string; stderr: string; requests: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(entryFile, args, { execArgv: [], stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    let stdout = '', stderr = '', requests = 0;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('fixture child deadline')); }, 15_000);
    child.stdout!.on('data', chunk => { stdout += chunk; }); child.stderr!.on('data', chunk => { stderr += chunk; });
    child.stdin!.on('error', () => {});
    child.on('message', raw => {
      const message = raw as { type: string; requestId: string };
      if (message.type === 'buildr.connection-revalidate') {
        requests++;
        child.send({ type: 'buildr.connection-revalidated', requestId: message.requestId, ok: revalidation?.() ?? true, error: { code: 'fixture_context_changed', message: '本机观察已变化。' } });
      }
    });
    child.on('spawn', () => { if (context) child.send({ type: 'buildr.connection-context', context }); child.stdin!.end(input); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, requests }); });
  });
}

test('standalone Nacos CLI help/version exit without context and requires private context for operations', async () => {
  const help = await runClient(['--help']);
  assert.equal(help.code, 0); assert.ok(JSON.parse(help.stdout).help.length); assert.equal(help.requests, 0);
  const version = await runClient(['--version']); assert.equal(version.code, 0); assert.equal(JSON.parse(version.stdout).version, '2.0.0');
});

test('standalone Nacos workflow preserves complete raw artifacts while ordinary output hides auth and tokens', async t => {
  const f = await fixture(t), directory = temporaryState(t), context = workflowContext(f, directory);
  f.state.content = original + 'password=' + f.credentials.password + '\nAuthorization: Bearer fixture-token-1\n';
  const workflow = createNacosWorkflow(context);
  const result = await workflow.get({ dataId: longId });
  assert.equal(fs.readFileSync(result.outputFile, 'utf8'), f.state.content);
  assert.equal(fs.statSync(result.outputFile).mode & 0o077, 0);
  assert.equal(result.contentSha256, 'sha256-' + crypto.createHash('sha256').update(f.state.content).digest('hex'));
  assert.equal(Object.hasOwn(result, 'content'), false);
  const difference = await workflow.diff({ dataId: longId, content: 'replacement\n' });
  const output = JSON.stringify(workflow.protection.visit(difference));
  assert.ok(!output.includes(f.credentials.password)); assert.ok(!output.includes('fixture-token-1'));
  assert.equal(difference.beforeSha256, result.contentSha256);
  const occupied = path.join(directory, 'occupied.yml'); fs.writeFileSync(occupied, 'previous');
  await assert.rejects(() => workflow.get({ dataId: longId }, occupied), { code: 'nacos_cli_output_invalid' });
  assert.equal(fs.readFileSync(occupied, 'utf8'), 'previous');
});

test('standalone Nacos diff uses separately injected credentials and refuses implicit comparison targets', async t => {
  const first = await fixture(t), second = await fixture(t), directory = temporaryState(t);
  second.state.content = candidate;
  second.state.override = (request, response) => {
    if (!request.pathname.endsWith('/login')) return false;
    assert.equal(request.form.get('username'), 'second-reader'); assert.equal(request.form.get('password'), 'separate-second-password');
    response.end(JSON.stringify({ accessToken: 'separate-second-token', tokenTtl: 300 })); return true;
  };
  const context: any = workflowContext(first, directory), compared = workflowContext(second, directory).connections.primary;
  compared.authentication.values = { username: 'second-reader', password: 'separate-second-password' };
  context.connections.compare = compared;
  const workflow = createNacosWorkflow(context);
  const result = await workflow.diff({ dataId: longId, compareContext: 'compare' });
  assert.equal(result.comparisonTarget.connectionId, compared.id); assert.equal(result.equal, false);
  assert.equal(first.state.writes + second.state.writes, 0);
  await assert.rejects(() => workflow.diff({ dataId: longId, compareContext: 'display-name' }), { code: 'nacos_comparison_invalid' });
  await assert.rejects(() => workflow.diff({ dataId: longId, content: candidate, compareContext: 'compare' }), { code: 'nacos_comparison_invalid' });
});

test('standalone Nacos production scope binds type, version and full content; single-use evidence is private', async t => {
  const f = await fixture(t), directory = temporaryState(t), context = workflowContext(f, directory, true);
  let checks = 0;
  const workflow = createNacosWorkflow(context, { revalidate: async () => { checks++; } });
  const difference = await workflow.diff({ dataId: longId, content: candidate });
  const evidence = { source: 'fixture:user-turn-1', statement: '批准本次指定目标及完整差异', scope: difference.authorizationScope };
  const input = { dataId: longId, content: candidate, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original) };
  await assert.rejects(() => workflow.publish(input), { code: 'nacos_production_authorization_required' });
  await assert.rejects(() => workflow.publish({ ...input, authorization: { ...evidence, scope: { ...evidence.scope, type: 'json' } } }), { code: 'nacos_production_authorization_mismatch' });
  await assert.rejects(() => workflow.publish({ ...input, expectedRevision: 'stale', authorization: evidence }), { code: 'connection_revision_conflict' });
  assert.equal(f.state.writes, 0);
  const result = await workflow.publish({ ...input, authorization: evidence });
  assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.serviceReloaded, false); assert.equal(checks, 1);
  const records = fs.readdirSync(path.join(directory, 'publication-authorizations'));
  assert.equal(records.length, 1);
  const record = fs.readFileSync(path.join(directory, 'publication-authorizations', records[0]!), 'utf8');
  assert.ok(!record.includes(evidence.source)); assert.ok(!record.includes(evidence.statement)); assert.ok(!record.includes(candidate));
  f.state.content = original;
  await assert.rejects(() => workflow.publish({ ...input, authorization: evidence }), { code: 'nacos_production_authorization_used' });
  assert.equal(f.state.writes, 1);
});

test('standalone Nacos defaults production true and unchanged content does not consume authorization', async t => {
  const f = await fixture(t), directory = temporaryState(t), context: any = workflowContext(f, directory);
  delete context.connections.primary.config.production;
  const workflow = createNacosWorkflow(context, { revalidate: async () => {} });
  const unchanged = await workflow.publish({ dataId: longId, content: original, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original) });
  assert.equal(unchanged.unchanged, true); assert.equal(unchanged.published, false);
  assert.equal(fs.existsSync(path.join(directory, 'publication-authorizations')), false);
  await assert.rejects(() => workflow.publish({ dataId: longId, content: candidate, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original) }), { code: 'nacos_production_authorization_required' });
  assert.equal(f.state.writes, 0);
});

test('standalone Nacos final local revalidation failure prevents writes and does not consume production evidence', async t => {
  const f = await fixture(t), directory = temporaryState(t), context = workflowContext(f, directory, true);
  const workflow = createNacosWorkflow(context, { revalidate: async () => { throw Object.assign(new Error('changed'), { code: 'fixture_context_changed' }); } });
  const diff = await workflow.diff({ dataId: longId, content: candidate });
  const evidence = { source: 'fixture:turn', statement: '批准指定发布', scope: diff.authorizationScope };
  await assert.rejects(() => workflow.publish({ dataId: longId, content: candidate, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original), authorization: evidence }), { code: 'fixture_context_changed' });
  assert.equal(f.state.writes, 0); assert.equal(fs.existsSync(path.join(directory, 'publication-authorizations')), false);
});

test('standalone Nacos publish transport timeout is unknown and evidence stays consumed without repeating', async t => {
  const f = await fixture(t), directory = temporaryState(t), context = workflowContext(f, directory, true);
  const workflow = createNacosWorkflow(context, { http: { timeoutMs: 50 }, revalidate: async () => {} });
  const difference = await workflow.diff({ dataId: longId, content: candidate });
  const evidence = { source: 'fixture:timeout-turn', statement: '授权一次此发布', scope: difference.authorizationScope };
  f.state.override = request => { if (!request.form.has('content')) return false; f.state.writes++; return true; };
  const input = { dataId: longId, content: candidate, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original), authorization: evidence };
  await assert.rejects(() => workflow.publish(input), { code: 'nacos_publish_outcome_unknown' });
  assert.equal(f.state.writes, 1);
  await assert.rejects(() => workflow.publish(input), { code: 'nacos_production_authorization_used' });
  assert.equal(f.state.writes, 1);
});

test('standalone Nacos accepted publish keeps layered facts when readback fails', async t => {
  const f = await fixture(t), context = workflowContext(f, temporaryState(t)); f.state.failReadAfterPublish = true;
  const workflow = createNacosWorkflow(context, { revalidate: async () => {} });
  const result = await workflow.publish({ dataId: longId, content: candidate, expectedRevision: context.connections.primary.revision, expectedMd5: md5(original) });
  assert.equal(result.submitted, true); assert.equal(result.published, true); assert.equal(result.verified, false); assert.equal(result.serviceReloaded, false); assert.ok(result.verificationError); assert.equal(f.state.writes, 1);
});

test('standalone Nacos IPC preserves business stdin and write-before-revalidate, including conflict', async t => {
  const f = await fixture(t), context = workflowContext(f, temporaryState(t));
  const read = await runClient(['get', '--data-id', longId, '--json'], context);
  assert.equal(read.code, 0); assert.equal(read.requests, 0); assert.equal(fs.readFileSync(JSON.parse(read.stdout).outputFile, 'utf8'), original);
  const diff = await runClient(['diff', '--data-id', longId, '--content-file', '-'], context, candidate);
  assert.equal(diff.code, 0); assert.equal(JSON.parse(diff.stdout).afterSha256, 'sha256-' + crypto.createHash('sha256').update(candidate).digest('hex'));
  const args = ['publish', '--data-id', longId, '--content-file', '-', '--expected-revision', context.connections.primary.revision, '--expected-md5', md5(original)];
  const stopped = await runClient(args, context, candidate, () => false);
  assert.equal(stopped.code, 1); assert.equal(JSON.parse(stopped.stdout).error.code, 'fixture_context_changed'); assert.equal(stopped.requests, 1); assert.equal(f.state.writes, 0);
  const written = await runClient(args, context, candidate, () => true);
  assert.equal(written.code, 0); assert.equal(written.requests, 1); assert.equal(f.state.content, candidate);
  assert.equal(written.stderr, ''); assert.ok(!written.stdout.includes(f.credentials.password));
});

test('standalone Nacos hooks report verified read scope and options without writes', async t => {
  const f = await fixture(t), context = workflowContext(f, temporaryState(t));
  const tested = await runClient(['test', '--json'], context);
  const body = JSON.parse(tested.stdout); assert.equal(tested.code, 0); assert.equal(body.status, 'success'); assert.deepEqual(body.checks, ['login', 'namespace-visible', 'bounded-config-read']); assert.ok(body.limitations.length);
  const discovered = await runClient(['namespaces', '--json'], context);
  assert.equal(discovered.code, 0); assert.deepEqual(JSON.parse(discovered.stdout).options, [{ value: 'public', label: 'public' }]); assert.equal(f.state.writes, 0);
});

test('standalone Nacos hooks preserve fixed control values and refuse secret-colliding option identities', async t => {
  for (const password of ['s', 'public']) {
    const f = await fixture(t), directory = temporaryState(t); f.credentials.password = password;
    f.state.override = (request, response) => {
      if (!request.pathname.endsWith('/login')) return false;
      response.end(JSON.stringify({ accessToken: 'fixture-login-token', tokenTtl: 300 })); return true;
    };
    const context = workflowContext(f, directory), tested = await runClient(['test', '--json'], context);
    assert.equal(tested.code, 0); assert.equal(JSON.parse(tested.stdout).status, 'success'); assert.equal(JSON.parse(tested.stdout).schemaVersion, 'nacos.connection-result/v1');
    const resultFile = path.join(directory, 'namespaces.json'), discovered = await runClient(['namespaces', '--json', '--result-file', resultFile], context), body = JSON.parse(discovered.stdout);
    if (password === 'public') {
      assert.equal(discovered.code, 1); assert.equal(body.status, 'failure'); assert.equal(body.error.code, 'nacos_discovery_identifier_hidden'); assert.equal(body.options, undefined); assert.equal(body.namespaces, undefined);
      assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).options[0].value, 'public', '受限私有结果保留真实读取事实');
    } else { assert.equal(discovered.code, 0); assert.equal(body.status, 'success'); assert.equal(body.options[0].value, 'public'); }
    assert.equal(f.state.writes, 0);
  }
});

test('standalone Nacos CLI rejects double stdin before context or remote requests', async t => {
  const f = await fixture(t);
  const result = await runClient(['publish', '--data-id', longId, '--content-file', '-', '--authorization-file', '-', '--expected-revision', 'observed', '--expected-md5', md5(original)]);
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.stdout).error.code, 'nacos_cli_invalid'); assert.equal(f.state.requests.length, 0);
});

test('standalone Nacos comparison limits display but hashes complete content and rejects mixed credential groups', async t => {
  const before = 'old\n'.repeat(1000), after = 'new\n'.repeat(1000), result = compareContents(before, after);
  assert.equal(result.diff.truncated, true); assert.ok(result.diff.lines.length <= 200);
  assert.equal(result.afterSha256, 'sha256-' + crypto.createHash('sha256').update(after).digest('hex'));
  const f = await fixture(t), context: any = workflowContext(f, temporaryState(t)); delete context.connections.primary.authentication.values.username;
  assert.throws(() => createNacosWorkflow(context), { code: 'nacos_credentials_missing' }); assert.equal(f.state.requests.length, 0);
  const protection = createOutputProtection(new Set(['secret-[REDACTED]', 'fixture-session-token']));
  assert.ok(!protection.text('secret-[REDACTED] fixture-session-token').includes('secret-'));
});

test('standalone Nacos delivered folder runs from a copied source without Buildr internal modules or dependencies', async t => {
  const f = await fixture(t), directory = temporaryState(t), copied = path.join(directory, 'delivered-nacos');
  fs.cpSync(fileURLToPath(skillRoot), copied, { recursive: true });
  const entry = path.join(copied, 'scripts', 'nacos-client.mjs');
  const help = await runClient(['--help'], undefined, '', undefined, entry);
  assert.equal(help.code, 0); assert.ok(JSON.parse(help.stdout).help.length);
  const read = await runClient(['namespaces', '--json'], workflowContext(f, directory), '', undefined, entry);
  assert.equal(read.code, 0); assert.equal(JSON.parse(read.stdout).status, 'success'); assert.equal(f.state.writes, 0);
});

test('standalone Nacos private results preserve overlapping secret identities, authorization scope and raw artifact paths', async t => {
  const f = await fixture(t, 'v3', 'nacos.yaml'), directory = path.join(temporaryState(t), 'nacos-private'); fs.mkdirSync(directory);
  f.credentials.password = 'nacos';
  f.state.override = (request, response) => {
    if (!request.pathname.endsWith('/login')) return false;
    assert.equal(request.form.get('password'), 'nacos'); response.end(JSON.stringify({ accessToken: 'fixture-login-token', tokenTtl: 300 })); return true;
  };
  const context = workflowContext(f, directory, true); context.connections.primary.id = 'nacos-fixture';
  const getFile = path.join(directory, 'get-result.json');
  const read = await runClient(['get', '--data-id', 'nacos.yaml', '--result-file', getFile], context);
  const shown = JSON.parse(read.stdout), exact = JSON.parse(fs.readFileSync(getFile, 'utf8'));
  assert.equal(read.code, 0); assert.equal(shown.displayOnly, true); assert.equal(shown.privateResultWritten, true);
  assert.equal(exact.target.dataId, 'nacos.yaml'); assert.equal(fs.readFileSync(exact.outputFile, 'utf8'), original);
  assert.notEqual(shown.outputFile, exact.outputFile); assert.equal(fs.statSync(getFile).mode & 0o777, 0o600);
  const diffFile = path.join(directory, 'diff-result.json');
  const diff = await runClient(['diff', '--data-id', 'nacos.yaml', '--content-file', '-', '--result-file', diffFile], context, candidate);
  const exactDiff = JSON.parse(fs.readFileSync(diffFile, 'utf8'));
  assert.equal(diff.code, 0); assert.equal(exactDiff.authorizationScope.dataId, 'nacos.yaml'); assert.equal(JSON.parse(diff.stdout).authorizationScope.dataId, '[REDACTED].yaml');
  const authorizationFile = path.join(directory, 'authorization.json');
  fs.writeFileSync(authorizationFile, JSON.stringify({ source: 'fixture:user-turn-1', statement: '批准当前差异的单次发布', scope: exactDiff.authorizationScope }), { mode: 0o600 });
  const written = await runClient(['publish', '--data-id', 'nacos.yaml', '--content-file', '-', '--expected-revision', exactDiff.expectedRevision, '--expected-md5', exactDiff.expectedMd5, '--authorization-file', authorizationFile], context, candidate);
  assert.equal(written.code, 0); assert.equal(JSON.parse(written.stdout).published, true); assert.equal(f.state.writes, 1);
});

test('standalone Nacos reserves private results before networking and never overwrites files or symlinks', async t => {
  const f = await fixture(t), directory = temporaryState(t), context = workflowContext(f, directory), occupied = path.join(directory, 'occupied.json');
  fs.writeFileSync(occupied, 'previous', { mode: 0o600 }); const link = path.join(directory, 'link.json'); fs.symlinkSync(occupied, link);
  for (const filename of [occupied, link, path.join(directory, 'missing-parent', 'result.json')]) {
    const read = await runClient(['get', '--data-id', longId, '--result-file', filename], context);
    assert.equal(read.code, 1); assert.equal(JSON.parse(read.stdout).error.code, 'nacos_result_file_invalid'); assert.equal(f.state.requests.length, 0);
  }
  assert.equal(fs.readFileSync(occupied, 'utf8'), 'previous');
});

test('standalone Nacos writes exact failure results into the reserved private file', async t => {
  const f = await fixture(t), directory = temporaryState(t), resultFile = path.join(directory, 'failure.json'); f.state.missing = true;
  const read = await runClient(['get', '--data-id', longId, '--result-file', resultFile], workflowContext(f, directory));
  assert.equal(read.code, 1); assert.equal(JSON.parse(read.stdout).privateResultWritten, true);
  assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).error.code, 'nacos_config_missing');
});

test('standalone Nacos retains accepted publication facts when the reserved private result is replaced', async t => {
  const f = await fixture(t), directory = temporaryState(t), resultFile = path.join(directory, 'result.json'), context = workflowContext(f, directory);
  f.state.override = request => {
    if (request.form.has('content')) { fs.rmSync(resultFile); fs.mkdirSync(resultFile); }
    return false;
  };
  const written = await runClient(['publish', '--data-id', longId, '--content-file', '-', '--expected-revision', context.connections.primary.revision, '--expected-md5', md5(original), '--result-file', resultFile], context, candidate);
  const result = JSON.parse(written.stdout);
  assert.equal(written.code, 0); assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.privateResultWritten, false);
  assert.equal(result.privateResultError.code, 'nacos_result_file_write_failed'); assert.equal(f.state.writes, 1); assert.equal(f.state.content, candidate);
});
