import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileTaskFinishMaintenance } from '../../src/task/application/finish/task-finish-maintenance.mjs';

function closeout(status, taskId = 'task-1', runId = 'run-1') {
  return {
    schemaVersion: 'buildr.self-bootstrap-closeout-result/v1',
    status,
    taskId,
    runId,
    phases: [{ id: 'finalize', status }],
  };
}

function runtimeFixture({ terminal = false, environmentStatus = 'ready' } = {}) {
  const state = terminal
    ? {
      kind: 'terminal',
      completion: {
        task: 'task-1',
        runId: 'run-1',
        maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'not-opened' },
        result: { status: 'complete', delivery: { finalRemoteRef: 'sha256-delivery' }, maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'not-opened' } },
      },
    }
    : {
      kind: 'run',
      run: { runId: 'run-1', identity: { task: 'task-1' }, maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'not-opened' } },
      completion: { maintenance: { delivery: 'delivered', activation: 'attention', environmentCleanup: 'pending', diagnostics: 'not-opened' } },
    };
  const writes = [];
  return {
    state,
    writes,
    readTaskFinishRunPersistence: (_root, selector) => terminal || selector.runId === 'run-1' || selector.taskId === 'task-1' ? (terminal ? null : { run: state.run, preparedCompletion: state.completion }) : null,
    readTaskFinishCompletionPersistence: () => terminal ? { completion: state.completion } : null,
    readTaskEnvironmentCurrent: () => ({ status: environmentStatus, environment: { latest: { cleanup: { completedAt: '2026-08-21T00:00:00.000Z' } } } }),
    writeTaskFinishMaintenancePersistence: (_root, input) => {
      writes.push(input);
      if (terminal) {
        state.completion.maintenance = input.maintenance;
        state.completion.result.maintenance = input.maintenance;
      } else {
        state.run.maintenance = input.maintenance;
        state.completion.maintenance = input.maintenance;
      }
      return { storage: 'workspace-sqlite', file: 'workspace-sqlite:task-finish-completion/task-1' };
    },
  };
}

test('self-bootstrap passed and cleaned Environment converge current Finish maintenance without Delivery input', () => {
  const runtime = runtimeFixture({ environmentStatus: 'cleaned' });
  const result = reconcileTaskFinishMaintenance({ runtime, root: '/workspace', taskId: 'task-1', runId: 'run-1', selfBootstrapResult: closeout('passed') });
  assert.equal(result.maintenance.activation, 'passed');
  assert.equal(result.maintenance.environmentCleanup, 'cleaned');
  assert.equal(result.maintenance.delivery, 'delivered');
  assert.equal(runtime.writes.length, 1);
});

test('self-bootstrap and cleanup facts may arrive in either order', () => {
  const runtime = runtimeFixture({ environmentStatus: 'ready' });
  const first = reconcileTaskFinishMaintenance({ runtime, root: '/workspace', taskId: 'task-1', runId: 'run-1', selfBootstrapResult: closeout('passed') });
  assert.deepEqual({ activation: first.maintenance.activation, cleanup: first.maintenance.environmentCleanup }, { activation: 'passed', cleanup: 'pending' });
  runtime.readTaskEnvironmentCurrent = () => ({ status: 'cleaned', environment: { latest: { cleanup: { completedAt: '2026-08-21T00:00:00.000Z' } } } });
  const second = reconcileTaskFinishMaintenance({ runtime, root: '/workspace', taskId: 'task-1', runId: 'run-1' });
  assert.deepEqual({ activation: second.maintenance.activation, cleanup: second.maintenance.environmentCleanup }, { activation: 'passed', cleanup: 'cleaned' });
});

test('foreign self-bootstrap result is rejected without writing Finish maintenance', () => {
  const runtime = runtimeFixture({ terminal: true, environmentStatus: 'cleaned' });
  assert.throws(() => reconcileTaskFinishMaintenance({ runtime, root: '/workspace', taskId: 'task-1', runId: 'run-1', selfBootstrapResult: closeout('passed', 'other-task', 'other-run') }), (error) => error.code === 'task_finish.maintenance_self_bootstrap_identity_conflict');
  assert.equal(runtime.writes.length, 0);
});
