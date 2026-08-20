import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createContributionHandoff, parentCoordinationDigest } from '../../src/domain/parent-coordination/parent-coordination.mjs';
import { createTaskDevelopmentPlanning } from '../../src/domain/task-development/task-development.mjs';

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
  const opened = current.runtime.openWorkspaceStructuredStore(current.root, { writable: true });
  opened.database.prepare("INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at) VALUES ('parent-task', 'ready', '{}', '2026-08-08T00:00:00.000Z')").run();
  opened.database.close();
  current.runtime.beginTaskDevelopment(current.root, 'parent-task', { changeDispositions: [], planning: { targetIdentity: null, nodes: [] }, planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Initial coordination planning is not yet recorded.', source: 'test fixture' } });
  current.runtime.beginTaskDevelopment(current.root, 'child-task', { changeDispositions: [], planning: { targetIdentity: null, nodes: [] }, planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Fixture child planning.', source: 'test fixture' } });
}

function parentPlan() {
  return {
    outcome: 'The parent outcome is integrated and explicitly accepted.',
    architectureDecisions: ['One fact has one authority.', 'Child completion does not complete Parent.'],
    contributions: [
      { id: 'child-delivery', priority: 'P0-1', title: 'Child delivery', objective: 'A Child independently delivers its narrow product change.', directions: ['Deliver through a narrow Change.'], boundaries: ['Do not complete Parent.'], expectedChild: 'A focused Child Task', dependencies: [] },
      { id: 'parent-integration', priority: 'P0-2', title: 'Parent integration', objective: 'The Parent performs explicit final integration acceptance.', directions: ['Integrate proven results.'], boundaries: ['Do not infer delivery from status.'], expectedChild: null, dependencies: ['child-delivery'] },
    ],
    finalAcceptance: ['All delivery facts are proven by saved handoffs.', 'Final integration acceptance is explicitly recorded.'],
  };
}

test('ordinary Task保持absent，不扫描或自动backfill Parent Plan', (t) => {
  const current = fixture(t);
  current.runtime.createTaskRecord(current.root, { taskId: 'legacy-task', title: 'Legacy', intent: 'Remain readable.', projects: [], services: [], changes: [] });
  const before = current.runtime.inspectTaskRecord(current.root, 'legacy-task').recordDigest;
  const inspected = current.runtime.inspectParentCoordination(current.root, 'legacy-task');
  assert.equal(inspected.mode, 'ordinary');
  assert.equal(inspected.parentPlan, null);
  assert.equal(inspected.startup.status, 'not-applicable');
  assert.equal(inspected.diagnostic, null);
  assert.equal(current.runtime.inspectTaskRecord(current.root, 'legacy-task').recordDigest, before);
});

test('已保存v1 Parent Plan保持原identity并经read model双读', (t) => {
  const current = fixture(t);
  createTasks(current);
  const payload = {
    schemaVersion: 'buildr.parent-plan/v1', outcome: 'Legacy coordinated outcome.', architectureInvariants: ['Keep the original authority.'],
    contributions: [{ id: 'child-delivery', summary: 'Legacy Child delivery.', plannedChildTaskId: 'child-task' }], dependencies: [], finalAcceptance: ['Delivery is proven.'],
  };
  const legacyPlan = { identity: parentCoordinationDigest(payload), ...payload };
  assert.throws(() => current.runtime.recordParentPlan(current.root, 'parent-task', { plan: legacyPlan }), (error) => error.code === 'parent_coordination_field_forbidden');
  const opened = current.runtime.openWorkspaceStructuredStore(current.root, { writable: true });
  try {
    const row = opened.database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get('parent-task');
    const receipt = JSON.parse(row.record_json);
    receipt.parentPlan = legacyPlan;
    receipt.planning = createTaskDevelopmentPlanning({ targetIdentity: legacyPlan.identity, nodes: [{ id: 'parent-plan', kind: 'parent-plan', authority: 'buildr.task-development/v3', reference: 'workspace-sqlite:task-development/parent-task#parent-plan', identity: legacyPlan.identity, disposition: 'current', summary: 'Legacy Parent Plan.', source: null }] });
    opened.database.prepare('UPDATE task_development_current SET record_json = ? WHERE task_id = ?').run(JSON.stringify(receipt), 'parent-task');
  } finally { opened.database.close(); }
  const inspected = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.equal(inspected.mode, 'parent-plan');
  assert.equal(inspected.parentPlan.schemaVersion, 'buildr.parent-plan/v1');
  assert.equal(inspected.parentPlan.identity, legacyPlan.identity);
  assert.equal(inspected.plan.sourceSchemaVersion, 'buildr.parent-plan/v1');
  assert.equal(inspected.contributions[0].expectation.child, 'child-task');
  assert.equal(inspected.contributions[0].actual.status, 'unassigned');
  const upgraded = current.runtime.reconcileParentPlan(current.root, 'parent-task', {
    expectedPlanIdentity: legacyPlan.identity, plan: parentPlan(), reason: 'Explicitly upgrade the legacy coordination plan to v2.',
  });
  assert.equal(upgraded.parentPlan.schemaVersion, 'buildr.parent-plan/v2');
  assert.notEqual(upgraded.parentPlan.identity, legacyPlan.identity);
  assert.equal(upgraded.plan.sourceSchemaVersion, 'buildr.parent-plan/v2');
});

test('Parent Plan record/reconcile公开closed schema与最小example', () => {
  const schemaRun = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'record', '--schema', '--json'], { encoding: 'utf8' });
  assert.equal(schemaRun.status, 0, schemaRun.stderr);
  const schema = JSON.parse(schemaRun.stdout);
  assert.equal(schema.schemaVersion, 'buildr.parent-plan-input-schema/v2');
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(schema.inputSchema.required, ['outcome', 'architectureDecisions', 'contributions', 'finalAcceptance']);
  assert.equal(schema.inputSchema.properties.contributions.maxItems, 128);
  assert.deepEqual(schema.inputSchema.properties.contributions.items.required, ['id', 'priority', 'title', 'objective', 'directions', 'boundaries', 'dependencies']);
  assert.equal(schema.inputSchema.properties.contributions.items.properties.dependencies.items.pattern, '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$');

  const exampleRun = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'reconcile', '--example', '--json'], { encoding: 'utf8' });
  assert.equal(exampleRun.status, 0, exampleRun.stderr);
  const example = JSON.parse(exampleRun.stdout);
  assert.equal(example.schemaVersion, 'buildr.parent-plan-input-example/v2');
  assert.equal(example.parentPlan.contributions.length, 1);
  assert.equal(example.parentPlan.contributions[0].expectedChild, 'A focused implementation Child');
});

test('Parent startup按真实安全顺序推进Review、gate refresh与首个eligible Contribution', (t) => {
  const current = fixture(t);
  createTasks(current);
  const startupPlan = parentPlan();
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: startupPlan });

  let startup = current.runtime.inspectParentStartupReadiness(current.root, 'parent-task');
  assert.equal(startup.schemaVersion, 'buildr.parent-startup-readiness/v2');
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
  const eligible = refreshed.contributions.find((item) => item.id === 'child-delivery');
  assert.equal(eligible.expectation.status, 'expected');
  assert.equal(eligible.actual.status, 'unassigned');
  assert.equal(eligible.eligibility.status, 'eligible');
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
  current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
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
  const childMode = current.runtime.inspectParentCoordination(current.root, 'child-task');
  assert.equal(childMode.mode, 'child');
  assert.equal(childMode.parentSource.taskId, 'parent-task');
  assert.deepEqual(childMode.parentSource.bindings, ['child-delivery']);
  assert.deepEqual(childMode.parentSource.contributions.map((item) => [item.title, item.bindingStatus]), [['Child delivery', 'active']]);

  current.runtime.completeTaskRecord(current.root, 'child-task', { summary: 'Top-level Child marked completed without a Finish handoff.', noChange: false });
  result = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.equal(result.parentStatus, 'active');
  assert.equal(result.children[0].status, 'completed');
  assert.equal(result.children[0].deliveryProven, false);
  assert.equal(result.contributions.find((item) => item.id === 'child-delivery').actual.status, 'unproven');
  assert.equal(JSON.stringify(result.parentPlan), planBytes);
  assert.equal(result.planningReview.applicability, 'current');
  assert.throws(() => current.runtime.acceptParentCoordination(current.root, 'parent-task', { expectedPlanIdentity: planIdentity, summary: 'Accept.' }), (error) => error.code === 'parent_acceptance_prerequisites_incomplete');
  assert.throws(() => current.runtime.completeTaskRecord(current.root, 'parent-task', { summary: 'All Children look done.', noChange: false }), (error) => error.code === 'parent_final_acceptance_required');

  const cli = spawnSync(process.execPath, [BUILDR, 'task', 'parent', 'inspect', 'parent-task', '--target', current.root, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const publicResult = JSON.parse(cli.stdout);
  assert.equal(publicResult.schemaVersion, 'buildr.parent-coordination-result/v2');
  assert.deepEqual(publicResult.contributions, result.contributions);
  assert.deepEqual(publicResult.children, result.children);
});

test('reconcile使用optimistic identity并且没有新增progress或lifecycle表', (t) => {
  const current = fixture(t);
  createTasks(current);
  const recorded = current.runtime.recordParentPlan(current.root, 'parent-task', { plan: parentPlan() });
  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: recorded.parentPlan.identity, method: 'self', reviewed: ['Plan v2'], uncovered: [], findings: [],
    conclusion: { outcome: 'ready', summary: 'Original plan is ready.' },
  });
  current.runtime.bindChildContributions(current.root, 'child-task', { parentTaskId: 'parent-task', contributionIds: ['child-delivery'] });
  assert.throws(() => current.runtime.reconcileParentPlan(current.root, 'parent-task', { expectedPlanIdentity: 'sha256-0000000000000000000000000000000000000000000000000000000000000000', plan: parentPlan(), reason: 'Stale writer.' }), (error) => error.code === 'parent_plan_conflict');
  assert.throws(() => current.runtime.reconcileParentPlan(current.root, 'parent-task', {
    expectedPlanIdentity: recorded.parentPlan.identity,
    reason: 'Invalidly erase active Child ownership.',
    plan: { ...parentPlan(), contributions: parentPlan().contributions.filter((item) => item.id !== 'child-delivery').map((item) => ({ ...item, dependencies: [] })) },
  }), (error) => error.code === 'parent_plan_referenced_contribution_removed');
  const reconciled = current.runtime.reconcileParentPlan(current.root, 'parent-task', {
    expectedPlanIdentity: recorded.parentPlan.identity,
    reason: 'The integration Contribution now has a clearer expected implementation shape.',
    plan: { ...parentPlan(), contributions: parentPlan().contributions.map((item) => item.id === 'parent-integration' ? { ...item, expectedChild: 'A focused integration Child' } : item) },
  });
  assert.equal(reconciled.status, 'reconciled');
  assert.notEqual(reconciled.parentPlan.identity, recorded.parentPlan.identity);
  assert.equal(reconciled.planningReview.applicability, 'stale');
  current.runtime.recordTaskReview(current.root, 'parent-task', {
    reviewType: 'planning', targetIdentity: reconciled.parentPlan.identity, method: 'self', reviewed: ['Updated Plan v2'], uncovered: [], findings: [],
    conclusion: { outcome: 'ready', summary: 'Updated plan is ready.' },
  });
  const refreshed = current.runtime.refreshParentPlanning(current.root, 'parent-task');
  assert.equal(refreshed.planningReview.applicability, 'current');
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
    architectureDecisions: ['Only saved handoffs prove delivery.'],
    contributions: [
      { id: 'child-delivery', priority: 'P0-1', title: 'Child delivery', objective: 'Child delivers its planned result.', directions: [], boundaries: [], expectedChild: 'A focused Child', dependencies: [] },
      { id: 'later-capability', priority: 'P0-2', title: 'Later capability', objective: 'A later capability is also delivered.', directions: [], boundaries: [], expectedChild: null, dependencies: [] },
      { id: 'future-child-scope', priority: 'P1-1', title: 'Future Child scope', objective: 'A future Child would otherwise deliver this scope.', directions: [], boundaries: [], expectedChild: 'A future Child', dependencies: ['later-capability'] },
    ],
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
  const originalProjection = current.runtime.projectParentCoordinationChild;
  current.runtime.projectParentCoordinationChild = (row, parentTaskId) => {
    const projected = originalProjection(row, parentTaskId);
    return row.task_id === 'child-task' ? { ...projected, deliveryProven: true, contributionHandoff } : projected;
  };

  let inspected = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.deepEqual(inspected.contributions.map((item) => [item.id, item.actual.status]), [
    ['child-delivery', 'delivered'], ['later-capability', 'delivered'], ['future-child-scope', 'superseded'],
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
  const originalProjection = current.runtime.projectParentCoordinationChild;
  current.runtime.projectParentCoordinationChild = (row, parentTaskId) => {
    const projected = originalProjection(row, parentTaskId);
    return row.task_id === 'child-task' ? { ...projected, deliveryProven: true, contributionHandoff } : projected;
  };
  const inspected = current.runtime.inspectParentCoordination(current.root, 'parent-task');
  assert.equal(inspected.contributions.find((item) => item.id === 'child-delivery').actual.status, 'residual');
  assert.equal(inspected.prerequisitesSatisfied, false);
  assert.throws(() => current.runtime.acceptParentCoordination(current.root, 'parent-task', { expectedPlanIdentity: recorded.parentPlan.identity, summary: 'Too early.' }), (error) => error.code === 'parent_acceptance_prerequisites_incomplete');
});
