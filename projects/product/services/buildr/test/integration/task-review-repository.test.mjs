import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-review-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v1', taskId: 'demo-task', title: 'Demo', intent: 'Verify Review SQLite authority',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  });
  return { root: fs.realpathSync(root), runtime };
}

function input(reviewType = 'planning', overrides = {}) {
  return { reviewType, targetIdentity: `${reviewType}:identity-1`, method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: `${reviewType} ready` }, ...overrides };
}

function stored(runtime, root, reviewType) {
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  try { return opened.database.prepare("SELECT result_json FROM task_review_current WHERE task_id = 'demo-task' AND review_type = ?").get(reviewType)?.result_json ?? null; }
  finally { opened.database.close(); }
}

test('Planning和Completion维护独立SQLite current slots并派生applicability', (t) => {
  const { root, runtime } = fixture(t);
  const legacyPlanning = path.join(root, '.buildr', 'tasks', 'demo-task', 'reviews', 'planning.yml');
  const legacyCompletion = path.join(root, '.buildr', 'tasks', 'demo-task', 'reviews', 'completion.yml');
  fs.mkdirSync(path.dirname(legacyPlanning), { recursive: true });
  fs.writeFileSync(legacyPlanning, 'legacy: planning\n');
  fs.writeFileSync(legacyCompletion, 'legacy: completion\n');
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.present, false);

  const planning = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  assert.equal(planning.slots.planning.path, 'workspace-sqlite:task-review/demo-task/planning');
  assert.equal(planning.slots.planning.applicability, 'current');
  const planningValue = stored(runtime, root, 'planning');
  assert.doesNotMatch(planningValue, /resultDigest|revision|applicability/);

  const completion = runtime.recordTaskReview(root, 'demo-task', input('completion'));
  assert.equal(stored(runtime, root, 'planning'), planningValue);
  assert.equal(completion.slots.planning.applicability, 'unknown');
  assert.equal(completion.slots.completion.applicability, 'current');
  const inspected = runtime.inspectTaskReview(root, 'demo-task', { planningTargetIdentity: 'changed', completionTargetIdentity: 'completion:identity-1' });
  assert.equal(inspected.slots.planning.applicability, 'stale');
  assert.equal(inspected.slots.completion.applicability, 'current');
  assert.equal(fs.readFileSync(legacyPlanning, 'utf8'), 'legacy: planning\n');
  assert.equal(fs.readFileSync(legacyCompletion, 'utf8'), 'legacy: completion\n');
});

test('一个Review mutation失败不破坏自身last-valid或另一个Review', (t) => {
  const { root, runtime } = fixture(t);
  runtime.recordTaskReview(root, 'demo-task', input('planning'));
  runtime.recordTaskReview(root, 'demo-task', input('completion'));
  const planning = stored(runtime, root, 'planning');
  const completion = stored(runtime, root, 'completion');

  runtime.taskReviewSerialize = () => { throw new Error('serialization failure'); };
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'planning:new' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'serialization');
  runtime.taskReviewSerialize = null;

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_planning_update BEFORE UPDATE ON task_review_current WHEN OLD.review_type = 'planning' BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'planning:new' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'mutation' && error.details.rollback.status === 'restored');
  assert.equal(stored(runtime, root, 'planning'), planning);
  assert.equal(stored(runtime, root, 'completion'), completion);
});

test('损坏current与terminal Task均fail closed，terminal仍可读取既有Result', (t) => {
  const { root, runtime } = fixture(t);
  runtime.recordTaskReview(root, 'demo-task', input('planning'));
  let opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.prepare("UPDATE task_review_current SET result_json = '{\"schemaVersion\":\"invalid\"}' WHERE task_id = 'demo-task' AND review_type = 'planning'").run();
  opened.database.close();
  assert.throws(() => runtime.inspectTaskReview(root, 'demo-task'), (error) => error.code === 'task_review_result_invalid');
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'planning:new' })), (error) => error.code === 'task_review_result_invalid');

  opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.prepare("UPDATE task_review_current SET result_json = ?, target_identity = 'planning:identity-1', outcome = 'ready', updated_at = '2026-08-02T00:00:01.000Z' WHERE task_id = 'demo-task' AND review_type = 'planning'").run(JSON.stringify({ schemaVersion: 'buildr.task-review-result/v1', taskId: 'demo-task', reviewType: 'planning', targetIdentity: 'planning:identity-1', method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'ready' }, completedAt: '2026-08-02T00:00:01.000Z' }));
  opened.database.close();
  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, { ...task.record, status: 'completed', result: { summary: 'done', noChange: false }, updatedAt: '2026-08-02T00:00:02.000Z' });
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.present, true);
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning')), (error) => error.code === 'task_review_task_terminal');
});
