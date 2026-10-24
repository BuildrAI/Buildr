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
  const idle: any = { schemaVersion: 'buildr.web-update-flow/v2', id: null, revision: 0, stage: 'idle', runningVersion: '1.0.0', installedVersion: null, simulated: false, steps: { install: 'pending', launcher: 'pending', restart: 'pending', verify: 'pending' }, launcherError: null, status: 'idle', track: null, version: null, currentVersion: '1.0.0', error: null, updatedAt: null };
  const application: any = {
    webUpdateStatus: () => idle,
    webUpdateRecover: (input: any) => { calls.push(['recover', input]); return { ...idle, status: 'applying' }; },
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
  response = await fetch(`${url}/api/v1/update/recover`, { method: 'POST', headers, body: JSON.stringify({ expectedJobId: 'job', expectedVersion: '1.1.0', action: 'all' }) });
  assert.equal(response.status, 400);
  response = await fetch(`${url}/api/v1/update/recover`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ expectedJobId: 'job', expectedVersion: '1.1.0', action: 'launcher' }) });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0, '非法请求不得产生 Application 副作用');

  response = await fetch(`${url}/api/v1/update/prepare`, { method: 'POST', headers, body: JSON.stringify({ track: 'stable', expectedVersion: '1.1.0' }) });
  assert.equal(response.status, 202);
  validate('system-installation.update-flow.prepare', 'success', await response.json());
  response = await fetch(`${url}/api/v1/update/apply`, { method: 'POST', headers, body: JSON.stringify({ expectedVersion: '1.1.0' }) });
  assert.equal(response.status, 202);
  validate('system-installation.update-flow.apply', 'success', await response.json());
  response = await fetch(`${url}/api/v1/update/recover`, { method: 'POST', headers, body: JSON.stringify({ expectedJobId: 'job', expectedVersion: '1.1.0', action: 'launcher' }) });
  assert.equal(response.status, 202);
  validate('system-installation.update-flow.recover', 'success', await response.json());
  assert.deepEqual(calls, [
    ['prepare', { track: 'stable', expectedVersion: '1.1.0' }],
    ['apply', { expectedVersion: '1.1.0' }],
    ['recover', { expectedJobId: 'job', expectedVersion: '1.1.0', action: 'launcher' }],
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
  const idle: any = { schemaVersion: 'buildr.web-update-flow/v2', id: null, revision: 0, stage: 'idle', runningVersion: '1.0.0', installedVersion: null, simulated: false, steps: { install: 'pending', launcher: 'pending', restart: 'pending', verify: 'pending' }, launcherError: null, status: 'idle', track: null, version: null, currentVersion: '1.0.0', error: null, updatedAt: null };
  const application: any = {
    webUpdateStatus: () => idle,
    webUpdateRecover: (input: any) => { calls.push(['recover', input]); return { ...idle, status: 'applying' }; },
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
  for (const [pathname, body] of [['/api/v1/update/prepare', { track: 'stable', expectedVersion: '1.1.0' }], ['/api/v1/update/apply', { expectedVersion: '1.1.0' }], ['/api/v1/update/recover', { expectedJobId: 'job', expectedVersion: '1.1.0', action: 'launcher' }]] as any) {
    response = await fetch(`${url}${pathname}`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 409, pathname);
    assert.equal((await response.json()).error.code, 'update_flow_preview_unsupported');
  }
  assert.equal(calls.length, 0, 'Preview 写请求不得产生 Application 副作用');
});

test('共享位置 HTTP 仅接受资源身份并要求写保护，读取不准备资源', async () => {
  const reads:any[]=[];const opens:any[]=[];
  const resources:any={resourceLocation:()=>{reads.push(true);return {version:'1.0.0',resourceSet:'1.0.0-content',path:'/shared/resources/1.0.0-content',available:true,issue:null};},openResourceLocation:async(input:any)=>{opens.push(input);return {requested:true};}};
  const http=createUpdateFlowHttpContribution({},resources);
  const context:any={request:{method:'GET'},pathname:'/api/v1/installation/resources',authorizeWrite:()=>{throw new Error('protected');},readJsonBody:async()=>({resourceSet:'1.0.0-content'})};
  assert.equal((await http.handleTopLevel(context))?.body.available,true);assert.equal(reads.length,1);assert.equal(opens.length,0);
  const write={...context,request:{method:'POST'},pathname:'/api/v1/installation/resources/open'};
  await assert.rejects(http.handleTopLevel(write),/protected/);assert.equal(opens.length,0);
  await assert.rejects(http.handleTopLevel({...write,authorizeWrite:()=>{},readJsonBody:async()=>({path:'/etc'})}),/契约/);assert.equal(opens.length,0);
  assert.equal((await http.handleTopLevel({...write,authorizeWrite:()=>{}}))?.body.requested,true);assert.deepEqual(opens,[{resourceSet:'1.0.0-content'}]);
});
