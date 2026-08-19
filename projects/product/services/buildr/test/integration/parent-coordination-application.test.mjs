import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createContributionHandoff } from '../../src/domain/parent-coordination/parent-coordination.mjs';

const BUILDR = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-parent-coordination-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Parent coordination fixture\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  runtime.resolveTaskEnvironmentExecution = (_workspace, taskId) => ({
    ready: true,
    taskId,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    scopes: [],
  });
  return { root: fs.realpathSync(root), runtime };
}

function createTasks(current) {
  current.runtime.createTaskRecord(current.root, { taskId: 'parent-task', title: 'Parent', intent: 'Coordinate final outcome.', projects: [], services: [], changes: [] });
  current.runtime.createTaskRecord(current.root, { taskId: 'child-task', title: 'Child', intent: 'Deliver one Contribution.', parentTaskId: 'parent-task', projects: [], services: [], changes: [] });
  current.runtime.beginTaskDevelopment(current.root, 'parent-task', { changeDispositions: [], planning: { targetIdentity: null, nodes: [] }, planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Initial coordination planning is not yet recorded.', source: 'test fixture' } });
  current.runtime.beginTaskDevelopment(current.root, 'child-task', { changeDispositions: [], planning: { targetIdentity: null, nodes: [] }, planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Fixture child planning.', source: 'test fixture' } });
}

function parentPlan() {
  return {
    outcome: 'The parent outcome is integrated and explicitly accepted.',
    architectureInvariants: ['One fact has one authority.', 'Child completion does not complete Parent.'],
    contributions: [
      { id: 'child-delivery', summary: 'A Child independently delivers its narrow product change.', plannedChildTaskId: 'child-task' },
      { id: 'parent-integration', summary: 'The Parent performs explicit final integration acceptance.', plannedChildTaskId: null },
    ],
    dependencies: [{ contributionId: 'parent-integration', dependsOn: 'child-delivery' }],
    finalAcceptance: ['All delivery facts are proven by saved handoffs.', 'Final integration acceptance is explicitly recorded.'],
  };
}

test('legacy Task保持absent，不扫描或自动backfill Parent Plan', (t) => {
  const current = fixture(t);
  current.runtime.createTaskRecord(current.root, { taskId: 'legacy-task', title: 'Legacy', intent: 'Remain readable.', projects: [], services: [], changes: [] });
  const before = current.runtime.inspectTaskRecord(current.root, 'legacy-task').recordDigest;
  const inspected = current.runtime.inspectParentCoordination(current.root, 'legacy-task');
  assert.equal(inspected.mode, 'legacy');
  assert.equal(inspected.parentPlan, null);
  assert.equal(inspected.startup.status, 'not-applicable');
  assert.equal(inspected.diagnostic.code, 'parent_plan_absent');
  assert.equal(current.runtime.inspectTaskRecord(current.root, 'legacy-task').recordDigest, before);
});

test('Parent Plan record/reconcile公开closed schema与最小example', () => {
  const schemaRun = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'record', '--schema', '--json'], { encoding: 'utf8' });
  assert.equal(schemaRun.status, 0, schemaRun.stderr);
  const schema = JSON.parse(schemaRun.stdout);
  assert.equal(schema.schemaVersion, 'buildr.parent-plan-input-schema/v1');
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(schema.inputSchema.required, ['outcome', 'architectureInvariants', 'contributions', 'finalAcceptance']);
  assert.equal(schema.inputSchema.properties.contributions.maxItems, 128);
  assert.deepEqual(schema.inputSchema.properties.contributions.items.required, ['id', 'summary']);
  assert.equal(schema.inputSchema.properties.dependencies.items.properties.dependsOn.pattern, '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$');

  const exampleRun = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'reconcile', '--example', '--json'], { encoding: 'utf8' });
  assert.equal(exampleRun.status, 0, exampleRun.stderr);
  const example = JSON.parse(exampleRun.stdout);
  assert.equal(example.schemaVersion, 'buildr.parent-plan-input-example/v1');
  assert.equal(example.parentPlan.contributions.length, 1);
  assert.equal('plannedChildTaskId' in example.parentPlan.contributions[0], false);
});

test('Parent startup按真实安全顺序推进Review、gate refresh与首个eligible Contribution', (t) => {
  const current = fixture(t);
  createTasks(current);
  const startupPlan = { ...parentPlan(), contributions: parentPlan().contributions.map((item) => ({ ...item, plannedChildTaskId: null })) };
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: startupPlan });

  let startup = current.runtime.inspectParentStartupReadiness(current.root, 'parent-task');
  assert.equal(startup.schemaVersion, 'buildr.parent-startup-readiness/v1');
  assert.equal(startup.status, 'blocked');
  assert.equal(startup.next.action, 'planning-review');

  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: recorded.parentPlan.identity, method: 'self',
    reviewed: ['Parent outcome', 'Architecture invariants', 'Contribution Map', 'Dependencies', 'Final acceptance'],
    uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Parent Plan is ready.' },
  });
  startup = current.runtime.inspectParentStartupReadiness(current.root, 'parent-task');
  assert.equal(startup.next.action, 'refresh-parent-planning');

  const refreshed = current.runtime.refreshParentPlanning(current.root, 'parent-task');
  assert.equal(refreshed.status, 'refreshed');
  assert.equal(refreshed.startup.status, 'ready');
  assert.equal(refreshed.startup.next.action, 'start-child-contribution');
  assert.deepEqual(refreshed.startup.eligibleContributions, ['child-delivery']);
  assert.equal(refreshed.startup.blockers.length, 0);
  assert.deepEqual(refreshed.startup.dependencyBlockers, [{ contributionId: 'parent-integration', dependsOn: ['child-delivery'] }]);
});

test('Parent planning refresh不接受缺失、stale或changes-required Review', (t) => {
  const current = fixture(t);
  createTasks(current);
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  assert.throws(() => current.runtime.refreshParentPlanning(current.root, 'parent-task'), (error) => error.code === 'parent_planning_review_not_ready');
  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: recorded.parentPlan.identity, method: 'self', reviewed: ['Plan'], uncovered: [], findings: [],
    conclusion: { outcome: 'changes-required', summary: 'Plan must change.' },
  });
  assert.throws(() => current.runtime.refreshParentPlanning(current.root, 'parent-task'), (error) => error.code === 'parent_planning_review_not_ready');
});

test('Parent startup只在没有eligible Contribution时暴露依赖阻塞', (t) => {
  const current = fixture(t);
  createTasks(current);
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: recorded.parentPlan.identity, method: 'self', reviewed: ['Plan'], uncovered: [], findings: [],
    conclusion: { outcome: 'ready', summary: 'Ready.' },
  });
  current.runtime.refreshParentPlanning(current.root, 'parent-task');
  const startup = current.runtime.inspectParentStartupReadiness(current.root, 'parent-task');
  assert.equal(startup.status, 'blocked');
  assert.equal(startup.next.action, 'wait-contribution-dependencies');
  assert.deepEqual(startup.dependencyBlockers, [{ contributionId: 'parent-integration', dependsOn: ['child-delivery'] }]);
  assert.deepEqual(startup.blockers, [{ axis: 'contribution-dependency', code: 'parent_startup_contribution_dependency_incomplete', contributionId: 'parent-integration', dependsOn: ['child-delivery'] }]);
});

test('Parent Plan、Child binding与派生进度不复制Child状态，completed Child也不完成Parent', (t) => {
  const current = fixture(t);
  createTasks(current);
  let result = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  const planIdentity = result.parentPlan.identity;
  const planBytes = JSON.stringify(result.parentPlan);
  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: planIdentity, method: 'self',
    reviewed: ['Parent outcome', 'Architecture invariants', 'Contribution Map', 'Dependencies', 'Final acceptance'],
    uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Coordination plan is ready.' },
  });
  result = current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
  assert.deepEqual(result.children[0].plannedContributions, ['child-delivery']);
  assert.equal(result.parentStatus, 'active');

  current.runtime.completeTaskRecord(current.root, 'child-task', { summary: 'Top-level Child marked completed without a Finish handoff.', noChange: false });
  result = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.equal(result.parentStatus, 'active');
  assert.equal(result.children[0].status, 'completed');
  assert.equal(result.children[0].deliveryProven, false);
  assert.equal(result.contributions.find((item) => item.id === 'child-delivery').disposition, 'unproven');
  assert.equal(JSON.stringify(result.parentPlan), planBytes);
  assert.equal(result.planningReview.applicability, 'current');
  assert.throws(() => current.runtime.acceptParentCoordination(current.root, 'parent-task', { expectedPlanIdentity: planIdentity, summary: 'Accept.' }), (error) => error.code === 'parent_acceptance_prerequisites_incomplete');
  assert.throws(() => current.runtime.completeTaskRecord(current.root, 'parent-task', { summary: 'All Children look done.', noChange: false }), (error) => error.code === 'parent_final_acceptance_required');

  const cli = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'inspect', 'parent-task', '--target', current.root, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const publicResult = JSON.parse(cli.stdout);
  assert.equal(publicResult.schemaVersion, 'buildr.parent-coordination-result/v1');
  assert.deepEqual(publicResult.contributions, result.contributions);
  assert.deepEqual(publicResult.children, result.children);
});

test('reconcile使用optimistic identity并且没有新增progress或lifecycle表', (t) => {
  const current = fixture(t);
  createTasks(current);
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
  assert.throws(() => current.runtime.reconcileParentPlan(current.root, 'parent-task', { expectedPlanIdentity: 'sha256-0000000000000000000000000000000000000000000000000000000000000000', plan: parentPlan(), reason: 'Stale writer.' }), (error) => error.code === 'parent_plan_conflict');
  assert.throws(() => current.runtime.reconcileParentPlan(current.root, 'parent-task', {
    expectedPlanIdentity: recorded.parentPlan.identity,
    reason: 'Invalidly erase active Child ownership.',
    plan: { ...parentPlan(), contributions: parentPlan().contributions.filter((item) => item.id !== 'child-delivery'), dependencies: [] },
  }), (error) => error.code === 'parent_plan_referenced_contribution_removed');
  const reconciled = current.runtime.reconcileParentPlan(current.root, 'parent-task', {
    expectedPlanIdentity: recorded.parentPlan.identity,
    reason: 'The integration Contribution is now owned explicitly by the Parent.',
    plan: { ...parentPlan(), contributions: parentPlan().contributions.map((item) => item.id === 'parent-integration' ? { ...item, plannedChildTaskId: 'parent-task' } : item) },
  });
  assert.equal(reconciled.status, 'reconciled');
  assert.notEqual(reconciled.parentPlan.identity, recorded.parentPlan.identity);
  const opened = current.runtime.openWorkspaceStructuredStore(current.root, { writable: false });
  try {
    const names = opened.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    assert.equal(names.some((name) => /parent.*(progress|lifecycle)|coordination_(event|history)|delivery_registry/.test(name)), false);
  } finally {
    opened.database.close();
  }
});

test('saved Contribution Handoff派生delivered/extra/superseded，Parent仍需显式accept与complete', (t) => {
  const current = fixture(t);
  createTasks(current);
  const plan = {
    outcome: 'All coordinated capabilities are integrated.',
    architectureInvariants: ['Only saved handoffs prove delivery.'],
    contributions: [
      { id: 'child-delivery', summary: 'Child delivers its planned result.', plannedChildTaskId: 'child-task' },
      { id: 'later-capability', summary: 'A later capability is also delivered.', plannedChildTaskId: null },
      { id: 'future-child-scope', summary: 'A future Child would otherwise deliver this scope.', plannedChildTaskId: null },
    ],
    dependencies: [{ contributionId: 'future-child-scope', dependsOn: 'later-capability' }],
    finalAcceptance: ['Every Contribution is delivered or superseded.', 'The Parent records integration acceptance.'],
  };
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan });
  current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
  current.runtime.completeTaskRecord(current.root, 'child-task', { summary: 'Delivered through Formal Finish fixture.', noChange: false });
  const contributionHandoff = createContributionHandoff({
    parentTaskId: 'parent-task', planned: ['child-delivery'], delivered: ['child-delivery'],
    extra: [{ contributionId: 'later-capability', summary: 'The Child safely delivered this later capability too.' }],
    superseded: [{ contributionId: 'future-child-scope', deliveredByContributionId: 'later-capability', reason: 'The later capability completely covers the future scope.' }],
    nextAction: 'Parent owner reconciles future Child creation and records final acceptance.',
  });
  const originalTerminal = current.runtime.inspectTaskTerminalDelivery;
  current.runtime.inspectTaskTerminalDelivery = (root, taskId) => taskId === 'child-task'
    ? { delivered: true, snapshot: { handoff: { contributionHandoff } } }
    : originalTerminal(root, taskId);

  let inspected = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.deepEqual(inspected.contributions.map((item) => [item.id, item.disposition]), [
    ['child-delivery', 'delivered'], ['future-child-scope', 'superseded'], ['later-capability', 'delivered'],
  ]);
  assert.equal(inspected.prerequisitesSatisfied, true);
  assert.equal(inspected.parentStatus, 'active');
  inspected = current.runtime.acceptParentCoordination(current.root, 'parent-task', { expectedPlanIdentity: recorded.parentPlan.identity, summary: 'Integrated behavior and all invariants are accepted.' });
  assert.equal(inspected.parentStatus, 'active');
  assert.equal(inspected.parentAcceptance.planIdentity, recorded.parentPlan.identity);
  current.runtime.completeTaskRecord(current.root, 'parent-task', { summary: 'Explicit Parent completion after final integration acceptance.', noChange: false });
  assert.equal(current.runtime.inspectTaskRecord(current.root, 'parent-task').record.status, 'completed');
});

test('partial delivery保持residual且不能被Parent final acceptance越过', (t) => {
  const current = fixture(t);
  createTasks(current);
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
  current.runtime.completeTaskRecord(current.root, 'child-task', { summary: 'Partially delivered through Formal Finish fixture.', noChange: false });
  const contributionHandoff = createContributionHandoff({
    parentTaskId: 'parent-task', planned: ['child-delivery'], delivered: [],
    residual: [{ contributionId: 'child-delivery', summary: 'Only the residual contract work remains in the narrowed Child scope.' }],
    affected: [{ contributionId: 'parent-integration', summary: 'Integration remains blocked on the residual work.' }],
    nextAction: 'Update the Child intent and narrow Change to the residual scope only.',
  });
  current.runtime.inspectTaskTerminalDelivery = (_root, taskId) => taskId === 'child-task'
    ? { delivered: true, snapshot: { handoff: { contributionHandoff } } }
    : { delivered: false, snapshot: null };
  const inspected = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.equal(inspected.contributions.find((item) => item.id === 'child-delivery').disposition, 'residual');
  assert.equal(inspected.prerequisitesSatisfied, false);
  assert.throws(() => current.runtime.acceptParentCoordination(current.root, 'parent-task', { expectedPlanIdentity: recorded.parentPlan.identity, summary: 'Too early.' }), (error) => error.code === 'parent_acceptance_prerequisites_incomplete');
});
