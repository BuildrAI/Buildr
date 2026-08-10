import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_EXECUTION_RECORD_LIMITS,
  beginTaskExecutionRecordCleanup,
  completeTaskExecutionRecordCleanup,
  createOpenTaskExecutionRecord,
  evaluateTaskExecutionRecordCleanup,
  evaluateTaskExecutionRecordTombstonePurge,
  resolveTaskExecutionRecord,
  sealTaskExecutionRecord,
} from '../../src/domain/task-execution-record/task-execution-record.mjs';

const body = {
  locator: '.buildr/local/task-execution-records/task-verification/record-1/',
  digest: `sha256-${'a'.repeat(64)}`,
  storedSizeBytes: 1024,
  originalSizeBytes: 512,
  truncated: false,
};

function opened(overrides = {}) {
  return createOpenTaskExecutionRecord({
    recordId: 'record-1', taskId: 'task-1', owner: 'task-verification', kind: 'verification-execution',
    runIdentity: 'run-1', targetIdentity: 'target-1', producer: 'test', openedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  });
}

test('closed Domain固定owner/kind、quota reservation与terminal组合', () => {
  const record = opened();
  assert.equal(record.body.reservedSizeBytes, TASK_EXECUTION_RECORD_LIMITS.recordBytes);
  assert.equal(record.quotaStatus, 'reserved');
  assert.throws(() => opened({ owner: 'task-review', kind: 'review-execution' }), (error) => error.code === 'task_execution_record_field_invalid');
  assert.throws(() => opened({ owner: 'task-verification', kind: 'finish-diagnostics' }), (error) => error.code === 'task_execution_record_field_invalid');

  const passed = sealTaskExecutionRecord(record, body, 'passed', '2026-01-02T00:00:00.000Z');
  assert.equal(passed.lifecycleStatus, 'retained');
  assert.equal(passed.resolutionStatus, 'not-required');
  assert.equal(passed.retention.retainUntil, '2026-01-09T00:00:00.000Z');
  assert.equal(passed.body.originalSizeBytes, 512, '原始字节与含manifest的stored字节相互独立');
  assert.throws(() => sealTaskExecutionRecord(record, body, 'running'), (error) => error.code === 'task_execution_record_outcome_not_terminal');
});

test('failure resolution与retention共同决定单记录cleanup eligibility', () => {
  const failed = sealTaskExecutionRecord(opened(), body, 'failed', '2026-01-02T00:00:00.000Z');
  assert.deepEqual(evaluateTaskExecutionRecordCleanup(failed, { now: '2026-03-01T00:00:00.000Z', recentRank: 9 }), { eligible: false, reasons: ['resolution-pending'] });
  const resolved = resolveTaskExecutionRecord(failed, 'acknowledged', '2026-02-02T00:00:00.000Z');
  assert.deepEqual(evaluateTaskExecutionRecordCleanup(resolved, { now: '2026-03-01T00:00:00.000Z', recentRank: 9 }), { eligible: true, reasons: [] });
  const pending = beginTaskExecutionRecordCleanup(resolved, '2026-03-01T00:01:00.000Z');
  const cleaned = completeTaskExecutionRecordCleanup(pending, 'body-removed', '2026-03-01T00:02:00.000Z');
  assert.equal(cleaned.lifecycleStatus, 'cleaned');
  assert.equal(cleaned.body.locator, null);
  assert.equal(cleaned.body.digest, body.digest);
  assert.equal(cleaned.quotaStatus, 'released');
});

test('passed最近三条与固定七天窗口都受保护', () => {
  const passed = sealTaskExecutionRecord(opened(), body, 'passed', '2026-01-02T00:00:00.000Z');
  assert.deepEqual(evaluateTaskExecutionRecordCleanup(passed, { now: '2026-01-05T00:00:00.000Z', recentRank: 4 }).reasons, ['retention-time-protected']);
  assert.deepEqual(evaluateTaskExecutionRecordCleanup(passed, { now: '2026-02-01T00:00:00.000Z', recentRank: 3 }).reasons, ['recent-count-protected']);
  assert.equal(evaluateTaskExecutionRecordCleanup(passed, { now: '2026-02-01T00:00:00.000Z', recentRank: 4 }).eligible, true);
});

test('cleaned tombstone同时受90天与最近20条保护', () => {
  const failed = sealTaskExecutionRecord(opened(), body, 'failed', '2025-10-01T00:00:00.000Z');
  const resolved = resolveTaskExecutionRecord(failed, 'recovered', '2025-11-01T00:00:00.000Z');
  const pending = beginTaskExecutionRecordCleanup(resolved, '2025-11-02T00:00:00.000Z');
  const cleaned = completeTaskExecutionRecordCleanup(pending, 'body-removed', '2025-11-03T00:00:00.000Z');
  assert.deepEqual(evaluateTaskExecutionRecordTombstonePurge(cleaned, { now: '2025-12-01T00:00:00.000Z', recentRank: 21 }).reasons, ['tombstone-time-protected']);
  assert.deepEqual(evaluateTaskExecutionRecordTombstonePurge(cleaned, { now: '2026-03-01T00:00:00.000Z', recentRank: 20 }).reasons, ['tombstone-recent-count-protected']);
  assert.equal(evaluateTaskExecutionRecordTombstonePurge(cleaned, { now: '2026-03-01T00:00:00.000Z', recentRank: 21 }).eligible, true);
});
