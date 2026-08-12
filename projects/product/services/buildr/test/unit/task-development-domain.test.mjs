import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskDevelopmentPlanning,
  createTaskCandidate,
  createTaskFinishHandoff,
  normalizeTaskDevelopmentReceipt,
  normalizeTaskVerificationPolicy,
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
    schemaVersion: 'buildr.task-development-receipt/v2',
    taskId: 'demo-task',
    environment: { taskId: 'demo-task', receiptSchema: 'buildr.task-environment-receipt/v2' },
    taskContext,
    planning: createTaskDevelopmentPlanning({ targetIdentity: gates.planning.targetIdentity, nodes: [] }),
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

test('planning snapshot支持current、not-applicable与明确waived，但拒绝无授权waiver', () => {
  const current = createTaskDevelopmentPlanning({ targetIdentity: sha('plan'), nodes: [{ id: 'proposal', kind: 'proposal', authority: 'openspec/v1', reference: 'product/change/proposal', identity: sha('proposal'), disposition: 'current', summary: 'Proposal current.', source: null }] });
  assert.equal(current.nodes[0].disposition, 'current');
  assert.throws(() => createTaskDevelopmentPlanning({ nodes: [{ id: 'review', kind: 'planning-review', authority: 'buildr.task-review/v1', reference: null, identity: null, disposition: 'waived', summary: 'Skipped.', source: null }] }), (error) => error.code === 'task_development_planning_waiver_source_required');
});

test('Receipt允许只有planning facts且Content Target为null', () => {
  const early = receipt({ contentTarget: null, verificationPolicy: null, generation: 0, candidate: null, gates: { planning: null, verification: null, completion: null }, decision: null, handoffs: [] });
  assert.equal(normalizeTaskDevelopmentReceipt(early).contentTarget, null);
});

test('v1 Receipt只读迁移保持Candidate、decision与handoff identity', () => {
  const legacy = receipt();
  legacy.schemaVersion = 'buildr.task-development-receipt/v1';
  delete legacy.planning;
  const migrated = normalizeTaskDevelopmentReceipt(legacy);
  assert.equal(migrated.schemaVersion, 'buildr.task-development-receipt/v3');
  assert.equal(migrated.parentPlan, null);
  assert.deepEqual(migrated.plannedContributions, []);
  assert.equal(migrated.parentAcceptance, null);
  assert.equal(migrated.candidate.identity, legacy.candidate.identity);
  assert.deepEqual(migrated.decision, legacy.decision);
  assert.equal(migrated.handoffs[0].identity, legacy.handoffs[0].identity);
  assert.equal(migrated.planning.targetIdentity, legacy.gates.planning.targetIdentity);
});

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

test('workspace-only policy 只接受空 declarations 与唯一 workspace gap 的自描述 shape', () => {
  const payload = { declarations: [], capabilities: [], coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }], overrides: [] };
  const normalized = normalizeTaskVerificationPolicy({ identity: sha(payload), ...payload });
  assert.deepEqual(normalized, { identity: sha(payload), ...payload });
  for (const invalid of [
    { ...payload, coverageGaps: [] },
    { ...payload, coverageGaps: [{ scope: 'project:demo', summary: 'Not workspace.' }] },
    { ...payload, capabilities: [{ project: 'demo', capability: 'demo.check', required: true }] },
    { ...payload, overrides: [{ project: 'demo', capability: 'demo.check', required: true, scope: 'workspace', basis: 'invalid', source: 'test' }] },
  ]) {
    assert.throws(() => normalizeTaskVerificationPolicy({ identity: sha(invalid), ...invalid }), (error) => error.code === 'task_development_policy_workspace_shape_invalid');
  }
  const projectPayload = policy();
  projectPayload.coverageGaps = [{ scope: 'workspace', summary: 'Invalid for Project policy.' }];
  projectPayload.identity = sha({ declarations: projectPayload.declarations, capabilities: projectPayload.capabilities, coverageGaps: projectPayload.coverageGaps, overrides: projectPayload.overrides });
  assert.throws(() => normalizeTaskVerificationPolicy(projectPayload), (error) => error.code === 'task_development_policy_workspace_shape_invalid');
});
