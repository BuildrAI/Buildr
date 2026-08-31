import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

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
  assert.equal(f.runtime.inspectTaskEntrySnapshot(f.root, 'parent').next.action, 'coordinate');
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

test('retired writers perform no writes and corrupt historical records do not hide current results', (t) => {
  const f = fixture(t); f.create('parent', { isParent: true });
  const before = f.inspect('parent').recordDigest;
  for (const action of ['recordParentPlan', 'refreshParentPlanning', 'acceptParentCoordination', 'recordTaskParentPlan', 'bindTaskPlannedContributions', 'reconcileTerminalChildContributionDelivery', 'recordTaskParentAcceptance']) {
    assert.throws(() => f.runtime[action](f.root, 'parent', {}), { code: 'parent_coordination_action_retired' });
  }
  assert.throws(() => f.runtime.createTaskDevelopmentHandoff(f.root, 'parent', { contributionHandoff: { retired: true } }), { code: 'parent_coordination_action_retired' });
  assert.equal(f.inspect('parent').recordDigest, before);
  const opened = f.runtime.openWorkspaceStructuredStore(f.root, { writable: true });
  opened.database.prepare("INSERT INTO task_development_current(task_id, record_json) VALUES (?, ?)").run('parent', 'null');
  opened.database.close();
  const view = f.runtime.inspectParentCoordination(f.root, 'parent');
  assert.equal(view.isParent, true); assert.equal(view.diagnostic.code, 'parent_history_unreadable');
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
  const historical = JSON.stringify({ parentPlan: { outcome: 'Original goal with no separate modern role' } });
  opened.database.prepare('INSERT INTO task_development_current(task_id, record_json) VALUES (?, ?)').run('legacy-parent', historical);
  opened.database.close();
  const view = f.runtime.inspectParentCoordination(f.root, 'legacy-parent');
  assert.equal(view.isParent, true);
  assert.throws(() => f.complete('legacy-parent'), { code: 'parent_completion_authorization_required' });
  const after = f.runtime.openWorkspaceStructuredStore(f.root, { writable: false });
  assert.equal(after.database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get('legacy-parent').record_json, historical);
  after.database.close();
});
