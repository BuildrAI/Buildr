import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createReleaseAwarenessHttpContribution } from '../../src/modules/installation/interfaces/http/release-awareness-http.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.ts';

test('Buildr Web Runtime HTTP owner 只读读取不依赖 Git，并传播明确的 API 边界', async (t: any) => {
  const { base, root }: any = fixture(t, 'buildr-web-http-owner');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer: any = createRuntime();
  writer.createTask(root, { taskId: 'http-read', title: 'HTTP 只读', intent: '验证 HTTP owner', projects: [], services: [], changes: [] });
  const reader: any = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('HTTP read 不得观察 Git/worktree provenance'); } });
  const instance: any = createLocalWorkspaceServer(reader, { targetRoot: root });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId }: any = await instance.ready;

  const list: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).tasks.map((item: any) => item.record.taskId), ['http-read']);
  const development: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/development`);
  assert.equal(development.status, 404);
  const overview: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/overview`);
  assert.equal(overview.status, 404);
  const prototypes: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-prototypes`);
  assert.equal(prototypes.status, 200);
  assert.deepEqual(await prototypes.json(), { taskId: 'http-read', prototypes: [], diagnostics: [] });
  const prototypeDirectory = path.join(root, '.buildr/local/task-prototypes/http-read');
  fs.mkdirSync(prototypeDirectory, { recursive: true });
  const html = '<html><head><title>任务本机原型</title></head><body><!-- buildr:ui-prototype --><p>只有当前任务可读</p></body></html>';
  fs.writeFileSync(path.join(prototypeDirectory, 'screen.html'), html);
  const discovered = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-prototypes`).then(response => response.json());
  assert.equal(discovered.prototypes.length, 1);
  assert.equal(discovered.prototypes[0].source, 'task');
  assert.equal(discovered.prototypes[0].change, null);
  const document = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-prototypes/${discovered.prototypes[0].id}`);
  assert.equal(document.status, 200);
  assert.equal(await document.text(), html);
  assert.match(document.headers.get('content-security-policy') || '', /sandbox allow-scripts/);
  assert.equal((await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/unknown-task/ui-prototypes`)).status, 404);
  const legacyPreviews: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-previews`);
  assert.equal(legacyPreviews.status, 404);
});

test('Buildr Web Runtime HTTP owner 传播 read executor 错误并保持写请求保护', async (t: any) => {
  const { base, root }: any = fixture(t, 'buildr-web-http-errors');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  runtime.createTask(root, { taskId: 'http-errors', title: 'HTTP 错误', intent: '验证错误边界', projects: [], services: [], changes: [] });
  const readExecutor: any = {
    run: async () => { throw Object.assign(new Error('受控 read failure'), { code: 'local_app_http_test_failure' }); },
    close: async () => {},
  };
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, readExecutor });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken }: any = await instance.ready;
  const failed: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-errors/reviews`);
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, 'local_app_http_test_failure');
  const rejectedWrite: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-errors`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ title: '不得写入' }),
  });
  assert.equal(rejectedWrite.status, 403);
  assert.equal((await rejectedWrite.json()).error.code, 'origin_forbidden');
});

test('Buildr Web Runtime 提供全局只读 Release Awareness 且没有 npm 更新写路由', async (t: any) => {
  const { base, root }: any = fixture(t, 'local-app-release-awareness');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const releaseAwareness = () => ({
    schemaVersion: 'buildr.release-awareness/v1',
    current: { version: '0.1.0-rc.12' },
    selectedTrack: 'candidate',
    tracks: {
      stable: { tag: 'latest', version: '0.1.0', status: 'update-available', available: true, installable: true },
      candidate: { tag: 'next', version: '0.1.0-rc.13', status: 'update-available', available: true, installable: true },
    },
    notices: [], observedAt: '2026-08-15T00:00:00.000Z',
    freshness: { status: 'fresh', source: 'fixture', checkedAt: '2026-08-15T00:00:00.000Z' },
    blockingReasons: [], nextActions: [],
  });
  const httpContributions = runtimeContributions(runtime, 'http').filter((item: any) => item.id !== 'system-installation.release-awareness.http');
  httpContributions.push(createReleaseAwarenessHttpContribution({ releaseAwareness }));
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url }: any = await instance.ready;

  const response: any = await fetch(`${url}/api/v1/release-awareness`);
  assert.equal(response.status, 200);
  const awareness: any = await response.json();
  assert.equal(awareness.schemaVersion, 'buildr.release-awareness/v1');
  assert.equal(awareness.tracks.stable.version, '0.1.0');
  assert.equal(awareness.tracks.candidate.version, '0.1.0-rc.13');

  const rejected: any = await fetch(`${url}/api/v1/release-awareness`, { method: 'POST' });
  assert.equal(rejected.status, 404);
  assert.equal((await rejected.json()).error.code, 'not_found');
});
