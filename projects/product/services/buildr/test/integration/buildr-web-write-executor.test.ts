import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
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
    reclaimCodeGitOperationFile(lockFile, new Set());
    assert.equal(fs.existsSync(lockFile), false, '崩溃 worker 的锁必须被回收');
    // token 仍被其他存活 worker 持有：保留
    const aliveToken = 'cd'.repeat(16);
    fs.writeFileSync(lockFile, JSON.stringify(record(aliveToken)) + '\n');
    reclaimCodeGitOperationFile(lockFile, new Set([aliveToken]));
    assert.equal(fs.existsSync(lockFile), true, '存活 worker 的锁不得回收');
    // 其他进程的锁：保留
    fs.rmSync(lockFile, { force: true });
    fs.writeFileSync(lockFile, JSON.stringify({ ...record('ef'.repeat(16)), pid: process.ppid }) + '\n');
    reclaimCodeGitOperationFile(lockFile, new Set());
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
