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

test('CLI 和 Application 覆盖六个动作、0/1/N Change、跨 Project 同名与四态结果', (t) => {
  const { root } = fixture(t, 'task-lifecycle');
  const runtime = createRuntime();
  const empty = runtime.createTaskRecord(root, { taskId: 'empty-task', title: '空引用', intent: '允许没有 Change', projects: [], services: [], changes: [] });
  assert.equal(empty.schemaVersion, 'buildr.task-record-result/v4'); assert.deepEqual(empty.record.changes, []); assert.equal(empty.status, 'created'); assert.deepEqual(empty.nextActions, []); assert.equal('path' in empty, false);

  const created = json(['task', 'create', 'multi-task', '--title', '多范围任务', '--intent', '验证限定引用', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/same-change', '--change', 'demo/second-change', '--change', 'other/same-change', '--target', root]);
  assert.equal(created.record.changes.length, 3); assert.match(created.recordDigest, /^sha256-/); assert.deepEqual(created.effects, [{ type: 'created', taskId: 'multi-task' }]); assert.equal('path' in created, false);
  const inspected = json(['task', 'inspect', 'multi-task', '--target', root]); assert.equal(inspected.recordDigest, created.recordDigest); assert.deepEqual(inspected.effects, []); assert.equal('path' in inspected, false);

  const updated = runtime.updateTaskRecord(root, 'multi-task', { title: '更新标题', removeChanges: ['demo/second-change'], addProjects: ['other'] });
  assert.equal(updated.status, 'updated'); assert.equal(updated.record.title, '更新标题'); assert.deepEqual(updated.record.scope.projects, ['demo', 'other']); assert.equal(updated.record.changes.length, 2);
  assert.equal(runtime.createTaskRecord(root, { taskId: 'peer-task', title: '共享 Change', intent: '不扫描其他 Task ownership', projects: [], services: [], changes: ['demo/same-change'] }).status, 'created');

  const completed = json(['task', 'complete', 'empty-task', '--summary', '确认无需修改', '--no-change', '--target', root]);
  assert.deepEqual(completed.record.result, { summary: '确认无需修改', noChange: true });
  assert.match(completed.nextActions[0], /是否进行任务复盘.*Token 数据仅在 Agent 可取得时记录.*缺失不影响复盘/);
  const abandoned = runtime.createTaskRecord(root, { taskId: 'abandoned-task', title: '取消任务', intent: '验证放弃', projects: [], services: [], changes: [] });
  assert.equal(abandoned.status, 'created');
  const ended = runtime.abandonTaskRecord(root, 'abandoned-task', { reason: '目标取消' }); assert.deepEqual(ended.record.result, { summary: '目标取消' }); assert.deepEqual(ended.nextActions, completed.nextActions);
  runtime.createTaskRecord(root, { taskId: 'human-output-task', title: '人类输出', intent: '验证终态提示', projects: [], services: [], changes: [] });
  const human = run(['task', 'complete', 'human-output-task', '--summary', '完成', '--no-change', '--target', root]);
  assert.match(human.stdout, /Task human-output-task completed[\s\S]*Next: 是否进行任务复盘/);
  const terminal = json(['task', 'update', 'abandoned-task', '--title', '不可重开', '--target', root], 1); assert.equal(terminal.status, 'blocked'); assert.equal(terminal.diagnostic.code, 'task_record_terminal'); assert.deepEqual(terminal.effects, []);
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'multi-task', title: '重复', intent: '不得覆盖', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_already_exists');
  const syntax = json(['task', 'create', 'missing-title', '--intent', '语法错误', '--target', root], 2); assert.equal(syntax.schemaVersion, 'buildr.cli-error/v1'); assert.equal(syntax.error.code, 'task_record_cli.syntax');
});

test('Formal Finish 通过 Task Record Application 幂等完成 active Task，并拒绝冲突终态', (t) => {
  const { root } = fixture(t, 'task-finish-completion');
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'finish-task', title: '正常交付', intent: '验证 Finish 终态', projects: [], services: [], changes: [] });

  const completed = runtime.completeTaskRecordFromFinish(root, 'finish-task');
  assert.equal(completed.operation, 'complete');
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.record.result, { summary: '任务贡献已验证交付。', noChange: false });
  assert.deepEqual(completed.effects, [{ type: 'updated', taskId: 'finish-task' }]);
  assert.match(completed.nextActions[0], /任务复盘/);

  const repeated = runtime.completeTaskRecordFromFinish(root, 'finish-task');
  assert.equal(repeated.status, 'completed');
  assert.deepEqual(repeated.effects, []);
  assert.deepEqual(repeated.record, completed.record);
  assert.equal(repeated.recordDigest, completed.recordDigest);

  runtime.createTaskRecord(root, { taskId: 'no-change-task', title: '无需交付', intent: '验证 noChange 冲突', projects: [], services: [], changes: [] });
  const noChange = runtime.completeTaskRecord(root, 'no-change-task', { summary: '无需修改', noChange: true });
  assert.throws(() => runtime.completeTaskRecordFromFinish(root, 'no-change-task'), (error) => error.code === 'task_record_finish_terminal_conflict');
  assert.equal(runtime.inspectTaskRecord(root, 'no-change-task').recordDigest, noChange.recordDigest);

  runtime.createTaskRecord(root, { taskId: 'abandoned-finish-task', title: '已放弃', intent: '验证 abandon 冲突', projects: [], services: [], changes: [] });
  const abandoned = runtime.abandonTaskRecord(root, 'abandoned-finish-task', { reason: '不再交付' });
  assert.throws(() => runtime.completeTaskRecordFromFinish(root, 'abandoned-finish-task'), (error) => error.code === 'task_record_finish_terminal_conflict');
  assert.equal(runtime.inspectTaskRecord(root, 'abandoned-finish-task').recordDigest, abandoned.recordDigest);
});

test('todo 只保存意向与复盘信源，支持多对多关联、open 查询与显式激活', (t) => {
  const { root } = fixture(t, 'task-todo-retrospective-sources');
  const runtime = createRuntime();
  for (const sourceTaskId of ['source-one', 'source-two']) {
    runtime.createTaskRecord(root, { taskId: sourceTaskId, title: sourceTaskId, intent: '形成复盘信源', projects: [], services: [], changes: [] });
    runtime.completeTaskRecord(root, sourceTaskId, { summary: '已结束', noChange: true });
    runtime.recordTaskRetrospective(root, sourceTaskId, { reportMarkdown: `# ${sourceTaskId}\n\n当时的原始复盘。` });
  }

  const todo = json(['task', 'create', 'todo-followup', '--title', '待办改进', '--intent', '仅记录已接受意向', '--status', 'todo', '--retrospective-source', 'source-one', '--retrospective-source', 'source-two', '--target', root]);
  assert.equal(todo.record.status, 'todo');
  assert.deepEqual(todo.record.changes, []);
  assert.deepEqual(todo.record.retrospectiveSourceTaskIds, ['source-one', 'source-two']);
  assert.deepEqual(todo.retrospectiveRelations.sources.map((item) => item.taskId), ['source-one', 'source-two']);
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'open' }).tasks.map((item) => item.record.taskId), ['todo-followup']);
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'todo' }).tasks.map((item) => item.record.taskId), ['todo-followup']);
  assert.throws(() => runtime.updateTaskRecord(root, 'todo-followup', { addChanges: ['demo/same-change'] }), (error) => error.code === 'task_record_todo_change_forbidden');
  assert.throws(() => runtime.completeTaskRecord(root, 'todo-followup', { summary: '存在交付', noChange: false }), (error) => error.code === 'task_record_todo_completion_requires_no_change');

  runtime.createTaskRecord(root, { taskId: 'active-followup', title: '已激活改进', intent: '复用同一复盘信源', retrospectiveSourceTaskIds: ['source-one'], projects: [], services: [], changes: [] });
  assert.deepEqual(runtime.inspectTaskRetrospective(root, 'source-one').followupTasks.map((item) => item.taskId), ['active-followup', 'todo-followup']);
  assert.deepEqual(runtime.inspectTaskRetrospective(root, 'source-two').followupTasks.map((item) => item.taskId), ['todo-followup']);

  const activated = json(['task', 'activate', 'todo-followup', '--target', root]);
  assert.equal(activated.status, 'activated');
  assert.equal(activated.record.status, 'active');
  assert.deepEqual(activated.record.retrospectiveSourceTaskIds, ['source-one', 'source-two']);
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'open' }).tasks.map((item) => item.record.taskId).sort(), ['active-followup', 'todo-followup']);

  runtime.createTaskRecord(root, { taskId: 'no-retrospective-source', title: '无复盘来源', intent: '校验拒绝', projects: [], services: [], changes: [] });
  runtime.completeTaskRecord(root, 'no-retrospective-source', { summary: '结束', noChange: true });
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'invalid-followup', title: '非法来源', intent: '缺少 current 复盘', status: 'todo', retrospectiveSourceTaskIds: ['no-retrospective-source'], projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_retrospective_source_missing');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'active-source-followup', title: '非终态来源', intent: '来源必须结束', status: 'todo', retrospectiveSourceTaskIds: ['active-followup'], projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_retrospective_source_not_terminal');
});

test('Parent Task 支持直接层级、重挂与清除，并拒绝自引用、循环和 terminal 新关系', (t) => {
  const { root } = fixture(t, 'task-parent');
  const runtime = createRuntime();
  const parent = json(['task', 'create', 'parent-task', '--title', '协调任务', '--intent', '管理直接子任务', '--target', root]);
  const child = json(['task', 'create', 'child-task', '--title', '子任务', '--intent', '被协调', '--parent', 'parent-task', '--target', root]);
  assert.equal(child.record.parentTaskId, 'parent-task');
  assert.deepEqual(child.taskRelations.parent, { taskId: 'parent-task', title: '协调任务', status: 'active' });
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').record.childTaskIds, ['child-task']);
  assert.notEqual(runtime.inspectTaskRecord(root, 'parent-task').recordDigest, parent.recordDigest, '反向 Children 变化必须改变 Parent read model digest');
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').taskRelations.children, [{ taskId: 'child-task', title: '子任务', status: 'active' }]);

  runtime.createTaskRecord(root, { taskId: 'grandchild-task', title: '孙任务', intent: '验证多层', parentTaskId: 'child-task', projects: [], services: [], changes: [] });
  assert.throws(() => runtime.updateTaskRecord(root, 'parent-task', { parentTaskId: 'grandchild-task' }), (error) => error.code === 'task_record_parent_cycle');
  assert.throws(() => runtime.updateTaskRecord(root, 'parent-task', { parentTaskId: 'parent-task' }), (error) => error.code === 'task_record_parent_self_reference');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'missing-parent-child', title: '非法子任务', intent: 'Parent 不存在', parentTaskId: 'missing-parent', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_parent_not_found');

  const replacement = runtime.createTaskRecord(root, { taskId: 'replacement-parent', title: '替代协调任务', intent: '验证重挂', projects: [], services: [], changes: [] });
  const reparented = json(['task', 'update', 'child-task', '--parent', 'replacement-parent', '--target', root]);
  assert.equal(reparented.record.parentTaskId, 'replacement-parent');
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').record.childTaskIds, []);
  assert.deepEqual(runtime.inspectTaskRecord(root, 'replacement-parent').record.childTaskIds, ['child-task']);
  const cleared = json(['task', 'update', 'child-task', '--clear-parent', '--target', root]);
  assert.equal(cleared.record.parentTaskId, null);
  const mutuallyExclusive = json(['task', 'update', 'child-task', '--parent', 'parent-task', '--clear-parent', '--target', root], 2);
  assert.equal(mutuallyExclusive.error.code, 'task_record_cli.syntax');

  const terminalParent = runtime.completeTaskRecord(root, 'replacement-parent', { summary: '协调结束', noChange: false });
  assert.equal(terminalParent.record.status, 'completed');
  assert.throws(() => runtime.updateTaskRecord(root, 'child-task', { parentTaskId: 'replacement-parent' }), (error) => error.code === 'task_record_parent_terminal');
  runtime.updateTaskRecord(root, 'child-task', { parentTaskId: 'parent-task' });
  runtime.completeTaskRecord(root, 'parent-task', { summary: 'Parent 独立完成', noChange: false });
  const stillRelated = runtime.inspectTaskRecord(root, 'child-task');
  assert.equal(stillRelated.record.parentTaskId, 'parent-task');
  assert.equal(stillRelated.taskRelations.parent.status, 'completed');
  runtime.updateTaskRecord(root, 'child-task', { title: '既有关系不阻塞普通更新' });
  runtime.completeTaskRecord(root, 'child-task', { summary: 'Child 独立完成', noChange: false });
  assert.throws(() => runtime.updateTaskRecord(root, 'child-task', { parentTaskId: null }), (error) => error.code === 'task_record_terminal');
  assert.match(replacement.recordDigest, /^sha256-/);
  assert.match(parent.recordDigest, /^sha256-/);
});

test('引用、closed input、旧 YAML、陈旧 digest 与 transaction 失败均保留最后有效记录', (t) => {
  const { root } = fixture(t, 'task-failures');
  const runtime = createRuntime();
  const legacyDirectory = path.join(root, '.buildr', 'tasks', 'safe-task');
  fs.mkdirSync(legacyDirectory, { recursive: true });
  const legacyFile = path.join(legacyDirectory, 'task.yml');
  fs.writeFileSync(legacyFile, 'schemaVersion: legacy\nrevision: 1\n');
  const created = runtime.createTaskRecord(root, { taskId: 'safe-task', title: '安全写入', intent: '验证失败边界', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const original = created.record;
  const legacyBytes = fs.readFileSync(legacyFile, 'utf8');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'unknown-fields', title: '非法', intent: '非法输入', projects: [], services: [], changes: [], worktree: '/tmp/example' }), (error) => error.code === 'task_record_field_forbidden');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-project', title: '非法引用', intent: '项目不存在', projects: ['missing'], services: [], changes: [] }), (error) => error.code === 'task_record_project_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-service', title: '非法引用', intent: '服务不存在', projects: [], services: ['demo/missing'], changes: [] }), (error) => error.code === 'task_record_service_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-change', title: '非法引用', intent: 'Change 不存在', projects: [], services: [], changes: ['demo/missing'] }), (error) => error.code === 'task_record_change_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'duplicate-change', title: '重复引用', intent: '当前记录去重', projects: [], services: [], changes: ['demo/same-change', 'demo/same-change'] }), (error) => error.code === 'task_record_reference_duplicate');

  const staleDigest = created.recordDigest;
  runtime.updateTaskRecord(root, 'safe-task', { intent: '由另一客户端更新' });
  const current = runtime.inspectTaskRecord(root, 'safe-task');
  const environmentFile = path.join(legacyDirectory, 'environment.json');
  fs.writeFileSync(environmentFile, '{"owner":"task-environment"}\n');
  const environmentBytes = fs.readFileSync(environmentFile, 'utf8');
  const reviewsDirectory = path.join(legacyDirectory, 'reviews');
  fs.mkdirSync(reviewsDirectory);
  const reviewSiblings = new Map([
    [path.join(reviewsDirectory, 'planning.yml'), 'slot: planning\n'],
    [path.join(reviewsDirectory, 'completion.yml'), 'slot: completion\n'],
  ]);
  for (const [file, content] of reviewSiblings) fs.writeFileSync(file, content);
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { expectedRecordDigest: staleDigest, title: '陈旧页面' }), (error) => error.code === 'task_record_conflict' && Boolean(error.details.currentRecordDigest));
  assert.equal(runtime.inspectTaskRecord(root, 'safe-task').recordDigest, current.recordDigest);

  let database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  database.exec("CREATE TRIGGER fail_safe_task BEFORE UPDATE ON tasks WHEN NEW.task_id = 'safe-task' BEGIN SELECT RAISE(ABORT, 'injected update failure'); END;");
  database.close();
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { title: '不应留下' }), (error) => error.code === 'task_record_database_failed');
  assert.equal(runtime.inspectTaskRecord(root, 'safe-task').recordDigest, current.recordDigest, 'failed transaction must preserve current logical record');
  assert.equal(fs.readFileSync(environmentFile, 'utf8'), environmentBytes, 'Task Record failure must not rewrite sibling professional files');
  for (const [file, content] of reviewSiblings) assert.equal(fs.readFileSync(file, 'utf8'), content, 'Task Record failure must preserve Task Review slots');
  assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacyBytes, 'legacy task.yml must remain inert and unchanged');

  database = runtime.openWorkspaceStructuredStore(root, { writable: true }).database;
  database.exec('DROP TRIGGER fail_safe_task; CREATE TRIGGER fail_create_task BEFORE INSERT ON tasks WHEN NEW.task_id = \'failed-create\' BEGIN SELECT RAISE(ABORT, \'injected create failure\'); END;');
  database.close();
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'failed-create', title: '失败创建', intent: '验证 transaction rollback', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_database_failed');
  assert.throws(() => runtime.inspectTaskRecord(root, 'failed-create'), (error) => error.code === 'task_record_not_found');

  const occupiedDirectory = path.join(root, '.buildr', 'tasks', 'occupied-task');
  fs.mkdirSync(occupiedDirectory, { recursive: true });
  const reviewFile = path.join(occupiedDirectory, 'review.yml');
  fs.writeFileSync(reviewFile, 'owner: user-defined-sibling\n');
  assert.equal(runtime.createTaskRecord(root, { taskId: 'occupied-task', title: '独立 authority', intent: '保留未知 sibling', projects: [], services: [], changes: [] }).status, 'created');
  assert.equal(fs.readFileSync(reviewFile, 'utf8'), 'owner: user-defined-sibling\n');

  fs.appendFileSync(legacyFile, 'unknown: still-ignored\n');
  const inspected = json(['task', 'inspect', 'safe-task', '--target', root]); assert.equal(inspected.status, 'inspected'); assert.equal(inspected.record.intent, '由另一客户端更新');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'safe-task', title: '不得覆盖', intent: 'SQLite duplicate', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_already_exists');
  const list = runtime.listTaskRecords(root); assert.equal(list.tasks.some((item) => item.record.taskId === 'safe-task'), true); assert.deepEqual(list.diagnostics, []);
  assert.notDeepEqual(original, current.record);
});
