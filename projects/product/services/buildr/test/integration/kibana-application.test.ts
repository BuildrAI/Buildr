import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConnectionsApplication } from '../../src/modules/connections/application/connections-application.ts';
import { createKibanaProvider } from '../../src/modules/connections/infrastructure/kibana-provider.ts';
import { createConnectionsHttpContribution } from '../../src/modules/connections/interfaces/http/connections-http.ts';
import { runKibanaCli } from '../../src/modules/connections/interfaces/cli/kibana-cli.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction } from '../../src/infrastructure/sqlite/transaction.ts';

const draft = { name: 'Kibana 演示', category: 'logs', type: 'kibana', environment: 'qa', config: { consoleUrl: 'https://logs.invalid/prefix/s/demo/app/discover', username: 'reader', dataViewId: 'view-1' } };
function fixture(t: { after(fn: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-kibana-app-')), root = path.join(base, 'workspace'), dataRoot = path.join(base, 'profile');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true }); fs.mkdirSync(dataRoot);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() };
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace: () => {} }));
  const password = 'fixture-password-' + crypto.randomUUID(), calls: { url: string; body: unknown }[] = [];
  const provider = createKibanaProvider({ fetch: (async (url, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Basic ' + Buffer.from('reader:' + password).toString('base64'));
    const address = String(url); calls.push({ url: address, body: init?.body ? JSON.parse(String(init.body)) : null });
    let body: unknown;
    if (address.endsWith('/api/status')) body = { version: { number: '8.5.1' } };
    else if (address.endsWith('/api/data_views')) body = { data_view: [{ id: 'view-1', name: 'Logs', title: 'logs-*' }] };
    else if (address.includes('/api/data_views/data_view/')) body = { data_view: { id: 'view-1', name: 'Logs', title: 'logs-*', timeFieldName: '@timestamp', fields: [
      { name: '@timestamp', type: 'date', esTypes: ['date'], searchable: true, aggregatable: true, readFromDocValues: true },
      { name: 'message', type: 'string', esTypes: ['text'], searchable: true, aggregatable: false },
    ] } };
    else { assert.ok(address.endsWith('/internal/search/es')); body = { isRunning: false, isPartial: false, rawResponse: { timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 }, hits: { hits: [] } } }; }
    return Response.json(body);
  }) as typeof fetch });
  const application = new ConnectionsApplication({ dataRoot, store, resolveScope: () => scope, providers: [provider] });
  return { base, root, dataRoot, scope, store, provider, application, password, calls };
}

test('Kibana draft discovery is credential-bound, paginated and never saves a connection', async t => {
  const f = fixture(t);
  const result = await f.application.discoverKibanaViews(f.root, { ...draft, credentials: { password: f.password }, viewName: 'Logs', offset: 0, limit: 1 });
  assert.equal(result.dataViews[0].id, 'view-1'); assert.equal(result.limit, 1);
  assert.equal(f.application.list(f.root).connections.length, 0);
  assert.equal(fs.existsSync(path.join(f.dataRoot, 'external-connections')), false);
  assert.ok(f.calls.every(call => call.url.startsWith('https://logs.invalid/prefix/s/demo/')));
  assert.equal(JSON.stringify(result).includes(f.password), false);
});

test('saved Kibana discovery rejects stale revisions and changed targets before credentials leave', async t => {
  const f = fixture(t), record = f.application.create(f.root, { ...draft, credentials: { password: f.password } }).connection;
  await f.application.discoverKibanaViews(f.root, { id: record.id, expectedRevision: record.revision });
  const updated = f.application.update(f.root, record.id, { expectedRevision: record.revision, name: 'renamed' }).connection;
  const count = f.calls.length;
  await assert.rejects(f.application.discoverKibanaViews(f.root, { id: record.id, expectedRevision: record.revision }), { code: 'connection_revision_conflict' });
  await assert.rejects(f.application.discoverKibanaViews(f.root, { id: record.id, expectedRevision: updated.revision, config: { consoleUrl: 'https://other.invalid/app/discover' } }), { code: 'connection_credentials_required' });
  assert.equal(f.calls.length, count);
  const before = f.application.list(f.root).connections[0];
  await f.application.discoverKibanaViews(f.root, { id: record.id, expectedRevision: updated.revision });
  assert.deepEqual(f.application.list(f.root).connections[0], before);
});

test('Kibana app outputs observed connection identity and cleans the complete result boundary', async t => {
  const f = fixture(t), record = f.application.create(f.root, { ...draft, environment: f.password, credentials: { password: f.password } }).connection;
  const result = await f.application.kibana.search(f.root, record.id, { since: '1m', contains: 'ERROR', limit: 10 });
  assert.equal(result.connectionId, record.id); assert.equal(result.connectionRevision, record.revision);
  assert.equal(result.rowCount, 0); assert.equal(JSON.stringify(result).includes(f.password), false);
  assert.deepEqual(f.application.list(f.root).connections[0], record);
  const request = f.calls.find(call => call.url.endsWith('/internal/search/es'))!.body as { params: { index: string; track_total_hits: boolean } };
  assert.equal(request.params.index, 'logs-*'); assert.equal(request.params.track_total_hits, false);
});

test('Kibana readonly preview reuses credentials for discovery/query without permitting configuration writes', async t => {
  const f = fixture(t), record = f.application.create(f.root, { ...draft, credentials: { password: f.password } }).connection;
  const previewProfile = path.join(f.base, 'preview'); fs.mkdirSync(previewProfile);
  const preview = new ConnectionsApplication({ dataRoot: previewProfile, credentialDataRoot: f.dataRoot, readonlyScope: f.scope, store: f.store, resolveScope: () => f.scope, providers: [f.provider] });
  await preview.discoverKibanaViews(f.root, { id: record.id, expectedRevision: record.revision });
  await preview.kibana.fields(f.root, record.id, {});
  assert.throws(() => preview.update(f.root, record.id, { expectedRevision: record.revision, name: 'changed' }), { code: 'connection_preview_readonly' });
  assert.equal(f.application.list(f.root).connections[0].revision, record.revision);
  assert.equal(fs.existsSync(path.join(previewProfile, 'external-connections')), false);
});

test('Kibana draft HTTP discovery requires the same request authorization and does not save', async t => {
  const f = fixture(t); let authorized = 0;
  const handler = createConnectionsHttpContribution(f.application);
  const result = await handler.handle({ request: { method: 'POST' }, suffix: '/connections/kibana/data-views', searchParams: new URLSearchParams(), root: f.root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ ...draft, credentials: { password: f.password } }) });
  assert.equal(authorized, 1); assert.equal(result?.status, 200); assert.equal(f.application.list(f.root).connections.length, 0);
  await assert.rejects(handler.handle({ request: { method: 'POST' }, suffix: '/connections/kibana/data-views', searchParams: new URLSearchParams(), root: f.root, authorizeWrite: () => { throw new Error('denied'); }, readJsonBody: async () => { throw new Error('must not read body'); } }), /denied/);
});

test('Kibana CLI maps bounded filter files, rejects repeated parameters and emits the public result', async t => {
  const f = fixture(t), record = f.application.create(f.root, { ...draft, credentials: { password: f.password } }).connection;
  const file = path.join(f.base, 'filters.json'); fs.writeFileSync(file, JSON.stringify({ filters: [{ field: 'message', op: 'match-phrase', value: 'ERROR' }] }));
  const write = process.stdout.write; let encoded = '';
  process.stdout.write = ((chunk: string | Uint8Array) => { encoded += String(chunk); return true; }) as typeof process.stdout.write;
  try {
    const result = await runKibanaCli(f.application, ['search', '--connection', record.id, '--target', f.root, '--filter-file', file, '--limit', '2', '--json']);
    assert.equal(result.operation, 'kibana-search'); assert.equal(JSON.parse(encoded).connectionId, record.id);
    const count = f.calls.length;
    await assert.rejects(runKibanaCli(f.application, ['search', '--connection', record.id, '--since', '1m', '--since', '2m']), { code: 'kibana_cli_invalid' });
    fs.writeFileSync(file, Buffer.alloc(65537));
    await assert.rejects(runKibanaCli(f.application, ['search', '--connection', record.id, '--filter-file', file]), { code: 'kibana_cli_input_invalid' });
    assert.equal(f.calls.length, count);
  } finally { process.stdout.write = write; }
});
