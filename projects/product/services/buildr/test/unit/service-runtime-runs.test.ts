import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessMatcher, isActiveRun, nextAvailablePort } from '../../src/modules/service-runtime/domain/runs.ts';

test('端口避让递增', () => {
  assert.equal(nextAvailablePort(8080, new Set()), 8080);
  assert.equal(nextAvailablePort(8080, new Set([8080, 8081])), 8082);
});

test('未确认清理完成的失败实例仍占用目录与端口', () => {
  assert.equal(isActiveRun({ status: 'failed', pid: 123, stoppedAt: null }), true);
  assert.equal(isActiveRun({ status: 'failed', pid: -1, stoppedAt: null }), false);
  assert.equal(isActiveRun({ status: 'failed', pid: 123, stoppedAt: '2026-10-22T08:00:00Z' }), false);
  assert.equal(isActiveRun({ status: 'failed' }), false);
});

test('就绪匹配器', () => {
  const log = createReadinessMatcher({ kind: 'log', pattern: 'Started App' });
  assert.equal(log.testLine?.('[12:00] Started App in 3s'), true);
  assert.equal(log.testLine?.('other'), false);
  const http = createReadinessMatcher({ kind: 'http', path: '/health' });
  assert.equal(http.testHttp?.(200), true);
  assert.equal(http.testHttp?.(500), false);
});
