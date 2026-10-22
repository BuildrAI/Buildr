import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { UPDATE_FLOW_HTTP_OPERATIONS, UPDATE_FLOW_HTTP_VALIDATORS } from '../../src/modules/installation/interfaces/http/update-flow-http-contracts.ts';
import { createUpdateFlowHttpContribution } from '../../src/modules/installation/interfaces/http/update-flow-http.ts';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.ts';

function operation(id: any): any  {
  const value: any = UPDATE_FLOW_HTTP_OPERATIONS.find((item: any) => item.id === id);
  assert.ok(value, `missing operation ${id}`);
  return value;
}

function validate(id: any, phase: any, value: any): any  {
  const item: any = operation(id);
  const schemaId: any = phase === 'request' ? item.requestSchemaId : phase === 'success' ? item.successSchemaId : item.errorSchemaId;
  const result: any = UPDATE_FLOW_HTTP_VALIDATORS.validate(schemaId, value);
  assert.equal(result.valid, true, `${id} ${phase}: ${JSON.stringify(result.errors)}`);
}

test('Update Flow HTTP 契约：状态只读、写保护、Schema 校验与无副作用失败', async (t: any) => {
  const { base, root }: any = fixture(t, 'update-flow-http-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const originalLog: any = console.log;
  console.log = () => {};
  try {
    runtime.createProject(['product', '--target', root, '--name', 'Buildr Product', '--description', 'Update flow contract fixture']);
  } finally {
    console.log = originalLog;
  }

  const calls: any[] = [];
  const idle: any = { schemaVersion: 'buildr.web-update-flow/v1', status: 'idle', track: null, version: null, currentVersion: '1.0.0', error: null, updatedAt: null };
  const application: any = {
    webUpdateStatus: () => idle,
    webUpdatePrepare: (input: any) => { calls.push(['prepare', input]); return { ...idle, status: 'preparing', track: input.track, version: input.expectedVersion, updatedAt: '2026-08-23T00:00:00.000Z' }; },
    webUpdateApply: (input: any) => { calls.push(['apply', input]); return { ...idle, status: 'applying', track: 'stable', version: input.expectedVersion, updatedAt: '2026-08-23T00:00:00.000Z' }; },
  };
  const httpContributions = runtimeContributions(runtime, 'http').filter((item: any) => item.id !== 'system-installation.update-flow.http');
  httpContributions.push(createUpdateFlowHttpContribution(application));
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, sessionToken }: any = await instance.ready;

  let response: any = await fetch(`${url}/api/v1/update/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  validate('system-installation.update-flow.status', 'success', status);
  assert.equal(status.status, 'idle');

  response = await fetch(`${url}/api/v1/update/prepare`, {
    method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ track: 'stable', expectedVersion: '1.1.0' }),
  });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/v1/update/prepare`, {
    method: 'POST', headers: { origin: url, 'x-buildr-session': 'wrong', 'content-type': 'application/json' }, body: JSON.stringify({ track: 'stable', expectedVersion: '1.1.0' }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'session_forbidden');

  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  response = await fetch(`${url}/api/v1/update/prepare`, { method: 'POST', headers, body: JSON.stringify({ track: 'stable' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'update_flow_http_request_invalid');
  response = await fetch(`${url}/api/v1/update/prepare`, { method: 'POST', headers, body: JSON.stringify({ track: 'beta', expectedVersion: '1.1.0' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'update_flow_http_request_invalid');
  response = await fetch(`${url}/api/v1/update/apply`, { method: 'POST', headers, body: JSON.stringify({ unexpected: true }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'update_flow_http_request_invalid');
  assert.equal(calls.length, 0, '非法请求不得产生 Application 副作用');

  response = await fetch(`${url}/api/v1/update/prepare`, { method: 'POST', headers, body: JSON.stringify({ track: 'stable', expectedVersion: '1.1.0' }) });
  assert.equal(response.status, 202);
  validate('system-installation.update-flow.prepare', 'success', await response.json());
  response = await fetch(`${url}/api/v1/update/apply`, { method: 'POST', headers, body: JSON.stringify({ expectedVersion: '1.1.0' }) });
  assert.equal(response.status, 202);
  validate('system-installation.update-flow.apply', 'success', await response.json());
  assert.deepEqual(calls, [
    ['prepare', { track: 'stable', expectedVersion: '1.1.0' }],
    ['apply', { expectedVersion: '1.1.0' }],
  ]);
});

test('Update Flow HTTP 契约：Preview 实例拒绝写入口，状态仍只读可观', async (t: any) => {
  const { base, root }: any = fixture(t, 'update-flow-http-preview');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const originalLog: any = console.log;
  console.log = () => {};
  try {
    runtime.createProject(['product', '--target', root, '--name', 'Buildr Product', '--description', 'Update flow preview fixture']);
  } finally {
    console.log = originalLog;
  }

  const calls: any[] = [];
  const idle: any = { schemaVersion: 'buildr.web-update-flow/v1', status: 'idle', track: null, version: null, currentVersion: '1.0.0', error: null, updatedAt: null };
  const application: any = {
    webUpdateStatus: () => idle,
    webUpdatePrepare: (input: any) => { calls.push(['prepare', input]); return { ...idle, status: 'preparing' }; },
    webUpdateApply: (input: any) => { calls.push(['apply', input]); return { ...idle, status: 'applying' }; },
  };
  const httpContributions = runtimeContributions(runtime, 'http').filter((item: any) => item.id !== 'system-installation.update-flow.http');
  httpContributions.push(createUpdateFlowHttpContribution(application));
  const previewIdentity = { taskId: 'task-fixture', workspaceRoot: root, sourceRoot: root };
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions, previewIdentity });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, sessionToken }: any = await instance.ready;

  let response: any = await fetch(`${url}/api/v1/update/status`);
  assert.equal(response.status, 200);

  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  for (const [pathname, body] of [['/api/v1/update/prepare', { track: 'stable', expectedVersion: '1.1.0' }], ['/api/v1/update/apply', { expectedVersion: '1.1.0' }]] as any) {
    response = await fetch(`${url}${pathname}`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 409, pathname);
    assert.equal((await response.json()).error.code, 'update_flow_preview_unsupported');
  }
  assert.equal(calls.length, 0, 'Preview 写请求不得产生 Application 副作用');
});
