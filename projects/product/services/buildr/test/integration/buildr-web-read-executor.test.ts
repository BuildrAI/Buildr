import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { createChangeHttpContribution } from '../../src/modules/task/change/interfaces/http/change-http.ts';
import { createBoundedBuildrWebReadExecutor } from '../../src/web/http/read-executor.ts';
import { copyPreparedWorkspace, copyPreparedProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { CODE_APPLICATION } from '../../src/modules/code/module.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

function fakeWorkerFactory({ delayMs = 20, failFirst = false, metrics }: any): any  {
  let created: any = 0;
  return () => {
    const worker: any = new EventEmitter();
    const workerId: any = ++created;
    let timer: any = null;
    let running: any = false;
    worker.postMessage = (message: any) => {
      metrics.calls += 1;
      metrics.started.push(message.id);
      metrics.messages?.push(message);
      metrics.active += 1;
      running = true;
      metrics.maxActive = Math.max(metrics.maxActive, metrics.active);
      timer = setTimeout(() => {
        timer = null;
        running = false;
        metrics.active -= 1;
        if (failFirst && workerId === 1) {
          worker.emit('error', Object.assign(new Error('worker crashed'), { code: 'worker_crashed' }));
          worker.emit('exit', 1);
          return;
        }
        worker.emit('message', { id: message.id, ok: true, value: { operation: message.operation, taskId: message.taskId } });
      }, typeof delayMs === 'function' ? delayMs(workerId, message) : delayMs);
    };
    worker.terminate = () => {
      metrics.terminated = (metrics.terminated ?? 0) + 1;
      if (timer) clearTimeout(timer);
      timer = null;
      if (running) metrics.active -= 1;
      running = false;
      return Promise.resolve();
    };
    return worker;
  };
}

const input: any = (taskId: any, signal: any) => ({ targetRoot: '/tmp/buildr-read-executor', taskId, signal });

test('registration-only inventory does not start a read worker; Git status still uses the bounded executor', async t => {
  const { root } = copyPreparedWorkspace(t, 'inventory-no-worker');
  const runtime = createRuntime(), application = runtimeProvide(runtime, CODE_APPLICATION);
  const http = createCodeHttpContribution(application);
  let submitted = 0;
  const context = { request: { method: 'GET' }, root, searchParams: new URLSearchParams(), submitTaskRead: async () => { submitted++; throw Error('status worker'); } };
  const result = await http.handle({ ...context, suffix: '/code/source-control-inventory' });
  assert.equal(result?.status, 200);
  assert.equal(submitted, 0);
  await assert.rejects(http.handle({ ...context, suffix: '/code/source-control' }), /status worker/);
  assert.equal(submitted, 1);
});

test('固定容量与 FIFO 队列限制并发且不重复派发', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 2, queueLimit: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  try {
    const first: any = executor.run('coordination', input('task-a'));
    const second: any = executor.run('reviews', input('task-b'));
    const third: any = executor.run('verification', input('task-c'));
    await assert.rejects(executor.run('coordination', input('task-d')), (error: any) => error.code === 'local_app_read_queue_full');
    const results: any = await Promise.all([first, second, third]);
    assert.deepEqual(results.map((item: any) => item.taskId), ['task-a', 'task-b', 'task-c']);
    assert.equal(metrics.calls, 3);
    assert.equal(metrics.maxActive, 2);
    assert.deepEqual(metrics.started, [1, 2, 3]);
  } finally {
    await executor.close();
  }
});

test('取消排队和运行中的读取都不重试，运行中取消会回收 Worker 并立即恢复容量', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [], terminated: 0 };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ delayMs: (workerId: any) => workerId === 1 ? 1000 : 20, metrics }) });
  try {
    const runningController: any = new AbortController();
    const running: any = executor.run('coordination', input('task-running', runningController.signal));
    const queuedController: any = new AbortController();
    const queued: any = executor.run('reviews', input('task-queued', queuedController.signal));
    queuedController.abort();
    await assert.rejects(queued, (error: any) => error.code === 'local_app_read_cancelled');
    runningController.abort();
    await assert.rejects(running, (error: any) => error.code === 'local_app_read_cancelled');
    const next: any = executor.run('verification', input('task-next'));
    await next;
    assert.equal(metrics.calls, 2);
    assert.deepEqual(metrics.started, [1, 3], '取消的 queued request 不得派发，后续请求使用新的 sequence id');
    assert.equal(metrics.terminated, 1, '运行中的取消必须终止占用容量的 Worker');
    assert.equal(metrics.maxActive, 1);
  } finally {
    await executor.close();
  }
});

test('Worker failure 只结算当前请求并恢复固定容量', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor: any = createBoundedBuildrWebReadExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ failFirst: true, metrics }) });
  try {
    await assert.rejects(executor.run('coordination', input('task-failed')), (error: any) => error.code === 'worker_crashed');
    const recovered: any = await executor.run('reviews', input('task-recovered'));
    assert.equal(recovered.taskId, 'task-recovered');
    assert.equal(metrics.calls, 2);
    assert.equal(metrics.maxActive, 1);
  } finally {
    await executor.close();
  }
});


test('任务材料使用同一有界只读队列，只传任务范围字段', async () => {
 const metrics:any={calls:0,active:0,maxActive:0,started:[],messages:[]};
 const executor=createBoundedBuildrWebReadExecutor({workerCount:1,queueLimit:4,workerFactory:fakeWorkerFactory({metrics})});
 try {
  await executor.run('file-diff',{...input('task-a'),repositoryId:'repo',filePath:'src/a.ts',commitHash:'worktree'});
  metrics.messages.shift();
  await executor.run('change',{...input('task-a'),project:'demo',change:'one'});
  await executor.run('documents',{...input('task-a'),project:'demo',documentPath:'docs/one.md'});
  await executor.run('materials',input('task-a'));
  await executor.run('changed-file-count',input('task-a'));
  await executor.run('prototypes',input('task-a'));
  await executor.run('prototype',{...input('task-a'),prototypeId:'a'.repeat(32)});
  assert.equal(metrics.maxActive,1);
  assert.equal(metrics.messages[0].project,'demo'); assert.equal(metrics.messages[0].change,'one');
  assert.equal(metrics.messages[1].documentPath,'docs/one.md');
  assert.throws(() => executor.run('change',{...input('task-a'),project:'../other',change:'one'}));
  assert.throws(() => executor.run('documents',{...input('task-a'),project:'demo',documentPath:'docs/one.md',arbitraryCommand:'read'}));
  assert.throws(() => executor.run('reviews',{...input('task-a'),project:'demo'}));
 } finally {await executor.close();}
});

test('文件差异读取队列保留可选检出来源，旧请求兼容且拒绝无效身份', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [], messages: [] };
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  const fields = { ...input('task-a'), repositoryId: 'repo', filePath: 'src/a.ts', commitHash: 'worktree' };
  const checkoutId = 'checkout-' + 'a'.repeat(64);
  try {
    await executor.run('file-diff', { ...fields, checkoutId });
    assert.equal(metrics.messages[0].checkoutId, checkoutId);
    await executor.run('file-diff', fields);
    assert.equal('checkoutId' in metrics.messages[1], false);
    for (const invalid of ['', 'main', ['checkout-' + 'a'.repeat(64)], '../other']) assert.throws(() => executor.run('file-diff', { ...fields, checkoutId: invalid }), (error: { code: string }) => error.code === 'local_app_read_input_invalid');
    assert.throws(() => executor.run('changed-files', { ...input('task-a'), checkoutId }), (error: { code: string }) => error.code === 'local_app_read_field_forbidden');
  } finally { await executor.close(); }
});


test('材料HTTP入口直接交给有界读取器，主线程不再读取文件或任务详情', async () => {
 const calls:any[]=[];let html='';
 const http=createChangeHttpContribution();
 const submitTaskRead=async (operation:string,taskId:string,input?:Record<string,string>) => {calls.push({operation,taskId,input});return {html:'<p>preview</p>'};};
 const context={request:{method:'GET'},root:'/tmp/read-only-scope',respond:{uiPrototypeHtml:(value:string)=>{html=value;}},submitTaskRead};
 await http.handle({...context,suffix:'/tasks/task-a/changes/demo/change-a'});
 await http.handle({...context,suffix:'/tasks/task-a/documents/demo/docs/one%20two.md'});
 await http.handle({...context,suffix:'/tasks/task-a/ui-prototypes'});
 await http.handle({...context,suffix:'/tasks/task-a/ui-prototypes/'+'a'.repeat(32)});
 assert.deepEqual(calls.map(item=>item.operation),['change','documents','prototypes','prototype']);
 assert.deepEqual(calls[0].input,{project:'demo',change:'change-a'});
 assert.deepEqual(calls[1].input,{project:'demo',documentPath:'docs/one two.md'});
 assert.equal(html,'<p>preview</p>');
 await assert.rejects(http.handle({...context,suffix:'/tasks/task-a/documents/demo/%ZZ.md'}));
 assert.equal(await http.handle({...context,request:{method:'POST'},suffix:'/tasks/task-a/ui-prototypes'}),null);
});

test('交付资料HTTP和有界读取器保留相对路径与已观察来源，拒绝缺失或重复身份', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [], messages: [] };
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  const http = createChangeHttpContribution();
  const expectedSourceIdentity = 'sha256-' + 'a'.repeat(64);
  const context = { request: { method: 'GET' }, root: '/tmp/read-only-scope', respond: { uiPrototypeHtml: () => {} }, submitTaskRead: (operation: string, taskId: string, fields?: Record<string, string>) => executor.run(operation, { targetRoot: '/tmp/read-only-scope', taskId, ...fields }), suffix: '/tasks/task-a/changes/demo/change-a/assets/handoff/one%20two.sql' };
  try {
    await http.handle({ ...context, searchParams: new URLSearchParams({ expectedSourceIdentity }) });
    assert.equal(metrics.messages[0].operation, 'change-asset');
    assert.equal(metrics.messages[0].assetPath, 'handoff/one two.sql');
    assert.equal(metrics.messages[0].expectedSourceIdentity, expectedSourceIdentity);
    for (const searchParams of [new URLSearchParams(), new URLSearchParams({ expectedSourceIdentity: 'invalid' }), new URLSearchParams(`expectedSourceIdentity=${expectedSourceIdentity}&expectedSourceIdentity=${expectedSourceIdentity}`), new URLSearchParams({ expectedSourceIdentity, extra: 'field' })]) {
      await assert.rejects(http.handle({ ...context, searchParams }), (error: { code: string }) => error.code === 'task_change_asset_input_invalid');
    }
    assert.equal(metrics.calls, 1, '参数拒绝不得提交文件读取');
  } finally { await executor.close(); }
});

test('Web 默认按需创建读取 Worker，首次交付资料 HTTP 读取正确并复用同一线程', async t => {
  const { base, root } = copyPreparedProjectWorkspace(t, 'change-asset-worker');
  const priorApp = process.env.BUILDR_APP_DATA_DIR, priorProduct = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'asset-app-data');
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'asset-product-data');
  t.after(() => {
    if (priorApp === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = priorApp;
    if (priorProduct === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = priorProduct;
  });
  const runtime = createRuntime();
  const project = runtime.projectDetail(root, 'demo').project, projectRoot = runtime.resolveSourceRoot(root, project.source);
  const changeRoot = path.join(projectRoot, 'openspec/changes/worker-assets');
  fs.mkdirSync(path.join(changeRoot, 'custom'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'custom/one.sql'), 'SELECT 1;\n');
  const markdown = '# 交付说明\n[脚本](one.sql)\n![截图](screen.png)\n';
  fs.writeFileSync(path.join(changeRoot, 'custom/README.md'), markdown);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(changeRoot, 'custom/screen.png'), png);
  runtime.createTask(root, { taskId: 'asset-worker', title: '交付资料读取', intent: '只读资料', projects: ['demo'], services: [], changes: [{ project: 'demo', change: 'worker-assets' }] });
  const before = runtime.readTask(root, 'asset-worker');
  let createdWorkers = 0;
  const workerHook = createHook({ init(_id, type) { if (type === 'WORKER') createdWorkers += 1; } }).enable();
  t.after(() => workerHook.disable());
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId, instanceSecret } = await instance.ready;
  assert.equal(createdWorkers, 0, '监听就绪前没有任务读取，不得创建读取线程');
  const health = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': instanceSecret } });
  assert.equal(health.status, 200);
  assert.equal((await health.json() as any).status, 'ready');
  assert.equal(createdWorkers, 0, '健康检查不得启动任务读取线程');
  const prefix = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/asset-worker`;
  const detailResponse = await fetch(`${prefix}/changes/demo/worker-assets`);
  assert.equal(detailResponse.status, 200, await detailResponse.clone().text());
  const detail = await detailResponse.json() as any;
  assert.equal(createdWorkers, 1, '首次读取才创建一个真实线程');
  assert.equal(detail.resolution.workingCopy.change.assets.length, 3);
  for (const asset of detail.resolution.workingCopy.change.assets) {
    const endpoint = `${prefix}/changes/demo/worker-assets/assets/${asset.relativePath.split('/').map(encodeURIComponent).join('/')}`;
    const query = new URLSearchParams({ expectedSourceIdentity: asset.sourceIdentity });
    const response = await fetch(`${endpoint}?${query}`);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json() as any;
    if (asset.kind === 'image') assert.equal(body.imageDataUrl, `data:image/png;base64,${png.toString('base64')}`);
    else if (asset.kind === 'markdown') {
      assert.equal(body.content, markdown);
      assert.equal(body.documentPath, 'openspec/changes/worker-assets/custom/README.md');
      assert.equal(body.imageContext.documentDigest, body.actualDigest);
      const imageQuery = new URLSearchParams({ documentPath: body.documentPath, href: 'screen.png', expectedDocumentDigest: body.imageContext.documentDigest, expectedSourceIdentity: body.imageContext.sourceIdentity });
      const image = await fetch(`${prefix}/document-image/demo?${imageQuery}`);
      assert.equal(image.status, 200, await image.clone().text());
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    }
    else assert.equal(body.content, 'SELECT 1;\n');
    for (const suffix of ['', '?expectedSourceIdentity=invalid', `?${query}&expectedSourceIdentity=${asset.sourceIdentity}`, `?${query}&extra=field`]) {
      const denied = await fetch(`${endpoint}${suffix}`);
      assert.equal(denied.status, 400);
      assert.equal((await denied.json() as any).error.code, 'task_change_asset_input_invalid');
    }
  }
  for (const endpoint of [`${prefix}/changes/demo/worker-assets?expectedSourceIdentity=unexpected`, `${prefix}/ui-prototypes?extra=field`]) {
    const denied = await fetch(endpoint);
    assert.equal(denied.status, 400);
    assert.equal((await denied.json() as any).error.code, 'task_api_query_forbidden');
  }
  assert.equal(createdWorkers, 1, '顺序读取继续复用已有线程');
  assert.deepEqual(runtime.readTask(root, 'asset-worker'), before);
});

test('Web预热仅加载固定容量，不读取任务，并继续复用已有Worker', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const factory = fakeWorkerFactory({ metrics });
  let created = 0;
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 2, warm: true, workerFactory: () => { created += 1; return factory(); } });
  try {
    assert.equal(created, 2);
    assert.equal(metrics.calls, 0, '预热不得扫描未打开任务');
    await executor.run('changed-files', input('task-one'));
    assert.equal(created, 2);
    assert.equal(metrics.calls, 1);
  } finally { await executor.close(); }
});

test('commit-context HTTP traverses the real bounded worker and resolves the registered checkout', async t => {
  const { root } = copyPreparedWorkspace(t, 'commit-context-worker'), runtime = createRuntime(), workspaceId = runtime.getWorkspace(root).workspace.id;
  const repositoryPath = path.join(root, 'fixture-repository'); fs.mkdirSync(repositoryPath);
  execFileSync('git', ['-C', repositoryPath, 'init', '--initial-branch=main'], { stdio: 'ignore' }); fs.writeFileSync(path.join(repositoryPath, 'new.txt'), 'new content\n');
  const repositoryId = crypto.randomUUID();
  fs.writeFileSync(path.join(root, 'repositories', 'manifest.yml'), JSON.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: { fixture: { id: repositoryId, workspaceId, code: 'fixture', name: 'Fixture', description: '', source: { type: 'git', path: 'fixture-repository' } } } }));
  const code = runtimeProvide(runtime, CODE_APPLICATION), tree = code.sourceControl(root).repositories[0].worktrees.find((item: { isMain: boolean }) => item.isMain);
  const location = { repositoryId, worktreeId: tree.worktreeId }, expected = code.commitContext(root, location);
  const executor = createBoundedBuildrWebReadExecutor({ workerCount: 1 });
  try {
    const response = await createCodeHttpContribution(code).handle({ request: { method: 'GET' }, root, suffix: '/code/commit-context', searchParams: new URLSearchParams(location), submitTaskRead: (operation, taskId, input) => executor.run(operation, { targetRoot: root, taskId, ...input }) });
    assert.equal(response?.status, 200); assert.equal(response?.body.revision, expected.revision); assert.equal(response?.body.source.worktreeId, tree.worktreeId); assert.equal(response?.body.hasChanges, true);
    const syncContext = code.syncContext(root, location);
    const syncResponse = await createCodeHttpContribution(code).handle({ request: { method: 'GET' }, root, suffix: '/code/sync-context', searchParams: new URLSearchParams(location), submitTaskRead: (operation, taskId, input) => executor.run(operation, { targetRoot: root, taskId, ...input }) });
    assert.equal(syncResponse?.status, 200); assert.equal(syncResponse?.body.revision, syncContext.revision); assert.equal(syncResponse?.body.source.worktreeId, tree.worktreeId); assert.equal(syncResponse?.body.available, false);
    assert.throws(() => executor.run('code-sync', { targetRoot: root, taskId: 'code-files', input: JSON.stringify(location) }), (error: { code: string }) => error.code === 'local_app_read_operation_forbidden');
    assert.throws(() => executor.run('code-commit-changes', { targetRoot: root, taskId: 'code-files', input: JSON.stringify(location) }), (error: { code: string }) => error.code === 'local_app_read_operation_forbidden');
  } finally { await executor.close(); }
});
