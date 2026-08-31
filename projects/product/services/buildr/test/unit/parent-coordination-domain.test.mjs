import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeContributionHandoff, normalizeParentPlan, parentCoordinationDigest, projectParentPlan } from '../../src/task/domain/parent-coordination.mjs';

// Persisted historical content, not a writer for the retired coordination workflow.
function stored(payload) {
  return { identity: parentCoordinationDigest(payload), ...payload };
}

const legacyPlan = stored({
  schemaVersion: 'buildr.parent-plan/v1', outcome: 'Legacy outcome', architectureInvariants: ['Legacy invariant'],
  contributions: [{ id: 'legacy-one', summary: 'Legacy contribution', plannedChildTaskId: 'legacy-child' }],
  dependencies: [], finalAcceptance: ['Accepted'],
});
const historicalPlan = stored({
  schemaVersion: 'buildr.parent-plan/v2', outcome: 'Overall goal', architectureDecisions: ['Independent delivery'],
  contributions: [
    { id: 'first', priority: 'P0', title: 'First result', objective: 'Deliver first result', directions: ['Implement'], boundaries: ['Keep scope'], expectedChild: 'First child', dependencies: [] },
    { id: 'second', priority: 'P1', title: 'Second result', objective: 'Deliver second result', directions: [], boundaries: [], expectedChild: null, dependencies: ['first'] },
  ],
  finalAcceptance: ['Verify the whole goal'],
});
const historicalHandoff = stored({
  schemaVersion: 'buildr.contribution-handoff/v1', parentTaskId: 'parent-task', planned: ['first'], delivered: ['first'],
  extra: [{ contributionId: 'second', summary: 'Additional result' }], residual: [{ contributionId: 'third', summary: 'Remaining work' }],
  superseded: [{ contributionId: 'fourth', deliveredByContributionId: 'second', reason: 'Covered by the same artifact' }],
  affected: [{ contributionId: 'third', summary: 'Review its scope' }], nextAction: 'Review the remaining goal',
});

test('historical v1 parent plan remains readable without changing stored identity or bytes', () => {
  const before = JSON.stringify(legacyPlan);
  assert.deepEqual(normalizeParentPlan(legacyPlan), legacyPlan);
  const projected = projectParentPlan(legacyPlan);
  assert.equal(projected.sourceSchemaVersion, 'buildr.parent-plan/v1');
  assert.equal(projected.identity, legacyPlan.identity);
  assert.equal(projected.contributions[0].expectedChild, 'legacy-child');
  assert.deepEqual(projected.architectureDecisions, ['Legacy invariant']);
  assert.equal(JSON.stringify(legacyPlan), before);
});

test('historical v2 plan keeps goals, decisions, dependencies and acceptance', () => {
  assert.deepEqual(normalizeParentPlan(historicalPlan), historicalPlan);
  const projected = projectParentPlan(historicalPlan);
  assert.equal(projected.identity, historicalPlan.identity);
  assert.deepEqual(projected.contributions, historicalPlan.contributions);
  assert.deepEqual(projected.finalAcceptance, ['Verify the whole goal']);
  assert.throws(() => projectParentPlan({ ...historicalPlan, outcome: 'Changed' }), { code: 'parent_plan_identity_mismatch' });
});

test('invalid historical plans are diagnosed, never inferred into current progress', () => {
  const cycle = stored({ ...historicalPlan, contributions: historicalPlan.contributions.map((item) => ({ ...item, dependencies: item.id === 'first' ? ['second'] : ['first'] })) });
  assert.throws(() => normalizeParentPlan(cycle), { code: 'parent_plan_dependency_cycle' });
  assert.throws(() => normalizeParentPlan({ ...historicalPlan, progress: 100 }), { code: 'parent_coordination_field_forbidden' });
  assert.throws(() => normalizeParentPlan({ schemaVersion: 'unknown' }), { code: 'parent_plan_schema_unsupported' });
});

test('historical contribution handoff preserves each disposition and verifies its content identity', () => {
  const before = JSON.stringify(historicalHandoff);
  assert.deepEqual(normalizeContributionHandoff(historicalHandoff), historicalHandoff);
  assert.equal(JSON.stringify(historicalHandoff), before);
  assert.throws(() => normalizeContributionHandoff({ ...historicalHandoff, nextAction: 'Changed' }), { code: 'contribution_handoff_identity_mismatch' });
  assert.throws(() => normalizeContributionHandoff({ ...historicalHandoff, delivered: ['unknown'] }), { code: 'contribution_handoff_delivered_not_planned' });
});
