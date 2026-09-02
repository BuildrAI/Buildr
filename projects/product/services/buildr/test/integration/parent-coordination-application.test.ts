// @ts-nocheck -- Existing behavioral suite migrated with its implementation; typing the fixture framework is outside this change.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { parentCoordinationDigest } from '../../src/task/domain/parent-coordination.ts';

const test = createBuildrApplicationTest('integration-parent-coordination-application');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-parent-light-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'));
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'projects/manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr/workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Parent coordination fixture\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  const create = (taskId, options = {}) => runtime.createTaskRecord(root, { taskId, title: taskId, intent: `Deliver ${taskId}`, projects: [], services: [], changes: [], ...options });
  const inspect = (taskId) => runtime.inspectTaskRecord(root, taskId);
  const complete = (taskId, input = {}) => runtime.completeTaskRecord(root, taskId, { summary: 'Observed completed result', noChange: false, ...input });
  const input = (taskId) => {
    const view = runtime.inspectParentCoordination(root, taskId);
    return { expectedRecordDigest: view.recordDigest, parentCompletion: {
      expectedSnapshot: view.completion.snapshotIdentity,
      acceptance: { summary: 'The full goal and actual artifacts have been reviewed.', children: view.children.map((child) => ({ taskId: child.taskId, summary: `Reviewed result and disposition: ${child.status}` })) },
      authorization: { source: 'test-user-message:explicit-parent-completion', statement: `The user explicitly authorizes completing ${taskId}.` },
    } };
  };
  return { root, runtime, create, inspect, complete, input };
}

test('coordination needs no environment or Development; child completion never completes parent', (t) => {
  const f = fixture(t); f.create('parent'); f.create('child', { parentTaskId: 'parent' });
  assert.equal(f.inspect('parent').record.isParent, true);
  f.complete('child');
  const view = f.runtime.inspectParentCoordination(f.root, 'parent');
  assert.equal(view.recordDigest, f.inspect('parent').recordDigest);
  assert.equal(view.mode, 'parent'); assert.equal(view.children[0].result.summary, 'Observed completed result');
  assert.throws(() => f.complete('parent'), { code: 'parent_completion_authorization_required' });
  assert.equal(f.inspect('parent').record.status, 'active');
});

test('explicit parent with no children needs authorization and records its acceptance', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true });
  assert.throws(() => f.complete('parent'), { code: 'parent_completion_authorization_required' });
  const result = f.complete('parent', f.input('parent'));
  assert.equal(result.record.status, 'completed');
  assert.equal(result.record.result.parentCompletion.authorization.source, 'test-user-message:explicit-parent-completion');
  assert.ok(result.record.result.parentCompletion.recordedAt);
});

test('open children and incomplete dispositions block only parent completion', (t) => {
  const f = fixture(t); f.create('parent'); f.create('child', { parentTaskId: 'parent' });
  assert.throws(() => f.complete('parent', f.input('parent')), { code: 'parent_completion_children_open' });
  f.complete('child'); const missing = f.input('parent'); missing.parentCompletion.acceptance.children = [];
  assert.throws(() => f.complete('parent', missing), { code: 'parent_completion_children_mismatch' });
  assert.equal(f.inspect('child').record.status, 'completed');
  f.complete('parent', f.input('parent'));
});

test('result changes after observation are rejected even when parent record digest is unchanged', (t) => {
  const f = fixture(t); f.create('parent'); f.create('child', { parentTaskId: 'parent' });
  const stale = f.input('parent'); f.complete('child');
  assert.equal(stale.expectedRecordDigest, f.inspect('parent').recordDigest);
  assert.throws(() => f.complete('parent', stale), { code: 'parent_completion_conflict' });
  assert.equal(f.inspect('parent').record.status, 'active');
});

test('relationship changes are rejected and parent identity survives detaching the last child', (t) => {
  const f = fixture(t); f.create('parent'); f.create('child', { parentTaskId: 'parent' });
  const stale = f.input('parent'); f.runtime.updateTaskRecord(f.root, 'child', { parentTaskId: null });
  assert.equal(f.inspect('parent').record.isParent, true);
  assert.throws(() => f.complete('parent', stale), { code: 'task_record_conflict' });
  assert.throws(() => f.complete('parent'), { code: 'parent_completion_authorization_required' });
});

test('nested parent completion requires separate authorization and leaves ancestors unchanged', (t) => {
  const f = fixture(t); f.create('root-parent', { isParent: true }); f.create('middle', { parentTaskId: 'root-parent', isParent: true }); f.create('leaf', { parentTaskId: 'middle' });
  f.complete('leaf'); f.complete('middle', f.input('middle'));
  assert.equal(f.inspect('root-parent').record.status, 'active');
  assert.throws(() => f.complete('root-parent'), { code: 'parent_completion_authorization_required' });
});

test('abandoned child requires explicit disposition and is not rewritten as delivered', (t) => {
  const f = fixture(t); f.create('parent'); f.create('child', { parentTaskId: 'parent' });
  f.runtime.abandonTaskRecord(f.root, 'child', { reason: 'Its goal was covered by the existing artifact.' });
  const evidence = f.input('parent'); evidence.parentCompletion.acceptance.children[0].summary = 'Covered by reviewed existing artifact; no work remains.';
  f.complete('parent', evidence); assert.equal(f.inspect('child').record.status, 'abandoned');
});

test('corrupt historical records do not hide current results', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true });
  const opened = f.runtime.openWorkspaceStructuredStore(f.root, { writable: true });
  opened.database.prepare("UPDATE tasks SET legacy_parent_plan_json = '{}' WHERE task_id = ?").run('parent');
  opened.database.close();
  const view = f.runtime.inspectParentCoordination(f.root, 'parent');
  assert.equal(view.isParent, true); assert.equal(view.diagnostic.code, 'parent_plan_schema_unsupported');
  assert.throws(() => f.complete('parent'), { code: 'parent_completion_authorization_required' });
});

test('ordinary task remains independently completable', (t) => {
  const f = fixture(t); f.create('ordinary'); assert.equal(f.complete('ordinary').record.status, 'completed');
});

test('child identity punctuation does not make an otherwise complete acceptance incomparable', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true });
  for (const id of ['child-a', 'child.a', 'child_a']) { f.create(id, { parentTaskId: 'parent' }); f.complete(id); }
  assert.equal(f.complete('parent', f.input('parent')).record.status, 'completed');
});
test('legacy Parent Plan remains readable and still requires explicit completion authorization', (t) => {
  const f = fixture(t); f.create('legacy-parent');
  const opened = f.runtime.openWorkspaceStructuredStore(f.root, { writable: true });
  const content = {
    schemaVersion: 'buildr.parent-plan/v1', outcome: 'Original goal with no separate modern role',
    architectureInvariants: ['Preserve the original result.'], contributions: [{ id: 'legacy', summary: 'Legacy contribution', plannedChildTaskId: null }],
    dependencies: [], finalAcceptance: ['Review the original result.'],
  };
  const historical = JSON.stringify({ identity: parentCoordinationDigest(content), ...content });
  opened.database.prepare('UPDATE tasks SET legacy_parent_plan_json = ? WHERE task_id = ?').run(historical, 'legacy-parent');
  opened.database.close();
  const view = f.runtime.inspectParentCoordination(f.root, 'legacy-parent');
  assert.equal(view.isParent, true);
  assert.equal(view.historicalPlan.outcome, content.outcome);
  assert.throws(() => f.complete('legacy-parent'), { code: 'parent_completion_authorization_required' });
  const after = f.runtime.openWorkspaceStructuredStore(f.root, { writable: false });
  assert.equal(after.database.prepare('SELECT legacy_parent_plan_json FROM tasks WHERE task_id = ?').get('legacy-parent').legacy_parent_plan_json, historical);
  after.database.close();
});

test('更正父任务保留阶段结果和子任务，update完成仍要求明确授权', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true }); f.create('child', { parentTaskId: 'parent' }); f.complete('child');
  f.complete('parent', f.input('parent'));
  const before = f.inspect('parent');
  const update = (input) => f.runtime.updateTaskRecord(f.root, 'parent', { expectedRecordDigest: f.inspect('parent').recordDigest, ...input });
  assert.throws(() => update({ status: 'active' }));
  assert.equal(f.inspect('parent').recordDigest, before.recordDigest);
  const reopened = update({ status: 'active', intent: 'Continue the entire roadmap', reason: 'User corrects a stage completion' });
  assert.equal(reopened.record.status, 'active'); assert.equal(reopened.record.result, null);
  assert.equal(reopened.record.resultHistory[0].intent, before.record.intent);
  assert.deepEqual(reopened.record.resultHistory[0].result, before.record.result);
  assert.equal(reopened.record.resultHistory[0].recordUpdatedAt, before.record.updatedAt);
  assert.equal(f.inspect('child').record.status, 'completed');
  assert.throws(() => update({ status: 'completed', summary: 'All done', noChange: false }), { code: 'parent_completion_authorization_required' });
  assert.throws(() => update({ status: 'completed', intent: 'Shrink the goal', summary: 'All done', noChange: false, ...f.input('parent') }), { code: 'task_record_completion_context_changed' });
  const completed = update({ status: 'completed', summary: 'Full goal accepted', noChange: false, ...f.input('parent') });
  assert.equal(completed.record.status, 'completed'); assert.equal(completed.record.resultHistory.length, 1);
  assert.throws(() => update({ intent: 'A different goal', reason: 'Edit' }), { code: 'task_record_completion_context_changed' });
});

test('已完成任务可更正父关系，保留成果、旧关系并拒绝并发覆盖和只读字段', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true }); f.create('child'); f.complete('child');
  const before = f.inspect('child');
  const input = { expectedRecordDigest: before.recordDigest, parentTaskId: 'parent', reason: 'User groups completed work under the overall goal' };
  const linked = f.runtime.updateTaskRecord(f.root, 'child', input);
  assert.equal(linked.record.status, 'completed'); assert.deepEqual(linked.record.result, before.record.result);
  assert.equal(linked.record.resultHistory[0].parentTaskId, null);
  assert.deepEqual(f.inspect('parent').record.childTaskIds, ['child']); assert.equal(f.inspect('parent').record.status, 'active');
  assert.throws(() => f.runtime.updateTaskRecord(f.root, 'child', { ...input, title: 'Stale overwrite' }), { code: 'task_record_conflict' });
  for (const field of ['taskId', 'resultHistory', 'createdAt', 'result']) assert.throws(() => f.runtime.updateTaskRecord(f.root, 'child', { expectedRecordDigest: linked.recordDigest, title: 'Invalid', [field]: [] }), { code: 'task_record_field_forbidden' });
  assert.throws(() => f.runtime.updateTaskRecord(f.root, 'child', { expectedRecordDigest: linked.recordDigest, parentTaskId: 'child', reason: 'Invalid cycle' }));
  assert.equal(f.inspect('child').recordDigest, linked.recordDigest);
  const same = f.runtime.updateTaskRecord(f.root, 'child', { ...input, expectedRecordDigest: linked.recordDigest });
  assert.deepEqual(same.effects, []); assert.equal(same.record.resultHistory.length, 1);
});

test('统一更新支持四种状态，保留结果一致性和撤回历史', (t) => {
  const f = fixture(t); f.create('task');
  const update = (input) => f.runtime.updateTaskRecord(f.root, 'task', { expectedRecordDigest: f.inspect('task').recordDigest, ...input });
  assert.throws(() => f.runtime.updateTaskRecord(f.root, 'task', { status: 'todo' }), { code: 'task_record_digest_required' });
  assert.equal(update({ status: 'todo' }).record.status, 'todo');
  assert.throws(() => update({ status: 'completed', summary: 'Changed', noChange: false }), { code: 'task_record_todo_completion_requires_no_change' });
  assert.equal(update({ status: 'active' }).record.status, 'active');
  assert.equal(update({ status: 'completed', summary: 'Delivered', noChange: false }).record.status, 'completed');
  const abandoned = update({ status: 'abandoned', reason: 'User corrects the disposition' });
  assert.deepEqual(abandoned.record.result, { summary: 'User corrects the disposition' });
  assert.equal(abandoned.record.resultHistory[0].result.summary, 'Delivered');
  const reopened = update({ status: 'active', reason: 'User resumes the work' });
  assert.equal(reopened.record.resultHistory.length, 2); assert.equal(reopened.record.result, null);
});

test('旧父计划尚未标记父身份时，也不能沿用完成状态更换目标', (t) => {
  const f = fixture(t); f.create('legacy'); f.complete('legacy');
  const opened = f.runtime.openWorkspaceStructuredStore(f.root, { writable: true });
  opened.database.prepare('UPDATE tasks SET legacy_parent_plan_json = ? WHERE task_id = ?').run(JSON.stringify({ outcome: 'Historical parent goal' }), 'legacy');
  opened.database.close();
  const before = f.inspect('legacy');
  assert.throws(() => f.runtime.updateTaskRecord(f.root, 'legacy', { expectedRecordDigest: before.recordDigest, intent: 'A new goal', reason: 'Correction' }), { code: 'task_record_completion_context_changed' });
  assert.equal(f.inspect('legacy').recordDigest, before.recordDigest);
});
