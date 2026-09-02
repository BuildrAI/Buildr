import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTaskTerminalDeliveryApplication } from '../../src/task/application/task-terminal-delivery-application.ts';

const TASK = 'terminal-task';

function runtimeFor(status = 'completed', finish: any = null) {
  const runtime: any = {
    inspectTaskRecord: () => ({ record: { taskId: TASK, status, result: status === 'completed' ? { noChange: false } : null } }),
    inspectTaskFinishReadModel: () => finish || ({ state: 'none', result: null, completion: null, diagnostics: [] }),
    inspectTaskDevelopment: () => { throw new Error('Terminal Delivery must not read Development.'); },
    inspectTaskReview: () => { throw new Error('Terminal Delivery must not read Review.'); },
  };
  registerTaskTerminalDeliveryApplication(runtime);
  return runtime;
}

function delivered(overrides: any = {}) {
  return {
    state: 'terminal',
    result: {
      runId: 'legacy-run', completedAt: '2026-09-01T01:00:00.000Z',
      identity: { targetBranch: 'dev', remote: 'origin' },
      delivery: { finalRemoteRef: 'abc123', activation: { status: 'passed' } },
    },
    completion: {
      runId: 'legacy-run', completedAt: '2026-09-01T01:00:00.000Z', finalRemoteRef: 'abc123', targetBranch: 'dev',
      cleanup: { status: 'cleaned', completedAt: '2026-09-01T01:01:00.000Z', summary: 'Cleaned.' },
      maintenance: { delivery: 'delivered', activation: 'passed', environmentCleanup: 'cleaned', diagnostics: 'not-applicable' },
    },
    diagnostics: [],
    ...overrides,
  };
}

test('Terminal Delivery只读取Task Record与Finish history', () => {
  const result = runtimeFor('completed', delivered()).inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(result.status, 'delivered');
  assert.equal(result.delivered, true);
  assert.equal(result.delivery.finalRemoteRef, 'abc123');
  assert.equal('snapshot' in result, false);
  assert.equal('associations' in result, false);
  assert.equal('development' in result, false);
  assert.equal('reviews' in result, false);
});

test('Task结果不因Finish历史缺失或损坏而撤销', () => {
  const missing = runtimeFor('completed').inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(missing.status, 'completed');
  assert.equal(missing.delivered, false);

  const runtime = runtimeFor('completed');
  runtime.inspectTaskFinishReadModel = () => { throw Object.assign(new Error('history unavailable'), { code: 'history-unavailable' }); };
  const degraded = runtime.inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(degraded.status, 'completed');
  assert.equal(degraded.diagnostics[0].code, 'history-unavailable');
});

test('active、abandoned和no-change保持独立Task状态', () => {
  assert.equal(runtimeFor('active').inspectTaskTerminalDelivery('/workspace', TASK).status, 'active');
  assert.equal(runtimeFor('abandoned').inspectTaskTerminalDelivery('/workspace', TASK).status, 'abandoned');
  const noChange = runtimeFor('completed');
  noChange.inspectTaskRecord = () => ({ record: { taskId: TASK, status: 'completed', result: { noChange: true } } });
  assert.equal(noChange.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-no-change');
});

test('历史cleanup attention不撤销已交付事实', () => {
  const history = delivered({
    state: 'current',
    completion: {
      runId: 'legacy-run', completedAt: '2026-09-01T01:00:00.000Z', finalRemoteRef: 'abc123', targetBranch: 'dev',
      cleanup: { status: 'pending', summary: 'Cleanup pending.' },
      maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'attention' },
    },
  });
  const result = runtimeFor('completed', history).inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(result.status, 'delivered');
  assert.equal(result.delivery.cleanup.status, 'pending');
  assert.equal(result.maintenance.activation, 'attention');
});
