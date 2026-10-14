import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

const root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!, temporary = process.env.BUILDR_SMOKE_ROOT!;
assert.ok(root && temporary, 'Use run-isolated-workspace-smoke.ts.');
const entry = path.resolve(import.meta.dirname, '../../bin/buildr.mjs'), execute = promisify(execFile);
const password = 'synthetic-kibana-password', requests: Record<string, unknown>[] = [];
const fields = [
  { name: '@timestamp', type: 'date', esTypes: ['date'], searchable: true, aggregatable: true },
  { name: 'message', type: 'string', esTypes: ['text'], searchable: true, aggregatable: false },
  ...['kubernetes.deployment.name', 'kubernetes.namespace'].map(name => ({ name, type: 'string', esTypes: ['keyword'], searchable: true, aggregatable: true })),
];
const view = { id: 'fixture-view', title: 'fixture-*', name: 'Fixture Logs', timeFieldName: '@timestamp', fields: Object.fromEntries(fields.map(field => [field.name, field])) };
const remote = http.createServer(async (request, response) => {
  assert.equal(request.headers.authorization, 'Basic ' + Buffer.from('reader:' + password).toString('base64'));
  let body: unknown;
  if (request.url === '/api/status') body = { version: { number: '8.5.1' } };
  else if (request.url === '/api/data_views') body = { data_view: [{ id: view.id, title: view.title, name: view.name }] };
  else if (request.url === '/api/data_views/data_view/' + view.id) body = { data_view: view };
  else {
    assert.equal(request.url, '/internal/search/es'); assert.equal(request.method, 'POST'); assert.equal(request.headers['kbn-xsrf'], 'true');
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const query = JSON.parse(Buffer.concat(chunks).toString('utf8')); requests.push(query);
    assert.equal(query.params.index, view.title); assert.equal(query.params.track_total_hits, false); assert.equal(query.params.timeout, '5s'); assert.equal('id' in query, false);
    const raw = { timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 }, hits: { hits: query.params.body.size === 0 ? [] : [{ _index: 'fixture-logs', _id: 'fixture-document', fields: { '@timestamp': [new Date().toISOString()], 'kubernetes.deployment.name': ['service-a'], 'kubernetes.namespace': ['qa-fixture'] }, _source: { message: 'ERROR synthetic log Authorization: Bearer fixture-secret' } }] }, ...(query.params.body.aggs ? { aggregations: { groups: { buckets: [{ key: 'service-a', doc_count: 1 }], sum_other_doc_count: 0, doc_count_error_upper_bound: 0 } } } : {}) };
    body = { isRunning: false, isPartial: false, rawResponse: raw };
  }
  response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body));
});
await new Promise<void>(resolve => remote.listen(0, '127.0.0.1', resolve));
async function cli(args: string[]) {
  const { stdout } = await execute(process.execPath, [entry, ...args], { env: process.env, maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout);
}
let local: ReturnType<typeof createLocalWorkspaceServer> | undefined;
try {
  await execute(process.execPath, [entry, 'init', '--target', root, '--name', 'Kibana smoke', '--profile', 'team'], { env: process.env, maxBuffer: 5 * 1024 * 1024 });
  const target = 'http://127.0.0.1:' + (remote.address() as { port: number }).port;
  const input = path.join(temporary, 'connection.json');
  fs.writeFileSync(input, JSON.stringify({ name: 'Fixture Logs', category: 'logs', type: 'kibana', environment: 'qa-fixture', config: { consoleUrl: target + '/app/discover', username: 'reader', dataViewId: view.id }, credentials: { password } }), { mode: 0o600 });
  const created = await cli(['connection', 'create', '--target', root, '--file', input, '--json']);
  const id = created.connection.id;
  assert.equal(created.connection.hasCredentials, true); assert.equal(JSON.stringify(created).includes(password), false);
  assert.equal((await cli(['connection', 'test', '--target', root, '--connection', id, '--json'])).kibana.searchVerified, true);
  const common = ['--connection', id, '--target', root, '--json'];
  assert.equal((await cli(['connection', 'kibana', 'views', ...common])).dataViews[0].id, view.id);
  assert.equal((await cli(['connection', 'kibana', 'fields', '--name', 'kubernetes', ...common])).total, 2);
  const searched = await cli(['connection', 'kibana', 'search', '--service', 'service-a', '--contains', 'ERROR', '--limit', '3', ...common]);
  assert.equal(searched.rowCount, 1); assert.equal(searched.rows[0]._id, 'fixture-document'); assert.ok(!JSON.stringify(searched).includes('fixture-secret'));
  assert.ok(JSON.stringify(requests.at(-1)).includes('kubernetes.deployment.name'));
  assert.equal((await cli(['connection', 'kibana', 'aggregate', '--field', 'kubernetes.deployment.name', ...common])).buckets[0].docCount, 1);
  const runtime = createRuntime(), workspace = runtimeProvide(runtime, WORKSPACE_APPLICATION);
  local = createLocalWorkspaceServer(runtime, { targetRoot: root, ensureRegisteredTarget: workspace.ensureRegisteredTarget, resolveRegisteredWorkspace: workspace.resolveRegisteredWorkspace });
  const { url, initialWorkspaceId, sessionToken } = await local.ready;
  const base = url + '/api/v1/workspaces/' + initialWorkspaceId + '/connections';
  const listed = await fetch(base); assert.equal(listed.status, 200); assert.equal((await listed.json()).connections[0].id, id);
  const body = { id, expectedRevision: created.connection.revision, viewName: 'Fixture' };
  const denied = await fetch(base + '/kibana/data-views', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify(body) }); assert.equal(denied.status, 403);
  const response = await fetch(base + '/kibana/data-views', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, 'x-buildr-session': sessionToken }, body: JSON.stringify(body) }); assert.equal(response.status, 200); assert.equal((await response.json()).dataViews[0].id, view.id);
  assert.equal((await cli(['connection', 'list', '--target', root, '--json'])).connections[0].revision, created.connection.revision);
  process.stdout.write(JSON.stringify({ status: 'passed', checks: ['real-cli-config', 'real-cli-test', 'views', 'fields', 'search', 'aggregate', 'http-session', 'draft-no-save'], remoteQueries: requests.length }) + '\n');
} finally {
  if (local) await new Promise<void>((resolve, reject) => local!.server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => remote.close(error => error ? reject(error) : resolve()));
}
