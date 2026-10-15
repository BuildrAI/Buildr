import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { readConnectionSkillFile } from '../../src/modules/agent-assets/application/connection-skill-source.ts';

const source = fileURLToPath(new URL('../../resources/workspace/skills/connections/kibana-connection/', import.meta.url));
const viewId = 'logs/测试';
const team = { username: 'fixture-reader', password: 'fixture-kibana-password' };
const personal = { username: 'personal-reader', password: 'fixture-personal-password' };
const header = (values: typeof team) => 'Basic ' + Buffer.from(values.username + ':' + values.password).toString('base64');
type Request = { pathname: string; method: string; headers: http.IncomingHttpHeaders; body: any };
function field(name: string, esTypes: string[], type = esTypes.includes('text') ? 'string' : esTypes[0]) {
  return { name, type, esTypes, searchable: true, aggregatable: !esTypes.includes('text'), readFromDocValues: !esTypes.includes('text') };
}
function dataView() {
  return { id: viewId, name: '测试日志', title: 'fixture-logs-*', timeFieldName: '@timestamp',
    fields: [field('@timestamp', ['date_nanos'], 'date'), field('message', ['text']), field('message.keyword', ['keyword']),
      field('kubernetes.deployment.name', ['text']), field('kubernetes.deployment.name.keyword', ['keyword']),
      field('kubernetes.namespace', ['keyword']), field('trace.id', ['keyword']), field('log.level', ['keyword'])],
    sourceFilters: [] as { value: string }[], runtimeFieldMap: {} as Record<string, unknown> };
}
function wrapper(hits: unknown[] = []) {
  return { rawResponse: { timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 }, hits: { hits } }, isRunning: false, isPartial: false };
}
async function fixture(t: { after(action: () => void | Promise<void>): void }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kibana-skill-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = { view: dataView(), response: wrapper(), requests: [] as Request[], allowedAuth: header(team),
    override: null as ((request: Request, response: http.ServerResponse) => boolean) | null };
  const server = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const current: Request = { pathname: new URL(request.url!, 'http://localhost').pathname, method: request.method!, headers: request.headers, body: body ? JSON.parse(body) : null };
    state.requests.push(current);
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (state.override?.(current, response)) return;
    if (current.headers.authorization !== state.allowedAuth) { json({ error: 'private upstream authentication body ' + team.password }, 401); return; }
    if (!current.pathname.startsWith('/proxy/kibana/s/fixture-space/')) { json({}, 404); return; }
    if (current.pathname.endsWith('/api/status')) { json({ version: { number: '8.5.1' } }); return; }
    if (current.pathname.endsWith('/api/data_views')) { json({ data_view: [{ id: viewId, name: '测试日志', title: state.view.title }, { id: 'other', title: 'other-*' }] }); return; }
    if (current.pathname.endsWith('/api/data_views/data_view/' + encodeURIComponent(viewId))) { json({ data_view: state.view }); return; }
    if (current.pathname.endsWith('/internal/search/es')) { json(state.response); return; }
    json({}, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const port = (server.address() as { port: number }).port, apiBaseUrl = `http://127.0.0.1:${port}/proxy/kibana/s/fixture-space`;
  const workspace = path.join(root, 'workspace'), directory = path.join(workspace, 'skills/connections/kibana-connection');
  fs.cpSync(source, directory, { recursive: true });
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'kibana-connection', assetIdentity: 'fixture:kibana', sourceIdentity: 'fixture:local', path: 'connections/kibana-connection', connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: readConnectionSkillFile,
  } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'local'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-kibana-workspace' }) });
  const entry = app.definitions(workspace).definitions[0]!;
  assert.ok(entry, JSON.stringify(app.definitions(workspace).diagnostics));
  const binding = { skillAssetIdentity: entry.skill.assetIdentity, definitionId: 'kibana', sourceIdentity: entry.skill.sourceIdentity, configVersion: 1 };
  const created = app.save(workspace, null, { id: 'kibana-fixture', name: 'fixture', environment: 'test', binding, config: { apiBaseUrl, dataViewId: viewId }, authentication: { intent: 'replace', values: team }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const run = async (args: string[], input?: string) => {
    const current = app.get(workspace, created.id).instance;
    const execution = await app.run(workspace, { id: created.id, expectedRevision: current.revision, args, input });
    assert.equal(execution.status, 'exited', JSON.stringify(execution));
    return { ...execution, result: JSON.parse(execution.stdout) };
  };
  return { root, state, workspace, directory, app, entry, binding, created, apiBaseUrl, run };
}

test('Kibana complete copied source provides offline help and self-test with no developer checkout imports', async t => {
  const f = await fixture(t);
  const help = await f.app.help(f.workspace, f.created.id);
  assert.equal(help.exitCode, 0); assert.match(help.stdout, /views\|fields\|search\|aggregate/); assert.equal(f.state.requests.length, 0);
  const standalone = spawnSync(process.execPath, [path.join(f.directory, 'scripts/kibana-client.mjs'), '--self-test'], { cwd: f.root, env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(standalone.status, 0, standalone.stderr); assert.equal(JSON.parse(standalone.stdout).status, 'success'); assert.equal(f.state.requests.length, 0);
  const missingContext = spawnSync(process.execPath, [path.join(f.directory, 'scripts/kibana-client.mjs'), 'views'], { cwd: f.root, env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(missingContext.status, 1); assert.equal(JSON.parse(missingContext.stdout).error.code, 'kibana_context_required'); assert.equal(f.state.requests.length, 0);
  assert.equal(f.entry.definition.category, 'logs'); assert.deepEqual(f.entry.definition.authentication.targetFields, ['apiBaseUrl']);
  assert.deepEqual(f.entry.definition.hooks?.dataViews?.inputs, ['config.apiBaseUrl', 'authentication.username', 'authentication.password']);
});

test('Kibana discovers views before a default selection and tests the actual synchronous channel with zero documents', async t => {
  const f = await fixture(t);
  const discovered = await f.app.hook(f.workspace, { binding: f.binding, config: { apiBaseUrl: f.apiBaseUrl }, hook: 'dataViews', authentication: { source: 'team', intent: 'replace', values: team }, expected: { teamRevision: 'absent', definitionRevision: f.entry.revision } }, 'discover');
  assert.equal(discovered.status, 'success'); assert.deepEqual((discovered.options as any[]).find(item => item.value === viewId), { value: viewId, label: '测试日志 · fixture-logs-*' });
  const current = f.app.get(f.workspace, f.created.id).instance;
  const tested = await f.app.hook(f.workspace, { id: current.id, binding: current.binding, config: current.config, authentication: { source: 'team', intent: 'keep' }, expected: { teamRevision: current.teamRevision, localRevision: current.localRevision, definitionRevision: current.definitionRevision } }, 'test');
  assert.equal(tested.status, 'success');
  const request = f.state.requests.find(item => item.pathname.endsWith('/internal/search/es'))!;
  assert.equal(request.method, 'POST'); assert.equal(request.headers['kbn-xsrf'], 'true');
  assert.deepEqual(Object.keys(request.body), ['params']); assert.equal(request.body.params.index, 'fixture-logs-*');
  assert.equal(request.body.params.timeout, '5s'); assert.equal(request.body.params.track_total_hits, false);
  assert.equal(request.body.params.body.size, 0); assert.equal(request.body.params.body._source, false); assert.equal(request.body.params.body.fields, undefined);
  assert.ok(f.state.requests.every(item => item.pathname.startsWith('/proxy/kibana/s/fixture-space/')));
});

test('Kibana search and aggregation preserve mapped fields, current identities, bounded conditions and partial-result facts', async t => {
  const f = await fixture(t);
  f.state.response = wrapper([{ _index: 'fixture-logs-1', _id: 'doc-1', _source: { message: '中😀longer' }, fields: { '@timestamp': ['2026-10-15T00:00:00.123456789Z'], message: ['中😀longer'], 'message.keyword': ['a', 'b'] }, _ignored: ['message.keyword'] }]);
  f.state.response.isRunning = true; f.state.response.isPartial = true; f.state.response.rawResponse.timed_out = true;
  f.state.response.rawResponse._shards = { total: 2, successful: 1, skipped: 0, failed: 1 };
  const searched = await f.run(['search', '--service', 'order-api', '--namespace', 'test', '--from', '2026-10-15T08:00:00+08:00', '--to', '2026-10-15T08:10:00+08:00', '--fields', 'message,message.keyword', '--message-bytes', '6', '--limit', '1']);
  assert.equal(searched.exitCode, 0); assert.equal(searched.result.status, 'unknown'); assert.equal(searched.result.incomplete, true); assert.equal(searched.result.rows[0].message, '中');
  assert.equal(searched.result.rows[0].timestamp[0], '2026-10-15T00:00:00.123456789Z'); assert.equal(searched.result.rows[0].messageTruncated, true); assert.equal(searched.result.rows[0].documentIdentityAvailable, true);
  assert.ok(searched.result.incompleteReasons.includes('shards_failed')); assert.ok(searched.result.incompleteReasons.includes('row_limit_reached'));
  const searchRequest = f.state.requests.find(item => item.pathname.endsWith('/internal/search/es'))!;
  assert.ok(JSON.stringify(searchRequest.body).includes('kubernetes.deployment.name.keyword')); assert.ok(!JSON.stringify(searchRequest.body).includes('"fields":["*"]'));
  f.state.view.title = 'new-current-*';
  f.state.override = (request, response) => {
    if (!request.pathname.endsWith('/internal/search/es')) return false;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ...wrapper(), rawResponse: { ...wrapper().rawResponse, aggregations: { groups: { buckets: [{ key: 'ERROR', doc_count: 4 }], sum_other_doc_count: 2, doc_count_error_upper_bound: 1 } } } })); return true;
  };
  const aggregated = await f.run(['aggregate', '--field', 'log.level', '--top', '1']);
  assert.equal(aggregated.result.status, 'unknown'); assert.equal(aggregated.result.resolvedField, 'log.level'); assert.equal(aggregated.result.sumOtherDocCount, 2); assert.equal(aggregated.result.docCountErrorUpperBound, 1); assert.equal(aggregated.result.rows, undefined);
  const requests = f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es'));
  assert.equal(requests.length, 2); assert.equal(requests[1].body.params.index, 'new-current-*'); assert.equal(requests[1].body.params.body.size, 0); assert.equal(requests[1].body.params.body._source, false);
});

test('Kibana refuses unsupported fields and invalid ranges without silently removing filters or expanding requests', async t => {
  const f = await fixture(t);
  for (const args of [['search', '--since', '25h'], ['search', '--limit', '501'], ['search', '--since', '15m', '--from', '2026-10-15T00:00:00Z'], ['search', '--unknown', 'value']]) {
    const result = await f.run(args); assert.equal(result.exitCode, 1); assert.equal(result.result.status, 'failure');
  }
  assert.equal(f.state.requests.length, 0);
  const unsupported = await f.run(['search', '--filter-file', '-'], JSON.stringify({ filters: [{ field: 'not-present', op: 'eq', value: 'x' }] }));
  assert.equal(unsupported.result.error.code, 'kibana_field_missing'); assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
  f.state.view.sourceFilters = [{ value: 'message' }];
  const excluded = await f.run(['search', '--fields', 'message']); assert.equal(excluded.result.error.code, 'kibana_field_excluded');
  f.state.view.runtimeFieldMap['trace.id'] = { type: 'keyword' };
  const runtime = await f.run(['search', '--filter-file', '-'], JSON.stringify({ filters: [{ field: 'trace.id', op: 'eq', value: 'trace' }] }));
  assert.equal(runtime.result.error.code, 'kibana_field_unsupported'); assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
});

test('Kibana masks sensitive log data before truncation and writes an exclusive restricted result file', async t => {
  const f = await fixture(t), resultFile = path.join(f.root, 'result.json');
  const message = team.password + ' Authorization: Bearer private-token\nCookie: session=private-cookie\npassword=private-log-password';
  f.state.response = wrapper([{ _index: 'fixture-logs-1', _id: team.password, _source: { message }, fields: { '@timestamp': ['2026-10-15T00:00:00Z'], message: [message] } }]);
  const found = await f.run(['search', '--message-bytes', '6', '--result-file', resultFile]);
  const output = JSON.stringify(found.result) + fs.readFileSync(resultFile, 'utf8');
  for (const secret of [team.password, 'private-token', 'private-cookie', 'private-log-password', header(team)]) assert.ok(!output.includes(secret), secret);
  assert.ok(!JSON.stringify({ message: found.result.rows[0].message, fields: found.result.rows[0].fields }).includes(team.password.slice(0, 6)), '正文截断前必须先遮蔽完整认证值');
  assert.equal(found.result.rows[0].documentIdentityAvailable, false); assert.ok(found.result.rows[0].redactionCount > 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(resultFile, 'utf8')), found.result);
  if (process.platform !== 'win32') assert.equal(fs.statSync(resultFile).mode & 0o777, 0o600);
  const before = f.state.requests.length, repeated = await f.run(['search', '--result-file', resultFile]);
  assert.equal(repeated.result.error.code, 'kibana_result_file_unavailable'); assert.equal(f.state.requests.length, before);
});

test('Kibana personal authentication stays isolated and failed credentials never retry using the team group', async t => {
  const f = await fixture(t), current = f.app.get(f.workspace, f.created.id).instance;
  f.app.saveAuth(f.workspace, current.id, { intent: 'replace', values: personal, expected: { teamRevision: current.teamRevision, localRevision: current.localRevision, definitionRevision: current.definitionRevision } });
  f.state.allowedAuth = header(personal);
  const success = await f.run(['views']); assert.equal(success.result.authenticationSource, 'personal');
  assert.ok(f.state.requests.every(item => item.headers.authorization === header(personal)));
  f.state.requests.length = 0; f.state.allowedAuth = header(team);
  const failed = await f.run(['search']); assert.equal(failed.result.error.code, 'kibana_access_denied');
  assert.ok(f.state.requests.length > 0); assert.ok(f.state.requests.every(item => item.headers.authorization === header(personal)));
  assert.ok(!JSON.stringify(failed).includes(team.password)); assert.ok(!JSON.stringify(failed).includes(personal.password));
});

test('Kibana rejects redirects and incompatible responses, and a zero-shard test is not reported as verified', async t => {
  const f = await fixture(t);
  f.state.override = (request, response) => {
    if (!request.pathname.includes('/api/data_views/data_view/')) return false;
    response.writeHead(302, { Location: 'http://unrelated.example.invalid/private' }); response.end(team.password); return true;
  };
  const redirect = await f.run(['search']); assert.equal(redirect.result.error.code, 'kibana_redirect_rejected');
  assert.ok(f.state.requests.every(item => item.pathname.startsWith('/proxy/kibana/s/fixture-space/'))); assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
  f.state.override = (request, response) => {
    if (!request.pathname.endsWith('/internal/search/es')) return false;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ rawResponse: { hits: { hits: [] } } })); return true;
  };
  const incompatible = await f.run(['search']); assert.equal(incompatible.result.error.code, 'kibana_protocol_unsupported');
  f.state.override = null; f.state.response = wrapper(); f.state.response.rawResponse._shards = { total: 0, successful: 0, skipped: 0, failed: 0 };
  const tested = await f.run(['test']); assert.equal(tested.result.status, 'failure'); assert.equal(tested.result.error.code, 'kibana_search_unverified');
  assert.equal(f.state.requests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 2, '不为不完整结果启动轮询或重发');
});

test('Kibana copied operations bound streamed metadata and query bytes and cancel timeouts without retrying', async t => {
  const f = await fixture(t);
  const { createKibanaOperations } = await import(pathToFileURL(path.join(f.directory, 'scripts/lib/operations.mjs')).href);
  const config = { consoleUrl: f.apiBaseUrl, username: team.username, dataViewId: viewId }, credentials = { password: team.password };
  const smallMetadata = createKibanaOperations({ maxMetadataBytes: 128 });
  await assert.rejects(() => smallMetadata.fields(config, credentials), { code: 'kibana_response_too_large' });
  f.state.response = wrapper([{ _index: 'fixture-logs-1', _id: 'doc-1', fields: { message: ['x'.repeat(512)] } }]);
  const smallResponse = createKibanaOperations({ maxResponseBytes: 128 });
  await assert.rejects(() => smallResponse.search(config, credentials, {}), { code: 'kibana_response_too_large' });
  const before = f.state.requests.length;
  f.state.override = request => request.pathname.includes('/api/data_views/data_view/');
  const timeout = createKibanaOperations({ timeoutMs: 100 });
  await assert.rejects(() => timeout.search(config, credentials, {}), { code: 'kibana_timeout' });
  const timedRequests = f.state.requests.slice(before);
  assert.equal(timedRequests.filter(item => item.pathname.includes('/api/data_views/data_view/')).length, 1);
  assert.equal(timedRequests.filter(item => item.pathname.endsWith('/internal/search/es')).length, 0);
});
