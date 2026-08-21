import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.mjs';

test('Buildr Web Runtime HTTP owner 只读读取不依赖 Git，并传播明确的 API 边界', async (t) => {
  const { base, root } = fixture(t, 'local-app-http-owner');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer = createRuntime();
  writer.createTaskRecord(root, { taskId: 'http-read', title: 'HTTP 只读', intent: '验证 HTTP owner', projects: [], services: [], changes: [] });
  const reader = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('HTTP read 不得观察 Git/worktree provenance'); } });
  const instance = createLocalWorkspaceServer(reader, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;

  const list = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).tasks.map((item) => item.record.taskId), ['http-read']);
  const development = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/development`);
  assert.equal(development.status, 200);
  assert.equal((await development.json()).schemaVersion, 'buildr.task-development-operation-result/v1');
  const overview = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/overview`);
  assert.equal(overview.status, 200);
  assert.equal((await overview.json()).schemaVersion, 'buildr.task-overview/v1');
  const prototypes = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-prototypes`);
  assert.equal(prototypes.status, 200);
  assert.deepEqual(await prototypes.json(), { taskId: 'http-read', prototypes: [], diagnostics: [] });
  const legacyPreviews = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-read/ui-previews`);
  assert.equal(legacyPreviews.status, 404);
  const missing = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/missing/development`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'task_record_not_found');
});

test('Buildr Web Runtime HTTP 只读每日演进，不接受路径也不写入', async (t) => {
  const { base, root } = fixture(t, 'local-app-http-daily-progress');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'http-progress', title: 'HTTP 每日演进', intent: '验证只读 API', projects: ['demo'], services: [], changes: [] });
  runtime.recordProjectDailyProgress(root, {
    project: 'demo',
    date: '2026-08-18',
    payload: {
      daySummary: {
        added: '新增只读 HTTP 投影。',
        updated: '更新 Task 关联为可选。',
        deleted: '删除必填推进项。',
        drawbacks: 'GET 仍不扫描 Git。',
      },
      commits: [{
        sha: 'c3a91f2',
        subject: 'HTTP 只读提交。',
        authorName: '王志宏',
        authorEmail: 'wangzhihong@example.com',
        authorship: 'self',
        taskIds: ['http-progress'],
      }],
      files: [{ path: 'README.md', kind: 'modified' }],
    },
  });
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;

  const inspected = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo/daily-progress/2026-08-18?group=person`);
  assert.equal(inspected.status, 200);
  const body = await inspected.json();
  assert.equal(body.schemaVersion, 'buildr.project-daily-progress-inspect-result/v1');
  assert.equal(body.status, 'inspected');
  assert.equal(body.groups[0].label, '王志宏 · wangzhihong@example.com');
  assert.equal(body.daySummary.added, '新增只读 HTTP 投影。');
  assert.equal(body.commits[0].sha, 'c3a91f2');
  assert.equal(Object.hasOwn(body, 'file'), false);
  assert.doesNotMatch(JSON.stringify(body), /workspace\.sqlite/);

  const empty = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo/daily-progress/2026-08-01`);
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).status, 'not-found');

  const reverse = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-progress/daily-progress`);
  assert.equal(reverse.status, 200);
  assert.equal((await reverse.json()).itemCount, 1);

  const pathRejected = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo/daily-progress/2026-08-18?target=${encodeURIComponent(root)}`);
  assert.equal(pathRejected.status, 400);
  assert.equal((await pathRejected.json()).error.code, 'target_forbidden');

  const queryRejected = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo/daily-progress/2026-08-18?path=/tmp`);
  assert.equal(queryRejected.status, 400);

  const writeRejected = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/projects/demo/daily-progress/2026-08-18`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken, origin: url },
    body: JSON.stringify({ daySummary: {}, commits: [], files: [] }),
  });
  assert.equal(writeRejected.status, 404);
});

test('Buildr Web Runtime HTTP owner 传播 read executor 错误并保持写请求保护', async (t) => {
  const { base, root } = fixture(t, 'local-app-http-errors');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'http-errors', title: 'HTTP 错误', intent: '验证错误边界', projects: [], services: [], changes: [] });
  const readExecutor = {
    run: async () => { throw Object.assign(new Error('受控 read failure'), { code: 'local_app_http_test_failure' }); },
    close: async () => {},
  };
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root, readExecutor });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const failed = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-errors/development`);
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, 'local_app_http_test_failure');
  const rejectedWrite = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/http-errors`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ title: '不得写入' }),
  });
  assert.equal(rejectedWrite.status, 403);
  assert.equal((await rejectedWrite.json()).error.code, 'origin_forbidden');
});

test('正式 Local HTTP Server 启动scheduler，Task Preview Server完全不创建scheduled maintenance', async (t) => {
  const { base, root } = fixture(t, 'local-app-scheduled-maintenance');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'scheduler-boundary', title: 'Scheduler Boundary', intent: '验证Preview零后台维护', projects: [], services: [], changes: [] });
  const taskBefore = runtime.inspectTaskRecord(root, 'scheduler-boundary').record;

  let formalCreated = 0;
  let formalStarted = 0;
  let formalStopped = 0;
  const formal = createLocalWorkspaceServer(runtime, {
    targetRoot: root,
    scheduledMaintenanceFactory: () => {
      formalCreated += 1;
      return { start: () => { formalStarted += 1; }, stop: () => { formalStopped += 1; } };
    },
  });
  await formal.ready;
  assert.equal(formalCreated, 1);
  assert.equal(formalStarted, 1);
  await new Promise((resolve) => formal.server.close(resolve));
  assert.equal(formalStopped, 1);

  let previewFactoryCalls = 0;
  const preview = createLocalWorkspaceServer(runtime, {
    targetRoot: root,
    previewIdentity: { schemaVersion: 'buildr.local-app-preview/v1', instance: 'test-preview' },
    scheduledMaintenanceFactory: () => {
      previewFactoryCalls += 1;
      throw new Error('Preview must not create scheduled maintenance.');
    },
  });
  await preview.ready;
  assert.equal(previewFactoryCalls, 0);
  await new Promise((resolve) => preview.server.close(resolve));
  assert.deepEqual(runtime.inspectTaskRecord(root, 'scheduler-boundary').record, taskBefore);
});

test('Buildr Web Runtime 提供全局只读 Release Awareness 且没有 npm 更新写路由', async (t) => {
  const { base, root } = fixture(t, 'local-app-release-awareness');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.releaseAwareness = () => ({
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
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url } = await instance.ready;

  const response = await fetch(`${url}/api/v1/release-awareness`);
  assert.equal(response.status, 200);
  const awareness = await response.json();
  assert.equal(awareness.schemaVersion, 'buildr.release-awareness/v1');
  assert.equal(awareness.tracks.stable.version, '0.1.0');
  assert.equal(awareness.tracks.candidate.version, '0.1.0-rc.13');

  const rejected = await fetch(`${url}/api/v1/release-awareness`, { method: 'POST' });
  assert.equal(rejected.status, 404);
  assert.equal((await rejected.json()).error.code, 'not_found');
});
