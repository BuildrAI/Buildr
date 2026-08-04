import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-review-repository-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'projects'));
  fs.mkdirSync(path.join(root, '.buildr', 'tasks', 'demo-task'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), [
    'schemaVersion: buildr.workspace/v1',
    'id: 11111111-1111-4111-8111-111111111111',
    'name: Fixture',
    'description: Fixture Workspace',
    'runtime:',
    '  node:',
    `    version: ${process.versions.node}`,
    'kind: organization',
    'profile: team',
    '',
  ].join('\n'));
  createRuntime().createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v1', taskId: 'demo-task', title: 'Demo', intent: 'Verify Task Review repository',
    scope: { projects: [], services: [] }, changes: [], status: 'active', result: null,
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  });
  return fs.realpathSync(root);
}

function input(reviewType = 'planning', overrides = {}) {
  return {
    reviewType,
    targetIdentity: `${reviewType}:identity-1`,
    method: 'self',
    reviewed: ['task intent'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'ready', summary: `${reviewType} ready` },
    ...overrides,
  };
}

function injectedIo(overrides = {}) {
  return {
    existsSync: fs.existsSync,
    lstatSync: fs.lstatSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    mkdirSync: fs.mkdirSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
    readdirSync: fs.readdirSync,
    rmdirSync: fs.rmdirSync,
    ...overrides,
  };
}

test('Repository/Application 维护两个可选槽位、派生 applicability 并仅返回 response digest', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const empty = runtime.inspectTaskReview(root, 'demo-task');
  assert.equal(empty.slots.planning.present, false);
  assert.equal(empty.slots.planning.applicability, null);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'demo-task', 'reviews')), false);

  const planning = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  assert.equal(planning.slots.planning.applicability, 'current');
  assert.equal(planning.slots.completion.present, false);
  assert.match(planning.slots.planning.resultDigest, /^sha256-/);
  const planningFile = planning.slots.planning.path;
  const planningBytes = fs.readFileSync(planningFile, 'utf8');
  assert.doesNotMatch(planningBytes, /resultDigest|revision|applicability|current:/);

  const completion = runtime.recordTaskReview(root, 'demo-task', input('completion'));
  assert.equal(fs.readFileSync(planningFile, 'utf8'), planningBytes, 'completion must not rewrite planning');
  assert.equal(completion.slots.planning.applicability, 'unknown');
  assert.equal(completion.slots.completion.applicability, 'current');

  const inspected = runtime.inspectTaskReview(root, 'demo-task', { planningTargetIdentity: 'plan:changed', completionTargetIdentity: 'completion:identity-1' });
  assert.equal(inspected.slots.planning.applicability, 'stale');
  assert.equal(inspected.slots.completion.applicability, 'current');
  assert.equal(inspected.slots.planning.resultDigest, planning.slots.planning.resultDigest);

  const replaced = runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:identity-2', findings: ['scope changed'] }));
  assert.notEqual(replaced.slots.planning.resultDigest, planning.slots.planning.resultDigest);
  assert.equal(fs.readFileSync(completion.slots.completion.path, 'utf8').includes('completion:identity-1'), true);
});

test('无完整结论、损坏 current 与 terminal Task 都不能覆盖 current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const recorded = runtime.recordTaskReview(root, 'demo-task', input());
  const file = recorded.slots.planning.path;
  const original = fs.readFileSync(file, 'utf8');
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { reviewed: [] })), (error) => error.code === 'task_review_field_invalid');
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  fs.appendFileSync(file, 'revision: 1\n');
  const invalid = fs.readFileSync(file, 'utf8');
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:new' })), (error) => error.code === 'task_review_result_invalid');
  assert.equal(fs.readFileSync(file, 'utf8'), invalid);
  fs.writeFileSync(file, original);

  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, {
    ...task.record,
    status: 'completed',
    result: { summary: 'done', noChange: false },
    updatedAt: '2026-08-02T01:00:00.000Z',
  });
  assert.equal(runtime.inspectTaskReview(root, 'demo-task').slots.planning.present, true);
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:terminal' })), (error) => error.code === 'task_review_task_terminal');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.throws(() => runtime.recordTaskReview(root, 'missing-task', input()), (error) => error.code === 'task_record_not_found');
});

test('临时写入、rename 与写后读取失败都保留原 slot 和 sibling bytes', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const planning = runtime.recordTaskReview(root, 'demo-task', input('planning'));
  const completion = runtime.recordTaskReview(root, 'demo-task', input('completion'));
  const original = fs.readFileSync(planning.slots.planning.path);
  const sibling = fs.readFileSync(completion.slots.completion.path);

  runtime.taskReviewSerialize = () => { throw new Error('injected serialization failure'); };
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:serialization-failure' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'serialization');
  runtime.taskReviewSerialize = null;
  assert.deepEqual(fs.readFileSync(planning.slots.planning.path), original);

  runtime.taskReviewIo = injectedIo({
    writeFileSync(file, ...args) {
      if (String(file).includes('.planning.yml.buildr-tmp-')) throw new Error('injected temporary write failure');
      return fs.writeFileSync(file, ...args);
    },
  });
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:write-failure' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'temporary-write');
  assert.deepEqual(fs.readFileSync(planning.slots.planning.path), original);

  runtime.taskReviewIo = injectedIo({
    renameSync(source, destination) {
      if (destination === planning.slots.planning.path && String(source).includes('.planning.yml.buildr-tmp-')) throw new Error('injected rename failure');
      return fs.renameSync(source, destination);
    },
  });
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:rename-failure' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'rename');
  assert.deepEqual(fs.readFileSync(planning.slots.planning.path), original);

  let replaced = false;
  let failedPostRead = false;
  runtime.taskReviewIo = injectedIo({
    renameSync(source, destination) {
      const value = fs.renameSync(source, destination);
      if (destination === planning.slots.planning.path && String(source).includes('.planning.yml.buildr-tmp-')) replaced = true;
      return value;
    },
    readFileSync(file, ...args) {
      if (replaced && !failedPostRead && file === planning.slots.planning.path && args[0] === 'utf8') {
        failedPostRead = true;
        throw new Error('injected post-read failure');
      }
      return fs.readFileSync(file, ...args);
    },
  });
  assert.throws(() => runtime.recordTaskReview(root, 'demo-task', input('planning', { targetIdentity: 'plan:post-read-failure' })), (error) => error.code === 'task_review_write_failed' && error.details.stage === 'post-read' && error.details.rollback.status === 'restored');
  runtime.taskReviewIo = null;
  assert.deepEqual(fs.readFileSync(planning.slots.planning.path), original);
  assert.deepEqual(fs.readFileSync(completion.slots.completion.path), sibling);
  assert.equal(fs.readdirSync(path.dirname(planning.slots.planning.path)).some((name) => name.includes('.buildr-tmp-')), false);
});
