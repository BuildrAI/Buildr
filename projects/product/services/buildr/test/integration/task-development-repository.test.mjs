import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerTaskDevelopmentRepository } from '../../src/infrastructure/filesystem/task-development-repository.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-repository-'));
  const directory = path.join(root, '.buildr', 'tasks', 'demo-task');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'task.yml'), 'sibling: preserved\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = {
    assertCanonicalTaskWorkspace: () => root,
    taskRecordDirectory: (_target, taskId) => path.join(root, '.buildr', 'tasks', taskId),
  };
  registerTaskDevelopmentRepository(runtime);
  return { root, directory, runtime };
}

function receipt() {
  const taskContextPayload = { taskId: 'demo-task', intent: 'Portable docs', scope: { projects: ['docs'], services: [] }, changes: [] };
  const taskContext = { identity: taskDevelopmentDigest(taskContextPayload), ...taskContextPayload };
  const components = [{ selector: 'project:docs', kind: 'project', sourcePath: 'projects/docs', observer: 'fixture.filesystem/v1', identity: taskDevelopmentDigest('content') }];
  return {
    schemaVersion: 'buildr.task-development-receipt/v2',
    taskId: 'demo-task',
    environment: { taskId: 'demo-task', receiptSchema: 'buildr.task-environment-receipt/v2' },
    taskContext,
    planning: { identity: taskDevelopmentDigest({ targetIdentity: null, nodes: [] }), targetIdentity: null, nodes: [] },
    contentTarget: { identity: taskDevelopmentDigest({ components }), components },
    verificationPolicy: null,
    generation: 0,
    candidate: null,
    gates: { planning: null, verification: null, completion: null },
    decision: null,
    handoffs: [],
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
}

test('repository只读迁移v1 Receipt并在下一次写入保存v2', (t) => {
  const { root, directory, runtime } = fixture(t);
  const legacy = receipt();
  delete legacy.planning;
  legacy.schemaVersion = 'buildr.task-development-receipt/v1';
  fs.writeFileSync(path.join(directory, 'development.yml'), runtime.renderTaskDevelopmentReceipt({ ...receipt() }).replace('buildr.task-development-receipt/v2', 'buildr.task-development-receipt/v1').replace(/planning:\n(?:  .*\n)+?contentTarget:/, 'contentTarget:'));
  const before = fs.readFileSync(path.join(directory, 'development.yml'), 'utf8');
  const migrated = runtime.readTaskDevelopmentPersistence(root, 'demo-task', { optional: false });
  assert.equal(migrated.receipt.schemaVersion, 'buildr.task-development-receipt/v2');
  assert.equal(fs.readFileSync(path.join(directory, 'development.yml'), 'utf8'), before);
  runtime.writeTaskDevelopmentPersistence(root, migrated.receipt);
  assert.match(fs.readFileSync(path.join(directory, 'development.yml'), 'utf8'), /buildr\.task-development-receipt\/v2/);
});

function io(overrides = {}) {
  return {
    existsSync: fs.existsSync,
    lstatSync: fs.lstatSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
    ...overrides,
  };
}

test('repository 以 atomic replace 写入 closed Receipt，且不触碰 sibling records', (t) => {
  const { root, directory, runtime } = fixture(t);
  const written = runtime.writeTaskDevelopmentPersistence(root, receipt());
  assert.equal(written.created, true);
  assert.match(written.receiptDigest, /^sha256-/);
  assert.equal(runtime.readTaskDevelopmentPersistence(root, 'demo-task', { optional: false }).receipt.taskId, 'demo-task');
  assert.equal(fs.readFileSync(path.join(directory, 'task.yml'), 'utf8'), 'sibling: preserved\n');
  assert.equal(fs.readdirSync(directory).some((name) => name.includes('.buildr-tmp-')), false);
});

test('serialization、temporary write 与 post-read failure 均保留原 current', (t) => {
  const { root, directory, runtime } = fixture(t);
  runtime.writeTaskDevelopmentPersistence(root, receipt());
  const file = path.join(directory, 'development.yml');
  const original = fs.readFileSync(file);

  runtime.taskDevelopmentSerialize = () => { throw new Error('serialization failed'); };
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, { ...receipt(), updatedAt: '2026-08-04T00:01:00.000Z' }), (error) => error.code === 'task_development_write_failed' && error.details.stage === 'serialization');
  runtime.taskDevelopmentSerialize = null;

  runtime.taskDevelopmentIo = io({
    writeFileSync(target, ...args) {
      if (String(target).includes('.development.yml.buildr-tmp-')) throw new Error('temporary write failed');
      return fs.writeFileSync(target, ...args);
    },
  });
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, { ...receipt(), updatedAt: '2026-08-04T00:02:00.000Z' }), (error) => error.code === 'task_development_write_failed' && error.details.stage === 'temporary-write');

  let replaced = false;
  let postReadFailed = false;
  runtime.taskDevelopmentIo = io({
    renameSync(source, destination) {
      const result = fs.renameSync(source, destination);
      if (destination === file && String(source).includes('.development.yml.buildr-tmp-')) replaced = true;
      return result;
    },
    readFileSync(target, ...args) {
      if (replaced && !postReadFailed && target === file && args[0] === 'utf8') {
        postReadFailed = true;
        throw new Error('post-read failed');
      }
      return fs.readFileSync(target, ...args);
    },
  });
  assert.throws(() => runtime.writeTaskDevelopmentPersistence(root, { ...receipt(), updatedAt: '2026-08-04T00:03:00.000Z' }), (error) => error.code === 'task_development_write_failed' && error.details.stage === 'post-read' && error.details.rollback.status === 'restored');
  runtime.taskDevelopmentIo = null;
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(fs.readFileSync(path.join(directory, 'task.yml'), 'utf8'), 'sibling: preserved\n');
});
