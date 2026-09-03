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
  assert.equal(empty.schemaVersion, 'buildr.task-record-result/v5'); assert.deepEqual(empty.record.changes, []); assert.equal(empty.status, 'created'); assert.deepEqual(empty.nextActions, []); assert.equal('path' in empty, false);

  const created = json(['task', 'create', 'multi-task', '--title', '多范围任务', '--intent', '验证限定引用', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/same-change', '--change', 'demo/second-change', '--change', 'other/same-change', '--target', root]);
  assert.equal(created.record.changes.length, 3); assert.match(created.recordDigest, /^sha256-/); assert.deepEqual(created.effects, [{ type: 'created', taskId: 'multi-task' }]); assert.equal('path' in created, false);
  const inspected = json(['task', 'inspect', 'multi-task', '--target', root]); assert.equal(inspected.recordDigest, created.recordDigest); assert.deepEqual(inspected.effects, []); assert.equal('path' in inspected, false);

  const updated = runtime.updateTaskRecord(root, 'multi-task', { expectedRecordDigest: created.recordDigest, title: '更新标题', removeChanges: ['demo/second-change'], addProjects: ['other'] });
  assert.equal(updated.status, 'updated'); assert.equal(updated.record.title, '更新标题'); assert.deepEqual(updated.record.scope.projects, ['demo', 'other']); assert.equal(updated.record.changes.length, 2);
  assert.equal(runtime.createTaskRecord(root, { taskId: 'peer-task', title: '共享 Change', intent: '不扫描其他 Task ownership', projects: [], services: [], changes: ['demo/same-change'] }).status, 'created');

  const completed = json(['task', 'complete', 'empty-task', '--summary', '确认无需修改', '--expected-record', empty.recordDigest, '--target', root]);
  assert.deepEqual(completed.record.result, { summary: '确认无需修改' });
  assert.deepEqual(completed.nextActions, []);
  const abandoned = runtime.createTaskRecord(root, { taskId: 'abandoned-task', title: '取消任务', intent: '验证放弃', projects: [], services: [], changes: [] });
  assert.equal(abandoned.status, 'created');
  const ended = runtime.abandonTaskRecord(root, 'abandoned-task', { expectedRecordDigest: abandoned.recordDigest, reason: '目标取消' }); assert.deepEqual(ended.record.result, { summary: '目标取消' }); assert.deepEqual(ended.nextActions, completed.nextActions);
  const humanCreated = runtime.createTaskRecord(root, { taskId: 'human-output-task', title: '人类输出', intent: '验证终态输出', projects: [], services: [], changes: [] });
  const human = run(['task', 'complete', 'human-output-task', '--summary', '完成', '--expected-record', humanCreated.recordDigest, '--target', root]);
  assert.match(human.stdout, /Task human-output-task completed/);
  assert.doesNotMatch(human.stdout, /复盘|Next:/);
  const terminal = json(['task', 'update', 'abandoned-task', '--title', '缺少更正原因', '--expected-record', ended.recordDigest, '--target', root], 1); assert.equal(terminal.status, 'blocked'); assert.equal(terminal.diagnostic.code, 'task_record_field_invalid'); assert.deepEqual(terminal.effects, []);
  assert.equal(runtime.recordTaskRetrospective, undefined);
  assert.equal(runtime.handleTaskRetrospective, undefined);
  assert.equal(runtime.listTaskRetrospectives, undefined);
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'multi-task', title: '重复', intent: '不得覆盖', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_already_exists');
  const syntax = json(['task', 'create', 'missing-title', '--intent', '语法错误', '--target', root], 2); assert.equal(syntax.schemaVersion, 'buildr.cli-error/v1'); assert.equal(syntax.error.code, 'task_record_cli.syntax');
});

test('任务完成只经既有 complete，旧收尾专用完成写入口退出', (t) => {
  const { root } = fixture(t, 'direct-completion');
  const runtime = createRuntime();
  assert.equal(runtime.completeTaskRecordFromFinish, undefined);
  const created = runtime.createTaskRecord(root, { taskId: 'direct-task', title: '非 Git 成果', intent: '完成业务工作', projects: [], services: [], changes: [] });
  const completed = runtime.completeTaskRecord(root, 'direct-task', { expectedRecordDigest: created.recordDigest, summary: '业务成果已到位，实际业务结果已核对。' });
  assert.equal(completed.record.status, 'completed');
  assert.deepEqual(completed.record.result, { summary: '业务成果已到位，实际业务结果已核对。' });
  assert.equal(runtime.inspectTaskTerminalDelivery, undefined);
  assert.equal(runtime.inspectTaskRecord(root, 'direct-task').record.status, 'completed');
});

test('普通后续 Task 只在目标中说明来源，不维护复盘专用关系', (t) => {
  const { root } = fixture(t, 'task-todo-followup');
  const runtime = createRuntime();
  const todo = json(['task', 'create', 'todo-followup', '--title', '待办改进', '--intent', '承接 source-one 的复盘建议', '--status', 'todo', '--target', root]);
  assert.equal(todo.record.status, 'todo');
  assert.deepEqual(todo.record.changes, []);
  assert.equal(todo.record.intent, '承接 source-one 的复盘建议');
  assert.equal('retrospectiveSourceTaskIds' in todo.record, false);
  assert.equal('retrospectiveRelations' in todo, false);
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'open' }).tasks.map((item) => item.record.taskId), ['todo-followup']);
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'todo' }).tasks.map((item) => item.record.taskId), ['todo-followup']);
  assert.throws(() => runtime.updateTaskRecord(root, 'todo-followup', { expectedRecordDigest: todo.recordDigest, addChanges: ['demo/same-change'] }), (error) => error.code === 'task_record_todo_change_forbidden');
  const activated = json(['task', 'activate', 'todo-followup', '--expected-record', todo.recordDigest, '--target', root]);
  assert.equal(activated.status, 'activated');
  assert.equal(activated.record.status, 'active');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { status: 'open' }).tasks.map((item) => item.record.taskId), ['todo-followup']);
});

test('复盘文档由 Agent 写入固定本地路径，Task Record 只登记摘要与决定状态', (t) => {
  const { root } = fixture(t, 'task-retrospective-document');
  const runtime = createRuntime();
  const created = runtime.createTaskRecord(root, { taskId: 'document-task', title: '本地复盘', intent: '验证最小登记', projects: [], services: [], changes: [] });
  runtime.completeTaskRecord(root, 'document-task', { expectedRecordDigest: created.recordDigest, summary: '任务完成' });
  const before = runtime.inspectTaskRecord(root, 'document-task');
  assert.equal(before.record.retrospective, null);
  assert.equal(runtime.inspectTaskRetrospectiveDocument(root, 'document-task').effectiveState, 'missing');

  const documentPath = path.join(root, '.buildr', 'local', 'task-retrospectives', 'document-task.md');
  fs.mkdirSync(path.dirname(documentPath), { recursive: true });
  fs.writeFileSync(documentPath, '# 任务复盘\n\n当前没有可继续行动的问题。\n');
  const observed = runtime.inspectTaskRetrospectiveDocument(root, 'document-task');
  assert.equal(observed.present, true);
  assert.equal(observed.effectiveState, 'pending-decision');
  assert.match(observed.actualDigest, /^sha256-[0-9a-f]{64}$/);

  const registered = runtime.updateTaskRecord(root, 'document-task', {
    expectedRecordDigest: before.recordDigest,
    retrospectiveState: 'pending-decision',
    retrospectiveDocumentDigest: observed.actualDigest,
  });
  assert.deepEqual(registered.record.retrospective, { state: 'pending-decision', documentDigest: observed.actualDigest });
  const decided = runtime.updateTaskRecord(root, 'document-task', {
    expectedRecordDigest: registered.recordDigest,
    retrospectiveState: 'decided',
    retrospectiveDocumentDigest: observed.actualDigest,
  });
  assert.equal(decided.record.retrospective.state, 'decided');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { retrospectiveState: 'decided' }).tasks.map((item) => item.record.taskId), ['document-task']);

  fs.appendFileSync(documentPath, '\n新的事实。\n');
  const changed = runtime.inspectTaskRetrospectiveDocument(root, 'document-task');
  assert.equal(changed.effectiveState, 'pending-decision');
  assert.equal(changed.diagnostic.code, 'task_record_retrospective_document_changed');
  const latest = runtime.inspectTaskRecord(root, 'document-task');
  const cleared = runtime.updateTaskRecord(root, 'document-task', { expectedRecordDigest: latest.recordDigest, clearRetrospective: true });
  assert.equal(cleared.record.retrospective, null);
  assert.equal(fs.existsSync(documentPath), true, '清除 Task Record 摘要不能删除本地文档');
});

test('复盘文档读取拒绝符号链接目录且不写Task状态', (t) => {
  const { base, root } = fixture(t, 'task-retrospective-document-symlink');
  const runtime = createRuntime();
  const created = runtime.createTaskRecord(root, { taskId: 'symlink-task', title: '符号链接复盘', intent: '验证读取边界', projects: [], services: [], changes: [] });
  runtime.completeTaskRecord(root, 'symlink-task', { expectedRecordDigest: created.recordDigest, summary: '任务完成' });
  const external = path.join(base, 'external-retrospectives');
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'symlink-task.md'), '# 外部文件\n');
  fs.symlinkSync(external, path.join(root, '.buildr', 'local', 'task-retrospectives'));
  const before = runtime.inspectTaskRecord(root, 'symlink-task');
  assert.throws(() => runtime.inspectTaskRetrospectiveDocument(root, 'symlink-task'), (error) => error.code === 'task_record_retrospective_document_directory_invalid');
  assert.equal(runtime.inspectTaskRecord(root, 'symlink-task').recordDigest, before.recordDigest);

  const documents = path.join(root, '.buildr', 'local', 'task-retrospectives');
  fs.unlinkSync(documents);
  fs.mkdirSync(documents);
  fs.symlinkSync(path.join(external, 'symlink-task.md'), path.join(documents, 'symlink-task.md'));
  assert.throws(() => runtime.inspectTaskRetrospectiveDocument(root, 'symlink-task'), (error) => error.code === 'task_record_retrospective_document_invalid');
  assert.equal(runtime.inspectTaskRecord(root, 'symlink-task').recordDigest, before.recordDigest);
});

test('Parent Task 支持直接层级、重挂与清除，并拒绝自引用、循环和 terminal 新关系', (t) => {
  const { root } = fixture(t, 'task-parent');
  const runtime = createRuntime();
  const parent = json(['task', 'create', 'parent-task', '--title', '协调任务', '--intent', '管理直接子任务', '--target', root]);
  const child = json(['task', 'create', 'child-task', '--title', '子任务', '--intent', '被协调', '--parent', 'parent-task', '--target', root]);
  assert.equal(child.record.parentTaskId, 'parent-task');
  assert.deepEqual(child.taskRelations.parent, { taskId: 'parent-task', title: '协调任务', status: 'active' });
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').taskRelations.children.map((item) => item.taskId), ['child-task']);
  assert.notEqual(runtime.inspectTaskRecord(root, 'parent-task').recordDigest, parent.recordDigest, '首次建立 Child 时必须保存显式父任务身份');
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').taskRelations.children, [{ taskId: 'child-task', title: '子任务', status: 'active' }]);

  runtime.createTaskRecord(root, { taskId: 'grandchild-task', title: '孙任务', intent: '验证多层', parentTaskId: 'child-task', projects: [], services: [], changes: [] });
  assert.throws(() => runtime.updateTaskRecord(root, 'parent-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'parent-task').recordDigest, parentTaskId: 'grandchild-task' }), (error) => error.code === 'task_record_parent_cycle');
  assert.throws(() => runtime.updateTaskRecord(root, 'parent-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'parent-task').recordDigest, parentTaskId: 'parent-task' }), (error) => error.code === 'task_record_parent_self_reference');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'missing-parent-child', title: '非法子任务', intent: 'Parent 不存在', parentTaskId: 'missing-parent', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_parent_not_found');

  const replacement = runtime.createTaskRecord(root, { taskId: 'replacement-parent', title: '替代协调任务', intent: '验证重挂', projects: [], services: [], changes: [] });
  const reparented = json(['task', 'update', 'child-task', '--parent', 'replacement-parent', '--expected-record', runtime.inspectTaskRecord(root, 'child-task').recordDigest, '--target', root]);
  assert.equal(reparented.record.parentTaskId, 'replacement-parent');
  assert.deepEqual(runtime.inspectTaskRecord(root, 'parent-task').taskRelations.children, []);
  assert.deepEqual(runtime.inspectTaskRecord(root, 'replacement-parent').taskRelations.children.map((item) => item.taskId), ['child-task']);
  const cleared = json(['task', 'update', 'child-task', '--clear-parent', '--expected-record', reparented.recordDigest, '--target', root]);
  assert.equal(cleared.record.parentTaskId, null);
  const mutuallyExclusive = json(['task', 'update', 'child-task', '--parent', 'parent-task', '--clear-parent', '--target', root], 2);
  assert.equal(mutuallyExclusive.error.code, 'task_record_cli.syntax');

  const parentEvidence = (id) => ({ expectedRecordDigest: runtime.inspectTaskRecord(root, id).recordDigest, parentCompletion: {
    expectedSnapshot: runtime.inspectParentCoordination(root, id).completion.snapshotIdentity,
    acceptance: { summary: '测试整体目标已核对', children: runtime.inspectParentCoordination(root, id).children.map((child) => ({ taskId: child.taskId, summary: '测试成果已处置' })) },
    authorization: { source: 'test:explicit-user-authorization', statement: `明确完成 ${id}` },
  } });
  const terminalParent = runtime.completeTaskRecord(root, 'replacement-parent', { summary: '协调结束', ...parentEvidence('replacement-parent') });
  assert.equal(terminalParent.record.status, 'completed');
  assert.throws(() => runtime.updateTaskRecord(root, 'child-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'child-task').recordDigest, parentTaskId: 'replacement-parent' }), (error) => error.code === 'task_record_parent_terminal');
  runtime.updateTaskRecord(root, 'child-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'child-task').recordDigest, parentTaskId: 'parent-task' });
  assert.throws(() => runtime.completeTaskRecord(root, 'parent-task', { summary: '父任务不能提前完成', ...parentEvidence('parent-task') }), { code: 'parent_completion_children_open' });
  runtime.abandonTaskRecord(root, 'parent-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'parent-task').recordDigest, reason: '显式停止协调，保留子任务独立推进' });
  const stillRelated = runtime.inspectTaskRecord(root, 'child-task');
  assert.equal(stillRelated.record.parentTaskId, 'parent-task');
  assert.equal(stillRelated.taskRelations.parent.status, 'abandoned');
  runtime.updateTaskRecord(root, 'child-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'child-task').recordDigest, title: '既有关系不阻塞普通更新' });
  runtime.completeTaskRecord(root, 'grandchild-task', { expectedRecordDigest: runtime.inspectTaskRecord(root, 'grandchild-task').recordDigest, summary: '叶子成果完成' });
  runtime.completeTaskRecord(root, 'child-task', { summary: 'Child 独立完成', ...parentEvidence('child-task') });
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
  runtime.updateTaskRecord(root, 'safe-task', { expectedRecordDigest: created.recordDigest, intent: '由另一客户端更新' });
  const current = runtime.inspectTaskRecord(root, 'safe-task');
  const professionalFile = path.join(legacyDirectory, 'professional.json');
  fs.writeFileSync(professionalFile, '{"owner":"independent-professional"}\n');
  const professionalBytes = fs.readFileSync(professionalFile, 'utf8');
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
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { expectedRecordDigest: current.recordDigest, title: '不应留下' }), (error) => error.code === 'task_record_database_failed');
  assert.equal(runtime.inspectTaskRecord(root, 'safe-task').recordDigest, current.recordDigest, 'failed transaction must preserve current logical record');
  assert.equal(fs.readFileSync(professionalFile, 'utf8'), professionalBytes, 'Task Record failure must not rewrite sibling professional files');
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
  const list = runtime.queryTaskRecordViews(root); assert.equal(list.tasks.some((item) => item.record.taskId === 'safe-task'), true);
  assert.notDeepEqual(original, current.record);
});

test('历史Project、Service或Change不可用时Task仍可读并允许移除引用或修改无关字段', (t) => {
  const { root } = fixture(t, 'task-reference-availability');
  const runtime = createRuntime();
  const created = runtime.createTaskRecord(root, { taskId: 'historical-references', title: '历史引用', intent: '引用以后可能迁移', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');

  const inspected = runtime.inspectTaskRecord(root, 'historical-references');
  assert.equal(inspected.recordDigest, created.recordDigest);
  assert.deepEqual(inspected.record.scope, created.record.scope);
  assert.deepEqual(new Set(inspected.referenceDiagnostics.map((item) => item.kind)), new Set(['project', 'service', 'change']));
  const cliInspected = json(['task', 'inspect', 'historical-references', '--target', root]);
  assert.deepEqual(cliInspected.record, inspected.record);
  assert.deepEqual(cliInspected.referenceDiagnostics, inspected.referenceDiagnostics);
  const detail = runtime.inspectTaskRecordView(root, 'historical-references');
  assert.deepEqual(detail.record, inspected.record);
  assert.deepEqual(detail.referenceDiagnostics, inspected.referenceDiagnostics);
  const listed = runtime.queryTaskRecordViews(root).tasks.find((item) => item.record.taskId === 'historical-references');
  assert.deepEqual(listed.record, inspected.record);
  assert.deepEqual(listed.referenceDiagnostics, inspected.referenceDiagnostics);

  const renamed = runtime.updateTaskRecord(root, 'historical-references', { expectedRecordDigest: inspected.recordDigest, title: '历史引用仍可读' });
  assert.equal(renamed.record.title, '历史引用仍可读');
  const cleaned = runtime.updateTaskRecord(root, 'historical-references', {
    expectedRecordDigest: renamed.recordDigest,
    removeProjects: ['demo'], removeServices: ['demo/api'], removeChanges: ['demo/same-change'],
  });
  assert.deepEqual(cleaned.record.scope, { projects: [], services: [] });
  assert.deepEqual(cleaned.record.changes, []);
  assert.deepEqual(cleaned.referenceDiagnostics, []);

  assert.throws(() => runtime.updateTaskRecord(root, 'historical-references', { expectedRecordDigest: cleaned.recordDigest, addProjects: ['missing'] }), { code: 'task_record_project_not_found' });
  assert.throws(() => runtime.updateTaskRecord(root, 'historical-references', { expectedRecordDigest: cleaned.recordDigest, addServices: ['missing/api'] }), { code: 'task_record_project_not_found' });
  assert.throws(() => runtime.updateTaskRecord(root, 'historical-references', { expectedRecordDigest: cleaned.recordDigest, addChanges: ['missing/change'] }), { code: 'task_record_project_not_found' });
});

test('CLI 完成动作沿用观察到的记录摘要并拒绝覆盖并发更新', (t) => {
  const { root } = fixture(t, 'completion-cas');
  const runtime = createRuntime();
  const before = runtime.createTaskRecord(root, { taskId: 'cas-task', title: '旧目标', intent: '初始目标', projects: [], services: [], changes: [] });
  runtime.updateTaskRecord(root, 'cas-task', { expectedRecordDigest: before.recordDigest, intent: '协作者更新了目标' });
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
  const denied = json(['task', 'complete', 'explicit-parent', '--summary', '尚无授权', '--expected-record', created.recordDigest, '--target', root], 1);
  assert.equal(denied.diagnostic.code, 'parent_completion_authorization_required');
  const context = json(['task', 'parent', 'inspect', 'explicit-parent', '--target', root]);
  const evidence = path.join(base, 'parent-completion.json');
  fs.writeFileSync(evidence, JSON.stringify({ expectedSnapshot: context.completion.snapshotIdentity,
    acceptance: { summary: '整体目标已核对', children: [] },
    authorization: { source: 'test:explicit-parent-user-message', statement: '用户明确授权完成 explicit-parent' } }));
  const completed = json(['task', 'complete', 'explicit-parent', '--summary', '整体完成', '--expected-record', created.recordDigest, '--parent-completion', evidence, '--target', root]);
  assert.equal(completed.record.result.parentCompletion.authorization.source, 'test:explicit-parent-user-message');
});


test('CLI可显式更正终态并保留历史，随后仍能使用统一状态更新', (t) => {
  const { root } = fixture(t, 'task-correction-cli');
  const created = json(['task', 'create', 'correctable', '--title', '阶段任务', '--intent', '先完成一个阶段', '--target', root]);
  const completed = json(['task', 'complete', 'correctable', '--summary', '阶段已完成', '--expected-record', created.recordDigest, '--target', root]);
  const reopened = json(['task', 'update', 'correctable', '--status', 'active', '--reason', '用户恢复整体目标', '--intent', '继续整体工作', '--expected-record', completed.recordDigest, '--target', root]);
  assert.equal(reopened.record.status, 'active'); assert.equal(reopened.record.result, null);
  assert.equal(reopened.record.resultHistory[0].result.summary, '阶段已完成');
  assert.equal(reopened.record.resultHistory[0].intent, '先完成一个阶段');
  const again = json(['task', 'update', 'correctable', '--status', 'completed', '--summary', '整体已完成', '--expected-record', reopened.recordDigest, '--target', root]);
  assert.equal(again.record.status, 'completed'); assert.equal(again.record.resultHistory.length, 1);
});
