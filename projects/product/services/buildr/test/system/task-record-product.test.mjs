import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import {
  runBuildr as run,
  runBuildrJson as json,
  taskRecordFixture as fixture,
} from '../helpers/task-record-system-fixture.mjs';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('CLI 和 Application 覆盖五个动作、0/1/N Change、跨 Project 同名与三态结果', (t) => {
  const { root } = fixture(t, 'task-lifecycle');
  const runtime = createRuntime();
  const empty = runtime.createTaskRecord(root, { taskId: 'empty-task', title: '空引用', intent: '允许没有 Change', projects: [], services: [], changes: [] });
  assert.equal(empty.schemaVersion, 'buildr.task-record-result/v1'); assert.deepEqual(empty.record.changes, []); assert.equal(empty.status, 'created');

  const created = json(['task', 'create', 'multi-task', '--title', '多范围任务', '--intent', '验证限定引用', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/same-change', '--change', 'demo/second-change', '--change', 'other/same-change', '--target', root]);
  assert.equal(created.record.changes.length, 3); assert.match(created.recordDigest, /^sha256-/); assert.equal(created.effects[0].path, '.buildr/tasks/multi-task/task.yml');
  const bytes = fs.readFileSync(created.path, 'utf8'); assert.doesNotMatch(bytes, /recordDigest|revision|workspaceId|worktree|environment/);
  const inspected = json(['task', 'inspect', 'multi-task', '--target', root]); assert.equal(inspected.recordDigest, created.recordDigest); assert.deepEqual(inspected.effects, []); assert.equal(fs.readFileSync(created.path, 'utf8'), bytes);

  const updated = runtime.updateTaskRecord(root, 'multi-task', { title: '更新标题', removeChanges: ['demo/second-change'], addProjects: ['other'] });
  assert.equal(updated.status, 'updated'); assert.equal(updated.record.title, '更新标题'); assert.deepEqual(updated.record.scope.projects, ['demo', 'other']); assert.equal(updated.record.changes.length, 2);
  assert.equal(runtime.createTaskRecord(root, { taskId: 'peer-task', title: '共享 Change', intent: '不扫描其他 Task ownership', projects: [], services: [], changes: ['demo/same-change'] }).status, 'created');

  const completed = json(['task', 'complete', 'empty-task', '--summary', '确认无需修改', '--no-change', '--target', root]);
  assert.deepEqual(completed.record.result, { summary: '确认无需修改', noChange: true });
  const abandoned = runtime.createTaskRecord(root, { taskId: 'abandoned-task', title: '取消任务', intent: '验证放弃', projects: [], services: [], changes: [] });
  assert.equal(abandoned.status, 'created');
  const ended = runtime.abandonTaskRecord(root, 'abandoned-task', { reason: '目标取消' }); assert.deepEqual(ended.record.result, { summary: '目标取消' });
  const terminal = json(['task', 'update', 'abandoned-task', '--title', '不可重开', '--target', root], 1); assert.equal(terminal.status, 'blocked'); assert.equal(terminal.diagnostic.code, 'task_record_terminal'); assert.deepEqual(terminal.effects, []);
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'multi-task', title: '重复', intent: '不得覆盖', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_already_exists');
  const syntax = json(['task', 'create', 'missing-title', '--intent', '语法错误', '--target', root], 2); assert.equal(syntax.schemaVersion, 'buildr.cli-error/v1'); assert.equal(syntax.error.code, 'task_record_cli.syntax');
});

test('引用、closed input、损坏 YAML、陈旧 digest 与原子替换失败均保留最后有效 bytes', (t) => {
  const { root } = fixture(t, 'task-failures');
  const runtime = createRuntime();
  const created = runtime.createTaskRecord(root, { taskId: 'safe-task', title: '安全写入', intent: '验证失败边界', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const original = fs.readFileSync(created.path, 'utf8');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'unknown-fields', title: '非法', intent: '非法输入', projects: [], services: [], changes: [], worktree: '/tmp/example' }), (error) => error.code === 'task_record_field_forbidden');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-project', title: '非法引用', intent: '项目不存在', projects: ['missing'], services: [], changes: [] }), (error) => error.code === 'task_record_project_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-service', title: '非法引用', intent: '服务不存在', projects: [], services: ['demo/missing'], changes: [] }), (error) => error.code === 'task_record_service_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-change', title: '非法引用', intent: 'Change 不存在', projects: [], services: [], changes: ['demo/missing'] }), (error) => error.code === 'task_record_change_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'duplicate-change', title: '重复引用', intent: '当前记录去重', projects: [], services: [], changes: ['demo/same-change', 'demo/same-change'] }), (error) => error.code === 'task_record_reference_duplicate');

  const staleDigest = created.recordDigest;
  runtime.updateTaskRecord(root, 'safe-task', { intent: '由另一客户端更新' });
  const currentBytes = fs.readFileSync(created.path, 'utf8');
  const environmentFile = path.join(path.dirname(created.path), 'environment.json');
  fs.writeFileSync(environmentFile, '{"owner":"task-environment"}\n');
  const environmentBytes = fs.readFileSync(environmentFile, 'utf8');
  const reviewsDirectory = path.join(path.dirname(created.path), 'reviews');
  fs.mkdirSync(reviewsDirectory);
  const reviewSiblings = new Map([
    [path.join(reviewsDirectory, 'planning.yml'), 'slot: planning\n'],
    [path.join(reviewsDirectory, 'completion.yml'), 'slot: completion\n'],
  ]);
  for (const [file, content] of reviewSiblings) fs.writeFileSync(file, content);
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { expectedRecordDigest: staleDigest, title: '陈旧页面' }), (error) => error.code === 'task_record_conflict' && Boolean(error.details.currentRecordDigest));
  assert.equal(fs.readFileSync(created.path, 'utf8'), currentBytes);

  const originalAtomicWrite = runtime.atomicWriteFile;
  runtime.atomicWriteFile = (file, content, encoding) => { if (file === created.path) throw new Error('injected replace failure'); return originalAtomicWrite(file, content, encoding); };
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { title: '不应留下' }), (error) => error.code === 'task_record_write_failed');
  runtime.atomicWriteFile = originalAtomicWrite;
  assert.equal(fs.readFileSync(created.path, 'utf8'), currentBytes, 'failed exact-file replacement must preserve original bytes');
  assert.equal(fs.readFileSync(environmentFile, 'utf8'), environmentBytes, 'Task Record failure must not rewrite sibling professional files');
  for (const [file, content] of reviewSiblings) assert.equal(fs.readFileSync(file, 'utf8'), content, 'Task Record failure must preserve Task Review slots');

  const failedCreateDirectory = path.join(root, '.buildr', 'tasks', 'failed-create');
  runtime.atomicWriteFile = (file, content, encoding) => { if (file === path.join(failedCreateDirectory, 'task.yml')) throw new Error('injected create failure'); return originalAtomicWrite(file, content, encoding); };
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'failed-create', title: '失败创建', intent: '验证精确目录清理', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_write_failed');
  runtime.atomicWriteFile = originalAtomicWrite;
  assert.equal(fs.existsSync(failedCreateDirectory), false, 'failed create may only remove the empty directory created by that call');

  const occupiedDirectory = path.join(root, '.buildr', 'tasks', 'occupied-task');
  fs.mkdirSync(occupiedDirectory);
  const reviewFile = path.join(occupiedDirectory, 'review.yml');
  fs.writeFileSync(reviewFile, 'owner: user-defined-sibling\n');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'occupied-task', title: '不得覆盖', intent: '保留未知 sibling', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_path_occupied');
  assert.equal(fs.readFileSync(reviewFile, 'utf8'), 'owner: user-defined-sibling\n');

  fs.appendFileSync(created.path, 'revision: 1\n');
  const broken = json(['task', 'inspect', 'safe-task', '--target', root], 1); assert.equal(broken.diagnostic.code, 'task_record_invalid'); assert.equal(broken.record, null);
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'safe-task', title: '不得覆盖损坏记录', intent: '区分有效重复与损坏记录', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_invalid');
  const list = runtime.listTaskRecords(root); assert.equal(list.tasks.length, 0); assert.equal(list.diagnostics.some((item) => item.taskId === 'safe-task' && item.code === 'task_record_invalid'), true);
  assert.notEqual(original, currentBytes);
});
