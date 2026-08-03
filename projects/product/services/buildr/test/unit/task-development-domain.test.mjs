import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskCandidate,
  createTaskFinishHandoff,
  normalizeTaskDevelopmentReceipt,
  taskDevelopmentDigest,
} from '../../src/domain/task-development/task-development.mjs';

const sha = (value) => taskDevelopmentDigest(value);

function context(changes = []) {
  const payload = {
    taskId: 'demo-task',
    intent: 'Deliver portable documentation.',
    scope: { projects: ['docs'], services: [] },
    changes,
  };
  return { identity: sha(payload), ...payload };
}

function target(identity = sha('content-v1')) {
  const components = [{
    selector: 'project:docs',
    kind: 'project',
    sourcePath: 'projects/docs',
    observer: 'fixture.filesystem/v1',
    identity,
  }];
  return { identity: sha({ components }), components };
}

function policy() {
  const payload = {
    declarations: [{ project: 'docs', path: 'projects/docs/verification.yml', identity: sha('declaration') }],
    capabilities: [{ project: 'docs', capability: 'docs.check', required: true }],
    coverageGaps: [],
    overrides: [],
  };
  return { identity: sha(payload), ...payload };
}

function gate(targetIdentity, outcome) {
  return { resultDigest: sha(`${targetIdentity}:${outcome}`), targetIdentity, outcome, applicability: 'current' };
}

function receipt(overrides = {}) {
  const taskContext = context();
  const contentTarget = target();
  const verificationPolicy = policy();
  const candidate = createTaskCandidate({
    generation: 1,
    contentTargetIdentity: contentTarget.identity,
    taskContextIdentity: taskContext.identity,
    policyIdentity: verificationPolicy.identity,
  });
  const gates = {
    planning: gate(sha('plan'), 'ready'),
    verification: gate(contentTarget.identity, 'passed'),
    completion: gate(candidate.identity, 'ready'),
  };
  const decision = { outcome: 'proceed', candidateIdentity: candidate.identity, summary: 'All declared gates are current.', risks: [] };
  const handoff = createTaskFinishHandoff({ candidate, changes: taskContext.changes, gates, decision, createdAt: '2026-08-04T00:00:00.000Z' });
  return {
    schemaVersion: 'buildr.task-development-receipt/v1',
    taskId: 'demo-task',
    environment: { taskId: 'demo-task', receiptSchema: 'buildr.task-environment-receipt/v2' },
    taskContext,
    contentTarget,
    verificationPolicy,
    generation: 1,
    candidate,
    gates,
    decision,
    handoffs: [handoff],
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:01:00.000Z',
    ...overrides,
  };
}

test('Candidate identity 只绑定 generation、Content Target、Task Context 与 policy', () => {
  const current = receipt();
  const changedResults = {
    ...current,
    gates: {
      ...current.gates,
      planning: { ...current.gates.planning, resultDigest: sha('replacement planning result') },
      verification: { ...current.gates.verification, resultDigest: sha('replacement verification result') },
      completion: { ...current.gates.completion, resultDigest: sha('replacement completion result') },
    },
  };
  assert.equal(createTaskCandidate(current.candidate).identity, createTaskCandidate(changedResults.candidate).identity);
  assert.notEqual(createTaskFinishHandoff({ candidate: current.candidate, changes: current.taskContext.changes, gates: current.gates, decision: current.decision, createdAt: current.handoffs[0].createdAt }).identity,
    createTaskFinishHandoff({ candidate: current.candidate, changes: current.taskContext.changes, gates: changedResults.gates, decision: current.decision, createdAt: current.handoffs[0].createdAt }).identity);
});

test('Development Receipt 是 closed schema，拒绝 revision、history 与 Result payload', () => {
  for (const field of ['revision', 'history', 'state', 'verificationResult', 'reviewResult', 'candidateResultIds']) {
    assert.throws(() => normalizeTaskDevelopmentReceipt({ ...receipt(), [field]: 'forbidden' }), (error) => error.code === 'task_development_field_forbidden' && error.details.field === field, field);
  }
  assert.throws(() => normalizeTaskDevelopmentReceipt({ ...receipt(), candidate: { ...receipt().candidate, verificationResultDigest: sha('forbidden') } }), (error) => error.code === 'task_development_field_forbidden');
});

test('Receipt 校验所有派生 identity、generation 与 portable reference', () => {
  assert.equal(normalizeTaskDevelopmentReceipt(receipt()).handoffs[0].identity, receipt().handoffs[0].identity);
  assert.throws(() => normalizeTaskDevelopmentReceipt({ ...receipt(), generation: 2 }), (error) => error.code === 'task_development_generation_mismatch');
  assert.throws(() => normalizeTaskDevelopmentReceipt({ ...receipt(), candidate: { ...receipt().candidate, identity: sha('wrong') } }), (error) => error.code === 'task_development_identity_mismatch');
  const absolute = receipt();
  absolute.contentTarget = target();
  absolute.contentTarget.components[0].sourcePath = '/private/docs';
  assert.throws(() => normalizeTaskDevelopmentReceipt(absolute), (error) => error.code === 'task_development_reference_not_portable');
});

test('generation 只在新 Candidate 时变化，并形成不同 identity', () => {
  const current = receipt();
  const next = createTaskCandidate({ ...current.candidate, generation: 2 });
  assert.equal(current.candidate.generation, 1);
  assert.equal(next.generation, 2);
  assert.notEqual(next.identity, current.candidate.identity);
});
