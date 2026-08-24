import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createContributionHandoff,
  createParentPlan,
  normalizeContributionHandoff,
  normalizeParentPlan,
  parentCoordinationDigest,
  projectParentPlan,
  validateContributionHandoffAgainstPlan,
} from '../../src/task/domain/parent-coordination.mjs';
import { createTerminalContributionReconciliation, normalizeTerminalContributionReconciliation } from '../../src/task/domain/terminal-contribution-reconciliation.mjs';

function plan(overrides = {}) {
  return createParentPlan({
    outcome: 'Parent outcome is integrated and explicitly accepted.',
    architectureDecisions: ['One fact has one authority.', 'Child completion does not complete Parent.'],
    contributions: [
      { id: 'application-read-model', priority: 'P0-2', title: 'Shared read model', objective: 'A shared derived read model is available.', directions: ['Derive facts from authorities.'], boundaries: ['Do not add a second store.'], expectedChild: null, dependencies: ['independent-delivery'] },
      { id: 'independent-delivery', priority: 'P0-1', title: 'Independent delivery', objective: 'Child Tasks deliver narrow Changes independently.', directions: ['Keep Child scope narrow.'], boundaries: ['Do not complete Parent.'], expectedChild: 'A focused Child Task', dependencies: [] },
    ],
    finalAcceptance: ['All Contributions are proven delivered or explicitly superseded.', 'Parent integration acceptance is recorded.'],
    ...overrides,
  });
}

test('Parent Plan identity只绑定协调内容且输入顺序不影响identity', () => {
  const first = plan();
  const reordered = plan({
    architectureDecisions: ['Child completion does not complete Parent.', 'One fact has one authority.'],
    contributions: [...first.contributions].reverse(),
    finalAcceptance: [...first.finalAcceptance].reverse(),
  });
  assert.equal(first.identity, reordered.identity);
  assert.deepEqual(normalizeParentPlan(first), first);
  assert.equal(Object.hasOwn(first, 'children'), false);
  assert.equal(Object.hasOwn(first, 'progress'), false);
});

test('Parent Plan拒绝循环依赖、未知Contribution与实现状态字段', () => {
  assert.throws(() => plan({ contributions: plan().contributions.map((item) => ({ ...item, dependencies: item.id === 'independent-delivery' ? ['application-read-model'] : ['independent-delivery'] })) }), (error) => error.code === 'parent_plan_dependency_cycle');
  assert.throws(() => plan({ contributions: plan().contributions.map((item) => item.id === 'application-read-model' ? { ...item, dependencies: ['missing'] } : item) }), (error) => error.code === 'parent_plan_dependency_invalid');
  assert.throws(() => plan({ contributions: plan().contributions.map((item) => item.id === 'independent-delivery' ? { ...item, dependencies: ['independent-delivery'] } : item) }), (error) => error.code === 'parent_plan_dependency_invalid');
  assert.throws(() => createParentPlan({
    outcome: 'Outcome', architectureDecisions: ['Decision'],
    contributions: [{ id: 'one', priority: 'P0-1', title: 'One', objective: 'One', directions: [], boundaries: [], dependencies: [], status: 'completed' }],
    finalAcceptance: ['Accepted'],
  }), (error) => error.code === 'parent_coordination_field_forbidden');
});

test('v1 Parent Plan保留原identity并投影为v2只读结构', () => {
  const payload = {
    schemaVersion: 'buildr.parent-plan/v1', outcome: 'Legacy outcome', architectureInvariants: ['Legacy invariant'],
    contributions: [{ id: 'legacy-one', summary: 'Legacy contribution', plannedChildTaskId: 'legacy-child' }], dependencies: [], finalAcceptance: ['Accepted'],
  };
  const legacy = normalizeParentPlan({ identity: parentCoordinationDigest(payload), ...payload });
  const projected = projectParentPlan(legacy);
  assert.equal(legacy.schemaVersion, 'buildr.parent-plan/v1');
  assert.equal(projected.sourceSchemaVersion, 'buildr.parent-plan/v1');
  assert.equal(projected.identity, legacy.identity);
  assert.equal(projected.contributions[0].expectedChild, 'legacy-child');
});

test('等价大型Parent计划完整round-trip七个方向、十五条决策与十四条验收', () => {
  const large = createParentPlan({
    outcome: 'A complete multi-Child optimization is coordinated.',
    architectureDecisions: Array.from({ length: 15 }, (_, index) => `Architecture decision ${index + 1}`),
    contributions: Array.from({ length: 7 }, (_, index) => ({
      id: `direction-${index + 1}`, priority: `P${Math.floor(index / 3)}-${index + 1}`, title: `Direction ${index + 1}`,
      objective: `Deliver direction ${index + 1}.`, directions: [`Implementation direction ${index + 1}`], boundaries: [`Boundary ${index + 1}`],
      expectedChild: `Focused Child ${index + 1}`, dependencies: index === 0 ? [] : [`direction-${index}`],
    })),
    finalAcceptance: Array.from({ length: 14 }, (_, index) => `Acceptance ${index + 1}`),
  });
  const roundTrip = normalizeParentPlan(JSON.parse(JSON.stringify(large)));
  assert.equal(roundTrip.contributions.length, 7);
  assert.equal(roundTrip.contributions.flatMap((item) => item.directions).length, 7);
  assert.equal(roundTrip.architectureDecisions.length, 15);
  assert.equal(roundTrip.finalAcceptance.length, 14);
  assert.equal(roundTrip.identity, large.identity);
});

test('Contribution Handoff表达planned、delivered、extra、residual、superseded与唯一next action', () => {
  const handoff = createContributionHandoff({
    parentTaskId: 'parent-one',
    planned: ['independent-delivery'],
    delivered: ['independent-delivery'],
    extra: [{ contributionId: 'application-read-model', summary: 'Also delivered the shared read model.' }],
    residual: [{ contributionId: 'documentation', summary: 'Architecture documentation remains.' }],
    superseded: [{ contributionId: 'future-child', deliveredByContributionId: 'application-read-model', reason: 'Its complete scope is already proven.' }],
    affected: [{ contributionId: 'documentation', summary: 'Documentation must describe the delivered read model.' }],
    nextAction: 'Parent owner reconciles the current Parent Plan once.',
  });
  assert.deepEqual(normalizeContributionHandoff(handoff), handoff);
  assert.equal(validateContributionHandoffAgainstPlan(handoff, plan({ contributions: [
    { id: 'independent-delivery', priority: 'P0-1', title: 'Independent delivery', objective: 'Independent delivery.', directions: [], boundaries: [], expectedChild: 'Child one', dependencies: [] },
    { id: 'application-read-model', priority: 'P0-2', title: 'Shared read model', objective: 'Shared read model.', directions: [], boundaries: [], expectedChild: null, dependencies: [] },
    { id: 'documentation', priority: 'P1-1', title: 'Documentation', objective: 'Architecture documentation.', directions: [], boundaries: [], expectedChild: null, dependencies: [] },
    { id: 'future-child', priority: 'P1-2', title: 'Future Child', objective: 'Future Child scope.', directions: [], boundaries: [], expectedChild: null, dependencies: [] },
  ] }), ['independent-delivery']).identity, handoff.identity);
  assert.throws(() => validateContributionHandoffAgainstPlan(handoff, plan(), ['application-read-model']), (error) => error.code === 'contribution_handoff_planned_mismatch');
  assert.throws(() => validateContributionHandoffAgainstPlan(handoff, plan(), ['independent-delivery']), (error) => error.code === 'contribution_handoff_unknown_contribution');
  assert.throws(() => createContributionHandoff({
    parentTaskId: 'parent-one', planned: ['independent-delivery'], delivered: ['not-planned'], nextAction: 'Reconcile once.',
  }), (error) => error.code === 'contribution_handoff_delivered_not_planned');
});

test('terminal contribution reconciliation identity不含createdAt且拒绝Finish association漂移', () => {
  const contributionHandoff = createContributionHandoff({
    parentTaskId: 'parent-task', planned: ['application-read-model'], delivered: ['application-read-model'],
    nextAction: 'Continue with the next eligible Contribution.',
  });
  const gate = { disposition: 'not-applicable', targetIdentity: null, summary: 'Fixture gate.', source: 'unit-test' };
  const handoff = {
    identity: 'sha256-handoff', candidate: { identity: 'sha256-candidate', generation: 1 },
    gates: { planning: gate, verification: gate, completion: gate },
  };
  const finishAssociation = {
    handoffIdentity: handoff.identity, candidateIdentity: handoff.candidate.identity, candidateGeneration: 1,
    gates: {
      planning: { status: 'gate-disposition', ...gate },
      verification: { status: 'gate-disposition', ...gate },
      completion: { status: 'gate-disposition', ...gate },
    },
  };
  const input = { childTaskId: 'child-task', parentTaskId: 'parent-task', parentPlanIdentity: 'sha256-plan', finishAssociation, handoff, contributionHandoff, reason: 'Recover omitted evidence.', source: 'unit-test' };
  const first = createTerminalContributionReconciliation({ ...input, createdAt: '2026-08-23T00:00:00.000Z' });
  const replay = createTerminalContributionReconciliation({ ...input, createdAt: '2026-08-23T00:01:00.000Z' });
  assert.equal(first.identity, replay.identity);
  assert.deepEqual(normalizeTerminalContributionReconciliation(first), first);
  assert.throws(() => createTerminalContributionReconciliation({ ...input, finishAssociation: { ...finishAssociation, candidateGeneration: 2 }, createdAt: '2026-08-23T00:00:00.000Z' }), (error) => error.code === 'terminal_contribution_reconciliation_finish_mismatch');
});
