import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createContributionHandoff,
  createParentPlan,
  normalizeContributionHandoff,
  normalizeParentPlan,
  validateContributionHandoffAgainstPlan,
} from '../../src/domain/parent-coordination/parent-coordination.mjs';

function plan(overrides = {}) {
  return createParentPlan({
    outcome: 'Parent outcome is integrated and explicitly accepted.',
    architectureInvariants: ['One fact has one authority.', 'Child completion does not complete Parent.'],
    contributions: [
      { id: 'application-read-model', summary: 'A shared derived read model is available.', plannedChildTaskId: null },
      { id: 'independent-delivery', summary: 'Child Tasks deliver narrow Changes independently.', plannedChildTaskId: 'child-one' },
    ],
    dependencies: [{ contributionId: 'application-read-model', dependsOn: 'independent-delivery' }],
    finalAcceptance: ['All Contributions are proven delivered or explicitly superseded.', 'Parent integration acceptance is recorded.'],
    ...overrides,
  });
}

test('Parent Plan identity只绑定协调内容且输入顺序不影响identity', () => {
  const first = plan();
  const reordered = plan({
    architectureInvariants: ['Child completion does not complete Parent.', 'One fact has one authority.'],
    contributions: [...first.contributions].reverse(),
    finalAcceptance: [...first.finalAcceptance].reverse(),
  });
  assert.equal(first.identity, reordered.identity);
  assert.deepEqual(normalizeParentPlan(first), first);
  assert.equal(Object.hasOwn(first, 'children'), false);
  assert.equal(Object.hasOwn(first, 'progress'), false);
});

test('Parent Plan拒绝循环依赖、未知Contribution与实现状态字段', () => {
  assert.throws(() => plan({ dependencies: [
    { contributionId: 'application-read-model', dependsOn: 'independent-delivery' },
    { contributionId: 'independent-delivery', dependsOn: 'application-read-model' },
  ] }), (error) => error.code === 'parent_plan_dependency_cycle');
  assert.throws(() => plan({ dependencies: [{ contributionId: 'missing', dependsOn: 'independent-delivery' }] }), (error) => error.code === 'parent_plan_dependency_invalid');
  assert.throws(() => createParentPlan({
    outcome: 'Outcome', architectureInvariants: ['Invariant'],
    contributions: [{ id: 'one', summary: 'One', status: 'completed' }],
    finalAcceptance: ['Accepted'],
  }), (error) => error.code === 'parent_coordination_field_forbidden');
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
    { id: 'independent-delivery', summary: 'Independent delivery.', plannedChildTaskId: 'child-one' },
    { id: 'application-read-model', summary: 'Shared read model.', plannedChildTaskId: null },
    { id: 'documentation', summary: 'Architecture documentation.', plannedChildTaskId: null },
    { id: 'future-child', summary: 'Future Child scope.', plannedChildTaskId: null },
  ], dependencies: [] }), ['independent-delivery']).identity, handoff.identity);
  assert.throws(() => validateContributionHandoffAgainstPlan(handoff, plan(), ['application-read-model']), (error) => error.code === 'contribution_handoff_planned_mismatch');
  assert.throws(() => validateContributionHandoffAgainstPlan(handoff, plan(), ['independent-delivery']), (error) => error.code === 'contribution_handoff_unknown_contribution');
  assert.throws(() => createContributionHandoff({
    parentTaskId: 'parent-one', planned: ['independent-delivery'], delivered: ['not-planned'], nextAction: 'Reconcile once.',
  }), (error) => error.code === 'contribution_handoff_delivered_not_planned');
});
