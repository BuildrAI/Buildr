import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import {
  runBuildr as run,
  runBuildrJson as json,
  taskRecordFixture as fixture,
} from '../helpers/task-record-system-fixture.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('Task Record target 必须是 canonical Workspace，不能是 linked worktree checkout', (t: any) => {
  const { base, root }: any = fixture(t, 'task-canonical');
  run(['task', 'create', 'canonical-task', '--title', 'Canonical', '--intent', '写入 retained root', '--target', root]);
  assert.equal(spawnSync('git', ['init', '--initial-branch=main'], { cwd: root, encoding: 'utf8' }).status, 0);
  spawnSync('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root }); spawnSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root }); assert.equal(spawnSync('git', ['commit', '-m', 'fixture'], { cwd: root, encoding: 'utf8' }).status, 0);
  const worktree: any = path.join(base, 'linked-task');
  const added: any = spawnSync('git', ['worktree', 'add', '-b', 'codex/linked-task', worktree, 'HEAD'], { cwd: root, encoding: 'utf8' }); assert.equal(added.status, 0, added.stderr);
  const blocked: any = json(['task', 'create', 'linked-task', '--title', '错误目标', '--intent', '不得写入 worktree', '--target', worktree], 1);
  assert.equal(blocked.diagnostic.code, 'task_record_workspace_not_canonical'); assert.equal(fs.existsSync(path.join(worktree, '.buildr', 'tasks', 'linked-task')), false);
  const standalone: any = path.join(base, '.worktrees', 'standalone-workspace');
  run(['init', '--target', standalone, '--name', 'standalone', '--description', 'non-Git canonical workspace']);
  assert.equal(json(['task', 'create', 'standalone-task', '--title', '独立 Workspace', '--intent', '目录名不决定 authority', '--target', standalone]).status, 'created');
  const uninitialized: any = json(['task', 'create', 'missing-root', '--title', '错误目标', '--intent', '未初始化', '--target', path.join(root, 'not-a-workspace')], 1);
  assert.equal(uninitialized.diagnostic.code, 'task_record_workspace_invalid');
});

test('Buildr Web 已解析 Workspace root 的 Task 读取不观察 Git', async (t: any) => {
  const { base, root }: any = fixture(t, 'task-local-app-no-git-read');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-no-git-read'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const writer: any = createRuntime();
  writer.createTask(root, { taskId: 'read-without-git', title: '只读无需 Git', intent: '验证 Buildr Web read boundary', projects: [], services: [], changes: [] });

  const reader: any = createRuntime();
  registerWorkspaceSqlite(reader, { observeCheckout: () => { throw new Error('Buildr Web GET 不得调用 Git/worktree provenance'); } });
  const instance: any = createLocalWorkspaceServer(reader, { targetRoot: root });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId }: any = await instance.ready;
  const response: any = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`);
  assert.equal(response.status, 200);
  const body: any = await response.json();
  assert.deepEqual(body.tasks.map((item: any) => item.record.taskId), ['read-without-git']);
});

test('Buildr Web Task API 提供轻量查询与既有任务维护，不暴露创建入口', async (t: any) => {
  const { base, root }: any = fixture(t, 'task-local-app');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  runtime.createTask(root, { taskId: 'app-parent', title: '页面协调任务', intent: '作为 Parent', projects: [], services: [], changes: [] });
  const created: any = runtime.createTask(root, { taskId: 'app-task', title: '页面任务', intent: '验证轻量读取 %_ literal', parentTaskId: 'app-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const staleDigest: any = created.recordDigest;
  let bulkStore: any = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const insertBulk: any = bulkStore.database.prepare('INSERT INTO tasks(task_id, title, intent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  bulkStore.database.exec('BEGIN');
  for (let index: any = 0; index < 200; index += 1) insertBulk.run(`bulk-${String(index).padStart(3, '0')}`, `批量任务 ${index}`, '固定查询次数夹具', 'active', '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z');
  bulkStore.database.exec('COMMIT'); bulkStore.database.close();
  const openStore: any = runtime.openWorkspaceStructuredStore.bind(runtime);
  let preparedStatements: any = 0;
  runtime.openWorkspaceStructuredStore = (...args: any[]) => {
    const opened: any = openStore(...args);
    if (!opened.database) return opened;
    return { ...opened, database: new Proxy(opened.database, { get(database: any, field: any): any  {
      if (field === 'prepare') return (...input: any[]) => { preparedStatements += 1; return database.prepare(...input); };
      const value: any = Reflect.get(database, field); return typeof value === 'function' ? value.bind(database) : value;
    } }) };
  };
  const bulkView: any = runtime.queryTasks(root); assert.equal(bulkView.tasks.length, 202); assert.equal(bulkView.totalTaskCount, 202); assert.equal(preparedStatements, 8, '列表 SQL 次数必须与 Task 数量无关');
  preparedStatements = 0; runtime.inspectTaskView(root, 'app-task'); assert.equal(preparedStatements, 5, '详情轻量视图不得扫描或解析其他 Task');
  runtime.openWorkspaceStructuredStore = openStore;
  assert.deepEqual(runtime.queryTasks(root, { q: '%_' }).tasks.map((item: any) => item.record.taskId), ['app-task'], 'SQL wildcard 必须按普通文本匹配');
  assert.deepEqual(runtime.queryTasks(root, { q: 'app-ta' }).tasks.map((item: any) => item.record.taskId), ['app-task'], 'q 必须按标题、意图或任务编号做子串匹配');
  assert.deepEqual(runtime.queryTasks(root, { q: 'APP-TASK' }).tasks.map((item: any) => item.record.taskId), ['app-task'], '任务编号必须不区分大小写');
  assert.deepEqual(runtime.queryTasks(root, { q: 'app task' }).tasks.map((item: any) => item.record.taskId), ['app-task'], '任务编号必须把空格与连字符当作模糊分隔');
  assert.deepEqual(runtime.queryTasks(root, { q: "%' OR 1=1 --" }).tasks, [], 'query input 必须保持参数绑定');
  bulkStore = runtime.openWorkspaceStructuredStore(root, { writable: true }); bulkStore.database.prepare("DELETE FROM tasks WHERE task_id LIKE 'bulk-%'").run(); bulkStore.database.close();
  runtime.createTask(root, { taskId: 'app-retrospective', title: '已复盘任务', intent: '验证复盘筛选', projects: [], services: [], changes: [] });
  const retrospectiveTask: any = runtime.inspectTask(root, 'app-retrospective');
  const retrospectiveCompleted: any = runtime.completeTask(root, 'app-retrospective', { expectedRecordDigest: retrospectiveTask.recordDigest, summary: '复盘筛选夹具' });
  const retrospectivePath: any = path.join(root, '.buildr', 'local', 'task-retrospectives', 'app-retrospective.md');
  fs.mkdirSync(path.dirname(retrospectivePath), { recursive: true });
  fs.writeFileSync(retrospectivePath, '# 复盘\n\n列表筛选验证。\n');
  const retrospectiveDocument: any = runtime.inspectTaskRetrospectiveDocument(root, 'app-retrospective');
  const retrospectiveRegistered: any = runtime.updateTask(root, 'app-retrospective', {
    expectedRecordDigest: retrospectiveCompleted.recordDigest,
    retrospectiveState: 'pending-decision',
    retrospectiveDocumentDigest: retrospectiveDocument.actualDigest,
  });
  const readExecutor: any = {
    run: (operation: any, input: any) => Promise.resolve(runtime[{ reviews: 'inspectTaskReview', verification: 'inspectTaskVerificationView', coordination: 'inspectParentCoordination' }[operation]](input.targetRoot, input.taskId)),
    close: async () => {},
  };
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root, readExecutor });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken }: any = await instance.ready;
  const endpoint: any = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders: any = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request: any = async (resource: any, options: any = {}) => {
    const headers: any = new Headers(options.headers);
    headers.set('connection', 'close');
    const method: any = options.method || 'GET';
    try {
      const response: any = await fetch(resource, { ...options, headers });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } catch (error: any) {
      throw new Error(`Buildr Web request failed: ${method} ${resource}: ${error.message}`, { cause: error });
    }
  };

  let response: any = await request(endpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-list/v5'); assert.equal(response.body.totalTaskCount, 3); assert.deepEqual(new Set(response.body.tasks.map((item: any) => item.record.taskId)), new Set(['app-parent', 'app-task', 'app-retrospective']));
  const parentReadModel: any = response.body.tasks.find((item: any) => item.record.taskId === 'app-parent'); assert.equal(parentReadModel.taskRelations.children[0].taskId, 'app-task'); assert.equal(parentReadModel.taskRelations.children[0].status, 'active');
  response = await request(`${endpoint}?q=%E8%BD%BB%E9%87%8F&project=demo&service=demo%2Fapi&status=active&hasChildren=no&retrospectiveState=missing`);
  assert.deepEqual(response.body.tasks.map((item: any) => item.record.taskId), ['app-task']);
  assert.deepEqual(response.body.filters, { q: '轻量', project: 'demo', service: 'demo/api', status: 'active', hasChildren: 'no', retrospectiveState: 'missing' });
  assert.deepEqual(response.body.filterOptions, { projects: ['demo'], services: ['demo/api'] });
  response = await request(`${endpoint}?hasChildren=yes`); assert.deepEqual(response.body.tasks.map((item: any) => item.record.taskId), ['app-parent']);
  response = await request(`${endpoint}?retrospectiveState=pending-decision`); assert.deepEqual(response.body.tasks.map((item: any) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?retrospectiveState=missing`); assert.deepEqual(new Set(response.body.tasks.map((item: any) => item.record.taskId)), new Set(['app-parent', 'app-task']));
  response = await request(`${endpoint}?hasRetrospective=yes`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_forbidden');
  response = await request(`${endpoint}?retrospectiveState=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?status=invalid`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_filter_invalid');
  response = await request(`${endpoint}?q=a&q=b`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_invalid');
  const taskEndpoint: any = `${endpoint}/app-task`;
  response = await request(taskEndpoint); assert.equal(response.body.schemaVersion, 'buildr.task-record-view/v3'); assert.deepEqual(response.body.record.changes, [{ project: 'demo', change: 'same-change' }]); assert.equal('storedChangeReferences' in response.body, false);
  const coordinationEndpoint: any = `${endpoint}/app-parent/coordination`;
  response = await request(coordinationEndpoint); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.parent-coordination-result/v4'); assert.equal(response.body.mode, 'parent');
  response = await request(coordinationEndpoint, { method: 'PATCH', headers: writeHeaders, body: '{}' }); assert.equal(response.status, 404);
  response = await request(`${taskEndpoint}/development`); assert.equal(response.status, 404, '退役研发接口不提供兼容响应');
  const inspectReview: any = runtime.inspectTaskReview.bind(runtime);
  const inspectVerification: any = runtime.inspectTaskVerificationView.bind(runtime);
  let reviewReads: any = 0;
  let verificationReads: any = 0;
  runtime.inspectTaskReview = (...args: any[]) => { reviewReads += 1; return inspectReview(...args); };
  runtime.inspectTaskVerificationView = (...args: any[]) => { verificationReads += 1; return inspectVerification(...args); };
  response = await request(`${taskEndpoint}/reviews`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-review-operation-result/v2'); assert.equal('terminal' in response.body, false);
  response = await request(`${taskEndpoint}/verification`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-verification-operation-result/v1'); assert.equal('terminal' in response.body, false);
  response = await request(`${url}/api/v1/workspaces/${initialWorkspaceId}/prompts/task-verification`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'app-task' }) }); assert.equal(response.status, 404, 'Buildr Web不得暴露Task Verification后端prompt');
  assert.equal(reviewReads, 1, 'Reviews GET 应只读取一次 Review');
  assert.equal(verificationReads, 1, 'Verification GET 应只读取一次 Verification');
  const concurrent: any = await Promise.all([request(`${taskEndpoint}/reviews`), request(`${taskEndpoint}/verification`)]);
  assert.deepEqual(concurrent.map((item: any) => item.status), [200, 200]);
  assert.equal(reviewReads, 2, '并发读取Review只调用所属Application');
  assert.equal(verificationReads, 2, '并发读取Verification只调用所属Application');
  response = await request(`${taskEndpoint}/overview`); assert.equal(response.status, 404);
  const retrospectiveEndpoint: any = `${endpoint}/app-retrospective/retrospective-document`;
  const recordBeforeRead: any = runtime.inspectTask(root, 'app-retrospective');
  response = await request(retrospectiveEndpoint); assert.equal(response.status, 200); assert.equal(response.body.content, '# 复盘\n\n列表筛选验证。\n'); assert.equal(response.body.effectiveState, 'pending-decision');
  assert.equal(runtime.inspectTask(root, 'app-retrospective').recordDigest, recordBeforeRead.recordDigest, '查看本地复盘文档不得写入 Task Record');
  response = await request(`${endpoint}/app-retrospective/retrospective`); assert.equal(response.status, 404, '旧复盘接口不提供兼容响应');
  response = await request(`${endpoint}/app-retrospective`, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: retrospectiveRegistered.recordDigest, retrospectiveState: 'decided', retrospectiveDocumentDigest: retrospectiveDocument.actualDigest }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.retrospective.state, 'decided');
  response = await request(`${endpoint}?retrospectiveState=decided`); assert.deepEqual(response.body.tasks.map((item: any) => item.record.taskId), ['app-retrospective']);
  response = await request(`${endpoint}?retrospectiveState=pending-decision`); assert.deepEqual(response.body.tasks, []);
  const taskBeforeRejectedDevelopmentWrite: any = runtime.inspectTask(root, 'app-task');
  response = await request(`${taskEndpoint}/development`, { method: 'POST', headers: writeHeaders, body: '{}' }); assert.equal(response.status, 404);
  const taskAfterRejectedDevelopmentWrite: any = runtime.inspectTask(root, 'app-task');
  assert.equal(taskAfterRejectedDevelopmentWrite.recordDigest, taskBeforeRejectedDevelopmentWrite.recordDigest);
  assert.deepEqual(taskAfterRejectedDevelopmentWrite.record, taskBeforeRejectedDevelopmentWrite.record);
  response = await request(`${taskEndpoint}/environment`); assert.equal(response.status, 404, '已删除的Environment接口不保留兼容路由');
  response = await request(`${taskEndpoint}/changes/demo/same-change`); assert.equal(response.status, 200); assert.equal(response.body.resolution.workingCopy.provenance, 'retained-active'); assert.equal(response.body.resolution.workingCopy.change.code, 'same-change');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '页面已更新' }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.title, '页面已更新');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '陈旧覆盖' }) });
  assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_conflict');

  response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'not-created', title: 'x', intent: 'x' }) }); assert.equal(response.status, 404);
  assert.throws(() => runtime.inspectTask(root, 'not-created'), (error: any) => error.code === 'task_record_not_found');
  response = await request(`${endpoint}?filter=active`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_forbidden');

  const latest: any = (await request(taskEndpoint)).body;
  response = await request(`${taskEndpoint}/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: latest.recordDigest, summary: '页面确认完成' }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.status, 'completed');
  const completedSnapshot: any = response.body;
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: completedSnapshot.recordDigest, title: '缺少更正原因' }) }); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_record_field_invalid');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: completedSnapshot.recordDigest, status: 'active', reason: '用户更正阶段完成为整体进行中', intent: '继续整体目标' }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.status, 'active'); assert.equal(response.body.record.result, null);
  assert.equal(response.body.record.resultHistory[0].result.summary, '页面确认完成');
  response = await request(taskEndpoint); assert.equal(response.body.record.resultHistory[0].reason, '用户更正阶段完成为整体进行中');

  const other: any = path.join(base, 'other-workspace'); run(['init', '--target', other, '--name', 'other', '--description', 'other fixture', '--profile', 'team']);
  let registry: any = runtime.listRegisteredWorkspaces(); registry = runtime.registerLocalWorkspace({ rootPath: other, revision: registry.revision }); const otherId: any = registry.workspaces.find((item: any) => item.rootPath === other).workspace.id;
  response = await request(`${url}/api/v1/workspaces/${otherId}/tasks`); assert.deepEqual(response.body.tasks, []);
});
