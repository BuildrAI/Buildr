import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.mjs';

const test = createBuildrApplicationTest('integration-task-retrospective-repository');

const DRIVER = path.resolve(import.meta.dirname, '../../src/task/interfaces/internal/task-retrospective-driver.mjs');

function fixture(t, runtimeOverride = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-retrospective-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr', 'asset-review', 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 22222222-2222-4222-8222-222222222222\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const legacy = path.join(root, '.buildr', 'asset-review', 'inbox', 'legacy.md');
  fs.writeFileSync(legacy, 'legacy observation bytes\n');
  const runtime = runtimeOverride ?? t.buildrContexts.application;
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v2', taskId: 'demo-task', title: 'Demo', intent: 'Review efficiency',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
  });
  return { root: fs.realpathSync(root), runtime, legacy };
}

function isolateBuildrWebData(t) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-retrospective-app-data-'));
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    fs.rmSync(appData, { recursive: true, force: true });
  });
  return appData;
}

function terminal(runtime, root, status = 'completed') {
  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, {
    ...task.record, status,
    result: status === 'completed' ? { summary: 'done', noChange: false } : { summary: 'stopped' },
    updatedAt: '2026-08-05T00:01:00.000Z',
  });
}

function terminalTask(runtime, root, taskId, title = taskId) {
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v2', taskId, title, intent: `Retrospective for ${taskId}`,
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'completed',
    result: { summary: 'done', noChange: false }, createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:01:00.000Z',
  });
  return runtime.recordTaskRetrospective(root, taskId, { reportMarkdown: `# ${title}\n\nCurrent report.` });
}

test('terminal Task维护单一SQLite current Result且旧observation保持原样', (t) => {
  const { root, runtime, legacy } = fixture(t);
  assert.equal(runtime.inspectTaskRetrospective(root, 'demo-task').slot.present, false);
  assert.throws(() => runtime.handleTaskRetrospective(root, 'demo-task', { status: 'no-action', note: '没有报告', expectedCurrentDigest: 'sha256-missing' }), (error) => error.code === 'task_retrospective_result_not_found');
  assert.throws(() => runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: 'active' }), (error) => error.code === 'task_retrospective_task_not_terminal');
  runtime.recordTaskReview(root, 'demo-task', {
    reviewType: 'planning', subjectIdentity: 'plan:demo', method: 'self', reviewed: ['任务计划'],
    uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: '计划可执行' }, expectedCurrentDigest: 'absent',
  });
  const reviewBefore = JSON.stringify(runtime.inspectTaskReview(root, 'demo-task'));
  terminal(runtime, root);

  const first = runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# 第一次\n\n可减少重复检查。' });
  assert.equal(first.status, 'recorded');
  assert.deepEqual(first.effects, [{ type: 'created', path: 'workspace-sqlite:task-retrospective/demo-task' }]);
  assert.equal(first.slot.result.focus, 'agent-execution-efficiency');
  assert.deepEqual(first.slot.disposition, { status: 'pending', note: null, disposedAt: null });
  assert.match(first.slot.currentDigest, /^sha256-[a-f0-9]{64}$/);
  const noAction = runtime.handleTaskRetrospective(root, 'demo-task', {
    status: 'no-action', note: '  已确认无需后续行动。 ', expectedCurrentDigest: first.slot.currentDigest,
  });
  assert.equal(noAction.operation, 'handle');
  assert.equal(noAction.status, 'updated');
  assert.equal(noAction.slot.disposition.status, 'no-action');
  assert.equal(noAction.slot.disposition.note, '已确认无需后续行动。');
  assert.ok(noAction.slot.disposition.disposedAt);
  assert.notEqual(noAction.slot.currentDigest, first.slot.currentDigest);
  assert.throws(() => runtime.handleTaskRetrospective(root, 'demo-task', {
    status: 'handled', note: '陈旧页面', expectedCurrentDigest: first.slot.currentDigest,
  }), (error) => error.code === 'task_retrospective_conflict' && error.status === 409);
  const reopened = runtime.handleTaskRetrospective(root, 'demo-task', {
    status: 'pending', expectedCurrentDigest: noAction.slot.currentDigest,
  });
  assert.deepEqual(reopened.slot.disposition, { status: 'pending', note: null, disposedAt: null });
  const second = runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# 第二次\n\n先确认任务范围。' });
  assert.deepEqual(second.effects, [{ type: 'updated', path: 'workspace-sqlite:task-retrospective/demo-task' }]);
  assert.equal(runtime.inspectTaskRetrospective(root, 'demo-task').slot.result.reportMarkdown, '# 第二次\n\n先确认任务范围。');
  assert.deepEqual(second.slot.disposition, { status: 'pending', note: null, disposedAt: null });

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(opened.database.prepare("SELECT count(*) AS count FROM task_retrospective_current WHERE task_id = 'demo-task'").get().count, 1);
  const storedRow = opened.database.prepare("SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = 'demo-task'").get();
  opened.database.close();
  assert.doesNotMatch(storedRow.result_json, /history|revision|score|resultDigest|disposition/);
  assert.deepEqual({ ...storedRow, result_json: undefined }, { result_json: undefined, disposition_status: 'pending', disposition_note: null, disposed_at: null });
  assert.equal(JSON.stringify(runtime.inspectTaskReview(root, 'demo-task')), reviewBefore, '复盘写入不得修改 sibling review records');
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy observation bytes\n');
});

test('serialization或mutation失败保留last-valid current row', (t) => {
  const { root, runtime } = fixture(t); terminal(runtime, root, 'abandoned');
  runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: 'last valid' });
  runtime.taskRetrospectiveSerialize = () => { throw new Error('injected serialization failure'); };
  assert.throws(() => runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: 'new value' }), (error) => error.code === 'task_retrospective_write_failed' && error.details.stage === 'serialization');
  runtime.taskRetrospectiveSerialize = null;
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_retrospective_update BEFORE UPDATE ON task_retrospective_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: 'new value' }), (error) => error.code === 'task_retrospective_write_failed' && error.details.rollback.status === 'restored');
  assert.equal(runtime.inspectTaskRetrospective(root, 'demo-task').slot.result.reportMarkdown, 'last valid');
});

test('批量list按current状态有界返回摘要、正文与逐项诊断且零写入', (t) => {
  const { root, runtime } = fixture(t);
  terminal(runtime, root);
  const demo = runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# Demo\n\nPending report.' });
  const alpha = terminalTask(runtime, root, 'alpha-task', 'Alpha');
  runtime.handleTaskRetrospective(root, 'alpha-task', {
    status: 'handled', note: '已有承接 Task。', expectedCurrentDigest: alpha.slot.currentDigest,
  });
  terminalTask(runtime, root, 'beta-task', 'Beta');

  const before = runtime.openWorkspaceStructuredStore(root, { writable: false });
  const rowsBefore = before.database.prepare('SELECT * FROM task_retrospective_current ORDER BY task_id').all();
  before.database.close();

  const pending = runtime.listTaskRetrospectives(root);
  assert.equal(pending.schemaVersion, 'buildr.task-retrospective-list-result/v1');
  assert.deepEqual(pending.filters, { status: 'pending', taskIds: [], limit: 100, maxBytes: 262144, includeReport: false });
  assert.deepEqual(pending.items.map((item) => item.task.taskId), ['beta-task', 'demo-task']);
  assert.equal(pending.matchingTaskCount, 2);
  assert.equal(pending.returnedTaskCount, 2);
  assert.equal(pending.maxBytes, 262144);
  assert.equal(pending.returnedBytes, Buffer.byteLength(`${JSON.stringify(pending)}\n`, 'utf8'));
  assert.equal(pending.truncated, false);
  assert.equal(Object.hasOwn(pending.items[0].retrospective, 'reportMarkdown'), false);
  assert.deepEqual(pending.items[0].retrospective.followupTasks, []);
  assert.deepEqual(pending.effects, []);

  const bounded = runtime.listTaskRetrospectives(root, { status: 'all', taskIds: ['demo-task', 'alpha-task', 'demo-task'], limit: 1, includeReport: true });
  assert.deepEqual(bounded.filters.taskIds, ['alpha-task', 'demo-task']);
  assert.equal(bounded.matchingTaskCount, 2);
  assert.equal(bounded.returnedTaskCount, 1);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.items[0].task.taskId, 'alpha-task');
  assert.equal(bounded.items[0].retrospective.reportMarkdown, '# Alpha\n\nCurrent report.');
  assert.equal(runtime.listTaskRetrospectives(root, { status: 'handled' }).items[0].task.taskId, 'alpha-task');

  for (const input of [
    { status: 'missing' }, { taskIds: ['Invalid Task'] }, { limit: 0 }, { limit: 501 }, { maxBytes: 0 }, { maxBytes: 1048577 }, { includeReport: 'yes' },
  ]) assert.throws(() => runtime.listTaskRetrospectives(root, input), (error) => error.code?.startsWith('task_retrospective_list_'));

  const reportEnvelope = runtime.listTaskRetrospectives(root, { status: 'all', taskIds: ['alpha-task'] });
  const reportBounded = runtime.listTaskRetrospectives(root, {
    status: 'all', taskIds: ['alpha-task'], includeReport: true, maxBytes: reportEnvelope.returnedBytes + 20,
  });
  assert.equal(reportBounded.items.length, 1);
  assert.equal(Object.hasOwn(reportBounded.items[0].retrospective, 'reportMarkdown'), false);
  assert.equal(reportBounded.truncated, true);
  assert.ok(reportBounded.returnedBytes <= reportBounded.maxBytes);

  const corrupted = runtime.openWorkspaceStructuredStore(root, { writable: true });
  corrupted.database.prepare("UPDATE task_retrospective_current SET result_json = '{}' WHERE task_id = 'beta-task'").run();
  corrupted.database.close();
  const partial = runtime.listTaskRetrospectives(root, { status: 'pending' });
  assert.equal(partial.items.find((item) => item.task.taskId === 'beta-task').retrospective, null);
  assert.equal(partial.items.find((item) => item.task.taskId === 'beta-task').diagnostic.code, 'task_retrospective_result_invalid');
  assert.equal(partial.items.find((item) => item.task.taskId === 'demo-task').diagnostic, null);

  const after = runtime.openWorkspaceStructuredStore(root, { writable: false });
  const rowsAfter = after.database.prepare("SELECT * FROM task_retrospective_current WHERE task_id != 'beta-task' ORDER BY task_id").all();
  after.database.close();
  assert.deepEqual(rowsAfter, rowsBefore.filter((row) => row.task_id !== 'beta-task'));
  assert.match(demo.slot.currentDigest, /^sha256-/);
});

test('内部driver以单进程list支持重复Task过滤和正文opt-in', (t) => {
  const { root, runtime } = fixture(t);
  terminal(runtime, root);
  runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# Driver report' });
  terminalTask(runtime, root, 'other-task', 'Other');

  const listed = spawnSync(process.execPath, [
    DRIVER, 'list', '--target', root, '--task', 'other-task', '--task', 'demo-task', '--include-report', '--limit', '2',
  ], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const output = JSON.parse(listed.stdout);
  assert.equal(output.schemaVersion, 'buildr.task-retrospective-list-result/v1');
  assert.deepEqual(output.items.map((item) => item.task.taskId), ['demo-task', 'other-task']);
  assert.equal(output.items[0].retrospective.reportMarkdown, '# Driver report');

  const invalid = spawnSync(process.execPath, [DRIVER, 'list', '--target', root, '--limit', '501'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).diagnostic.code, 'task_retrospective_list_limit_invalid');
});

test('Buildr Web只读返回current Result或尚未复盘', async (t) => {
  const appData = isolateBuildrWebData(t);
  const { root, runtime } = fixture(t, createRuntime());
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const registry = runtime.readWorkspaceRegistryPersistence();
  assert.equal(registry.file, path.join(appData, 'workspace-registry.json'));
  assert.deepEqual(registry.registry.roots, [root]);
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/demo-task/retrospective`;
  let response = await fetch(endpoint);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).slot.present, false);
  terminal(runtime, root);
  runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# 可见报告' });
  response = await fetch(endpoint);
  assert.equal((await response.json()).slot.result.reportMarkdown, '# 可见报告');
  response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 404, 'Buildr Web不得暴露复盘writer');
});
