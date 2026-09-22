import { WORKBENCH_HTTP_OPERATIONS } from '../../src/modules/workbench/interfaces/http/workbench-http-schema.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { LOCAL_APP_HTTP_OPERATIONS, LOCAL_APP_HTTP_VALIDATORS } from '../../src/web/http/buildr-web-http-contracts.ts';
import { RELEASE_AWARENESS_HTTP_OPERATIONS, RELEASE_AWARENESS_HTTP_VALIDATORS } from '../../src/modules/installation/interfaces/http/release-awareness-http-contracts.ts';
import { createReleaseAwarenessHttpContribution } from '../../src/modules/installation/interfaces/http/release-awareness-http.ts';
import { PUBLICATION_HTTP_OPERATIONS, PUBLICATION_HTTP_VALIDATORS } from '../../src/modules/publication/interfaces/http/publication-http-contracts.ts';
import { TASK_HTTP_OPERATIONS } from '../../src/modules/task/interfaces/http/task-http-schema.ts';
import { TASK_PROFESSIONAL_HTTP_OPERATIONS } from '../../src/modules/task/interfaces/http/task-professional-http-contracts.ts';
import { WORKSPACE_HTTP_OPERATIONS } from '../../src/modules/workspace/interfaces/http/workspace-http-contracts.ts';
import { AGENT_ASSETS_HTTP_OPERATIONS } from '../../src/modules/agent-assets/interfaces/http/agent-assets-http-contracts.ts';
import { inspectHttpOperationCoverage, ownedHttpOperations } from '../../src/web/http/http-operation-coverage.ts';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.ts';

function operation(catalog: any, id: any): any  {
  const value: any = catalog.find((item: any) => item.id === id);
  assert.ok(value, `missing operation ${id}`);
  return value;
}

function validate(validators: any, operations: any, id: any, phase: any, value: any): any  {
  const item: any = operation(operations, id);
  const schemaId: any = phase === 'request' ? item.requestSchemaId : phase === 'success' ? item.successSchemaId : item.errorSchemaId;
  const result: any = validators.validate(schemaId, value);
  assert.equal(result.valid, true, `${id} ${phase}: ${JSON.stringify(result.errors)}`);
}

function releaseAwareness(): any  {
  const track: any = (name: any, tag: any, label: any, version: any) => ({
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

test('Runtime/System 真实 HTTP 契约覆盖 JSON、binary、错误与零副作用失败', async (t: any) => {
  const { base, root }: any = fixture(t, 'runtime-system-http-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const originalLog: any = console.log;
  console.log = () => {};
  try {
    runtime.createProject(['product', '--target', root, '--name', 'Buildr Product', '--description', 'Runtime/System contract fixture']);
  } finally {
    console.log = originalLog;
  }
  const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: contract-article\ntitle: 契约文章\nkind: product-article\nstatus: published\npublished_at: 2026-08-23\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 契约文章\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), Buffer.from('contract-image'));
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'notes.txt'), 'downloadable notes');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'unsafe.html'), '<script>bad</script>');

  const httpContributions = runtimeContributions(runtime, 'http').filter((item: any) => item.id !== 'system-installation.release-awareness.http');
  httpContributions.push(createReleaseAwarenessHttpContribution({ releaseAwareness }));
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, instanceSecret, sessionToken }: any = await instance.ready;
  const workspaceUrl: any = `${url}/api/v1/workspaces/${initialWorkspaceId}`;

  let response: any = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': instanceSecret } });
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
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.equal(await response.text(), 'downloadable notes');
  response = await fetch(`${workspaceUrl}/publications/contract-article/assets/assets/unsafe.html`);
  assert.equal(response.status, 400);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.asset', 'error', await response.json());

  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const projectUrl = `${workspaceUrl}/projects/product/publications`;
  response = await fetch(projectUrl, { method: 'POST', headers: { ...headers, 'x-buildr-session': 'wrong' }, body: JSON.stringify({ title: 'unauthorized' }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'session_forbidden');
  response = await fetch(projectUrl, { method: 'POST', headers: { ...headers, origin: 'https://example.com' }, body: JSON.stringify({ title: 'wrong origin' }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'origin_forbidden');
  response = await fetch(projectUrl, { method: 'POST', headers, body: JSON.stringify({ title: 'path rejected', path: '/tmp/escape' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'publication_http_request_invalid');
  response = await fetch(projectUrl, { method: 'POST', headers, body: JSON.stringify({ id: 'http-draft', title: 'HTTP 草稿', content: 'a'.repeat(40 * 1024) }) });
  assert.equal(response.status, 200);
  const created = await response.json();
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.create', 'success', created);
  const articleUrl = `${projectUrl}/http-draft`;
  response = await fetch(`${articleUrl}/assets`, { method: 'POST', headers, body: JSON.stringify({ revision: created.revision, filename: '说明.txt', contentBase64: Buffer.from('z'.repeat(40 * 1024)).toString('base64') }) });
  assert.equal(response.status, 200);
  const uploaded = await response.json();
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.upload', 'success', uploaded);
  assert.equal(uploaded.revision, created.revision);
  response = await fetch(`${articleUrl}/assets/${encodeURIComponent(uploaded.asset.relativePath)}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''/);
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await response.text()).length, 40 * 1024);
  response = await fetch(`${articleUrl}/assets`);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.assets', 'success', await response.json());
  const update = { revision: created.revision, title: '保存后的标题', summary: '摘要', status: 'planned', content: `[说明](${uploaded.asset.relativePath})` };
  response = await fetch(articleUrl, { method: 'PUT', headers, body: JSON.stringify(update) });
  assert.equal(response.status, 200);
  const saved = await response.json();
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.update', 'success', saved);
  assert.notEqual(saved.revision, created.revision);
  response = await fetch(articleUrl, { method: 'PUT', headers, body: JSON.stringify(update) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'publication_revision_conflict');
  response = await fetch(articleUrl, { method: 'DELETE', headers, body: JSON.stringify({ revision: created.revision }) });
  assert.equal(response.status, 409);
  response = await fetch(articleUrl, { method: 'DELETE', headers, body: JSON.stringify({ revision: saved.revision }) });
  assert.equal(response.status, 200);
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.delete', 'success', await response.json());
  assert.equal(fs.existsSync(path.join(publicationRoot, uploaded.asset.relativePath)), true);
  response = await fetch(articleUrl);
  assert.equal(response.status, 404);

  response = await fetch(projectUrl, { method: 'POST', headers, body: JSON.stringify({ id: 'assets', title: '合法的 assets 文章 ID' }) });
  assert.equal(response.status, 200);
  response = await fetch(`${projectUrl}/assets`);
  const namedAssets = await response.json();
  validate(PUBLICATION_HTTP_VALIDATORS, PUBLICATION_HTTP_OPERATIONS, 'system-publication.project-detail', 'success', namedAssets);
  assert.equal(namedAssets.publication.id, 'assets');
  response = await fetch(`${projectUrl}/assets`, { method: 'PUT', headers, body: JSON.stringify({ revision: namedAssets.revision, title: '可以正常修改', summary: '', content: '', status: 'draft' }) });
  assert.equal(response.status, 200);
  const savedAssets = await response.json();
  response = await fetch(`${projectUrl}/assets`, { method: 'DELETE', headers, body: JSON.stringify({ revision: savedAssets.revision }) });
  assert.equal(response.status, 200);

  response = await fetch(projectUrl, { method: 'POST', headers, body: JSON.stringify({ title: 'oversized', content: 'x'.repeat(1024 * 1024) }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'request_body_too_large');
  response = await fetch(`${projectUrl}/contract-article/assets`, { method: 'POST', headers, body: JSON.stringify({ revision: 'old', filename: 'large.txt', contentBase64: 'x'.repeat(14 * 1024 * 1024) }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'request_body_too_large');
  response = await fetch(`${url}/api/v1/app/quit`, { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }) });
  assert.equal(response.status, 413, 'unrelated endpoint retains 32 KiB default');
  assert.equal((await response.json()).error.code, 'request_body_too_large');

  let shutdownCalls: any = 0;
  const originalClose: any = instance.server.close.bind(instance.server);
  instance.server.close = (...args: any[]) => { shutdownCalls += 1; return originalClose(...args); };
  response = await fetch(`${url}/api/v1/app/quit`, {
    method: 'POST', headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' }, body: JSON.stringify({ unexpected: true }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'local_app_http_field_forbidden');
  assert.equal(shutdownCalls, 0);
});

test('Runtime/System validators 不变异输入且全局 operation coverage 闭合', () => {
  const input: any = { unexpected: true };
  const before: any = structuredClone(input);
  const result: any = LOCAL_APP_HTTP_VALIDATORS.validate(operation(LOCAL_APP_HTTP_OPERATIONS, 'local-app.quit').requestSchemaId, input);
  assert.equal(result.valid, false);
  assert.deepEqual(input, before);

  const coverage: any = inspectHttpOperationCoverage([
    WORKBENCH_HTTP_OPERATIONS,
    ownedHttpOperations('task-record', TASK_HTTP_OPERATIONS),
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

  const broken: any = inspectHttpOperationCoverage([[...LOCAL_APP_HTTP_OPERATIONS, { id: 'unknown.route', disposition: 'migrated-json' }]], []);
  assert.equal(broken.status, 'blocked');
  assert.deepEqual(broken.blockers, ['unknown.route']);
});
