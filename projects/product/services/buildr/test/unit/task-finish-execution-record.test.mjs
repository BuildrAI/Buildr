import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskFinishExecutionRecordFiles,
  publicTaskFinishExecutionRecord,
  taskFinishExecutionRecordOutcome,
} from '../../src/application/task-finish/execution-record.mjs';

function run(status = 'blocked') {
  return {
    runId: 'finish-run-1',
    status,
    invocations: 2,
    identity: {
      task: 'finish-task',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      workspaceRoot: '/Users/example/workspace',
      environmentRoot: '/Users/example/worktree',
      workspaceNodeIdentity: 'sha256-node',
    },
    deliveryCommit: {
      message: 'fix(task-finish): preserve delivery semantics\n\nprivate body',
      subject: 'fix(task-finish): preserve delivery semantics',
      identity: 'sha256-delivery-message',
    },
    deliveryCarrier: {
      identity: 'sha256-carrier',
      kind: 'git-isolated-commit',
      status: 'prepared',
      reuseMode: 'deterministic-reuse',
      root: '/Users/example/workspace/.buildr/carrier',
      head: 'abc123',
      tree: 'tree123',
      expectedTargetRef: 'before123',
      taskContribution: { identity: 'sha256-contribution' },
      deliveryBaseline: { head: 'before123', tree: 'beforetree' },
    },
    delivery: { targetDisposition: 'carrier', carrierRef: 'abc123', remoteAfterRef: 'abc123', finalRemoteRef: 'abc123' },
    completion: null,
    resume: { token: 'secret-token', phase: 'deliver' },
  };
}

test('Finish execution record mapper只生成closed portable正文', () => {
  const files = createTaskFinishExecutionRecordFiles({
    invocationId: 'finish-invocation-1',
    run: run(),
    invocationOrdinal: 2,
    outcome: 'blocked',
    startedAt: '2026-08-10T00:00:00.000Z',
    finishedAt: '2026-08-10T00:00:01.000Z',
    durationMs: 1000,
    timeline: [
      { milestone: 'record-opened', status: 'open', at: '2026-08-10T00:00:00.000Z' },
      { milestone: 'phase-finished', phase: 'deliver', status: 'blocked', at: '2026-08-10T00:00:01.000Z' },
    ],
    phaseResults: [{
      id: 'deliver', status: 'blocked', attempt: 1, startedAt: '2026-08-10T00:00:00.000Z', completedAt: '2026-08-10T00:00:01.000Z', durationMs: 1000,
      checks: [], operations: [{ kind: 'command', id: 'deliver-push', status: 1, stdout: { bytes: 0, digest: 'sha256-empty', truncated: false }, stderr: { bytes: 12, digest: 'sha256-error', truncated: false } }],
      failure: { phase: 'deliver', operation: 'target-push', code: 'task-finish.push-failed', status: 'failed', message: 'Push failed.', diagnostic: { digest: 'sha256-diagnostic' } },
    }],
    stdout: 'safe output\n',
    stderr: 'token=secret-value\n/Users/example/workspace/private\n',
    failure: { phase: 'deliver', operation: 'target-push', code: 'task-finish.push-failed', status: 'failed', message: 'Push failed.' },
  });
  assert.deepEqual(files.map((file) => file.name), ['summary.json', 'stdout.txt', 'stderr.txt', 'timeline.json', 'diagnostics.json']);
  const summary = files.find((file) => file.name === 'summary.json').content;
  assert.equal(summary.schemaVersion, 'buildr.task-finish-execution-record-summary/v1');
  assert.equal(summary.invocationId, 'finish-invocation-1');
  assert.equal(summary.finishRunId, 'finish-run-1');
  assert.equal(summary.invocationOrdinal, 2);
  assert.equal(summary.carrier.identity, 'sha256-carrier');
  assert.deepEqual(summary.deliveryCommit, { subject: 'fix(task-finish): preserve delivery semantics', identity: 'sha256-delivery-message' });
  const structured = JSON.stringify([summary, files.find((file) => file.name === 'diagnostics.json').content]);
  assert.doesNotMatch(structured, /workspaceRoot|environmentRoot|secret-token|\/Users\/example|carrier.*root|private body/i);
  assert.throws(() => createTaskFinishExecutionRecordFiles({ invocationId: 'x', run: run(), outcome: 'blocked', rawArgv: ['git', 'push'] }), /Unsupported Task Finish execution record field/);
});

test('Finish execution record outcome保持Finish owner状态映射', () => {
  assert.equal(taskFinishExecutionRecordOutcome({ status: 'complete' }), 'passed');
  assert.equal(taskFinishExecutionRecordOutcome({ status: 'blocked' }), 'blocked');
  assert.equal(taskFinishExecutionRecordOutcome({ status: 'cleanup_pending' }), 'blocked');
  assert.equal(taskFinishExecutionRecordOutcome({ status: 'failed' }), 'failed');
  assert.equal(taskFinishExecutionRecordOutcome({ status: 'blocked', cancelled: true }), 'cancelled');
});

test('公开Finish executionRecord摘要不暴露locator', () => {
  const result = publicTaskFinishExecutionRecord('retained', {
    record: {
      recordId: 'task-exec-1', outcome: 'passed', lifecycleStatus: 'retained',
      body: { locator: '.buildr/local/private', digest: 'sha256-body', storedSizeBytes: 10, originalSizeBytes: 12, truncated: true },
    },
    transientCleanup: { status: 'cleaned', code: 'cleanup.removed' },
  });
  assert.equal(result.recordId, 'task-exec-1');
  assert.equal(result.body.digest, 'sha256-body');
  assert.equal(JSON.stringify(result).includes('locator'), false);
});
