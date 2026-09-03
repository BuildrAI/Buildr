import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES,
  longRunningOperationSummary,
} from '../../src/infrastructure/contracts/public-json.ts';

test('long-running summary 是有界 closed projection', () => {
  const summary: any = longRunningOperationSummary({
    operation: 'verification.run',
    terminal: true,
    status: 'failed',
    taskId: 'task-1',
    runId: 'run-1',
    resultIdentity: 'sha256-result',
    stages: Array.from({ length: 20 }, (_: any, index: any) => ({ id: `stage-${index}`, status: 'passed', stdout: 'secret' })),
    primaryFailure: { stage: 'tests', code: 'exit-1', message: '失败'.repeat(1_000), diagnostics: ['secret'] },
    cleanup: { status: 'passed', effects: ['secret'] },
    recovery: { owner: 'release-transaction', operation: 'inspect', taskId: 'task-1', runId: 'run-1', recordId: 'record-1', token: 'secret' },
    checks: ['secret'],
    context: { path: '/private/path' },
  });

  assert.equal(summary.schemaVersion, 'buildr.long-running-operation-summary/v1');
  assert.equal(summary.detail, 'compact');
  assert.equal(summary.terminal, true);
  assert.equal(summary.status, 'failed');
  assert.equal(summary.stages.length, 12);
  assert.equal(summary.output.truncated, true);
  assert.equal(summary.output.bytes, Buffer.byteLength(`${JSON.stringify(summary)}\n`, 'utf8'));
  assert.ok(summary.output.bytes < LONG_RUNNING_OPERATION_SUMMARY_MAX_BYTES);
  assert.deepEqual(summary.recovery, {
    owner: 'release-transaction', operation: 'inspect', taskId: 'task-1', runId: 'run-1', recordId: 'record-1',
  });
  const serialized: any = JSON.stringify(summary);
  for (const forbidden of ['checks', 'context', 'stdout', 'diagnostics', 'effects', 'token', '/private/path']) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test('long-running summary 不伪造 recovery 或非法状态', () => {
  const summary: any = longRunningOperationSummary({ operation: 'release.transaction', status: 'invented', recovery: { owner: 'release' } });
  assert.equal(summary.status, 'unknown');
  assert.equal(summary.terminal, false);
  assert.equal(summary.recovery, null);
});
