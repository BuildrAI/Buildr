import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
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
  const terminal = json(['task', 'update', 'abandoned-task', '--title', '不可重开', '--target', root], 1); assert.equal(terminal.status, 'blocked'); assert.equal(terminal.diagnostic.code, 'task_record_digest_required'); assert.deepEqual(terminal.effects, []);
  runtime.createTaskRecord(root, { taskId: 'terminal-retro-source', title: '复盘来源', intent: '提供 current 复盘', projects: [], services: [], changes: [] });
  runtime.completeTaskRecord(root, 'terminal-retro-source', { summary: '来源已完成', noChange: true });
  runtime.recordTaskRetrospective(root, 'terminal-retro-source', { reportMarkdown: '# 复盘\n\n来源已形成。' });
  runtime.createTaskRecord(root, { taskId: 'terminal-followup', title: '终态承接', intent: '验证终态关系维护', projects: [], services: [], changes: [] });
  runtime.completeTaskRecord(root, 'terminal-followup', { summary: '承接已完成', noChange: true });
  const terminalSourceAdded = runtime.updateTaskRecord(root, 'terminal-followup', { addRetrospectiveSources: ['terminal-retro-source'] });
  assert.deepEqual(terminalSourceAdded.record.retrospectiveSourceTaskIds, ['terminal-retro-source']);
  assert.deepEqual(runtime.inspectTaskRetrospective(root, 'terminal-retro-source').followupTasks.map((item) => item.taskId), ['terminal-followup']);
  const terminalSourceRemoved = runtime.updateTaskRecord(root, 'terminal-followup', { removeRetrospectiveSources: ['terminal-retro-source'] });
  assert.deepEqual(terminalSourceRemoved.record.retrospectiveSourceTaskIds, []);
  assert.throws(() => runtime.updateTaskRecord(root, 'terminal-followup', { title: '仍不可改' }), (error) => error.code === 'task_record_digest_required');
  assert.throws(() => runtime.updateTaskRecord(root, 'terminal-followup', { title: '混合更新', addRetrospectiveSources: ['terminal-retro-source'] }), (error) => error.code === 'task_record_digest_required');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'multi-task', title: '重复', intent: '不得覆盖', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_already_exists');
  const syntax = json(['task', 'create', 'missing-title', '--intent', '语法错误', '--target', root], 2); assert.equal(syntax.schemaVersion, 'buildr.cli-error/v1'); assert.equal(syntax.error.code, 'task_record_cli.syntax');
});

test('任务完成只经既有 complete，旧收尾专用完成写入口退出', (t) => {
  const { root } = fixture(t, 'direct-completion');
  const runtime = createRuntime();
  assert.equal(runtime.completeTaskRecordFromFinish, undefined);
  runtime.createTaskRecord(root, { taskId: 'direct-task', title: '非 Git 成果', intent: '完成业务工作', projects: [], services: [], changes: [] });
  const completed = runtime.completeTaskRecord(root, 'direct-task', { summary: '业务成果已到位，实际业务结果已核对。', noChange: false });
  assert.equal(completed.record.status, 'completed');
  assert.equal(completed.record.result.noChange, false);
  assert.equal(runtime.inspectTaskTerminalDelivery(root, 'direct-task').status, 'completed');
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

  const parentEvidence = (id) => ({ expectedRecordDigest: runtime.inspectTaskRecord(root, id).recordDigest, parentCompletion: {
    expectedSnapshot: runtime.inspectParentCoordination(root, id).completion.snapshotIdentity,
    acceptance: { summary: '测试整体目标已核对', children: runtime.inspectParentCoordination(root, id).children.map((child) => ({ taskId: child.taskId, summary: '测试成果已处置' })) },
    authorization: { source: 'test:explicit-user-authorization', statement: `明确完成 ${id}` },
  } });
  const terminalParent = runtime.completeTaskRecord(root, 'replacement-parent', { summary: '协调结束', noChange: false, ...parentEvidence('replacement-parent') });
  assert.equal(terminalParent.record.status, 'completed');
  assert.throws(() => runtime.updateTaskRecord(root, 'child-task', { parentTaskId: 'replacement-parent' }), (error) => error.code === 'task_record_parent_terminal');
  runtime.updateTaskRecord(root, 'child-task', { parentTaskId: 'parent-task' });
  assert.throws(() => runtime.completeTaskRecord(root, 'parent-task', { summary: '父任务不能提前完成', noChange: false, ...parentEvidence('parent-task') }), { code: 'parent_completion_children_open' });
  runtime.abandonTaskRecord(root, 'parent-task', { reason: '显式停止协调，保留子任务独立推进' });
  const stillRelated = runtime.inspectTaskRecord(root, 'child-task');
  assert.equal(stillRelated.record.parentTaskId, 'parent-task');
  assert.equal(stillRelated.taskRelations.parent.status, 'abandoned');
  runtime.updateTaskRecord(root, 'child-task', { title: '既有关系不阻塞普通更新' });
  runtime.completeTaskRecord(root, 'grandchild-task', { summary: '叶子成果完成', noChange: false });
  runtime.completeTaskRecord(root, 'child-task', { summary: 'Child 独立完成', noChange: false, ...parentEvidence('child-task') });
  const beforeDetach = runtime.inspectTaskRecord(root, 'child-task');
  const detached = runtime.updateTaskRecord(root, 'child-task', { parentTaskId: null, expectedRecordDigest: beforeDetach.recordDigest, reason: '用户更正已完成任务的归属' });
  assert.equal(detached.record.parentTaskId, null); assert.equal(detached.record.status, 'completed');
  assert.deepEqual(detached.record.result, beforeDetach.record.result);
  assert.equal(detached.record.resultHistory[0].parentTaskId, 'parent-task');
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

test('CLI 完成动作沿用观察到的记录摘要并拒绝覆盖并发更新', (t) => {
  const { root } = fixture(t, 'completion-cas');
  const runtime = createRuntime();
  const before = runtime.createTaskRecord(root, { taskId: 'cas-task', title: '旧目标', intent: '初始目标', projects: [], services: [], changes: [] });
  runtime.updateTaskRecord(root, 'cas-task', { intent: '协作者更新了目标' });
  const rejected = run(['task', 'complete', 'cas-task', '--summary', '基于旧目标完成', '--expected-record', before.recordDigest, '--target', root, '--json'], 1);
  assert.notEqual(rejected.status, 0);
  assert.equal(runtime.inspectTaskRecord(root, 'cas-task').record.status, 'active');
  const current = runtime.inspectTaskRecord(root, 'cas-task');
  const completed = json(['task', 'complete', 'cas-task', '--summary', '已核对新目标并完成', '--expected-record', current.recordDigest, '--target', root]);
  assert.equal(completed.record.status, 'completed');
});

test('CLI parent completion requires an explicit evidence file and preserves the authorization', (t) => {
  const { root, base } = fixture(t, 'parent-completion-cli');
  const created = json(['task', 'create', 'explicit-parent', '--parent-task', '--title', '父任务', '--intent', '核对独立整体目标', '--target', root]);
  assert.equal(created.record.isParent, true);
  const denied = json(['task', 'complete', 'explicit-parent', '--summary', '尚无授权', '--target', root], 1);
  assert.equal(denied.diagnostic.code, 'parent_completion_authorization_required');
  const context = json(['task', 'parent', 'inspect', 'explicit-parent', '--target', root]);
  const evidence = path.join(base, 'parent-completion.json');
  fs.writeFileSync(evidence, JSON.stringify({ expectedSnapshot: context.completion.snapshotIdentity,
    acceptance: { summary: '整体目标已核对', children: [] },
    authorization: { source: 'test:explicit-parent-user-message', statement: '用户明确授权完成 explicit-parent' } }));
  const completed = json(['task', 'complete', 'explicit-parent', '--summary', '整体完成', '--expected-record', created.recordDigest, '--parent-completion', evidence, '--target', root]);
  assert.equal(completed.record.result.parentCompletion.authorization.source, 'test:explicit-parent-user-message');
  const retired = json(['task', 'parent', 'record', 'explicit-parent', '--target', root], 1);
  assert.equal(retired.diagnostic.code, 'parent_coordination_action_retired');
  assert.deepEqual(retired.effects, []);
});


test('CLI可显式更正终态并保留历史，随后仍能使用统一状态更新', (t) => {
  const { root } = fixture(t, 'task-correction-cli');
  json(['task', 'create', 'correctable', '--title', '阶段任务', '--intent', '先完成一个阶段', '--target', root]);
  const completed = json(['task', 'complete', 'correctable', '--summary', '阶段已完成', '--no-change', '--target', root]);
  const reopened = json(['task', 'update', 'correctable', '--status', 'active', '--reason', '用户恢复整体目标', '--intent', '继续整体工作', '--expected-record', completed.recordDigest, '--target', root]);
  assert.equal(reopened.record.status, 'active'); assert.equal(reopened.record.result, null);
  assert.equal(reopened.record.resultHistory[0].result.summary, '阶段已完成');
  assert.equal(reopened.record.resultHistory[0].intent, '先完成一个阶段');
  const again = json(['task', 'update', 'correctable', '--status', 'completed', '--summary', '整体已完成', '--no-change', '--expected-record', reopened.recordDigest, '--target', root]);
  assert.equal(again.record.status, 'completed'); assert.equal(again.record.resultHistory.length, 1);
});
