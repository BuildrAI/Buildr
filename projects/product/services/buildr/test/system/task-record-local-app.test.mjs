import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
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

test('Local App 已解析 Workspace root 的 Task 读取不观察 Git', async (t) => {
  const { base, root } = fixture(t, 'task-local-app-no-git-read');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-no-git-read'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer = createRuntime();
  writer.createTaskRecord(root, { taskId: 'read-without-git', title: '只读无需 Git', intent: '验证 Local App read boundary', projects: [], services: [], changes: [] });

  const reader = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('Local App GET 不得调用 Git/worktree provenance'); } });
  const instance = createLocalWorkspaceServer(reader, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const response = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.tasks.map((item) => item.record.taskId), ['read-without-git']);
});

test('Local App 专业 Task read view 使用默认 bounded Worker executor', async (t) => {
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

test('Local App Task API 提供轻量查询与既有任务维护，不暴露创建入口', async (t) => {
  const { base, root } = fixture(t, 'task-local-app');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'app-parent', title: '页面协调任务', intent: '作为 Parent', projects: [], services: [], changes: [] });
  const created = runtime.createTaskRecord(root, { taskId: 'app-task', title: '页面任务', intent: '验证轻量读取 %_ literal', parentTaskId: 'app-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const staleDigest = created.recordDigest;
  let bulkStore = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const insertBulk = bulkStore.database.prepare('INSERT INTO tasks(task_id, schema_version, title, intent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  bulkStore.database.exec('BEGIN');
  for (let index = 0; index < 200; index += 1) insertBulk.run(`bulk-${String(index).padStart(3, '0')}`, 'buildr.task-record/v1', `批量任务 ${index}`, '固定查询次数夹具', 'active', '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z');
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
  const bulkView = runtime.queryTaskRecordViews(root); assert.equal(bulkView.tasks.length, 202); assert.equal(bulkView.totalTaskCount, 202); assert.equal(preparedStatements, 8, '列表 SQL 次数必须与 Task 数量无关');
  preparedStatements = 0; runtime.inspectTaskRecordView(root, 'app-task'); assert.equal(preparedStatements, 5, '详情轻量视图不得扫描或解析其他 Task');
  runtime.openWorkspaceStructuredStore = openStore;
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: '%_' }).tasks.map((item) => item.record.taskId), ['app-task'], 'SQL wildcard 必须按普通文本匹配');
  assert.deepEqual(runtime.queryTaskRecordViews(root, { q: "%' OR 1=1 --" }).tasks, [], 'query input 必须保持参数绑定');
  bulkStore = runtime.openWorkspaceStructuredStore(root, { writable: true }); bulkStore.database.prepare("DELETE FROM tasks WHERE task_id LIKE 'bulk-%'").run(); bulkStore.database.close();
  runtime.createTaskRecord(root, { taskId: 'app-retrospective', title: '已复盘任务', intent: '验证复盘筛选', projects: [], services: [], changes: [] });
  const retrospectiveTask = runtime.inspectTaskRecord(root, 'app-retrospective');
  runtime.completeTaskRecord(root, 'app-retrospective', { expectedRecordDigest: retrospectiveTask.recordDigest, summary: '复盘筛选夹具', noChange: false });
  runtime.recordTaskRetrospective(root, 'app-retrospective', { reportMarkdown: '# 复盘\n\n列表筛选验证。' });
  const readExecutor = {
    run: (operation, input) => Promise.resolve(runtime[{ development: 'inspectTaskDevelopmentView', reviews: 'inspectTaskReviewView', verification: 'inspectTaskVerificationView' }[operation]](input.targetRoot, input.taskId)),
    close: async () => {},
  };
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root, readExecutor });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options); return { status: response.status, headers: response.headers, body: await response.json() };
  };

  let response = await request(endpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-list/v3'); assert.equal(response.body.totalTaskCount, 3); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task', 'app-retrospective']));
  const parentReadModel = response.body.tasks.find((item) => item.record.taskId === 'app-parent'); assert.deepEqual(parentReadModel.record.childTaskIds, ['app-task']); assert.equal(parentReadModel.taskRelations.children[0].status, 'active');
  assert.equal(parentReadModel.childTaskCount, 1);
  response = await request(`${endpoint}?q=%E8%BD%BB%E9%87%8F&project=demo&service=demo%2Fapi&status=active&hasChildren=no&hasRetrospective=no`);
  assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-task']);
  assert.deepEqual(response.body.filters, { q: '轻量', project: 'demo', service: 'demo/api', status: 'active', hasChildren: 'no', hasRetrospective: 'no' });
  assert.deepEqual(response.body.filterOptions, { projects: ['demo'], services: ['demo/api'] });
  response = await request(`${endpoint}?hasChildren=yes`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-parent']);
  response = await request(`${endpoint}?hasRetrospective=yes`); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?hasRetrospective=no`); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task']));
  response = await request(`${endpoint}?hasRetrospective=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?status=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?q=a&q=b`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_invalid');
  const taskEndpoint = `${endpoint}/app-task`;
  response = await request(taskEndpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-view/v1'); assert.deepEqual(response.body.storedChangeReferences, [{ project: 'demo', change: 'same-change' }]); assert.equal('changeReferences' in response.body, false);
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
  runtime.inspectTaskTerminalDelivery = () => { throw new Error('Local App Tab 不得调用完整 terminal 聚合器。'); };
  response = await request(`${taskEndpoint}/reviews`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-review-operation-result/v1'); assert.equal(response.body.terminal.status, 'active');
  response = await request(`${taskEndpoint}/verification`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-verification-operation-result/v1'); assert.equal(response.body.terminal.status, 'active');
  assert.equal(developmentReads, 1, 'Reviews/Verification GET 不得读取 Development');
  assert.equal(reviewReads, 1, 'Reviews GET 应只读取一次 Review');
  assert.equal(verificationReads, 1, 'Verification GET 应只读取一次 Verification');
  response = await request(`${taskEndpoint}/development?target=${encodeURIComponent(root)}`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/missing-task/development`); assert.equal(response.status, 404); assert.equal(response.body.error.code, 'task_record_not_found');
  const taskBeforeRejectedDevelopmentWrite = runtime.inspectTaskRecord(root, 'app-task');
  response = await request(`${taskEndpoint}/development`, { method: 'POST', headers: writeHeaders, body: '{}' }); assert.equal(response.status, 404);
  const taskAfterRejectedDevelopmentWrite = runtime.inspectTaskRecord(root, 'app-task');
  assert.equal(taskAfterRejectedDevelopmentWrite.recordDigest, taskBeforeRejectedDevelopmentWrite.recordDigest);
  assert.deepEqual(taskAfterRejectedDevelopmentWrite.record, taskBeforeRejectedDevelopmentWrite.record);
  response = await request(`${taskEndpoint}/environment`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-environment-result/v1'); assert.equal(response.body.status, 'unavailable'); assert.equal(response.body.source, 'current-machine'); assert.equal(response.headers.get('cache-control'), 'no-store');
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
