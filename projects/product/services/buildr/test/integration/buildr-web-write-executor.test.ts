import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { createBoundedBuildrWebWriteExecutor } from '../../src/web/http/write-executor.ts';
import os from 'node:os';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { CODE_APPLICATION } from '../../src/modules/code/module.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { acquireCodeGitOperation } from '../../src/modules/code/infrastructure/code-git-operation-lock.ts';

function fakeWorkerFactory({ delayMs = 20, failFirst = false, metrics }: any): any {
  let created = 0;
  return () => {
    const worker: any = new EventEmitter();
    const workerId = ++created;
    let timer: any = null;
    let running = false;
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
        worker.emit('message', { id: message.id, ok: true, value: { operation: message.operation } });
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

const input = (value: any) => ({ targetRoot: '/tmp/buildr-write-executor', input: JSON.stringify(value) });

test('写执行器串行派发且不重复，排队请求才可取消', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, queueLimit: 1, workerFactory: fakeWorkerFactory({ delayMs: 30, metrics }) });
  try {
    const first = executor.run('code-sync', input({ repositoryId: 'repo-a' }));
    const second = executor.run('code-fetch', input({ repositories: [{ repositoryId: 'repo-b' }] }));
    await assert.rejects(executor.run('code-push', input({})), (error: any) => error.code === 'local_app_write_queue_full');
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map((item: any) => item.operation), ['code-sync', 'code-fetch']);
    assert.equal(metrics.maxActive, 1, '单 Worker 时写操作逐一执行');
    assert.equal(metrics.calls, 2);
  } finally { await executor.close(); }
});

test('多 Worker 并行派发独立写入，同一仓库互斥由文件锁保证', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 2, queueLimit: 4, workerFactory: fakeWorkerFactory({ delayMs: 40, metrics }) });
  try {
    const results = await Promise.all([
      executor.run('code-sync', input({ repositoryId: 'repo-a' })),
      executor.run('code-sync', input({ repositoryId: 'repo-b' })),
      executor.run('code-sync', input({ repositoryId: 'repo-c' })),
    ]);
    assert.equal(results.length, 3);
    assert.ok(metrics.maxActive >= 2, '独立仓库必须并行执行');
  } finally { await executor.close(); }
});

test('Worker 崩溃遗留的锁按登记回收，存活持有者不受影响', async t => {
  const { reclaimCodeGitOperationFile } = await import('../../src/modules/code/infrastructure/code-git-operation-lock.ts');
  const common = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-lock-common-'));
  const lockFile = path.join(common, 'buildr-operation.lock');
  const record = (token: string) => ({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token, createdAt: new Date().toISOString(), target: common });
  try {
    // 本进程记录、token 未被任何存活持有者登记：回收
    fs.writeFileSync(lockFile, JSON.stringify(record('ab'.repeat(16))) + '\n');
    reclaimCodeGitOperationFile(lockFile, 'ab'.repeat(16));
    assert.equal(fs.existsSync(lockFile), false, '崩溃 worker 的锁必须被回收');
    // token 仍被其他存活 worker 持有：保留
    const aliveToken = 'cd'.repeat(16);
    fs.writeFileSync(lockFile, JSON.stringify(record(aliveToken)) + '\n');
    reclaimCodeGitOperationFile(lockFile, 'ab'.repeat(16));
    assert.equal(fs.existsSync(lockFile), true, '存活 worker 的锁不得回收');
    // 其他进程的锁：保留
    fs.rmSync(lockFile, { force: true });
    fs.writeFileSync(lockFile, JSON.stringify({ ...record('ef'.repeat(16)), pid: process.ppid }) + '\n');
    reclaimCodeGitOperationFile(lockFile, 'ef'.repeat(16));
    assert.equal(fs.existsSync(lockFile), true, '其他进程的锁不得回收');
    fs.rmSync(lockFile, { force: true });
  } finally { fs.rmSync(common, { recursive: true, force: true }); }
});

test('已派发写入在请求方取消后继续完成，结果不再交付', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, workerFactory: fakeWorkerFactory({ delayMs: 60, metrics }) });
  try {
    const controller = new AbortController();
    const running = executor.run('code-commit-changes', { ...input({}), signal: controller.signal });
    controller.abort();
    await assert.rejects(running, (error: any) => error.code === 'local_app_write_cancelled');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(metrics.calls, 1, '取消只影响结果交付，Worker 中的 Git 写入仍完成');
    assert.equal((metrics as any).terminated ?? 0, 0, '写入完成不得回收 Worker');
    const next = await executor.run('code-sync', input({}));
    assert.equal(next.operation, 'code-sync');
  } finally { await executor.close(); }
});

test('Worker failure 只结算当前写入并恢复容量', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, workerFactory: fakeWorkerFactory({ failFirst: true, metrics }) });
  try {
    await assert.rejects(executor.run('code-fetch', input({})), (error: any) => error.code === 'worker_crashed');
    const recovered = await executor.run('code-sync', input({}));
    assert.equal(recovered.operation, 'code-sync');
    assert.equal(metrics.calls, 2);
  } finally { await executor.close(); }
});

test('写操作白名单拒绝读取与其他字段', async () => {
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [], messages: [] };
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, workerFactory: fakeWorkerFactory({ metrics }) });
  try {
    for (const operation of ['code-source-control', 'reviews', 'coordination']) {
      assert.throws(() => executor.run(operation, input({})), (error: any) => error.code === 'local_app_write_operation_forbidden');
    }
    assert.throws(() => executor.run('code-sync', { ...input({}), taskId: 'task-a' }), (error: any) => error.code === 'local_app_write_field_forbidden');
    assert.throws(() => executor.run('service-runtime-prepare', input({})), (error: any) => error.code === 'local_app_write_input_invalid');
    const prepared = await executor.run('service-runtime-prepare', { targetRoot: '/tmp/buildr-write-executor', serviceCode: 'demo', input: JSON.stringify({ worktreeId: 'x' }) });
    assert.equal(prepared.operation, 'service-runtime-prepare');
    assert.equal(metrics.messages.at(-1).serviceCode, 'demo');
  } finally { await executor.close(); }
});

test('Worker 退出时按登记表回收其持有的 Git 锁', async () => {
  const common = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-lock-common-'));
  const lockFile = path.join(common, 'buildr-operation.lock');
  const token = 'ab'.repeat(16);
  const metrics: any = { calls: 0, active: 0, maxActive: 0, started: [] };
  const registries: string[] = [];
  let firstWorker: any = null;
  const executor = createBoundedBuildrWebWriteExecutor({
    workerCount: 1,
    workerFactory: (registry: string) => {
      registries.push(registry);
      const worker = fakeWorkerFactory({ delayMs: 5, metrics })();
      if (!firstWorker) firstWorker = worker;
      return worker;
    },
  });
  try {
    await executor.run('code-sync', input({}));
    assert.equal(registries.length, 1, 'worker 必须获得唯一登记表');
    // 模拟 worker 持锁中崩溃：登记为 acquire 未 release，锁记录归属本进程 pid
    fs.appendFileSync(registries[0], JSON.stringify({ event: 'acquire', lockFile, token }) + '\n');
    fs.writeFileSync(lockFile, JSON.stringify({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token, createdAt: new Date().toISOString(), target: common }) + '\n');
    firstWorker.emit('error', new Error('worker crashed'));
    firstWorker.emit('exit', 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(lockFile), false, 'worker 退出必须回收其登记的锁');
    assert.equal(registries.length, 2, '退出后必须补充新 worker');
    const recovered = await executor.run('code-fetch', input({}));
    assert.equal(recovered.operation, 'code-fetch');
  } finally { await executor.close(); fs.rmSync(common, { recursive: true, force: true }); }
});

test('HTTP 写端点进入有界写执行器', async t => {
  const { root } = copyPreparedWorkspace(t, 'write-executor-http');
  const runtime = createRuntime(), code = runtimeProvide(runtime, CODE_APPLICATION), workspaceId = runtime.getWorkspace(root).workspace.id;
  const repositoryPath = path.join(root, 'fixture-repository');
  fs.mkdirSync(repositoryPath);
  execFileSync('git', ['-C', repositoryPath, 'init', '--initial-branch=main'], { stdio: 'ignore' });
  const repositoryId = crypto.randomUUID();
  fs.writeFileSync(path.join(root, 'repositories', 'manifest.yml'), JSON.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: { fixture: { id: repositoryId, workspaceId, code: 'fixture', name: 'Fixture', description: '', source: { type: 'git', path: 'fixture-repository' } } } }));
  const calls: any[] = [];
  const submitTaskWrite = async (operation: string, fields: Record<string, string>) => { calls.push([operation, JSON.parse(fields.input)]); return { readAt: new Date().toISOString(), repositories: [{ repositoryId, gitId: null, status: 'succeeded', message: '', remotes: [] }] }; };
  const http = createCodeHttpContribution(code);
  const authorizeWrite = () => {};
  const readJsonBody = async () => ({ repositories: [{ repositoryId, expectedGitId: null, expectedCheckoutId: null }] });
  const response = await http.handle({ request: { method: 'POST' }, root, suffix: '/code/fetch', searchParams: new URLSearchParams(), authorizeWrite, readJsonBody, submitTaskWrite });
  assert.equal(response?.status, 200);
  assert.deepEqual(calls, [['code-fetch', { repositories: [{ repositoryId, expectedGitId: null, expectedCheckoutId: null }] }]]);
  const direct = await http.handle({ request: { method: 'POST' }, root, suffix: '/code/fetch', searchParams: new URLSearchParams(), authorizeWrite, readJsonBody });
  assert.equal(direct?.status, 200, '未提供写执行器时按原路径直接执行');
});

test('Git 操作锁跨进程互斥并在释放后删除锁文件', async t => {
  const { root } = copyPreparedWorkspace(t, 'write-executor-lock');
  const runtime = createRuntime(), code = runtimeProvide(runtime, CODE_APPLICATION), workspaceId = runtime.getWorkspace(root).workspace.id;
  const repositoryPath = path.join(root, 'fixture-repository');
  fs.mkdirSync(repositoryPath);
  execFileSync('git', ['-C', repositoryPath, 'init', '--initial-branch=main'], { stdio: 'ignore' });
  const repositoryId = crypto.randomUUID();
  fs.writeFileSync(path.join(root, 'repositories', 'manifest.yml'), JSON.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: { fixture: { id: repositoryId, workspaceId, code: 'fixture', name: 'Fixture', description: '', source: { type: 'git', path: 'fixture-repository' } } } }));
  const location = { repositoryId, worktreeId: code.sourceControl(root).repositories[0].worktrees.find((item: any) => item.isMain)!.worktreeId };
  const source = code.syncContext(root, location).source;
  const lockPath = path.join(source.location, '.git', 'buildr-operation.lock');
  const release = acquireCodeGitOperation(source);
  try {
    assert.ok(fs.existsSync(lockPath), '取得锁必须留下锁文件');
    const contender = spawnSync('node', ['-e', `
      import('${path.join(process.cwd(), 'src/modules/code/infrastructure/code-git-operation-lock.ts').replace(/'/g, "\\'")}').then(m => {
        try { m.acquireCodeGitOperation(${JSON.stringify(source)}); console.log('acquired'); }
        catch (error) { console.log(error.code); }
      }).catch(error => { console.error(error); process.exitCode = 2; });
    `], { encoding: 'utf8' });
    assert.equal(contender.status, 0, contender.stderr);
    assert.match(contender.stdout.trim(), /code_git_operation_in_progress/, '另一个进程必须看到同一锁');
    await assert.rejects(code.sync(root, { ...location, expectedRevision: code.syncContext(root, location).revision }), (error: any) => error.code === 'code_git_operation_in_progress');
  } finally { release(); }
  assert.equal(fs.existsSync(lockPath), false, '释放后不得残留锁文件');
  const again = acquireCodeGitOperation(source);
  again();
  assert.equal(fs.existsSync(lockPath), false, '重复取放后不得残留锁文件');
});

async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 8_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, description);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const lockModule = new URL('../../src/modules/code/infrastructure/code-git-operation-lock.ts', import.meta.url).href;
const mutationModule = new URL('../../src/modules/code/infrastructure/code-git-mutation-runner.ts', import.meta.url).href;

for (const mode of ['crash', 'shutdown', 'timeout']) test(`真实工作线程退出后等待 Git 子进程关闭再回收锁（${mode}）`, { skip: process.platform === 'win32' }, async () => {
  const shutdown = mode !== 'crash';
  const expires = mode === 'timeout';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-write-child-'));
  const marker = path.join(root, 'started'), finish = path.join(root, 'finish');
  execFileSync('git', ['init', '--initial-branch=main', root], { stdio: 'ignore' });
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!${process.execPath}
const fs = require('node:fs'); fs.writeFileSync(process.env.MARKER, String(process.pid)); const timer = setInterval(() => { if (fs.existsSync(process.env.FINISH)) { clearInterval(timer); process.exit(0); } }, 10);
`, { mode: 0o755 });
  let worker: Worker;
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, queueLimit: 1, workerFactory: (registry: string) => {
    worker = new Worker(`const {parentPort, workerData} = require('node:worker_threads');
      parentPort.once('message', async message => {
        const {acquireCodeGitOperation} = await import(workerData.lockModule);
        const {runCodeGitMutation} = await import(workerData.mutationModule);
        const release = acquireCodeGitOperation({location: workerData.root});
        const result = await runCodeGitMutation({location: workerData.root}, ['fetch'], {env: workerData.env, timeoutMs: workerData.timeoutMs});
        release(); parentPort.postMessage({id: message.id, ok: true, value: result});
      });`, { eval: true, env: { ...process.env, BUILDR_GIT_OPERATION_LOG: registry }, workerData: { buildrGitMutationBroker: true, lockModule, mutationModule, root, timeoutMs: expires ? 1_500 : 5_000, env: { PATH: bin, MARKER: marker, FINISH: finish } } });
    return worker;
  } });
  const lockFile = path.join(root, '.git', 'buildr-operation.lock');
  let closing: Promise<void> | undefined;
  try {
    const result = executor.run('code-fetch', input({}));
    const rejected = assert.rejects(result, (error: any) => ['local_app_write_worker_failed', 'local_app_write_executor_closed'].includes(error.code));
    await until(() => fs.existsSync(marker), 'Git subprocess must actually start');
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    if (shutdown) {
      closing = executor.close();
      assert.equal(executor.close(), closing, 'Repeated close must await the same drain');
    } else await worker!.terminate();
    await rejected;
    process.kill(pid, 0);
    assert.equal(fs.existsSync(lockFile), true, 'A live Git child must retain exclusion after Worker death');
    assert.throws(() => acquireCodeGitOperation({ location: root } as any), (error: any) => error.code === 'code_git_operation_in_progress');
    const queued = shutdown ? null : executor.run('code-fetch', input({}));
    if (!shutdown) await assert.rejects(executor.run('code-fetch', input({})), (error: any) => error.code === 'local_app_write_queue_full');
    let drained = false;
    if (closing) void closing.then(() => { drained = true; });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(drained, false, 'Shutdown must wait for the Git child');
    if (!expires) fs.writeFileSync(finish, 'finish');
    if (closing) await closing;
    await until(() => !fs.existsSync(lockFile), 'Lock must be reclaimed after Git closes');
    assert.throws(() => process.kill(pid, 0), 'Child must have exited before lock reclamation');
    if (queued) assert.equal((await queued).ok, true, 'Replacement Worker receives the supervised Git result');
    const release = acquireCodeGitOperation({ location: root } as any); release();
  } finally {
    fs.writeFileSync(finish, 'finish');
    await executor.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('失败竞争者退出不能删除尚未登记 acquire 的存活者锁，持有者退出仍可准确回收', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-write-race-'));
  execFileSync('git', ['init', '--initial-branch=main', root], { stdio: 'ignore' });
  const paused = new Int32Array(new SharedArrayBuffer(4));
  const threads: Worker[] = [];
  let created = 0;
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 2, workerFactory: (registry: string) => {
    const owner = created++ === 0;
    const worker = new Worker(`const {parentPort,workerData} = require('node:worker_threads');
      parentPort.once('message', async message => {
        const fs = require('node:fs'); const append = fs.appendFileSync;
        if (workerData.owner) fs.appendFileSync = function(file, value, ...args) {
          if (String(value).includes('"event":"acquire"')) {
            Atomics.store(workerData.paused, 0, 1); Atomics.notify(workerData.paused, 0);
            Atomics.wait(workerData.paused, 0, 1);
          }
          return append.call(fs,file,value,...args);
        };
        const {acquireCodeGitOperation} = await import(workerData.lockModule);
        try { const release = acquireCodeGitOperation({location:workerData.root}); release(); }
        catch { process.exit(1); }
        parentPort.postMessage({id:message.id,ok:true});
      });`, { eval: true, env: { ...process.env, BUILDR_GIT_OPERATION_LOG: registry }, workerData: { root, lockModule, paused, owner } });
    threads.push(worker); return worker;
  } });
  const lockFile = path.join(root, '.git', 'buildr-operation.lock');
  try {
    const ownerResult = executor.run('code-fetch', input({}));
    const rejectedOwner = assert.rejects(ownerResult, (error: any) => error.code === 'local_app_write_worker_failed');
    await until(() => Atomics.load(paused, 0) === 1, 'Owner must pause after publication before acquire note');
    const token = JSON.parse(fs.readFileSync(lockFile, 'utf8')).token;
    await assert.rejects(executor.run('code-fetch', input({})), (error: any) => error.code === 'local_app_write_worker_failed');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token, token, 'Failed intent cannot reclaim another owner');
    assert.throws(() => acquireCodeGitOperation({ location: root } as any), (error: any) => error.code === 'code_git_operation_in_progress');
    await threads[0].terminate();
    await rejectedOwner;
    await until(() => !fs.existsSync(lockFile), 'Preregistered token recovers owner before acquire note');
  } finally {
    Atomics.store(paused, 0, 2); Atomics.notify(paused, 0);
    await executor.close(); fs.rmSync(root, { recursive: true, force: true });
  }
});


test('预登记锁令牌必须有效，默认获取与准确归属释放保持兼容', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-lock-token-'));
  const file = path.join(root, 'lock');
  try {
    for (const token of ['', 'x'.repeat(32), 123, null]) assert.throws(() => acquireExclusiveFileLock(file, root, { token }), TypeError);
    const owned = acquireExclusiveFileLock(file, root, { token: 'ab'.repeat(16) });
    assert.equal(owned.record.token, 'ab'.repeat(16));
    releaseExclusiveFileLock(owned);
    const generated = acquireExclusiveFileLock(file, root);
    assert.match(generated.record.token, /^[a-f0-9]{32}$/);
    releaseExclusiveFileLock(generated);
    assert.equal(fs.existsSync(file), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('终止未确认时关闭失败并保留线程锁', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-write-termination-'));
  const lockFile = path.join(root, 'buildr-operation.lock');
  const token = 'ab'.repeat(16);
  const failure = new Error('termination not confirmed');
  let registry = '';
  const executor = createBoundedBuildrWebWriteExecutor({ workerCount: 1, warm: true, workerFactory: (file: string) => {
    registry = file;
    const worker: any = new EventEmitter();
    worker.terminate = () => Promise.reject(failure);
    return worker;
  } });
  try {
    fs.appendFileSync(registry, JSON.stringify({ event: 'intent', lockFile, token }) + '\n');
    fs.writeFileSync(lockFile, JSON.stringify({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token, createdAt: new Date().toISOString(), target: root }));
    await assert.rejects(executor.close(), error => error === failure);
    assert.equal(fs.existsSync(lockFile), true, 'Unconfirmed termination cannot authorize reclamation');
    assert.equal(fs.existsSync(registry), true, 'Ownership evidence remains available');
  } finally { fs.rmSync(registry, { force: true }); fs.rmSync(root, { recursive: true, force: true }); }
});
