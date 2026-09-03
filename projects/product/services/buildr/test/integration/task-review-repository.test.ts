// @ts-nocheck -- Behavioral suite migrated with its repository.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('integration-task-review-repository');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-review-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v3', taskId: 'demo-task', title: 'Demo', intent: 'Verify Review SQLite authority',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, retrospective: null, status: 'active', result: null,
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  });
  return { root: fs.realpathSync(root), runtime };
}

function input(reviewType = 'planning', expectedCurrentDigest = 'absent', overrides = {}) {
  return { reviewType, subjectIdentity: `${reviewType}:identity-1`, method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: `${reviewType} accepted` }, expectedCurrentDigest, ...overrides };
}

function stored(runtime, root, reviewType) {
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  try { return opened.database.prepare("SELECT result_json FROM task_review_current WHERE task_id = 'demo-task' AND review_type = ?").get(reviewType)?.result_json ?? null; }
  finally { opened.database.close(); }
}

test('Planning和Completion维护独立SQLite current slots且inspect不判断适用性', (t) => {
  const { root, runtime } = fixture(t);
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.present, false);
  const planning = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  assert.equal(planning.slots.planning.path, 'workspace-sqlite:task-review/demo-task/planning');
  assert.equal(planning.slots.planning.result.subjectIdentity, 'planning:identity-1');
  assert.equal('applicability' in planning.slots.planning, false);
  const planningValue = stored(runtime, root, 'planning');
  assert.doesNotMatch(planningValue, /resultDigest|revision|applicability|targetIdentity/);
  const completion = runtime.recordTaskReview(root, 'demo-task', input('completion'));
  assert.equal(stored(runtime, root, 'planning'), planningValue);
  assert.equal(completion.slots.completion.result.conclusion.outcome, 'accepted');
});

test('CAS拒绝基于旧观察覆盖current且不破坏另一个槽位', (t) => {
  const { root, runtime } = fixture(t);
  const first = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  runtime.recordTaskReview(root, 'demo-task', input('completion'));
  const staleDigest = first.slots.planning.resultDigest;
  const second = runtime.recordTaskReview(root, 'demo-task', input('planning', staleDigest, { subjectIdentity: 'planning:identity-2' }));
  const secondDigest = second.slots.planning.resultDigest;
  const completion = stored(runtime, root, 'completion');
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', staleDigest, { subjectIdentity: 'planning:identity-3' })), (error) => error.code === 'task_review_current_conflict' && error.details.currentDigest === secondDigest);
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.result.subjectIdentity, 'planning:identity-2');
  assert.equal(stored(runtime, root, 'completion'), completion);
});

test('serialization或数据库mutation失败完整回滚', (t) => {
  const { root, runtime } = fixture(t);
  const current = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  const before = stored(runtime, root, 'planning');
  runtime.taskReviewSerialize = () => { throw new Error('serialization failure'); };
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', current.slots.planning.resultDigest)), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'serialization');
  runtime.taskReviewSerialize = null;
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_planning_update BEFORE UPDATE ON task_review_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', current.slots.planning.resultDigest)), (error) => error.code === 'task_review_write_failed' && error.details.rollback.status === 'restored');
  assert.equal(stored(runtime, root, 'planning'), before);
});

test('损坏current与terminal Task均fail closed，terminal仍可读取既有Result', (t) => {
  const { root, runtime } = fixture(t);
  runtime.recordTaskReview(root, 'demo-task', input('planning'));
  let opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.prepare("UPDATE task_review_current SET subject_identity = 'corrupt' WHERE task_id = 'demo-task' AND review_type = 'planning'").run();
  opened.database.close();
  assert.throws(() => runtime.inspectTaskReview(root, 'demo-task'), (error) => error.code === 'task_review_query_fields_inconsistent');
  opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.prepare("UPDATE task_review_current SET subject_identity = 'planning:identity-1' WHERE task_id = 'demo-task' AND review_type = 'planning'").run();
  opened.database.close();
  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, { ...task.record, status: 'completed', result: { summary: 'done' }, updatedAt: '2026-08-02T00:00:02.000Z' });
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.present, true);
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', runtime.inspectTaskReview(root, 'demo-task').slots.planning.resultDigest)), (error) => error.code === 'task_review_task_terminal');
});
