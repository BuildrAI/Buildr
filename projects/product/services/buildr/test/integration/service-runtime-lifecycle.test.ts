import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { matchesProcessIdentity, processAlive, startManagedProcess, type ManagedProcess } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';
import { readRunRecord, writeRunRecord } from '../../src/modules/service-runtime/persistence/runs-repository.ts';
import { withRuntimeLock } from '../../src/modules/service-runtime/infrastructure/runtime-lock.ts';
import { eventually, portReleased, runtimeDefinition, runtimeFixture, runtimeServerScript } from '../helpers/service-runtime-fixture.ts';

test('同目录并发启动只产生一个实例，代码来源与日志共享，停止不再复活', async t => {
  const f = await runtimeFixture(t);
  const source = f.worktrees.frontend![1]!;
  const input = { serviceCode: 'frontend', worktreeId: source.id, taskId: 'task', origin: 'agent' as const, expectedWorktree: { path: source.path, branch: source.branch, head: source.head, dirty: source.dirty } };
  const attempts = await Promise.allSettled([f.runtime.startRun(f.root, input), f.runtime.startRun(f.root, input)]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  const rejected = attempts.find(item => item.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'service_runtime_worktree_busy');
  const started = (attempts.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof f.runtime.startRun>>>).value;
  const running = await f.runtime.waitForRun(f.root, started.id);
  assert.equal(running.status, 'running');
  assert.equal(running.origin, 'agent');
  assert.equal(running.dirty, true);
  assert.equal(running.taskId, 'task');
  assert.equal(running.main, false);
  assert.equal(running.launch?.cwd, fs.realpathSync(source.path));
  assert.ok(matchesProcessIdentity(running.processIdentity));
  assert.match(f.runtime.readLog(f.root, running.id).log, /Started Fixture/);
  await f.runtime.stopRun(f.root, running.id);
  await portReleased(running.actualPort);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(readRunRecord(f.root, running.id)?.status, 'stopped');
});

test('失效来源与任务归属拒绝；符号链接目录逃逸不启动', async t => {
  const f = await runtimeFixture(t);
  const source = f.worktrees.frontend![1]!;
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: source.id, expectedWorktree: { path: source.path, branch: source.branch, head: 'stale', dirty: source.dirty } }), (error: any) => error.code === 'service_runtime_source_changed');
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: source.id, taskId: 'other' }), (error: any) => error.code === 'service_runtime_task_mismatch');
  const outside = path.join(f.root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(source.path, 'escape'), 'dir');
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { cwd: 'escape' }));
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: source.id }), (error: any) => error.code === 'service_runtime_directory_invalid');
  assert.equal((await f.runtime.listRuns(f.root)).length, 0);
});

test('多个应用共享实例互斥；过期对账不能否定锁内完成的启动', async t => {
  const f = await runtimeFixture(t);
  const second = createServiceRuntimeApplication({ resolveService: () => ({ id: 'backend', code: 'backend' }), listWorktrees: () => f.worktrees.backend! });
  const attempts = await Promise.allSettled([f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' }), second.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  const started = (attempts.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof f.runtime.startRun>>>).value;
  const ready = await f.runtime.waitForRun(f.root, started.id);
  assert.equal(ready.status, 'running');
  let observing: Promise<any>;
  await withRuntimeLock(f.root, async () => {
    await writeRunRecord(f.root, { ...ready, status: 'starting', pid: -1, processIdentity: null });
    observing = second.listRuns(f.root);
    await new Promise(resolve => setTimeout(resolve, 40));
    await writeRunRecord(f.root, ready);
  });
  await observing!;
  assert.equal(readRunRecord(f.root, ready.id)?.status, 'running');
  await second.stopRun(f.root, ready.id);
});

test('占用端口通过真实参数避让，无覆盖声明则明确失败', async t => {
  const f = await runtimeFixture(t);
  const blocker = net.createServer();
  await new Promise<void>(resolve => blocker.listen(f.ports.frontend, '127.0.0.1', resolve));
  t.after(() => blocker.close());
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { portOverride: null }));
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' }), (error: any) => error.code === 'service_runtime_port_override_missing');
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend));
  const started = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  const ready = await f.runtime.waitForRun(f.root, started.id);
  assert.equal(ready.status, 'running');
  assert.ok(ready.actualPort > f.ports.frontend);
  assert.match(ready.portNote, /已避让/);
  assert.ok(ready.launch?.command.includes(`--port=${ready.actualPort}`));
});

test('不存在的可执行文件记录失败；非正进程号从不视为活动进程', async t => {
  const f = await runtimeFixture(t);
  assert.equal(processAlive(-1), false);
  assert.equal(processAlive(0), false);
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { command: ['/definitely/missing/buildr-command'] }));
  const started = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  assert.equal(started.status, 'failed');
  assert.equal(started.pid, -1);
  assert.match(f.runtime.readLog(f.root, started.id).log, /启动失败/);
  assert.equal((await f.runtime.stopRun(f.root, started.id)).status, 'failed');
});

test('启动身份读取失败仍保留实际进程号，以自有句柄安全清理并记录失败', async t => {
  const f = await runtimeFixture(t);
  let managed: ManagedProcess | undefined;
  const application = createServiceRuntimeApplication({
    resolveService: () => ({ id: 'backend', code: 'backend' }), listWorktrees: () => f.worktrees.backend!,
    startProcess: async options => { managed = await startManagedProcess({ ...options, readIdentity: () => null }); return managed; },
  });
  t.after(async () => { await managed?.kill(); });
  const failed = await application.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' });
  assert.equal(failed.status, 'failed');
  assert.ok(failed.pid > 0);
  assert.equal(failed.processIdentity, null);
  assert.ok(failed.stoppedAt);
  assert.match(failed.failure!, /本次自有启动进程已退出/);
  assert.equal(processAlive(failed.pid), false);
  const saved = readRunRecord(f.root, failed.id)!;
  assert.equal(saved.pid, failed.pid);
  assert.equal(saved.status, 'failed');
  assert.match(application.readLog(f.root, failed.id).log, /无法读取可信进程身份/);
});

test('身份读取及首次清理失败仍落实际事实，精确stop重试真正终止自有进程', async t => {
  const f = await runtimeFixture(t);
  let managed: ManagedProcess | undefined;
  let failCleanup = true;
  const application = createServiceRuntimeApplication({
    resolveService: () => ({ id: 'backend', code: 'backend' }), listWorktrees: () => f.worktrees.backend!,
    startProcess: async options => {
      managed = await startManagedProcess({ ...options, readIdentity: () => { throw new Error('controlled identity read failure'); } });
      return { ...managed, kill: async () => { if (failCleanup) throw new Error('controlled cleanup failure'); await managed!.kill(); } };
    },
  });
  t.after(async () => { await managed?.kill(); });
  const failed = await application.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' });
  assert.equal(failed.status, 'failed');
  assert.ok(failed.pid > 0);
  assert.equal(failed.stoppedAt, null);
  assert.match(failed.failure!, /清理未完成.*可能仍在运行/);
  assert.equal(processAlive(failed.pid), true);
  assert.equal(readRunRecord(f.root, failed.id)?.pid, failed.pid);
  assert.equal(readRunRecord(f.root, failed.id)?.stoppedAt, null);
  const observed = (await application.listRuns(f.root)).find(run => run.id === failed.id)!;
  assert.match(observed.failure!, /controlled cleanup failure/);
  await assert.rejects(application.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' }), (error: any) => error.code === 'service_runtime_worktree_busy');
  failCleanup = false;
  const stopped = await application.stopRun(f.root, failed.id);
  assert.equal(stopped.status, 'stopped');
  assert.ok(stopped.stoppedAt);
  assert.equal(processAlive(failed.pid), false);
});

test('超时停止自身；未就绪退出准确失败', async t => {
  const f = await runtimeFixture(t);
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { readiness: { kind: 'log', pattern: 'NEVER' } }));
  const started = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  const failed = await f.runtime.waitForRun(f.root, started.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.failure!, /就绪检查超时/);
  await portReleased(started.actualPort);
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { script: 'setTimeout(() => process.exit(2), 500)' }));
  const early = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  assert.equal((await f.runtime.waitForRun(f.root, early.id)).status, 'failed');
});

test('重新创建应用后能按可信身份停止；同号无关或旧身份不终止', async t => {
  const f = await runtimeFixture(t);
  const started = await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' });
  const ready = await f.runtime.waitForRun(f.root, started.id);
  const restarted = createServiceRuntimeApplication({ resolveService: () => ({ id: 'backend', code: 'backend' }), listWorktrees: () => f.worktrees.backend! });
  await restarted.stopRun(f.root, ready.id);
  await portReleased(ready.actualPort);
  const external = { ...ready, id: 'foreign-record', status: 'running' as const, pid: process.pid, processIdentity: null };
  await writeRunRecord(f.root, external);
  await assert.rejects(restarted.stopRun(f.root, external.id), (error: any) => error.code === 'service_runtime_process_unverified');
  assert.equal(processAlive(process.pid), true);
  await writeRunRecord(f.root, { ...external, status: 'failed' });
});

test('停止独立组会关闭启动器派生服务，而不只关闭父进程', async t => {
  const f = await runtimeFixture(t);
  const wrapper = `const {spawn}=require('child_process'); spawn(process.execPath,['-e',${JSON.stringify(runtimeServerScript)},'--',process.argv.find(x=>x.startsWith('--port='))],{stdio:'inherit'}); setInterval(()=>{},1000);`;
  await f.runtime.writeDefinition(f.root, 'backend', runtimeDefinition(f.ports.backend, { script: wrapper }));
  const started = await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' });
  assert.equal((await f.runtime.waitForRun(f.root, started.id)).status, 'running');
  await f.runtime.stopRun(f.root, started.id);
  await portReleased(started.actualPort);
});

test('迟到 HTTP 就绪响应不覆盖已停止事实', async t => {
  const f = await runtimeFixture(t);
  const script = `require('http').createServer((req,res)=>setTimeout(()=>res.end('ok'),1500)).listen(Number(process.argv.find(x=>x.startsWith('--port=')).slice(7)),'127.0.0.1');`;
  await f.runtime.writeDefinition(f.root, 'frontend', runtimeDefinition(f.ports.frontend, { script, readiness: { kind: 'http', path: '/health' } }));
  const started = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  await new Promise(resolve => setTimeout(resolve, 700));
  const reading = f.runtime.listRuns(f.root);
  await f.runtime.stopRun(f.root, started.id);
  await reading;
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(readRunRecord(f.root, started.id)?.status, 'stopped');
});
