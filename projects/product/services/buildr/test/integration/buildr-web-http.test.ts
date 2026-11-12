import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createReleaseAwarenessHttpContribution } from '../../src/modules/installation/interfaces/http/release-awareness-http.ts';
import { createWebStaticFixture } from '../helpers/web-static-fixture.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.ts';

test('Buildr Web only listens after startup initialization completes', async (t: any) => {
  const { base, root }: any = fixture(t, 'buildr-web-startup');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const initializationEntered = Promise.withResolvers<void>();
  const finishInitialization = Promise.withResolvers<void>();
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, {
    targetRoot: root,
    onReady: () => {
      initializationEntered.resolve();
      return finishInitialization.promise;
    },
  });
  t.after(async () => {
    finishInitialization.resolve();
    await instance.ready;
    await instance.shutdown();
  });

  await initializationEntered.promise;
  assert.equal(instance.server.listening, false);
  assert.equal(instance.server.address(), null);

  finishInitialization.resolve();
  const { url, instanceSecret } = await instance.ready;
  const response = await fetch(`${url}/api/v1/health`, {
    headers: { 'x-buildr-instance': instanceSecret },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ready');
});

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

test('对话图片通过路径作用域 cookie 读取本机文件并拒绝非图片', async (t: any) => {
  const { base, root }: any = fixture(t, 'buildr-web-http-images');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, sessionToken }: any = await instance.ready;
  const imagePath = path.join(base, 'pixel.png');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(imagePath, image);
  fs.writeFileSync(path.join(base, 'notes.txt'), 'text');
  const document = await fetch(`${url}/`);
  const cookie = String(document.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^buildr-image=/);
  const headers = { cookie };
  const loaded = await fetch(`${url}/api/v1/conversation-image?path=${encodeURIComponent(imagePath)}`, { headers });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await loaded.arrayBuffer()), image);
  assert.equal((await fetch(`${url}/api/v1/conversation-image?path=${encodeURIComponent(imagePath)}`)).status, 403);
  assert.equal((await fetch(`${url}/api/v1/conversation-image?path=${encodeURIComponent(path.join(base, 'notes.txt'))}`, { headers })).status, 415);
  assert.equal((await fetch(`${url}/api/v1/conversation-image?path=${encodeURIComponent(path.join(base, 'missing.png'))}`, { headers })).status, 404);
  assert.equal(sessionToken.length > 20, true);
});

test('哈希静态资源压缩协商、缓存与 HTML 会话隔离', async t => {
  const {base,root}=fixture(t,'web-asset-transfer');
  const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'app-data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  const assets=path.join(base,'dist');fs.mkdirSync(path.join(assets,'assets'),{recursive:true});
  const content='export const value = "可缓存资源";\n'.repeat(500),file=path.join(assets,'assets/main-abcdefgh.js');
  const {gzipSync,brotliCompressSync}=await import('node:zlib');
  fs.writeFileSync(file,content);fs.writeFileSync(file+'.gz',gzipSync(content));fs.writeFileSync(file+'.br',brotliCompressSync(content));
  fs.writeFileSync(path.join(assets,'index.html'),'<meta name="buildr-session" content="__BUILDR_SESSION_TOKEN__">');
  const instance=createLocalWorkspaceServer(createRuntime(),{targetRoot:root,staticRoot:assets});
  const {url}=await instance.ready;t.after(()=>new Promise<void>(resolve=>instance.server.close(()=>resolve())));
  for(const [accept,encoding]of [['br, gzip','br'],['br;q=0, gzip;q=0.5','gzip'],['br;q=0,gzip;q=0',''],['identity','']] as const){
    const response=await fetch(url+'/assets/main-abcdefgh.js',{headers:{'accept-encoding':accept}});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-encoding')??'',encoding);
    assert.equal(response.headers.get('vary'),'Accept-Encoding');assert.match(response.headers.get('cache-control')!,/immutable/);
    assert.equal(await response.text(),content);assert.match(response.headers.get('server-timing')!,/^app;dur=\d/);
    if(encoding)assert.ok(Number(response.headers.get('content-length'))<Buffer.byteLength(content)/2);
  }
  assert.equal((await fetch(url+'/')).headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url+'/assets/main-abcdefgh.js.br')).status,404);
  fs.unlinkSync(file+'.br');fs.unlinkSync(file+'.gz');
  assert.equal(await (await fetch(url+'/assets/main-abcdefgh.js',{headers:{'accept-encoding':'br,gzip'}})).text(),content);
});

test('发布提示等待现有工作池时独立 HTML 先完成，保留原协议',async t=>{
  const {base,root}=fixture(t,'release-awareness-background');
  const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'app-data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  const runtime=createRuntime(),httpContributions=runtimeContributions(runtime,'http').filter((item:any)=>item.id!=='system-installation.release-awareness.http');
  httpContributions.push(createReleaseAwarenessHttpContribution({releaseAwareness:()=>assert.fail('不能在 HTTP 主线程查询')},()=>root));
  let release!:(value:unknown)=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});
  const readExecutor={run:(operation:string,input:any)=>{assert.equal(operation,'release-awareness');assert.equal(input.targetRoot,root);started();return new Promise(resolve=>{release=resolve;});}};
  const instance=createLocalWorkspaceServer(runtime,{targetRoot:root,staticRoot:createWebStaticFixture(path.join(base,'web')),httpContributions,readExecutor});const {url}=await instance.ready;
  t.after(()=>new Promise<void>(resolve=>instance.server.close(()=>resolve())));
  const result={current:{version:'fixture'},tracks:{},notices:[],blockingReasons:[],nextActions:[]};
  const pending=fetch(url+'/api/v1/release-awareness');
  try{
    await began;
    const html=await fetch(url+'/');assert.equal(html.status,200);await html.text();
    release(result);
    const response=await pending;assert.equal(response.status,200);assert.equal((await response.json()).current.version,'fixture');
  }finally{release?.(result);await pending.catch(()=>{});}
});
