import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { taskRecordFixture, runBuildrJson } from '../helpers/task-record-system-fixture.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { TASK_BRIEF_MAX_BYTES, taskContentDigest } from '../../src/modules/task/domain/task.ts';
import { applyWorkspaceSqliteMigration, loadWorkspaceSqliteMigrations, registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { prepareTaskPreviewStructuredStore } from '../../src/web/application/instance-lifecycle.ts';
import type { PreviewOwner } from '../../src/web/application/preview-lifecycle.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());
const input = (taskId: string, brief: string | null = null) => ({ taskId, title: '独立任务说明', intent: '验证记录正文', brief, projects: [], services: [], changes: [] });

test('任务正文原样保存、空白归空，非法输入与陈旧写入不改变当前记录', (t) => {
  const { root } = taskRecordFixture(t, 'task-brief-cas');
  const runtime = createRuntime();
  const markdown = '  # 目标\r\n\r\n正文末尾空格  \r\n';
  const created = runtime.createTask(root, input('brief-cas', markdown));
  assert.equal(created.record.schemaVersion, 'buildr.task-record/v4');
  assert.equal(created.record.brief, markdown);
  assert.equal(runtime.inspectTask(root, 'brief-cas').record.brief, markdown);
  const updated = runtime.updateTask(root, 'brief-cas', { expectedRecordDigest: created.recordDigest, brief: '# 新正文\n' });
  assert.notEqual(updated.recordDigest, created.recordDigest);
  assert.throws(() => runtime.updateTask(root, 'brief-cas', { expectedRecordDigest: created.recordDigest, brief: '# 陈旧正文' }), { code: 'task_record_conflict' });
  for (const brief of [42, String.fromCharCode(0xd800), '字'.repeat(Math.floor(TASK_BRIEF_MAX_BYTES / 3) + 1)]) {
    assert.throws(() => runtime.updateTask(root, 'brief-cas', { expectedRecordDigest: updated.recordDigest, brief }), (error: any) => ['task_record_field_invalid', 'task_record_brief_size_invalid'].includes(error.code));
    assert.equal(runtime.inspectTask(root, 'brief-cas').recordDigest, updated.recordDigest);
  }
  const cleared = runtime.updateTask(root, 'brief-cas', { expectedRecordDigest: updated.recordDigest, brief: ' \n\t' });
  assert.equal(cleared.record.brief, null);
  assert.equal(runtime.createTask(root, input('brief-todo', null)).record.brief, null);
});

test('列表不读取正文或历史载荷，记录版本与详情相同并覆盖历史更正', (t) => {
  const { root } = taskRecordFixture(t, 'task-brief-summary');
  const runtime = createRuntime();
  const created = runtime.createTask(root, input('brief-summary', '# 完整目标\n'.repeat(10_000)));
  const completed = runtime.completeTask(root, 'brief-summary', { expectedRecordDigest: created.recordDigest, summary: '已完成' });
  const corrected = runtime.updateTask(root, 'brief-summary', { expectedRecordDigest: completed.recordDigest, brief: '# 更正后的目标\n', reason: '用户更正目标表述' });
  assert.equal(corrected.record.resultHistory[0].brief, created.record.brief);
  assert.throws(() => runtime.updateTask(root, 'brief-summary', { expectedRecordDigest: corrected.recordDigest, brief: '# 缺少原因' }), { code: 'task_record_field_invalid' });
  const original = DatabaseSync.prototype.prepare;
  const statements: string[] = [];
  let listed: any;
  try {
    DatabaseSync.prototype.prepare = function(sql: string) { statements.push(sql); return original.call(this, sql); };
    listed = runtime.queryTasks(root, { pageSize: '50' }).tasks.find((item: any) => item.record.taskId === 'brief-summary');
  } finally { DatabaseSync.prototype.prepare = original; }
  assert.equal(statements.some(sql => /SELECT\s+\*\s+FROM\s+tasks|SELECT[^;]*\b(?:brief|result_history_json)\b[^;]*FROM\s+tasks/iu.test(sql)), false, statements.join('\n'));
  assert.ok(listed);
  assert.equal('brief' in listed.record, false);
  assert.equal('resultHistory' in listed.record, false);
  assert.equal(listed.recordDigest, corrected.recordDigest);
  assert.equal(listed.recordDigest, runtime.inspectTask(root, 'brief-summary').recordDigest);
  const history = structuredClone(corrected.record.resultHistory);
  history[0].reason = '保留当前时间但修正历史说明';
  const database = new DatabaseSync(path.join(root, '.buildr', 'local', 'workspace.sqlite'));
  try {
    const serialized = JSON.stringify(history);
    database.prepare('UPDATE tasks SET result_history_json = ?, result_history_digest = ? WHERE task_id = ?').run(serialized, taskContentDigest(serialized), 'brief-summary');
  } finally { database.close(); }
  const historyCorrected = runtime.inspectTask(root, 'brief-summary');
  assert.equal(historyCorrected.record.updatedAt, corrected.record.updatedAt);
  assert.notEqual(historyCorrected.recordDigest, corrected.recordDigest, '历史语义独立进入记录版本');
  assert.equal(runtime.queryTasks(root).tasks.find((item: any) => item.record.taskId === 'brief-summary').recordDigest, historyCorrected.recordDigest);
});

test('正文变化使组合任务旧验收观察失效，完成父任务不能修改说明后维持已完成', (t) => {
  const { root } = taskRecordFixture(t, 'task-brief-parent');
  const runtime = createRuntime();
  runtime.createTask(root, { ...input('brief-parent', '# 整体目标'), isParent: true });
  const child = runtime.createTask(root, { ...input('brief-child', '# 子目标'), parentTaskId: 'brief-parent' });
  const done = runtime.completeTask(root, 'brief-child', { expectedRecordDigest: child.recordDigest, summary: '子目标完成' });
  const observed = runtime.inspectParentCoordination(root, 'brief-parent');
  assert.equal(observed.recordDigest, runtime.inspectTask(root, 'brief-parent').recordDigest);
  runtime.updateTask(root, 'brief-child', { expectedRecordDigest: done.recordDigest, brief: '# 明确子目标', reason: '用户补充已完成目标' });
  const evidence = {
    expectedSnapshot: observed.completion.snapshotIdentity,
    acceptance: { summary: '整体验收', children: [{ taskId: 'brief-child', summary: '已验收' }] },
    authorization: { source: 'test:user', statement: '明确完成父任务' },
  };
  const current = runtime.inspectTask(root, 'brief-parent');
  assert.throws(() => runtime.completeTask(root, 'brief-parent', { expectedRecordDigest: current.recordDigest, summary: '整体完成', parentCompletion: evidence }), { code: 'parent_completion_conflict' });
  evidence.expectedSnapshot = runtime.inspectParentCoordination(root, 'brief-parent').completion.snapshotIdentity;
  const completed = runtime.completeTask(root, 'brief-parent', { expectedRecordDigest: current.recordDigest, summary: '整体完成', parentCompletion: evidence });
  assert.throws(() => runtime.updateTask(root, 'brief-parent', { expectedRecordDigest: completed.recordDigest, brief: '# 新整体目标', reason: '目标改变' }), { code: 'task_record_completion_context_changed' });
});

test('旧库追加迁移保留原结果历史，并回填内部历史摘要而不编造正文', () => {
  const migrations = loadWorkspaceSqliteMigrations();
  const database = new DatabaseSync(':memory:');
  try {
    for (const migration of migrations.filter((item: any) => item.version < 35)) applyWorkspaceSqliteMigration(database, migration);
    const history = JSON.stringify([{ status: 'completed', title: '旧目标', intent: '旧短目标', parentTaskId: null, result: { summary: '旧结果' }, recordUpdatedAt: '2026-09-01T00:00:00.000Z', correctedAt: '2026-09-02T00:00:00.000Z', reason: '旧更正' }]);
    database.prepare('INSERT INTO tasks(task_id,title,intent,status,result_summary,created_at,updated_at,result_history_json) VALUES (?,?,?,?,?,?,?,?)').run('brief-old', '旧任务', '旧目标', 'completed', '完成', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', history);
    applyWorkspaceSqliteMigration(database, migrations.find((item: any) => item.version === 35));
    const row = database.prepare('SELECT brief,brief_digest,result_history_json,result_history_digest FROM tasks WHERE task_id = ?').get('brief-old');
    assert.ok(row);
    assert.equal(row.brief, null);
    assert.equal(row.brief_digest, null);
    assert.equal(row.result_history_json, history);
    assert.equal(row.result_history_digest, taskContentDigest(history));
  } finally { database.close(); }
});

test('显式存储导入保持终态父任务的结果与历史时间，幂等重试不重复登记', (t) => {
  const { root } = taskRecordFixture(t, 'task-brief-parent-import');
  const runtime = createRuntime();
  runtime.createTask(root, { ...input('import-parent'), isParent: true });
  const observed = runtime.inspectParentCoordination(root, 'import-parent');
  const completed = runtime.completeTask(root, 'import-parent', {
    expectedRecordDigest: observed.recordDigest, summary: '已验收整体目标',
    parentCompletion: {
      expectedSnapshot: observed.completion.snapshotIdentity,
      acceptance: { summary: '已验收', children: [] },
      authorization: { source: 'test:user', statement: '明确完成任务' },
    },
  });
  const imported = runtime.importTaskBrief(root, 'import-parent', { expectedRecordDigest: completed.recordDigest, brief: '# 已关联的旧任务正文\n' });
  assert.equal(imported.record.status, 'completed');
  assert.equal(imported.record.taskId, completed.record.taskId);
  assert.equal(imported.record.createdAt, completed.record.createdAt);
  assert.deepEqual(imported.record.result, completed.record.result);
  assert.equal(imported.record.resultHistory[0].brief, null);
  assert.equal(imported.record.resultHistory[0].recordUpdatedAt, completed.record.updatedAt);
  assert.match(imported.record.resultHistory[0].reason, /显式导入/);
  const retried = runtime.importTaskBrief(root, 'import-parent', { expectedRecordDigest: imported.recordDigest, brief: imported.record.brief });
  assert.equal(retried.recordDigest, imported.recordDigest);
  assert.deepEqual(retried.effects, []);
  assert.equal(retried.record.resultHistory.length, 1);
  assert.throws(() => runtime.importTaskBrief(root, 'import-parent', { expectedRecordDigest: completed.recordDigest, brief: imported.record.brief }), { code: 'task_record_conflict' });
  assert.throws(() => runtime.importTaskBrief(root, 'import-parent', { expectedRecordDigest: imported.recordDigest, brief: '# 其他正文' }), { code: 'task_record_brief_exists' });
  assert.throws(() => runtime.updateTask(root, 'import-parent', { expectedRecordDigest: imported.recordDigest, brief: '# 人工修改目标', reason: '用户修改' }), { code: 'task_record_completion_context_changed' });
});

test('候选预览只升级自身旧库副本，保留库保持原版本与字节', (t) => {
  const { root, base } = taskRecordFixture(t, 'task-brief-preview');
  const store = path.join(root, '.buildr', 'local', 'workspace.sqlite');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  const old = new DatabaseSync(store);
  for (const script of loadWorkspaceSqliteMigrations().filter((item: any) => item.version < 35)) applyWorkspaceSqliteMigration(old, script);
  old.prepare('INSERT INTO tasks(task_id,title,intent,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('preview-old', '旧任务', '旧版本说明', 'active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  old.close();
  const validation = path.join(base, 'validation');
  fs.cpSync(root, validation, { recursive: true });
  const before = fs.readFileSync(store);
  const runtime = createRuntime();
  const sourceRoot = path.join(validation, 'projects', 'product', 'services', 'buildr');
  const common = path.join(root, '.git');
  registerWorkspaceSqlite(runtime, { sourceRoot, observeCheckout: (candidate: string) => ({
    checkoutRoot: candidate === root ? root : validation,
    gitDirectory: candidate === root ? common : path.join(common, 'worktrees', 'validation'),
    gitCommonDirectory: common, linkedWorktree: candidate !== root,
  }) });
  const owner: PreviewOwner = {
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'brief-preview', worktree: validation, repository: root,
    branch: 'codex/test', head: 'a'.repeat(40), dirty: false, taskId: 'preview-old', workspaceRoot: root,
    worktreeEvidencePath: 'test/evidence', worktreePlanDigest: 'sha256-test', productCheckout: sourceRoot,
    repositorySet: [], identityMode: 'task-worktree-v1', taskStore: { source: 'canonical', seeded: true },
  };
  prepareTaskPreviewStructuredStore(runtime, root, owner);
  assert.deepEqual(fs.readFileSync(store), before);
  prepareTaskPreviewStructuredStore(runtime, validation, owner);
  const snapshot = new DatabaseSync(path.join(validation, '.buildr', 'local', 'workspace.sqlite'), { readOnly: true });
  try {
    assert.equal(snapshot.prepare('SELECT max(version) AS version FROM schema_migrations').get()?.version, 35);
    assert.equal(snapshot.prepare('SELECT brief FROM tasks WHERE task_id = ?').get('preview-old')?.brief, null);
  } finally { snapshot.close(); }
  assert.deepEqual(fs.readFileSync(store), before);
  assert.throws(() => runtime.prepareWorkspaceStructuredStore(root), { code: 'workspace_store_writer_provenance_forbidden' });
});

test('CLI 正文文件支持创建、更新和清空，互斥参数保持当前内容', (t) => {
  const { root, base } = taskRecordFixture(t, 'task-brief-cli');
  const file = path.join(base, 'task-brief.md');
  const markdown = '# CLI 任务\n\n保留格式  \n';
  fs.writeFileSync(file, markdown);
  const created = runBuildrJson(['task', 'create', 'brief-cli', '--title', 'CLI 正文', '--intent', '命令入口', '--brief-file', file, '--target', root]);
  assert.equal(created.record.brief, markdown);
  fs.writeFileSync(file, '# 更新说明\n');
  const updated = runBuildrJson(['task', 'update', 'brief-cli', '--brief-file', file, '--expected-record', created.recordDigest, '--target', root]);
  assert.equal(updated.record.brief, '# 更新说明\n');
  const binary = path.join(base, 'invalid-utf8.md');
  fs.writeFileSync(binary, Buffer.from([0x23, 0x20, 0xc3, 0x28]));
  const invalidUtf8 = runBuildrJson(['task', 'update', 'brief-cli', '--brief-file', binary, '--expected-record', updated.recordDigest, '--target', root], 1);
  assert.equal(invalidUtf8.diagnostic.code, 'task_record_brief_file_invalid');
  const linked = path.join(base, 'symlink.md');
  fs.symlinkSync(file, linked);
  const invalidLink = runBuildrJson(['task', 'update', 'brief-cli', '--brief-file', linked, '--expected-record', updated.recordDigest, '--target', root], 1);
  assert.equal(invalidLink.diagnostic.code, 'task_record_brief_file_invalid');
  const oversized = path.join(base, 'oversized.md');
  fs.writeFileSync(oversized, Buffer.alloc(TASK_BRIEF_MAX_BYTES + 1, 0x61));
  const invalidSize = runBuildrJson(['task', 'update', 'brief-cli', '--brief-file', oversized, '--expected-record', updated.recordDigest, '--target', root], 1);
  assert.equal(invalidSize.diagnostic.code, 'task_record_brief_size_invalid');
  assert.equal(runBuildrJson(['task', 'inspect', 'brief-cli', '--target', root]).recordDigest, updated.recordDigest);
  const invalid = runBuildrJson(['task', 'update', 'brief-cli', '--brief-file', file, '--clear-brief', '--expected-record', updated.recordDigest, '--target', root], 2);
  assert.equal(invalid.error.code, 'task_record_cli.syntax');
  const cleared = runBuildrJson(['task', 'update', 'brief-cli', '--clear-brief', '--expected-record', updated.recordDigest, '--target', root]);
  assert.equal(cleared.record.brief, null);
});

test('HTTP 详情与更新读取同一正文，列表不携带正文，陈旧写入拒绝', async (t) => {
  const { root, base } = taskRecordFixture(t, 'task-brief-http');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  const created = runtime.createTask(root, input('brief-http', '# HTTP 说明\n'));
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const listed: any = await fetch(endpoint).then(response => response.json());
  const item = listed.tasks.find((item: any) => item.record.taskId === 'brief-http');
  assert.equal('brief' in item.record, false);
  assert.equal(item.recordDigest, created.recordDigest);
  const longMarkdown = '# 更新的 HTTP 正文\n' + '正文格式  \n'.repeat(10_000);
  const response = await fetch(`${endpoint}/brief-http`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRecordDigest: created.recordDigest, brief: longMarkdown }) });
  assert.equal(response.status, 200);
  const updated: any = await response.json();
  assert.equal(updated.record.brief, longMarkdown);
  const stale = await fetch(`${endpoint}/brief-http`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRecordDigest: created.recordDigest, brief: '旧版' }) });
  assert.equal(stale.status, 409);
  const inspected: any = await fetch(`${endpoint}/brief-http`).then(response => response.json());
  assert.equal(inspected.record.brief, updated.record.brief);
});
