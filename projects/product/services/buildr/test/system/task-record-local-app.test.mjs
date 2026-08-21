import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.mjs';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import {
  runBuildr as run,
  runBuildrJson as json,
  taskRecordFixture as fixture,
} from '../helpers/task-record-system-fixture.mjs';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('Task Record target 必须是 canonical Workspace，不能是 linked worktree checkout', (t) => {
  const { base, root } = fixture(t, 'task-canonical');
  run(['task', 'create', 'canonical-task', '--title', 'Canonical', '--intent', '写入 retained root', '--target', root]);
  assert.equal(spawnSync('git', ['init', '--initial-branch=main'], { cwd: root, encoding: 'utf8' }).status, 0);
  spawnSync('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root }); spawnSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root }); assert.equal(spawnSync('git', ['commit', '-m', 'fixture'], { cwd: root, encoding: 'utf8' }).status, 0);
  const worktree = path.join(base, 'linked-task');
  const added = spawnSync('git', ['worktree', 'add', '-b', 'codex/linked-task', worktree, 'HEAD'], { cwd: root, encoding: 'utf8' }); assert.equal(added.status, 0, added.stderr);
  const blocked = json(['task', 'create', 'linked-task', '--title', '错误目标', '--intent', '不得写入 worktree', '--target', worktree], 1);
  assert.equal(blocked.diagnostic.code, 'task_record_workspace_not_canonical'); assert.equal(fs.existsSync(path.join(worktree, '.buildr', 'tasks', 'linked-task')), false);
  const standalone = path.join(base, '.worktrees', 'standalone-workspace');
  run(['init', '--target', standalone, '--name', 'standalone', '--description', 'non-Git canonical workspace']);
  assert.equal(json(['task', 'create', 'standalone-task', '--title', '独立 Workspace', '--intent', '目录名不决定 authority', '--target', standalone]).status, 'created');
  const uninitialized = json(['task', 'create', 'missing-root', '--title', '错误目标', '--intent', '未初始化', '--target', path.join(root, 'not-a-workspace')], 1);
  assert.equal(uninitialized.diagnostic.code, 'task_record_workspace_invalid');
});

test('Buildr Web 已解析 Workspace root 的 Task 读取不观察 Git', async (t) => {
  const { base, root } = fixture(t, 'task-local-app-no-git-read');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-no-git-read'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer = createRuntime();
  writer.createTaskRecord(root, { taskId: 'read-without-git', title: '只读无需 Git', intent: '验证 Buildr Web read boundary', projects: [], services: [], changes: [] });

  const reader = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('Buildr Web GET 不得调用 Git/worktree provenance'); } });
  const instance = createLocalWorkspaceServer(reader, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const response = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.tasks.map((item) => item.record.taskId), ['read-without-git']);
});

test('Buildr Web 专业 Task read view 使用默认 bounded Worker executor', async (t) => {
  const { base, root } = fixture(t, 'task-local-app-bounded-worker');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-bounded-worker'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer = createRuntime();
  writer.createTaskRecord(root, { taskId: 'bounded-read', title: '有界读取', intent: '验证默认 Worker executor', projects: [], services: [], changes: [] });
  const instance = createLocalWorkspaceServer(createRuntime(), { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const response = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/bounded-read/development`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schemaVersion, 'buildr.task-development-operation-result/v1');
  assert.equal(body.status, 'missing');
});

test('Buildr Web Task Execution Record routes提供三种只读view和受限正文', async (t) => {
  const { base, root } = fixture(t, 'task-local-app-execution-records');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-execution-records'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer = createRuntime();
  writer.createTaskRecord(root, { taskId: 'execution-record-task', title: '执行记录', intent: '验证 Buildr Web execution records', projects: [], services: [], changes: [] });
  const verification = writer.openTaskExecutionRecord(root, 'execution-record-task', { owner: 'task-verification', kind: 'verification-execution', runIdentity: 'verification-1', targetIdentity: 'target-1', producer: 'system-test' });
  writer.sealTaskExecutionRecord(root, verification.record.recordId, { outcome: 'failed', files: [{ name: 'stdout.txt', content: 'verification output' }] });
  const finish = writer.openTaskExecutionRecord(root, 'execution-record-task', { owner: 'task-finish', kind: 'finish-diagnostics', runIdentity: 'finish-1', targetIdentity: 'target-1', producer: 'system-test' });
  writer.sealTaskExecutionRecord(root, finish.record.recordId, { outcome: 'passed', files: [{ name: 'diagnostics.json', content: { status: 'passed' } }] });

  const instance = createLocalWorkspaceServer(createRuntime(), { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/execution-record-task/execution-records`;
  let response = await fetch(endpoint);
  let body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.schemaVersion, 'buildr.task-execution-record-list-view/v1'); assert.equal(body.view, 'all'); assert.equal(body.records.length, 2);
  assert.equal(JSON.stringify(body).includes('.buildr/local/task-execution-records'), false);
  response = await fetch(`${endpoint}?view=verification`); body = await response.json();
  assert.deepEqual(body.records.map((record) => record.owner), ['task-verification']);
  response = await fetch(`${endpoint}?view=finish`); body = await response.json();
  assert.deepEqual(body.records.map((record) => record.owner), ['task-finish']);
  response = await fetch(`${endpoint}/${verification.record.recordId}`); body = await response.json();
  assert.equal(body.schemaVersion, 'buildr.task-execution-record-detail-view/v1'); assert.deepEqual(body.record.body.files.map((file) => file.name), ['stdout.txt']);
  response = await fetch(`${endpoint}/${verification.record.recordId}/body/stdout.txt`); body = await response.json();
  assert.equal(body.schemaVersion, 'buildr.task-execution-record-body-file/v1'); assert.equal(body.file.content, 'verification output');
  response = await fetch(`${endpoint}?view=resources`); body = await response.json(); assert.equal(response.status, 400); assert.equal(body.error.code, 'task_execution_record_view_invalid');
  response = await fetch(`${endpoint}?view=all&path=/tmp/private`); body = await response.json(); assert.equal(response.status, 400); assert.equal(body.error.code, 'target_forbidden');
  response = await fetch(`${endpoint}/${verification.record.recordId}/body/secret.txt`); body = await response.json(); assert.equal(response.status, 400); assert.equal(body.error.code, 'task_execution_record_body_name_forbidden');
});

test('Buildr Web Task API 提供轻量查询与既有任务维护，不暴露创建入口', async (t) => {
  const { base, root } = fixture(t, 'task-local-app');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'app-parent', title: '页面协调任务', intent: '作为 Parent', projects: [], services: [], changes: [] });
  const created = runtime.createTaskRecord(root, { taskId: 'app-task', title: '页面任务', intent: '验证轻量读取 %_ literal', parentTaskId: 'app-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const staleDigest = created.recordDigest;
  let bulkStore = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const insertBulk = bulkStore.database.prepare('INSERT INTO tasks(task_id, schema_version, title, intent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  bulkStore.database.exec('BEGIN');
  for (let index = 0; index < 200; index += 1) insertBulk.run(`bulk-${String(index).padStart(3, '0')}`, 'buildr.task-record/v2', `批量任务 ${index}`, '固定查询次数夹具', 'active', '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z');
  bulkStore.database.exec('COMMIT'); bulkStore.database.close();
  const openStore = runtime.openWorkspaceStructuredStore.bind(runtime);
  let preparedStatements = 0;
  runtime.openWorkspaceStructuredStore = (...args) => {
    const opened = openStore(...args);
    if (!opened.database) return opened;
    return { ...opened, database: new Proxy(opened.database, { get(database, field) {
      if (field === 'prepare') return (...input) => { preparedStatements += 1; return database.prepare(...input); };
      const value = Reflect.get(database, field); return typeof value === 'function' ? value.bind(database) : value;
    } }) };
  };
  const bulkView = runtime.queryTaskRecordViews(root); assert.equal(bulkView.tasks.length, 202); assert.equal(bulkView.totalTaskCount, 202); assert.equal(preparedStatements, 10, '列表 SQL 次数必须与 Task 数量无关');
  preparedStatements = 0; runtime.inspectTaskRecordView(root, 'app-task'); assert.equal(preparedStatements, 7, '详情轻量视图不得扫描或解析其他 Task');
  runtime.openWorkspaceStructuredStore = openStore;
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: '%_' }).tasks.map((item) => item.record.taskId), ['app-task'], 'SQL wildcard 必须按普通文本匹配');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: 'app-ta' }).tasks.map((item) => item.record.taskId), ['app-task'], 'q 必须按标题、意图或任务编号做子串匹配');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: 'APP-TASK' }).tasks.map((item) => item.record.taskId), ['app-task'], '任务编号必须不区分大小写');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: 'app task' }).tasks.map((item) => item.record.taskId), ['app-task'], '任务编号必须把空格与连字符当作模糊分隔');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: "%' OR 1=1 --" }).tasks, [], 'query input 必须保持参数绑定');
  bulkStore = runtime.openWorkspaceStructuredStore(root, { writable: true }); bulkStore.database.prepare("DELETE FROM tasks WHERE task_id LIKE 'bulk-%'").run(); bulkStore.database.close();
  runtime.createTaskRecord(root, { taskId: 'app-retrospective', title: '已复盘任务', intent: '验证复盘筛选', projects: [], services: [], changes: [] });
  const retrospectiveTask = runtime.inspectTaskRecord(root, 'app-retrospective');
  runtime.completeTaskRecord(root, 'app-retrospective', { expectedRecordDigest: retrospectiveTask.recordDigest, summary: '复盘筛选夹具', noChange: false });
  runtime.recordTaskRetrospective(root, 'app-retrospective', { reportMarkdown: '# 复盘\n\n列表筛选验证。' });
  runtime.resolveTaskEnvironmentExecution = (_workspace, taskId) => ({ ready: true, taskId, receiptSchema: 'buildr.task-environment-receipt/v2', workspaceRoot: root, environmentRoot: root, validationRoot: root, scopes: [] });
  runtime.beginTaskDevelopment(root, 'app-parent', { changeDispositions: [], planning: { targetIdentity: null, nodes: [] }, planningGate: { disposition: 'not-applicable', targetIdentity: null, summary: 'Parent Plan尚未记录。', source: 'system fixture' } });
  const readExecutor = {
    run: (operation, input) => Promise.resolve(runtime[{ development: 'inspectTaskDevelopmentView', reviews: 'inspectTaskReviewView', verification: 'inspectTaskVerificationView', coordination: 'inspectParentCoordination' }[operation]](input.targetRoot, input.taskId)),
    close: async () => {},
  };
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root, readExecutor });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('connection', 'close');
    const method = options.method || 'GET';
    try {
      const response = await fetch(resource, { ...options, headers });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } catch (error) {
      throw new Error(`Buildr Web request failed: ${method} ${resource}: ${error.message}`, { cause: error });
    }
  };

  let response = await request(endpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-list/v4'); assert.equal(response.body.totalTaskCount, 3); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task', 'app-retrospective']));
  const parentReadModel = response.body.tasks.find((item) => item.record.taskId === 'app-parent'); assert.deepEqual(parentReadModel.record.childTaskIds, ['app-task']); assert.equal(parentReadModel.taskRelations.children[0].status, 'active');
  assert.equal(parentReadModel.childTaskCount, 1);
  response = await request(`${endpoint}?q=%E8%BD%BB%E9%87%8F&project=demo&service=demo%2Fapi&status=active&hasChildren=no&hasRetrospective=no`);
  assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-task']);
  assert.deepEqual(response.body.filters, { q: '轻量', project: 'demo', service: 'demo/api', status: 'active', hasChildren: 'no', hasRetrospective: 'no', retrospectiveState: 'all' });
  assert.deepEqual(response.body.filterOptions, { projects: ['demo'], services: ['demo/api'] });
  response = await request(`${endpoint}?hasChildren=yes`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-parent']);
  response = await request(`${endpoint}?hasRetrospective=yes`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?hasRetrospective=no`); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task']));
  response = await request(`${endpoint}?retrospectiveState=pending`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?retrospectiveState=missing`); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task']));
  response = await request(`${endpoint}?retrospectiveState=handled`); assert.deepEqual(response.body.tasks, []);
  response = await request(`${endpoint}?retrospectiveState=no-action`); assert.deepEqual(response.body.tasks, []);
  response = await request(`${endpoint}?hasRetrospective=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?retrospectiveState=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?status=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?q=a&q=b`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_invalid');
  const taskEndpoint = `${endpoint}/app-task`;
  response = await request(taskEndpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-view/v2'); assert.deepEqual(response.body.storedChangeReferences, [{ project: 'demo', change: 'same-change' }]); assert.equal('changeReferences' in response.body, false);
  const coordinationEndpoint = `${endpoint}/app-parent/coordination`;
  response = await request(coordinationEndpoint); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.parent-coordination-result/v3'); assert.equal(response.body.mode, 'legacy');
  const parentPlan = { outcome: 'Buildr Web displays one shared coordination model.', architectureDecisions: ['No Child status is copied into Parent Plan.'], contributions: [{ id: 'app-child-delivery', priority: 'P0-1', title: 'App Child delivery', objective: 'The existing Child delivers its narrow scope.', directions: ['Use the existing Child relation.'], boundaries: ['Do not copy Child status.'], expectedChild: 'The existing app-task Child', dependencies: [] }], finalAcceptance: ['The saved delivery is explicitly accepted.'] };
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'record', plan: parentPlan }) }); assert.equal(response.status, 403);
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ operation: 'record', plan: parentPlan, root }) }); assert.equal(response.status, 400); assert.equal(response.body.schemaVersion, 'buildr.parent-coordination-result/v3'); assert.equal(response.body.diagnostic.code, 'target_forbidden');
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ operation: 'record', plan: parentPlan, reason: 'Wrong operation field.' }) }); assert.equal(response.status, 400); assert.equal(response.body.schemaVersion, 'buildr.parent-coordination-result/v3'); assert.equal(response.body.status, 'blocked'); assert.equal(response.body.diagnostic.code, 'parent_coordination_field_forbidden');
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ operation: 'record', plan: parentPlan }) }); assert.equal(response.status, 200); assert.equal(response.body.mode, 'parent-plan'); assert.equal(response.body.contributions[0].id, 'app-child-delivery'); assert.equal('parentPlan' in response.body, false);
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ operation: 'record', plan: parentPlan }) }); assert.equal(response.status, 409); assert.equal(response.body.schemaVersion, 'buildr.parent-coordination-result/v3'); assert.equal(response.body.status, 'blocked'); assert.equal(response.body.diagnostic.code, 'parent_plan_already_exists'); assert.deepEqual(response.body.effects, []);
  response = await request(`${taskEndpoint}/development`); assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.schemaVersion, 'buildr.task-development-operation-result/v1'); assert.equal(response.body.status, 'missing'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const inspectDevelopment = runtime.inspectTaskDevelopment.bind(runtime);
  const developmentReadModel = { schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'inspected', taskId: 'app-task', development: { path: 'workspace-sqlite:task-development/app-task', receiptDigest: 'sha256-development', receipt: { generation: 2 }, applicability: { status: 'candidate-current' } }, diagnostic: null, effects: [], nextActions: [] };
  let developmentReads = 0;
  runtime.inspectTaskDevelopment = (target, taskId) => {
    if (taskId !== 'app-task') return inspectDevelopment(target, taskId);
    developmentReads += 1;
    assert.equal(target, root);
    return developmentReadModel;
  };
  response = await request(`${taskEndpoint}/development`); assert.equal(response.status, 200);
  const { terminal, ...developmentBody } = response.body;
  assert.deepEqual(developmentBody, developmentReadModel, '既有 Development read model 字段保持兼容');
  assert.equal(terminal.schemaVersion, 'buildr.task-terminal-delivery/v1');
  assert.equal(terminal.status, 'active');
  assert.equal(terminal.delivered, false);
  assert.equal(terminal.snapshot.generation, 2);
  assert.equal(developmentReads, 1);
  const inspectReview = runtime.inspectTaskReview.bind(runtime);
  const inspectVerification = runtime.inspectTaskVerification.bind(runtime);
  let reviewReads = 0;
  let verificationReads = 0;
  runtime.inspectTaskReview = (...args) => { reviewReads += 1; return inspectReview(...args); };
  runtime.inspectTaskVerification = (...args) => { verificationReads += 1; return inspectVerification(...args); };
  runtime.inspectTaskTerminalDelivery = () => { throw new Error('Buildr Web Tab 不得调用完整 terminal 聚合器。'); };
  response = await request(`${taskEndpoint}/reviews`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-review-operation-result/v1'); assert.equal(response.body.terminal.status, 'active');
  response = await request(`${taskEndpoint}/verification`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-verification-operation-result/v1'); assert.equal(response.body.terminal.status, 'active');
  assert.equal(developmentReads, 3, 'Reviews/Verification 的terminal section各读取一次Development handoff authority');
  assert.equal(reviewReads, 1, 'Reviews GET 应只读取一次 Review');
  assert.equal(verificationReads, 1, 'Verification GET 应只读取一次 Verification');
  response = await request(`${taskEndpoint}/development?target=${encodeURIComponent(root)}`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/missing-task/development`); assert.equal(response.status, 404); assert.equal(response.body.error.code, 'task_record_not_found');
  const retrospectiveEndpoint = `${endpoint}/app-retrospective/retrospective`;
  response = await request(retrospectiveEndpoint); assert.equal(response.status, 200); assert.equal(response.body.slot.disposition.status, 'pending');
  const pendingCurrentDigest = response.body.slot.currentDigest;
  response = await request(retrospectiveEndpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'no-action', note: '暂无可行的改进项', expectedCurrentDigest: pendingCurrentDigest }) }); assert.equal(response.status, 403);
  response = await request(retrospectiveEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ status: 'no-action', note: '暂无可行的改进项', expectedCurrentDigest: pendingCurrentDigest, root }) }); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(retrospectiveEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ status: 'no-action', note: '暂无可行的改进项', expectedCurrentDigest: pendingCurrentDigest }) });
  assert.equal(response.status, 200); assert.equal(response.body.operation, 'handle'); assert.equal(response.body.slot.disposition.status, 'no-action'); assert.equal(response.body.slot.disposition.note, '暂无可行的改进项');
  response = await request(retrospectiveEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ status: 'handled', note: '已转化为改进任务', expectedCurrentDigest: pendingCurrentDigest }) }); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_retrospective_conflict');
  response = await request(`${endpoint}?retrospectiveState=no-action`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?retrospectiveState=pending`); assert.deepEqual(response.body.tasks, []);
  const taskBeforeRejectedDevelopmentWrite = runtime.inspectTaskRecord(root, 'app-task');
  response = await request(`${taskEndpoint}/development`, { method: 'POST', headers: writeHeaders, body: '{}' }); assert.equal(response.status, 404);
  const taskAfterRejectedDevelopmentWrite = runtime.inspectTaskRecord(root, 'app-task');
  assert.equal(taskAfterRejectedDevelopmentWrite.recordDigest, taskBeforeRejectedDevelopmentWrite.recordDigest);
  assert.deepEqual(taskAfterRejectedDevelopmentWrite.record, taskBeforeRejectedDevelopmentWrite.record);
  const inspectEnvironment = runtime.inspectTaskEnvironment;
  const readEnvironmentCurrent = runtime.readTaskEnvironmentCurrent.bind(runtime);
  let environmentCurrentReads = 0;
  runtime.inspectTaskEnvironment = () => { throw new Error('Buildr Web Environment GET 不得执行 live inspect。'); };
  runtime.readTaskEnvironmentCurrent = (...args) => { environmentCurrentReads += 1; return readEnvironmentCurrent(...args); };
  response = await request(`${taskEndpoint}/environment`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-environment-result/v4'); assert.equal(response.body.status, 'unavailable'); assert.equal(response.body.source, 'current-machine'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(environmentCurrentReads, 2, 'Task Record Change projection 与 Environment GET 各复用一次 saved current，且都不得执行 live inspect');
  runtime.inspectTaskEnvironment = inspectEnvironment;
  response = await request(`${taskEndpoint}/environment?target=${encodeURIComponent(root)}`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/missing-task/environment`); assert.equal(response.status, 404); assert.equal(response.body.error.code, 'task_record_not_found');
  response = await request(`${taskEndpoint}/changes/demo/same-change`); assert.equal(response.status, 200); assert.equal(response.body.resolution.workingCopy.provenance, 'retained-active'); assert.equal(response.body.resolution.workingCopy.change.code, 'same-change');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '页面已更新' }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.title, '页面已更新');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '陈旧覆盖' }) });
  assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_conflict');

  response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'not-created', title: 'x', intent: 'x' }) }); assert.equal(response.status, 404);
  assert.throws(() => runtime.inspectTaskRecord(root, 'not-created'), (error) => error.code === 'task_record_not_found');
  response = await request(`${endpoint}?filter=active`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_forbidden');

  const latest = (await request(taskEndpoint)).body;
  response = await request(`${taskEndpoint}/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: latest.recordDigest, summary: '页面确认完成', noChange: false }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.status, 'completed');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: response.body.recordDigest, title: '不可重开' }) }); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_terminal');

  const other = path.join(base, 'other-workspace'); run(['init', '--target', other, '--name', 'other', '--description', 'other fixture', '--profile', 'team']);
  let registry = runtime.listRegisteredWorkspaces(); registry = runtime.registerLocalWorkspace({ rootPath: other, revision: registry.revision }); const otherId = registry.workspaces.find((item) => item.rootPath === other).workspace.id;
  response = await request(`${url}/api/v1/workspaces/${otherId}/tasks`); assert.deepEqual(response.body.tasks, []);
});
