import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeFixture } from '../helpers/service-runtime-fixture.ts';
import { createServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { readRunRecord, writeRunRecord } from '../../src/modules/service-runtime/persistence/runs-repository.ts';
import { processAlive, startManagedProcess } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';

function requestTarget(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => http.get(url, response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve(JSON.parse(body).target)); }).on('error', reject));
}

test('前端主工作库默认远程，真实注入已验证变量；单独启动不产生后端', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const started = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main' });
  const ready = await f.runtime.waitForRun(f.root, started.id);
  assert.equal(ready.status, 'running');
  assert.deepEqual(ready.connection, { mode: 'remote', url: 'https://test.example/api', serviceCode: 'backend', runId: null });
  assert.equal(await requestTarget(ready.url), 'https://test.example/api');
  assert.equal((await f.runtime.listRuns(f.root, 'backend')).length, 0);
});

test('前端本地只连接同任务，按后端实际避让端口注入', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const other = await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-other' });
  await f.runtime.waitForRun(f.root, other.id);
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-task', connection: 'local' }), (error: any) => error.code === 'service_runtime_backend_unavailable');
  const backend = await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-task' });
  const backendReady = await f.runtime.waitForRun(f.root, backend.id);
  assert.ok(backendReady.actualPort > f.ports.backend);
  const front = await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-task' });
  const ready = await f.runtime.waitForRun(f.root, front.id);
  assert.equal(ready.connection?.runId, backend.id);
  assert.equal(ready.connection?.url, backendReady.url);
  assert.equal(await requestTarget(ready.url), backendReady.url);
  await f.runtime.stopRun(f.root, ready.id);
  assert.equal((await f.runtime.listRuns(f.root, 'backend')).filter(run => run.status === 'running').length, 2);
});

test('主工作库本地连接不借用任务后端；缺声明拒绝伪造连接', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const task = await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-task' });
  await f.runtime.waitForRun(f.root, task.id);
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'local' }), (error: any) => error.code === 'service_runtime_backend_unavailable');
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main', connection: 'remote' }), (error: any) => error.code === 'service_runtime_connection_undefined');
});

test('任务范围在端口探测间变化时，最终启动前核对阻止创建进程', async t => {
  const f = await runtimeFixture(t);
  let observations = 0;
  let allowed = true;
  const runtime = createServiceRuntimeApplication({
    resolveService: () => ({ id: 'backend', code: 'backend' }),
    listWorktrees: () => {
      if (++observations > 1) allowed = false;
      return f.worktrees.backend!;
    },
    assertTaskScope: () => { if (!allowed) throw new Error('任务服务范围已变化'); },
  });
  const record = await runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-task', taskId: 'task' });
  assert.equal(record.status, 'failed');
  assert.equal(record.pid, -1);
  assert.equal(record.processIdentity, null);
  assert.match(record.failure!, /任务服务范围已变化/);
});


test('可选本地后端只暴露唯一同范围就绪实例和实际避让地址，停止与不可信进程不可选', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const view = createServiceRuntimeView({ runtime: f.runtime, catalog: { listServices: () => [{ id: 'frontend', code: 'frontend', name: '前端', repositoryId: 'repo', modulePath: '', projects: [] }] } });
  const missing = await view.detail(f.root, 'frontend');
  assert.equal(missing.connectionTargets['frontend-main']?.target, null);
  assert.match(missing.connectionTargets['frontend-main']!.reason!, /先启动后端/);
  const other = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-other' })).id);
  const backend = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-task' })).id);
  assert.notEqual(backend.actualPort, f.ports.backend);
  const scoped = await view.detail(f.root, 'frontend');
  assert.deepEqual(scoped.connectionTargets['frontend-task']?.target, { runId: backend.id, serviceCode: 'backend', url: backend.url, worktreeLabel: backend.worktreeLabel, branch: backend.branch });
  assert.equal(scoped.connectionTargets['frontend-main']?.target, null);
  assert.equal(scoped.connectionTargets['frontend-other']?.target?.runId, other.id);
  await writeRunRecord(f.root, { ...backend, id: 'duplicate-backend' });
  assert.match((await view.detail(f.root, 'frontend')).connectionTargets['frontend-task']!.reason!, /多个/);
  await writeRunRecord(f.root, { ...backend, id: 'duplicate-backend', status: 'stopped', stoppedAt: new Date().toISOString() });
  await f.runtime.stopRun(f.root, backend.id);
  assert.equal((await view.detail(f.root, 'frontend')).connectionTargets['frontend-task']?.target, null);
  await writeRunRecord(f.root, { ...backend, id: 'unverified-backend', pid: process.pid, processIdentity: null });
  assert.equal((await view.detail(f.root, 'frontend')).connectionTargets['frontend-task']?.target, null);
  await writeRunRecord(f.root, { ...backend, id: 'unverified-backend', status: 'stopped', stoppedAt: new Date().toISOString() });
});

test('服务器切换先验证本地目标及来源，失败保留当前前端；成功采用同范围后端实际端口', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const front = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'remote' })).id);
  await assert.rejects(f.runtime.restartRun(f.root, front.id, { connection: 'local' }), (error: any) => error.code === 'service_runtime_backend_unavailable');
  assert.equal(readRunRecord(f.root, front.id)?.status, 'running');
  assert.equal(processAlive(front.pid), true);
  assert.equal(await requestTarget(front.url), 'https://test.example/api');
  const backend = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  await assert.rejects(f.runtime.restartRun(f.root, front.id, { connection: 'local', expectedWorktree: { ...f.worktrees.frontend![0]!, head: 'stale' } }), (error: any) => error.code === 'service_runtime_source_changed');
  assert.equal(processAlive(front.pid), true);
  const attempts = await Promise.allSettled([f.runtime.restartRun(f.root, front.id, { connection: 'local' }), f.runtime.restartRun(f.root, front.id, { connection: 'local' })]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const replacement = (attempts.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof f.runtime.restartRun>>>).value;
  const ready = await f.runtime.waitForRun(f.root, replacement.id);
  assert.equal(ready.status, 'running');
  assert.equal(ready.connection?.runId, backend.id);
  assert.equal(await requestTarget(ready.url), backend.url);
  assert.equal(readRunRecord(f.root, front.id)?.status, 'stopped');
  assert.equal(processAlive(backend.pid), true);
  await f.runtime.stopRun(f.root, backend.id);
  await assert.rejects(f.runtime.restartRun(f.root, ready.id, { connection: 'local' }), (error: any) => error.code === 'service_runtime_backend_unavailable');
  assert.equal(processAlive(ready.pid), true, 'stopped backend does not stop the existing frontend');
  const remote = await f.runtime.waitForRun(f.root, (await f.runtime.restartRun(f.root, ready.id, { connection: 'remote' })).id);
  assert.equal(await requestTarget(remote.url), 'https://test.example/api');
});

test('重启后启动失败明确保留原实例已停止事实，不伪装成旧服务仍在运行', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  let starts = 0;
  const runtime = createServiceRuntimeApplication({
    resolveService: (_root, code) => ({ id: code, code }), listWorktrees: (_root, code) => f.worktrees[code]!,
    startProcess: async options => { if (++starts > 1) throw new Error('controlled restart failure'); return startManagedProcess(options); },
  });
  const front = await runtime.waitForRun(f.root, (await runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'remote' })).id);
  const failed = await runtime.restartRun(f.root, front.id, { connection: 'remote' });
  assert.equal(failed.status, 'failed');
  assert.match(failed.failure!, /原实例已停止.*controlled restart failure/);
  assert.equal(readRunRecord(f.root, front.id)?.status, 'stopped');
  assert.equal(processAlive(front.pid), false);
});


test('用户观察后端A后已换为B时拒绝启动与切换，原前端保持可用', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const front = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'remote' })).id);
  const first = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  await f.runtime.stopRun(f.root, first.id);
  const second = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  await assert.rejects(f.runtime.restartRun(f.root, front.id, { connection: 'local', expectedBackendRunId: first.id }), (error: any) => error.code === 'service_runtime_backend_changed');
  assert.equal(readRunRecord(f.root, front.id)?.status, 'running');
  assert.equal(processAlive(front.pid), true);
  assert.equal(await requestTarget(front.url), 'https://test.example/api');
  await f.runtime.stopRun(f.root, front.id);
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'local', expectedBackendRunId: first.id }), (error: any) => error.code === 'service_runtime_backend_changed');
  const connected = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'local', expectedBackendRunId: second.id })).id);
  assert.equal(connected.connection?.runId, second.id);
});

test('预停校验通过后目标地址漂移也不会静默采用，失败明确原实例已停止', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const backend = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  let changeTarget = false;
  let launches = 0;
  const runtime = createServiceRuntimeApplication({
    resolveService: (_root, code) => ({ id: code, code }), listWorktrees: (_root, code) => f.worktrees[code]!,
    startProcess: async options => {
      launches += 1;
      const managed = await startManagedProcess(options);
      return { ...managed, kill: async () => {
        await managed.kill();
        if (changeTarget) { changeTarget = false; await writeRunRecord(f.root, { ...backend, url: 'http://127.0.0.1:1' }); }
      } };
    },
  });
  const front = await runtime.waitForRun(f.root, (await runtime.startRun(f.root, { serviceCode: 'frontend', worktreeId: 'frontend-main', connection: 'remote' })).id);
  changeTarget = true;
  try {
    await assert.rejects(runtime.restartRun(f.root, front.id, { connection: 'local', expectedBackendRunId: backend.id }), (error: any) => error.code === 'service_runtime_restart_failed' && /原实例已停止.*后端实例已变化/.test(error.message));
    assert.equal(launches, 1, 'changed target must not launch any replacement');
    assert.equal(readRunRecord(f.root, front.id)?.status, 'stopped');
  } finally { await writeRunRecord(f.root, backend); }
});
