import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

function record(taskId, parentTaskId = null) {
  return {
    schemaVersion: 'buildr.task-record/v2',
    taskId,
    title: taskId,
    intent: 'Verify bounded Parent Coordination reads.',
    scope: { projects: [], services: [] },
    changes: [],
    parentTaskId,
    childTaskIds: [],
    retrospectiveSourceTaskIds: [],
    status: 'active',
    result: null,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

function fixture(t, childCount = 32) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-parent-coordination-query-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  runtime.createTaskRecordPersistence(root, record('parent-task'));
  for (let index = 0; index < childCount; index += 1) {
    runtime.createTaskRecordPersistence(root, record(`child-${String(index).padStart(2, '0')}`, 'parent-task'));
  }
  return { root: fs.realpathSync(root), runtime };
}

test('Parent Coordination读取次数不随Child数量增长', (t) => {
  const { root, runtime } = fixture(t);
  const persistence = runtime.readParentCoordinationPersistence(root, 'parent-task');
  assert.equal(persistence.queryCount, 2);
  assert.equal(persistence.children.length, 32);
  assert.deepEqual(persistence.children.map((child) => child.task_id), Array.from({ length: 32 }, (_, index) => `child-${String(index).padStart(2, '0')}`));
  runtime.resolveTaskEnvironmentExecution = () => { throw new Error('read model不得执行Environment provider。'); };
  runtime.inspectTaskDevelopment = () => { throw new Error('read model不得逐Child调用Development Application。'); };
  runtime.inspectTaskTerminalDelivery = () => { throw new Error('read model不得逐Child调用Terminal Delivery Application。'); };
  const inspected = runtime.inspectParentCoordination(root, 'parent-task');
  assert.equal(inspected.mode, 'legacy');
  assert.equal(inspected.children.length, 32);
});

test('Parent Coordination缺失Task时返回稳定not-found且不写数据库', (t) => {
  const { root, runtime } = fixture(t, 0);
  const file = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.statSync(file).mtimeMs;
  assert.throws(() => runtime.readParentCoordinationPersistence(root, 'missing-task'), (error) => error.code === 'task_record_not_found' && error.status === 404);
  assert.equal(fs.statSync(file).mtimeMs, before);
});
