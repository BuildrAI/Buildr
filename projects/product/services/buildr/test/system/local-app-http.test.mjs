import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
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
  const missing = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/missing/development`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'task_record_not_found');
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
