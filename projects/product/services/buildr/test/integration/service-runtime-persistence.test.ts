import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveRun, type ManagedRunRecord } from '../../src/modules/service-runtime/domain/runs.ts';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { appendRunLog, listRunRecords, readRunLogTail, writeRunRecord, readRunRecord, runRecordPath } from '../../src/modules/service-runtime/persistence/runs-repository.ts';

function record(overrides: Partial<ManagedRunRecord> = {}): ManagedRunRecord {
  return {
    id: 'run-1',
    serviceId: 'svc',
    serviceCode: 'demo',
    worktreeId: 'wt-main',
    worktreePath: '/tmp/work',
    worktreeLabel: '主检出',
    branch: 'dev',
    head: 'abc',
    pid: 123,
    preferredPort: 8080,
    actualPort: 8081,
    portNote: '使用首选端口',
    status: 'running',
    startedAt: '2026-10-21T14:02:00.000Z',
    stoppedAt: null,
    failure: null,
    logPath: '/tmp/log',
    main: true,
    dirty: false,
    taskId: null,
    taskTitle: null,
    origin: 'human',
    url: 'http://127.0.0.1:8081',
    connection: null,
    launch: null,
    processIdentity: null,
    ...overrides,
  };
}

test('运行记录与日志往返', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-'));
  await writeRunRecord(root, record());
  await appendRunLog(root, 'run-1', 'line1\n');
  const records = listRunRecords(root);
  assert.equal(records.length, 1);
  assert.equal(records[0].actualPort, 8081);
  assert.deepEqual(readRunLogTail(root, 'run-1', 4096), { log: 'line1\n', truncated: false, size: 6 });
  await appendRunLog(root, 'run-1', 'x'.repeat(40) + '\n' + 'tail-line\n');
  const tail = readRunLogTail(root, 'run-1', 20);
  assert.equal(tail.truncated, true);
  assert.equal(tail.size, 57);
  assert.equal(tail.log, 'tail-line\n');
  fs.rmSync(root, { recursive: true, force: true });
});

test('对账把已退出进程标记停止', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-'));
  await writeRunRecord(root, record({ id: 'dead', pid: 4_200_001, status: 'running' }));
  const application = createServiceRuntimeApplication({ resolveService: () => ({ id: 'svc', code: 'demo' }), listWorktrees: () => [] });
  const reconciled = await application.reconcile(root);
  const dead = reconciled.find(item => item.id === 'dead');
  assert.equal(dead?.status, 'stopped');
  assert.equal(isActiveRun(dead!), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('旧运行记录缺少的来源与状态信息保持未知', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-legacy-'));
  const old = record() as any;
  for (const field of ['main', 'dirty', 'taskId', 'taskTitle', 'origin', 'url', 'connection', 'launch', 'processIdentity']) delete old[field];
  await writeRunRecord(root, old);
  const loaded = listRunRecords(root)[0]!;
  assert.equal(loaded.main, null);
  assert.equal(loaded.dirty, null);
  assert.equal(loaded.origin, 'unknown');
  assert.equal(loaded.processIdentity, null);
  assert.equal(loaded.url, 'http://127.0.0.1:8081');
  fs.rmSync(root, { recursive: true, force: true });
});

test('损坏或冒用另一个编号的记录局部隔离，不读取或改写另一实例', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-corrupt-'));
  await writeRunRecord(root, record({ id: 'valid', pid: 4_200_001 }));
  fs.writeFileSync(runRecordPath(root, 'alias'), JSON.stringify(record({ id: 'valid', pid: process.pid })));
  fs.writeFileSync(runRecordPath(root, 'invalid-id'), JSON.stringify(record({ id: '../outside' })));
  fs.writeFileSync(runRecordPath(root, 'broken'), '{invalid json');
  assert.equal(readRunRecord(root, 'alias'), null);
  assert.equal(readRunRecord(root, 'broken'), null);
  assert.deepEqual(listRunRecords(root).map(item => item.id), ['valid']);
  const runtime = createServiceRuntimeApplication({ resolveService: () => ({ id: 'svc', code: 'demo' }), listWorktrees: () => [] });
  await assert.rejects(runtime.stopRun(root, 'alias'), (error: any) => error.code === 'service_runtime_run_unknown');
  assert.equal(readRunRecord(root, 'valid')?.pid, 4_200_001);
  assert.equal((await runtime.reconcile(root))[0]?.status, 'stopped');
  fs.rmSync(root, { recursive: true, force: true });
});
