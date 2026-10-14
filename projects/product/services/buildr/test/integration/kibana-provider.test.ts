import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { kibanaConfiguration } from '../../src/modules/connections/domain/kibana-connection.ts';
import { createKibanaProvider, sanitizeKibanaOutput } from '../../src/modules/connections/infrastructure/kibana-provider.ts';

const now = () => new Date('2026-10-14T08:00:00.000Z');
const credentials = { password: 'fixture-kibana-password' };
const dataViewId = 'logs/测试';
const authHeader = 'Basic ' + Buffer.from('reader:' + credentials.password).toString('base64');
type Request = { pathname: string; method: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> | null };

function field(name: string, esTypes: string[], type = esTypes.includes('text') ? 'string' : esTypes[0]) {
  return { name, type, esTypes, searchable: true, aggregatable: !esTypes.includes('text'), scripted: false, readFromDocValues: !esTypes.includes('text') };
}
function view() {
  return {
    id: dataViewId, name: '测试日志', title: 'logs-fixture-*', timeFieldName: '@timestamp',
    fields: [field('@timestamp', ['date_nanos'], 'date'), field('message', ['text']), field('message.keyword', ['keyword']),
      field('kubernetes.deployment.name', ['text']), field('kubernetes.deployment.name.keyword', ['keyword']),
      field('kubernetes.namespace', ['keyword']), field('trace.id', ['keyword']), field('log.level', ['keyword'])],
    sourceFilters: [] as { value: string }[], runtimeFieldMap: {},
  };
}
function wrapper(hits: unknown[] = []) {
  return { rawResponse: { took: 1, timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 }, hits: { hits } }, isRunning: false, isPartial: false };
}
async function fixture(t: { after(action: () => Promise<void>): void }) {
  const state = { view: view(), result: wrapper(), requests: [] as Request[], statusFailure: false,
    override: null as ((request: Request, response: http.ServerResponse) => boolean | Promise<boolean>) | null };
  const server = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk.toString('utf8');
    const current: Request = { pathname: new URL(request.url!, 'http://localhost').pathname, method: request.method!, headers: request.headers, body: body ? JSON.parse(body) : null };
    state.requests.push(current);
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json;charset=UTF-8' }); response.end(JSON.stringify(value)); };
    if (await state.override?.(current, response)) return;
    assert.equal(current.headers.authorization, authHeader);
    assert.ok(current.pathname.startsWith('/gateway/kibana/s/test-space/'));
    if (current.pathname.endsWith('/api/status')) { json(state.statusFailure ? { error: 'status denied' } : { version: { number: '8.5.1' } }, state.statusFailure ? 403 : 200); return; }
    if (current.pathname.endsWith('/api/data_views')) { json({ data_view: [{ id: 'z-logs', name: '其他日志', title: 'other-*' }, { id: dataViewId, name: '测试日志', title: state.view.title }] }); return; }
    if (current.pathname.includes('/api/data_views/data_view/')) { json({ data_view: state.view }); return; }
    if (current.pathname.endsWith('/internal/search/es')) { json(state.result); return; }
    json({ error: 'unexpected fixture route' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address() as { port: number };
  const config = kibanaConfiguration({ consoleUrl: `http://127.0.0.1:${address.port}/gateway/kibana/s/test-space/app/discover?discard=secret#old-query`, username: 'reader', dataViewId });
  const provider = createKibanaProvider({ now });
  return { state, config, provider, api: provider.kibana! };
}

test('Kibana connection test verifies a fixed synchronous search without retrieving documents', async t => {
  const f = await fixture(t);
  const result = await f.provider.test(f.config, credentials);
  assert.equal(result.ok, true);
  const request = f.state.requests.find(item => item.pathname.endsWith('/internal/search/es'))!;
  assert.equal(request.method, 'POST'); assert.equal(request.headers['kbn-xsrf'], 'true');
  assert.match(String(request.headers['content-type']), /^application\/json/u);
  const params = request.body!.params as Record<string, unknown>;
  assert.deepEqual(Object.keys(params).sort(), ['body', 'index', 'timeout', 'track_total_hits']);
  assert.equal(params.index, 'logs-fixture-*'); assert.equal(params.timeout, '5s'); assert.equal(params.track_total_hits, false);
  const body = params.body as Record<string, unknown>;
  assert.equal(body.size, 0); assert.equal(body._source, false); assert.equal(body.fields, undefined);
  assert.deepEqual(Object.keys(request.body!), ['params']);
  assert.ok(f.state.requests.some(item => item.pathname.endsWith('/' + encodeURIComponent(dataViewId))));
});

test('Kibana version denial does not block independently verified queries', async t => {
  const f = await fixture(t); f.state.statusFailure = true;
  const result = await f.provider.test(f.config, credentials);
  assert.equal(result.ok, true); assert.equal(result.serverVersion, undefined);
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 1);
});

test('Kibana test rejects missing views and every incomplete execution state', async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.provider.test({ ...f.config, dataViewId: null }, credentials), { code: 'kibana_data_view_required' });
  assert.equal(f.state.requests.length, 0);
  for (const change of [
    { isRunning: true }, { isPartial: true },
    { rawResponse: { ...wrapper().rawResponse, timed_out: true } },
    { rawResponse: { ...wrapper().rawResponse, _shards: { total: 2, successful: 1, skipped: 0, failed: 1 } } },
    { rawResponse: { ...wrapper().rawResponse, _shards: { total: 2, successful: 1, skipped: 0, failed: 0 } } },
    { rawResponse: { ...wrapper().rawResponse, _shards: { total: 0, successful: 0, skipped: 0, failed: 0 } } },
  ]) {
    f.state.result = { ...wrapper(), ...change };
    await assert.rejects(() => f.provider.test(f.config, credentials), { code: /^kibana_/ });
  }
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'unexpected-document' }]);
  await assert.rejects(() => f.provider.test(f.config, credentials), { code: 'kibana_protocol_unsupported' });
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 7);
});

test('Kibana discovery sorts and filters bounded pages while keeping ordinary field metadata', async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.api.views(f.config, credentials, { dataViewId: 'unknown-input-key' } as never), { code: 'connection_input_invalid' });
  assert.equal(f.state.requests.length, 0);
  const views = await f.api.views(f.config, credentials, { name: '日志', limit: 1, offset: 0 });
  assert.equal(views.total, 2); assert.equal(views.dataViews.length, 1); assert.equal(views.dataViews[0].id, dataViewId); assert.equal(views.limitReached, true);
  const fields = await f.api.fields(f.config, credentials, { name: 'message', limit: 1, offset: 1 });
  assert.equal(fields.total, 2); assert.equal(fields.fields.length, 1); assert.equal(fields.fields[0].name, 'message.keyword');
  assert.deepEqual(fields.fields[0].esTypes, ['keyword']); assert.equal(fields.fields[0].aggregatable, true);
  await assert.rejects(() => f.api.views(f.config, credentials, { limit: 501 }), { code: /^kibana_/ });
});

test('Kibana search reads mapped multi-field arrays, nanosecond times and ignored-value facts', async t => {
  const f = await fixture(t);
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'document-1', fields: {
    '@timestamp': ['2026-10-14T07:59:59.123456789Z'], 'message.keyword': ['first value', 'second value'],
  }, ignored_field_values: { 'message.keyword': ['ignored oversized value'] }, _ignored: ['message.keyword'] }]);
  const result = await f.api.search(f.config, credentials, { fields: ['message.keyword', 'log.level'] });
  assert.equal(result.rows.length, 1); assert.deepEqual(result.rows[0].fields['message.keyword'], ['first value', 'second value']);
  assert.deepEqual(result.rows[0].timestamp, ['2026-10-14T07:59:59.123456789Z']);
  assert.ok(result.rows[0].ignoredFields.includes('message.keyword')); assert.ok(result.rows[0].missingFields.includes('log.level'));
  assert.equal(result.rows[0]._id, 'document-1'); assert.equal(result.rows[0]._index, 'logs-fixture-0001'); assert.equal(result.rows[0].documentIdentityAvailable, true);
  const request = f.state.requests.find(item => item.pathname.endsWith('/internal/search/es'))!;
  const body = (request.body!.params as { body: Record<string, unknown> }).body;
  assert.notEqual(body._source, true); assert.ok(!JSON.stringify(body).includes('"fields":["*"]'));
});

test('Kibana excluded message remains a matched document, and Unicode truncation reports separate limits', async t => {
  const f = await fixture(t);
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'document-1', _source: { message: '中😀more' }, fields: { '@timestamp': ['2026-10-14T07:59:59Z'], message: ['中😀more'] } }]);
  const truncated = await f.api.search(f.config, credentials, { limit: 1, messageBytes: 6 });
  assert.equal(truncated.rowCount, 1); assert.equal(truncated.limitReached, true); assert.equal(truncated.rows[0].messageTruncated, true);
  assert.equal(truncated.rows[0].message, '中'); assert.ok(truncated.rows[0].message!.isWellFormed()); assert.ok(Buffer.byteLength(truncated.rows[0].message!) <= 6);
  assert.deepEqual(truncated.rows[0].fields.message, ['中'], '映射字段不能绕过同一正文大小限制');
  assert.equal(truncated.incomplete, true);
  f.state.view.sourceFilters = [{ value: 'message' }];
  const excluded = await f.api.search(f.config, credentials, { contains: '中' });
  assert.equal(excluded.rowCount, 1); assert.equal(excluded.rows[0].message, null); assert.ok(excluded.rows[0].messageUnavailableReason);
  assert.ok(excluded.omittedFields.some(item => item.field === 'message'));
  await assert.rejects(() => f.api.search(f.config, credentials, { fields: ['message'] }), { code: /^kibana_/ });
});

test('Kibana search preserves partial hits and reports no target shards as a coverage limitation', async t => {
  const f = await fixture(t);
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'document-1', fields: { '@timestamp': ['2026-10-14T07:59:59Z'] } }]);
  f.state.result.isRunning = true; f.state.result.isPartial = true; f.state.result.rawResponse.timed_out = true;
  f.state.result.rawResponse._shards = { total: 2, successful: 1, skipped: 0, failed: 1 };
  const result = await f.api.search(f.config, credentials, {});
  assert.equal(result.rowCount, 1); assert.equal(result.incomplete, true);
  assert.equal(result.execution.isRunning, true); assert.equal(result.execution.isPartial, true); assert.equal(result.execution.timedOut, true); assert.equal(result.execution.shards.failed, 1);
  assert.ok(result.incompleteReasons.length >= 3);
  f.state.result = wrapper(); f.state.result.rawResponse._shards = { total: 0, successful: 0, skipped: 0, failed: 0 };
  const empty = await f.api.search(f.config, credentials, {});
  assert.equal(empty.rowCount, 0); assert.equal(empty.incomplete, true);
  assert.ok(empty.incompleteReasons.includes('no_target_shards') || empty.warnings.some(item => item.code === 'no_target_shards'));
  f.state.result = wrapper(); f.state.result.rawResponse._shards = { total: 2, successful: 1, skipped: 0, failed: 0 };
  const incompleteShards = await f.api.search(f.config, credentials, {});
  assert.equal(incompleteShards.incomplete, true); assert.ok(incompleteShards.incompleteReasons.includes('shards_incomplete'));
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 3, '部分结果不能启动未知生命周期的轮询');
});

test('Kibana sanitizes sensitive log text, mapped values, query echoes and document identity', async t => {
  const f = await fixture(t);
  const message = ['Authorization: Bearer fixture-auth-token', 'Proxy-Authorization: Basic fixture-proxy-token',
    'Cookie: fixture-cookie', 'Set-Cookie: fixture-set-cookie', 'password=fixture-password-value',
    'access_token=fixture-access-token', 'refresh_token=fixture-refresh-token', 'api_key=fixture-api-key', credentials.password, authHeader].join('\n');
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: credentials.password,
    _source: { message }, fields: { '@timestamp': ['2026-10-14T07:59:59Z'], message: [message], 'message.keyword': [credentials.password] } }]);
  const result = await f.api.search(f.config, credentials, { contains: credentials.password, fields: ['message', 'message.keyword'] });
  const output = JSON.stringify(result);
  for (const secret of ['fixture-auth-token', 'fixture-proxy-token', 'fixture-cookie', 'fixture-set-cookie', 'fixture-password-value',
    'fixture-access-token', 'fixture-refresh-token', 'fixture-api-key', credentials.password, authHeader]) assert.ok(!output.includes(secret), secret);
  assert.equal(result.rows[0].documentIdentityAvailable, false); assert.ok(result.rows[0].redactionCount > 0);
  assert.equal(result.rowCount, 1);
});

test('Kibana rejects redirects, missing views and opaque upstream errors without retrying or exposing bodies', async t => {
  const f = await fixture(t);
  for (const status of [302, 403, 404, 429, 500]) {
    f.state.requests.length = 0;
    f.state.override = (request, response) => {
      if (!request.pathname.includes('/api/data_views/data_view/')) return false;
      response.writeHead(status, { Location: 'http://unrelated.example.invalid/steal', 'Content-Type': 'text/plain', 'Set-Cookie': 'fixture-private-cookie' });
      response.end(credentials.password + ' Authorization: Bearer fixture-private-token'); return true;
    };
    await assert.rejects(() => f.api.search(f.config, credentials, {}), error => {
      assert.match((error as { code: string }).code, /^kibana_/); assert.ok(!String(error).includes(credentials.password));
      assert.ok(!String(error).includes('fixture-private-token')); assert.ok(!String(error).includes('fixture-private-cookie')); return true;
    });
    assert.equal(f.state.requests.filter(item => item.pathname.includes('/api/data_views/data_view/')).length, 1);
    assert.ok(!f.state.requests.some(item => item.pathname.endsWith('/internal/search/es')));
  }
});

test('Kibana does not convert unsupported search response structures into successful zero hits', async t => {
  const f = await fixture(t);
  for (const value of [{ rawResponse: wrapper().rawResponse, isRunning: false },
    { ...wrapper(), rawResponse: { hits: { hits: [] } } },
    { ...wrapper(), rawResponse: { ...wrapper().rawResponse, hits: { total: 0 } } },
    { ...wrapper(), rawResponse: { ...wrapper().rawResponse, _shards: { total: 1 } } }]) {
    f.state.override = (request, response) => {
      if (!request.pathname.endsWith('/internal/search/es')) return false;
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); return true;
    };
    await assert.rejects(() => f.api.search(f.config, credentials, {}), { code: /^kibana_/ });
  }
});

test('Kibana response and metadata limits abort oversized streams with explicit failures', async t => {
  const f = await fixture(t);
  const metadataLimited = createKibanaProvider({ now, maxMetadataBytes: 128 });
  await assert.rejects(() => metadataLimited.kibana!.fields(f.config, credentials), { code: /^kibana_.*(?:large|limit)/ });
  const responseLimited = createKibanaProvider({ now, maxResponseBytes: 128 });
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'document-1', fields: { message: ['large'.repeat(200)] } }]);
  await assert.rejects(() => responseLimited.kibana!.search(f.config, credentials, {}), { code: /^kibana_.*(?:large|limit)/ });
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 1);
});

test('Kibana action timeouts cancel a bounded request without automatic retries', async t => {
  const f = await fixture(t);
  f.state.override = request => request.pathname.includes('/api/data_views/data_view/');
  const short = createKibanaProvider({ now, timeoutMs: 30 });
  await assert.rejects(() => short.kibana!.search(f.config, credentials, {}), { code: 'kibana_timeout' });
  assert.equal(f.state.requests.filter(item => item.pathname.includes('/api/data_views/data_view/')).length, 1);
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
});

test('Kibana current nested and runtime field metadata prevents semantically invalid queries', async t => {
  const f = await fixture(t);
  Object.assign(f.state.view.fields.find(item => item.name === 'trace.id')!, { subType: { nested: { path: 'spans' } } });
  const fields = await f.api.fields(f.config, credentials, { name: 'trace.id' });
  assert.ok(fields.fields[0].unsupportedReasons.length > 0);
  await assert.rejects(() => f.api.search(f.config, credentials, { filters: [{ field: 'trace.id', op: 'eq', value: 'trace' }] }), { code: 'kibana_field_unsupported' });
  f.state.view = view(); f.state.view.runtimeFieldMap = { 'trace.id': { type: 'keyword', script: { source: 'emit("unsupported")' } } };
  await assert.rejects(() => f.api.search(f.config, credentials, { filters: [{ field: 'trace.id', op: 'eq', value: 'trace' }] }), { code: 'kibana_field_unsupported' });
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
});

test('Kibana every query rereads current view identity and does not substitute deleted views', async t => {
  const f = await fixture(t);
  await f.api.search(f.config, credentials, {});
  f.state.view.title = 'new-current-logs-*';
  await f.api.search(f.config, credentials, {});
  const requests = f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es'));
  assert.deepEqual(requests.map(item => (item.body!.params as { index: string }).index), ['logs-fixture-*', 'new-current-logs-*']);
  assert.equal(f.state.requests.filter(item => item.pathname.includes('/api/data_views/data_view/')).length, 2);
  f.state.override = (request, response) => {
    if (!request.pathname.includes('/api/data_views/data_view/')) return false;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data_view: { ...f.state.view, id: 'same-name-other-id' } })); return true;
  };
  await assert.rejects(() => f.api.search(f.config, credentials, {}), { code: /^kibana_/ });
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 2);
});

test('Kibana bounded aggregation preserves other counts and approximation independently of remote completion', async t => {
  const f = await fixture(t);
  f.state.override = (request, response) => {
    if (!request.pathname.endsWith('/internal/search/es')) return false;
    const result = wrapper();
    const rawResponse = { ...result.rawResponse, aggregations: { groups: {
      buckets: [{ key: 'order-api', doc_count: 12 }, { key: 'billing-api', doc_count: 8 }], sum_other_doc_count: 7, doc_count_error_upper_bound: 2,
    } } };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ...result, rawResponse })); return true;
  };
  const result = await f.api.aggregate(f.config, credentials, { field: 'kubernetes.deployment.name', top: 2 });
  assert.equal(result.resolvedField, 'kubernetes.deployment.name.keyword'); assert.equal(result.sumOtherDocCount, 7); assert.equal(result.docCountErrorUpperBound, 2);
  assert.deepEqual(result.buckets, [{ key: 'order-api', docCount: 12 }, { key: 'billing-api', docCount: 8 }]);
  assert.equal(result.execution.isPartial, false); assert.equal(result.incomplete, true); assert.equal(result.limitReached, true);
  assert.ok(result.incompleteReasons.length >= 2);
  assert.equal(Object.hasOwn(result, 'rows'), false);
  const request = f.state.requests.find(item => item.pathname.endsWith('/internal/search/es'))!;
  const body = (request.body!.params as { body: Record<string, unknown> }).body;
  assert.equal(body.size, 0); assert.equal(body._source, false); assert.equal(body.fields, undefined);
});

test('Kibana authentication identity changes only with the actual credential target', async t => {
  const f = await fixture(t);
  const original = f.provider.authenticationTargetIdentity(f.config);
  assert.equal(original, f.provider.authenticationTargetIdentity({ ...f.config, dataViewId: 'another-view' }));
  for (const config of [{ ...f.config, username: 'other-reader' },
    { ...f.config, consoleUrl: f.config.consoleUrl.replace('/s/test-space/', '/s/other-space/') },
    { ...f.config, consoleUrl: f.config.consoleUrl.replace('/gateway/', '/different-proxy/') },
    { ...f.config, consoleUrl: f.config.consoleUrl.replace('http:', 'https:') }]) assert.notEqual(original, f.provider.authenticationTargetIdentity(config));
});

test('Kibana stream limits stop reading before consuming the full upstream response', async () => {
  let chunksRead = 0, cancelled = false, searchCalls = 0;
  const transport: typeof fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith('/api/status')) return Response.json({ version: { number: '8.5.1' } });
    if (url.pathname.includes('/api/data_views/data_view/')) return Response.json({ data_view: view() });
    assert.ok(url.pathname.endsWith('/internal/search/es')); searchCalls++;
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (++chunksRead > 100) { controller.close(); return; }
        controller.enqueue(new TextEncoder().encode('x'.repeat(256)));
      }, cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'application/json' } });
  };
  const provider = createKibanaProvider({ now, fetch: transport, maxResponseBytes: 128 });
  const config = kibanaConfiguration({ consoleUrl: 'https://logs.example.invalid/app/discover', username: 'reader', dataViewId });
  await assert.rejects(() => provider.kibana!.search(config, credentials, {}), { code: /^kibana_.*(?:large|limit)/ });
  assert.equal(searchCalls, 1); assert.ok(chunksRead < 100); assert.equal(cancelled, true);
});

test('Kibana redacts complete secrets before truncation can expose a credential prefix', async t => {
  const f = await fixture(t);
  f.state.result = wrapper([{ _index: 'logs-fixture-0001', _id: 'document-1', _source: { message: credentials.password + ' additional content' },
    fields: { '@timestamp': ['2026-10-14T07:59:59Z'], message: [credentials.password + ' additional content'] } }]);
  const result = await f.api.search(f.config, credentials, { messageBytes: 6 });
  assert.ok(!result.rows[0].message!.includes(credentials.password.slice(0, 6)));
  assert.ok(!JSON.stringify(result.rows[0].fields).includes(credentials.password.slice(0, 6)));
  assert.equal(result.rows[0].messageTruncated, true); assert.ok(result.rows[0].redactionCount > 0);
});

test('Kibana final output boundary masks nested sensitive keys and rejects oversized JSON', () => {
  const config = { username: 'reader' };
  const result = sanitizeKibanaOutput({ fields: { password: ['fixture-password-value'], Authorization: [authHeader], 'http.Cookie': ['fixture-private-cookie'] },
    warnings: [], userText: 'ordinary nonsecret context', queryEcho: credentials.password }, credentials, config);
  assert.equal(result.userText, 'ordinary nonsecret context');
  const output = JSON.stringify(result);
  for (const secret of [credentials.password, authHeader, 'fixture-password-value', 'fixture-private-cookie']) assert.ok(!output.includes(secret));
  const jsonHeaders = sanitizeKibanaOutput({ message: '{"Authorization":"Bearer fixture-json-auth","Cookie":"session=fixture-json-cookie"}' }, credentials, config);
  assert.ok(!jsonHeaders.message.includes('fixture-json-auth')); assert.ok(!jsonHeaders.message.includes('fixture-json-cookie'));
  assert.deepEqual(sanitizeKibanaOutput(jsonHeaders, credentials, config), jsonHeaders, '重复脱敏不应改变已经处理的内容');
  assert.throws(() => sanitizeKibanaOutput({ message: 'x'.repeat(4 * 1024 * 1024) }, credentials, config), { code: 'kibana_output_too_large' });
});

test('Kibana accepts field dictionaries but rejects key and field identity disagreement', async t => {
  const f = await fixture(t);
  let mismatch = false;
  f.state.override = (request, response) => {
    if (!request.pathname.includes('/api/data_views/data_view/')) return false;
    const fields = Object.fromEntries(f.state.view.fields.map(item => [item.name, item]));
    if (mismatch) fields.message = { ...fields.message, name: 'wrong-message' };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data_view: { ...f.state.view, fields } })); return true;
  };
  const result = await f.api.fields(f.config, credentials, { name: 'message' });
  assert.deepEqual(result.fields.map(item => item.name), ['message', 'message.keyword']);
  assert.deepEqual(result.fields[1].esTypes, ['keyword']);
  mismatch = true;
  await assert.rejects(() => f.api.fields(f.config, credentials), { code: 'kibana_protocol_unsupported' });
});

test('Kibana metadata keeps the source parent needed to exclude custom multi-fields', async t => {
  const f = await fixture(t);
  f.state.view.fields.push(Object.assign(field('public.raw', ['keyword']), { subType: { multi: { parent: 'private.original' } } }));
  f.state.view.sourceFilters = [{ value: 'private.original' }];
  const fields = await f.api.fields(f.config, credentials, { name: 'public.raw' });
  assert.equal((fields.fields[0] as { sourceField?: string }).sourceField, 'private.original');
  await assert.rejects(() => f.api.search(f.config, credentials, { fields: ['public.raw'] }), { code: 'kibana_field_excluded' });
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
});
