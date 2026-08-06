import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { refreshTaskLifecycleReadModelRuntime } from '../../src/application/task-finish/task-finish-product-executor.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

test('Finish projection refreshes lifecycle read-model application from retained source', async () => {
  let projected = null;
  const runtime = {
    projectTaskFinish: () => { throw new Error('stale lifecycle runtime'); },
    readTaskRecordPersistence: () => ({
      root: '/workspace',
      record: { taskId: 'finish-runtime-refresh-task', status: 'completed', result: { noChange: false } },
    }),
    updateTaskLifecyclePersistence: (_root, _taskId, update) => {
      projected = update(null);
      return projected;
    },
  };

  const refreshed = await refreshTaskLifecycleReadModelRuntime(
    runtime,
    { controllerInvocation: { sourceRoot: serviceRoot } },
    'finish-runtime-refresh-run',
  );

  assert.equal(refreshed, true);
  runtime.projectTaskFinish('/workspace', 'finish-runtime-refresh-task', {
    status: 'delivered',
    association: {
      schemaVersion: 'buildr.task-terminal-delivery-associations/v1',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      gates: {
        planning: {
          status: 'gate-disposition',
          disposition: 'not-applicable',
          targetIdentity: null,
          summary: 'No planning artifact is in scope.',
          source: 'task',
        },
        completion: null,
        verification: null,
      },
    },
  });

  assert.equal(projected.finish.association.gates.planning.targetIdentity, null);
});
