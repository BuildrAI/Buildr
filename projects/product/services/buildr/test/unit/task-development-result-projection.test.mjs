import assert from 'node:assert/strict';
import test from 'node:test';

import { compactTaskDevelopmentOperationResult } from '../../src/task/application/task-development-result-projection.mjs';
import { deriveFormalVerificationReadiness } from '../../src/task/application/task-development-application.mjs';

test('compact projection只保留同次Development result的current与guidance', () => {
  const gates = {
    planning: { disposition: 'current', outcome: 'ready' },
    verification: { disposition: 'current', outcome: 'passed' },
    completion: { disposition: 'current', outcome: 'ready' },
  };
  const full = {
    schemaVersion: 'buildr.task-development-operation-result/v1',
    operation: 'handoff',
    status: 'ready',
    taskId: 'compact-result',
    development: {
      receiptDigest: 'sha256-receipt',
      observedAt: '2026-08-14T00:00:00.000Z',
      receipt: {
        taskContext: { identity: 'sha256-context' },
        planning: { identity: 'sha256-planning', targetIdentity: 'sha256-plan-target' },
        contentTarget: { identity: 'sha256-content' },
        verificationPolicy: { identity: 'sha256-policy' },
        candidate: { identity: 'sha256-candidate', generation: 2 },
        currentKnowledge: { identity: 'sha256-knowledge', treeIdentity: 'sha256-content', status: 'aligned', summary: 'Current Knowledge已对齐。' },
        generation: 2,
        decision: { outcome: 'proceed', candidateIdentity: 'sha256-candidate', summary: 'ready' },
        handoffs: [{ identity: 'sha256-handoff' }],
      },
      applicability: {
        status: 'handoff-current',
        taskContext: 'current', planning: 'current', contentTarget: 'current', policy: 'current', candidate: 'current', currentKnowledge: 'current', handoff: 'current',
        gates,
        reasons: [],
      },
    },
    formalVerificationReadiness: {
      scope: 'formal-verification', status: 'not-applicable',
      checks: { changes: 'ready', contentTarget: 'current', policy: 'current', currentKnowledge: 'not-applicable' },
      reasons: [{ axis: 'verification', code: 'matching-formal-verification-current' }],
    },
    diagnostic: null,
    effects: [{ type: 'updated', path: 'workspace-sqlite:task-development/compact-result' }],
    nextActions: ['等待明确交付授权后进入task-finish。'],
  };

  const compact = compactTaskDevelopmentOperationResult(full);
  assert.equal(compact.schemaVersion, 'buildr.task-development-driver-compact/v1');
  assert.deepEqual(compact.current, {
    receiptDigest: 'sha256-receipt',
    observedAt: '2026-08-14T00:00:00.000Z',
    status: 'handoff-current',
    axes: { taskContext: 'current', planning: 'current', contentTarget: 'current', policy: 'current', candidate: 'current', currentKnowledge: 'current', handoff: 'current' },
    identities: {
      taskContext: 'sha256-context', planning: 'sha256-planning', planningTarget: 'sha256-plan-target', parentPlan: null, contentTarget: 'sha256-content',
      policy: 'sha256-policy', candidate: 'sha256-candidate', currentKnowledge: 'sha256-knowledge', handoff: 'sha256-handoff',
    },
    candidateGeneration: 2,
    currentKnowledge: { status: 'aligned', treeIdentity: 'sha256-content', summary: 'Current Knowledge已对齐。' },
    gates,
    decision: { outcome: 'proceed', candidateIdentity: 'sha256-candidate' },
    reasons: [],
    formalVerificationReadiness: full.formalVerificationReadiness,
  });
  assert.deepEqual(compact.effects, full.effects);
  assert.deepEqual(compact.nextActions, full.nextActions);
  assert.equal(Object.hasOwn(compact, 'development'), false);
});

test('Formal Verification readiness只按保存事实区分not-applicable、blocked与ready', () => {
  const persistence = (changes = [], contentTarget = { identity: 'sha256-content' }, candidate = { identity: 'sha256-candidate', generation: 1 }) => ({ receipt: {
    taskContext: { changes }, contentTarget, verificationPolicy: { identity: 'sha256-policy' }, candidate,
  } });
  const applicability = (overrides = {}) => ({
    taskContext: 'current', planning: 'current', contentTarget: 'current', policy: 'current', candidate: 'current', gates: { verification: null }, ...overrides,
  });

  assert.equal(deriveFormalVerificationReadiness(persistence([], null, null), applicability({ contentTarget: 'missing', policy: 'missing', candidate: 'missing' })).status, 'not-applicable');
  const blocked = deriveFormalVerificationReadiness(persistence([{ project: 'demo', change: 'active', disposition: 'pending' }]), applicability());
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.reasons[0], { axis: 'change', code: 'change-disposition-pending', changes: ['demo/active'] });
  const ready = deriveFormalVerificationReadiness(persistence(), applicability());
  assert.equal(ready.status, 'ready');
  assert.equal(ready.checks.currentKnowledge, 'missing');
  assert.equal(deriveFormalVerificationReadiness(persistence(), applicability({ gates: { verification: { outcome: 'passed' } } })).status, 'not-applicable');
});

test('compact projection保留missing current并拒绝其他result schema', () => {
  const compact = compactTaskDevelopmentOperationResult({
    schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'missing', taskId: 'missing', development: null,
    diagnostic: null, effects: [], nextActions: ['调用begin。'],
  });
  assert.equal(compact.current, null);
  assert.deepEqual(compact.nextActions, ['调用begin。']);
  assert.throws(() => compactTaskDevelopmentOperationResult({ schemaVersion: 'other' }), /operation result v1/);
});
