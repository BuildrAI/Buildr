import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTaskLifecycleReadModelApplication } from '../../src/application/task-lifecycle-read-model/task-lifecycle-read-model-application.mjs';

const TASK = 'terminal-association-task';

function association(overrides = {}) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery-associations/v1',
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    gates: {
      planning: { status: 'gate-disposition', disposition: 'not-applicable', targetIdentity: 'sha256-plan', summary: '无需审查。', source: 'task-plan' },
      completion: { status: 'adopted-at-delivery', targetIdentity: 'sha256-candidate', resultDigest: 'sha256-completion', outcome: 'ready' },
      verification: { status: 'verified-at-delivery', targetIdentity: 'sha256-target', resultDigest: 'sha256-verification', outcome: 'passed' },
    },
    observedAt: '2026-08-06T00:00:00.000Z',
    source: 'task-finish-application',
    ...overrides,
  };
}

function runtimeFor() {
  let model = null;
  const runtime = {
    readTaskRecordPersistence: () => ({ root: '/workspace', record: { taskId: TASK, status: 'completed', result: { noChange: false }, updatedAt: '2026-08-06T00:00:00.000Z' } }),
    updateTaskLifecyclePersistence: (root, taskId, update) => {
      model = update(model);
      return { root, file: `workspace-sqlite:task-lifecycle/${taskId}`, model, modelDigest: 'sha256-model' };
    },
    readTaskLifecyclePersistence: () => model ? { file: `workspace-sqlite:task-lifecycle/${TASK}`, model, modelDigest: 'sha256-model' } : null,
    taskLifecycleReadModelPath: () => `workspace-sqlite:task-lifecycle/${TASK}`,
  };
  registerTaskLifecycleReadModelApplication(runtime);
  return runtime;
}

test('Finish projection persists a normalized terminal association snapshot', () => {
  const runtime = runtimeFor();
  runtime.projectTaskFinish('/workspace', TASK, { status: 'delivered', association: association(), completedAt: '2026-08-06T00:00:01.000Z' });
  const inspected = runtime.inspectTaskLifecycleReadModel('/workspace', TASK);
  assert.equal(inspected.present, true);
  assert.equal(inspected.model.finish.association.handoffIdentity, 'sha256-handoff');
  assert.equal(inspected.model.finish.association.gates.completion.status, 'adopted-at-delivery');
  assert.equal(inspected.model.finish.association.source, 'task-finish-application');
});

test('not-applicable planning gate may omit target identity while delivery gates remain strict', () => {
  const runtime = runtimeFor();
  assert.doesNotThrow(() => runtime.projectTaskFinish('/workspace', TASK, {
    status: 'delivered',
    association: association({ gates: {
      planning: { status: 'gate-disposition', disposition: 'not-applicable', targetIdentity: null, summary: '无需审查。', source: 'task-plan' },
      completion: association().gates.completion,
      verification: association().gates.verification,
    } }),
    completedAt: '2026-08-06T00:00:01.000Z',
  }));
  const strict = runtimeFor();
  assert.throws(() => strict.projectTaskFinish('/workspace', TASK, {
    status: 'delivered',
    association: association({ gates: {
      planning: association().gates.planning,
      completion: { status: 'adopted-at-delivery', targetIdentity: null, resultDigest: 'sha256-completion', outcome: 'ready' },
      verification: association().gates.verification,
    } }),
  }), (error) => error.code === 'task_terminal_association_invalid' && error.details.field === 'association.gates.completion.targetIdentity');
});

test('missing lifecycle snapshot remains an explicit read-only absence', () => {
  const inspected = runtimeFor().inspectTaskLifecycleReadModel('/workspace', TASK);
  assert.equal(inspected.present, false);
  assert.equal(inspected.model, null);
});

test('delivered Finish projection rejects missing or invalid terminal associations', () => {
  const missing = runtimeFor();
  assert.throws(() => missing.projectTaskFinish('/workspace', TASK, { status: 'delivered' }), (error) => error.code === 'task_terminal_association_required');
  const invalid = runtimeFor();
  assert.throws(() => invalid.projectTaskFinish('/workspace', TASK, { status: 'delivered', association: association({ candidateGeneration: 0 }) }), (error) => error.code === 'task_terminal_association_invalid');
});
