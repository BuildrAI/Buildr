import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { LOCAL_APP_HTTP_OPERATIONS, LOCAL_APP_HTTP_VALIDATORS } from '../../src/web/http/buildr-web-http-contracts.ts';
import { RELEASE_AWARENESS_HTTP_OPERATIONS, RELEASE_AWARENESS_HTTP_VALIDATORS } from '../../src/system/installation/interfaces/http/release-awareness-http-contracts.ts';
import { PUBLICATION_HTTP_OPERATIONS, PUBLICATION_HTTP_VALIDATORS } from '../../src/system/publication/interfaces/http/publication-http-contracts.ts';
import { TASK_RECORD_HTTP_OPERATIONS } from '../../src/task/interfaces/http/task-record-http-contracts.ts';
import { TASK_PROFESSIONAL_HTTP_OPERATIONS } from '../../src/task/interfaces/http/task-professional-http-contracts.ts';
import { WORKSPACE_HTTP_OPERATIONS } from '../../src/workspace/interfaces/http/workspace-http-contracts.ts';
import { AGENT_ASSETS_HTTP_OPERATIONS } from '../../src/agent-assets/interfaces/http/agent-assets-http-contracts.ts';
import { inspectHttpOperationCoverage, ownedHttpOperations } from '../../src/web/http/http-operation-coverage.ts';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.mjs';

function operation(catalog, id) {
  const value = catalog.find((item) => item.id === id);
  assert.ok(value, `missing operation ${id}`);
  return value;
}

function validate(validators, operations, id, phase, value) {
  const item = operation(operations, id);
  const schemaId = phase === 'request' ? item.requestSchemaId : phase === 'success' ? item.successSchemaId : item.errorSchemaId;
  const result = validators.validate(schemaId, value);
  assert.equal(result.valid, true, `${id} ${phase}: ${JSON.stringify(result.errors)}`);
}

function releaseAwareness() {
  const track = (name, tag, label, version) => ({
    track: name, tag, label, version, observedVersion: version, status: 'update-available', available: true, installable: true,
    seen: true, newlyObserved: true, notified: true, shouldNotify: true,
  });
  return {
    schemaVersion: 'buildr.release-awareness/v1', mode: 'development', channel: 'development',
    current: { version: '0.1.0-rc.21' }, selectedTrack: 'candidate',
    tracks: { stable: track('stable', 'latest', 'GA 正式版', '0.1.0'), candidate: track('candidate', 'next', 'RC 候选版', '0.1.0-rc.22') },
    notices: [], observedAt: '2026-08-23T00:00:00.000Z',
    freshness: { status: 'fresh', source: 'fixture', checkedAt: '2026-08-23T00:00:00.000Z' },
    status: 'update-available', blockingReasons: [], nextActions: [],
  };
}

test('Runtime/System 真实 HTTP 契约覆盖 JSON、binary、错误与零副作用失败', async (t) => {
  const { base, root } = fixture(t, 'runtime-system-http-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  const originalLog = console.log;
  console.log = () => {};
  try {
    runtime.createProject(['product', '--target', root, '--name', 'Buildr Product', '--description', 'Runtime/System contract fixture']);
  } finally {
    console.log = originalLog;
  }
  const publicationRoot = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: contract-article\ntitle: 契约文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-23\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 契约文章\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), Buffer.from('contract-image'));
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'notes.txt'), 'not-downloadable');

  runtime.releaseAwareness = releaseAwareness;
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, instanceSecret, sessionToken } = await instance.ready;
  const workspaceUrl = `${url}/api/v1/workspaces/${initialWorkspaceId}`;

  let response = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': instanceSecret } });
  assert.equal(response.status, 200);
  validate(LOCAL_APP_HTTP_VALIDATORS, LOCAL_APP_HTTP_OPERATIONS, 'local-app.health', 'success', await response.json());

  response = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': 'wrong' } });
  assert.equal(response.status, 403);
  validate(LOCAL_APP_HTTP_VALIDATORS, LOCAL_APP_HTTP_OPERATIONS, 'local-app.health', 'error', await response.json());

  response = await fetch(`${url}/api/v1/release-awareness`);
  assert.equal(response.status, 200);
  validate(RELEASE_AWARENESS_HTTP_VALIDATORS, RELEASE_AWARENESS_HTTP_OPERATIONS, 'system-installation.release-awareness', 'success', await response.json());

  response = await fetch(`${workspaceUrl}/publications`);
  assert.equal(response.status, 200);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.list', 'success', await response.json());

  response = await fetch(`${workspaceUrl}/publications/contract-article`);
  assert.equal(response.status, 200);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.detail', 'success', await response.json());

  response = await fetch(`${workspaceUrl}/publications/contract-article/assets/assets/cover.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from('contract-image'));

  response = await fetch(`${workspaceUrl}/publications/contract-article/assets/assets/notes.txt`);
  assert.equal(response.status, 400);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.asset', 'error', await response.json());

  let shutdownCalls = 0;
  const originalClose = instance.server.close.bind(instance.server);
  instance.server.close = (...args) => { shutdownCalls += 1; return originalClose(...args); };
  response = await fetch(`${url}/api/v1/app/quit`, {
    method: 'POST', headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' }, body: JSON.stringify({ unexpected: true }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'local_app_http_field_forbidden');
  assert.equal(shutdownCalls, 0);
});

test('Runtime/System validators 不变异输入且全局 operation coverage 闭合', () => {
  const input = { unexpected: true };
  const before = structuredClone(input);
  const result = LOCAL_APP_HTTP_VALIDATORS.validate(operation(LOCAL_APP_HTTP_OPERATIONS, 'local-app.quit').requestSchemaId, input);
  assert.equal(result.valid, false);
  assert.deepEqual(input, before);

  const coverage = inspectHttpOperationCoverage([
    ownedHttpOperations('task-record', TASK_RECORD_HTTP_OPERATIONS),
    ownedHttpOperations('task-professional', TASK_PROFESSIONAL_HTTP_OPERATIONS),
    ownedHttpOperations('workspace', WORKSPACE_HTTP_OPERATIONS),
    ownedHttpOperations('agent-assets', AGENT_ASSETS_HTTP_OPERATIONS),
    LOCAL_APP_HTTP_OPERATIONS,
    RELEASE_AWARENESS_HTTP_OPERATIONS,
    PUBLICATION_HTTP_OPERATIONS,
  ]);
  assert.equal(coverage.status, 'aligned');
  assert.equal(coverage.runtimeBlocking, false);
  assert.ok(coverage.dispositions['migrated-binary'].includes('system-publication.asset'));
  assert.ok(coverage.dispositions['not-applicable'].includes('system-doctor.cli'));

  const broken = inspectHttpOperationCoverage([[...LOCAL_APP_HTTP_OPERATIONS, { id: 'unknown.route', disposition: 'migrated-json' }]], []);
  assert.equal(broken.status, 'blocked');
  assert.deepEqual(broken.blockers, ['unknown.route']);
});
