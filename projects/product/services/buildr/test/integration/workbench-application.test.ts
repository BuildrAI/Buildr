import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { taskRecordFixture, runBuildrJson } from '../helpers/task-record-system-fixture.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { WORKBENCH_HTTP_VALIDATORS, WORKBENCH_HTTP_SCHEMAS } from '../../src/modules/workbench/interfaces/http/workbench-http-schema.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());
const record = (runtime: any, root: string, taskId: string, status = 'active', projects = ['demo']) => runtime.createTask(root, { taskId, title: taskId, intent: '可接续的真实工作', status, projects, services: [], changes: [] });
const conforms = (name: string, value: any) => { const result = WORKBENCH_HTTP_VALIDATORS.validate(WORKBENCH_HTTP_SCHEMAS[name].$id, value); assert.equal(result.valid, true, JSON.stringify(result.errors)); };

test('工作摘要独立维护、响应可回读、CAS拒绝覆盖且不改变任务四态', (t) => {
  const { root } = taskRecordFixture(t, 'work-context');
  const runtime = createRuntime();
  const task = record(runtime, root, 'context-task');
  assert.equal(runtime.inspectTaskWorkContext(root, 'context-task').context, null);
  let value = runtime.recordTaskWorkContext(root, 'context-task', { expectedContextDigest: 'absent', progress: '已整理方案', nextStep: '确认范围', attention: { kind: 'decision', reason: '需要确认范围' } });
  conforms('TaskWorkContextResponse', value);
  const initial = value;
  assert.equal(runtime.inspectWorkbench(root).attention.total, 1);
  value = runtime.respondTaskWorkContext(root, 'context-task', { expectedContextDigest: value.contextDigest, attentionId: value.context.attention.id, response: '先实现阅读能力' });
  assert.equal(value.context.attention.state, 'resolved');
  assert.equal(runtime.inspectWorkbench(root).attention.total, 0);
  assert.throws(() => runtime.recordTaskWorkContext(root, 'context-task', { expectedContextDigest: initial.contextDigest, progress: '旧摘要', nextStep: '旧下一步' }), (error: any) => error.code === 'task_work_context_conflict');
  assert.throws(() => runtime.respondTaskWorkContext(root, 'context-task', { expectedContextDigest: value.contextDigest, attentionId: initial.context.attention.id, response: '重复答复' }), (error: any) => error.code === 'task_work_context_attention_conflict');
  const response = value.context.attention.response;
  value = runtime.recordTaskWorkContext(root, 'context-task', { expectedContextDigest: value.contextDigest, progress: '已按意见调整', nextStep: '验证阅读路径' });
  assert.deepEqual(value.context.attention.response, response);
  value = runtime.recordTaskWorkContext(root, 'context-task', { expectedContextDigest: value.contextDigest, progress: '已完成阅读路径', nextStep: '查看成果', attention: { kind: 'acceptance', reason: '请查看实际成果' } });
  assert.notEqual(value.context.attention.id, initial.context.attention.id);
  assert.equal(value.context.attention.response, null);
  assert.equal(runtime.inspectTask(root, 'context-task').recordDigest, task.recordDigest);
  assert.equal(runtime.inspectTask(root, 'context-task').record.status, 'active');
  const bulk = runtime.inspectTaskWorkContexts(root, ['context-task', 'context-task']);
  conforms('TaskWorkContextsResponse', bulk);
  assert.equal(bulk.items.length, 1);
  assert.throws(() => runtime.inspectTaskWorkContexts(root, Array(101).fill('context-task')));
});

test('逐项偏好幂等与范围隔离，拒绝外部和逃逸链接，最近访问只留30项', (t) => {
  const { root } = taskRecordFixture(t, 'workbench-prefs');
  const other = taskRecordFixture(t, 'workbench-other').root;
  const runtime = createRuntime();
  const task = record(runtime, root, 'planned-task', 'todo');
  const workspaceId = runtime.getWorkspace(root).workspace.id;
  const endpoint = `/workspaces/${workspaceId}`;
  runtime.putWorkbenchPreference(root, 'pinned-task', 'planned-task', {});
  runtime.putWorkbenchPreference(root, 'planned-task', 'planned-task', {});
  runtime.putWorkbenchPreference(root, 'followed-project', 'demo', {});
  const saved = runtime.putWorkbenchPreference(root, 'saved-resource', 'demo', { label: 'Demo', href: `${endpoint}/projects/demo` });
  assert.deepEqual(runtime.putWorkbenchPreference(root, 'saved-resource', 'demo', { label: 'Demo', href: `${endpoint}/projects/demo` }), saved);
  assert.equal(saved.items.length, 4);
  assert.equal(runtime.inspectWorkbenchPreferences(other).items.length, 0);
  for (const href of ['https://example.com', '/etc/passwd', `${endpoint}/../other`, `${endpoint}/%2e%2e/tasks/x`, `${endpoint}/projects/demo?root=/etc`, '/workspaces/123e4567-e89b-42d3-a456-426614174999/projects/demo']) {
    assert.throws(() => runtime.putWorkbenchPreference(root, 'saved-resource', 'bad', { label: 'bad', href }), (error: any) => error.code === 'workbench_resource_forbidden');
  }
  for (let index = 0; index < 35; index += 1) runtime.recordWorkbenchVisit(root, { key: `visit-${index}`, label: `页面 ${index}`, href: `${endpoint}/tasks/planned-task` });
  const recent = runtime.inspectWorkbenchPreferences(root).items.filter((item: any) => item.kind === 'recent-resource');
  assert.equal(recent.length, 30);
  assert.equal(recent[0].key, 'visit-34');
  runtime.removeWorkbenchPreference(root, 'pinned-task', 'planned-task');
  runtime.removeWorkbenchPreference(root, 'pinned-task', 'planned-task');
  assert.equal(runtime.inspectWorkbenchPreferences(root).items.some((item: any) => item.kind === 'planned-task'), true);
  assert.equal(runtime.inspectTask(root, 'planned-task').recordDigest, task.recordDigest);
});

test('文章收藏保留项目身份和旧Product地址，并拒绝越界资源', (t) => {
  const { root } = taskRecordFixture(t, 'workbench-article-refs');
  const runtime = createRuntime();
  const workspaceId = runtime.getWorkspace(root).workspace.id;
  const endpoint = `/workspaces/${workspaceId}`;
  runtime.putWorkbenchPreference(root, 'saved-resource', 'article:shared', { label: '旧文章', href: `${endpoint}/articles/shared` });
  runtime.putWorkbenchPreference(root, 'saved-resource', 'article:demo:shared', { label: '演示项目文章', href: `${endpoint}/articles/demo/shared` });
  runtime.putWorkbenchPreference(root, 'saved-resource', 'article:other:shared', { label: '另一项目文章', href: `${endpoint}/articles/other/shared` });
  const resources = runtime.inspectWorkbenchPreferences(root).items.filter((item: any) => item.kind === 'saved-resource');
  assert.equal(resources.length, 3);
  assert.equal(new Set(resources.map((item: any) => item.href)).size, 3);
  for (const href of [`${endpoint}/articles/demo/shared/edit`, `${endpoint}/articles/demo/%2e%2e`, `${endpoint}/articles/demo/shared?path=/etc`, '/workspaces/another/articles/demo/shared']) {
    assert.throws(() => runtime.putWorkbenchPreference(root, 'saved-resource', 'bad-article', { label: '拒绝', href }), (error: any) => error.code === 'workbench_resource_forbidden');
  }
});

test('首批外置顶和事项按身份查得，跨项目任务不重复，日报局部错误', (t) => {
  const { root } = taskRecordFixture(t, 'workbench-overview');
  const runtime = createRuntime();
  record(runtime, root, 'old-important', 'active', ['demo', 'other']);
  record(runtime, root, 'next-important', 'todo');
  for (let index = 0; index < 16; index += 1) record(runtime, root, `newer-${index}`);
  assert.equal(runtime.queryTasks(root, { status: 'active', pageSize: '12' }).tasks.some((item: any) => item.record.taskId === 'old-important'), false);
  runtime.putWorkbenchPreference(root, 'pinned-task', 'old-important');
  runtime.putWorkbenchPreference(root, 'planned-task', 'next-important');
  runtime.recordTaskWorkContext(root, 'old-important', { expectedContextDigest: 'absent', progress: '等待明确判断', nextStep: '处理意见', attention: { kind: 'question', reason: '选择实施范围' } });
  runtime.recordProjectDailyProgress(root, { project: 'demo', date: '2026-09-18', payload: { daySummary: { added: '阅读入口', updated: '相关关系', deleted: '无', drawbacks: '仅本地已提交内容，未覆盖远端' }, commits: [], files: [] } });
  const broken = path.join(root, '.buildr/daily-progress/other/2026-09-19.yml');
  fs.mkdirSync(path.dirname(broken), { recursive: true }); fs.writeFileSync(broken, 'invalid: [');
  const overview = runtime.inspectWorkbench(root);
  conforms('WorkbenchResponse', overview);
  assert.equal(overview.active.items[0].task.record.taskId, 'old-important');
  assert.equal(overview.active.total, 17);
  assert.equal(overview.active.items.length, 12);
  assert.equal(overview.active.hasMore, true);
  assert.equal(overview.attention.items[0].task.record.taskId, 'old-important');
  assert.equal(overview.planned.items[0].task.record.taskId, 'next-important');
  assert.equal(overview.dailyProgress.items[0].date, '2026-09-18');
  assert.equal(overview.dailyProgress.items[0].coverage, '仅本地已提交内容，未覆盖远端');
  assert.equal(overview.dailyProgress.diagnostics[0].project, 'other');
  assert.equal(runtime.inspectWorkbench(root, { project: 'other' }).active.items.filter((item: any) => item.task.record.taskId === 'old-important').length, 1);
  const requested = runtime.inspectWorkbench(root, { date: '2026-09-17' });
  assert.equal(requested.dailyProgress.items.length, 0);
  assert.deepEqual(requested.dailyProgress.missingProjects, ['demo', 'other']);
});

test('有效0032数据库只读可用且字节与迁移台账不变，首次明确写入升级', (t) => {
  const { root } = taskRecordFixture(t, 'workbench-old-sqlite');
  const file = path.join(root, '.buildr/local/workspace.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  for (const migration of loadWorkspaceSqliteMigrations().filter((item: any) => item.version <= 32)) applyWorkspaceSqliteMigration(db, migration);
  db.prepare("INSERT INTO tasks(task_id,title,intent,status,created_at,updated_at) VALUES ('legacy','旧任务','继续已有工作','active',?,?)").run('2026-09-18T12:00:00.000Z', '2026-09-18T12:00:00.000Z');
  db.close();
  const before = fs.readFileSync(file);
  const runtime = createRuntime();
  assert.equal(runtime.inspectTask(root, 'legacy').record.title, '旧任务');
  assert.equal(runtime.inspectTaskWorkContext(root, 'legacy').context, null);
  assert.equal(runtime.inspectWorkbench(root).active.items[0].task.record.taskId, 'legacy');
  assert.deepEqual(fs.readFileSync(file), before);
  const read = new DatabaseSync(file, { readOnly: true });
  assert.equal(read.prepare('SELECT max(version) AS v FROM schema_migrations').get()?.v, 32); read.close();
  runtime.putWorkbenchPreference(root, 'pinned-task', 'legacy');
  const upgraded = new DatabaseSync(file, { readOnly: true });
  assert.equal(upgraded.prepare('SELECT max(version) AS v FROM schema_migrations').get()?.v, 33); upgraded.close();
});

test('命令行与应用读取相同摘要和偏好', (t) => {
  const { root } = taskRecordFixture(t, 'workbench-cli');
  const runtime = createRuntime();
  record(runtime, root, 'cli-task');
  const value = runBuildrJson(['task', 'work-context', 'record', 'cli-task', '--target', root, '--expected-current', 'absent', '--progress', '已整理事实', '--next-step', '确认目标', '--attention-kind', 'decision', '--attention-reason', '请确认目标']);
  assert.deepEqual(runtime.inspectTaskWorkContext(root, 'cli-task'), value);
  const response = runBuildrJson(['task', 'work-context', 'respond', 'cli-task', '--target', root, '--expected-current', value.contextDigest, '--attention', value.context.attention.id, '--response', '按方案继续']);
  assert.equal(response.context.attention.response.text, '按方案继续');
  runBuildrJson(['workbench', 'put', '--target', root, '--kind', 'pinned-task', '--key', 'cli-task']);
  const overview = runBuildrJson(['workbench', 'inspect', '--target', root]);
  conforms('WorkbenchResponse', overview);
  assert.equal(overview.preferences.items[0].key, 'cli-task');
});
