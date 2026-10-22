import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessMatcher, isActiveRun, nextAvailablePort, type ManagedRunRecord } from '../../src/modules/service-runtime/domain/runs.ts';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { appendRunLog, listRunRecords, readRunLogTail, writeRunRecord } from '../../src/modules/service-runtime/persistence/runs-repository.ts';

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
    ...overrides,
  };
}

test('端口避让递增', () => {
  assert.equal(nextAvailablePort(8080, new Set()), 8080);
  assert.equal(nextAvailablePort(8080, new Set([8080, 8081])), 8082);
});

test('就绪匹配器', () => {
  const log = createReadinessMatcher({ kind: 'log', pattern: 'Started App' });
  assert.equal(log.testLine?.('[12:00] Started App in 3s'), true);
  assert.equal(log.testLine?.('other'), false);
  const http = createReadinessMatcher({ kind: 'http', path: '/health' });
  assert.equal(http.testHttp?.(200), true);
  assert.equal(http.testHttp?.(500), false);
});

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
  const application = createServiceRuntimeApplication({ resolveService: () => ({ id: 'svc', code: 'demo' }) });
  const reconciled = await application.reconcile(root);
  const dead = reconciled.find(item => item.id === 'dead');
  assert.equal(dead?.status, 'stopped');
  assert.equal(isActiveRun(dead!), false);
  fs.rmSync(root, { recursive: true, force: true });
});
