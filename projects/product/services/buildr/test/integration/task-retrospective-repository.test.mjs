import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-retrospective-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr', 'asset-review', 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 22222222-2222-4222-8222-222222222222\nname: Fixture\ndescription: Fixture Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const legacy = path.join(root, '.buildr', 'asset-review', 'inbox', 'legacy.md');
  fs.writeFileSync(legacy, 'legacy observation bytes\n');
  const runtime = createRuntime();
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v1', taskId: 'demo-task', title: 'Demo', intent: 'Review efficiency',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
  });
  return { root: fs.realpathSync(root), runtime, legacy };
}

function isolateLocalAppData(t) {
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

test('terminal Task维护单一SQLite current Result且旧observation保持原样', (t) => {
  const { root, runtime, legacy } = fixture(t);
  assert.equal(runtime.inspectTaskRetrospective(root, 'demo-task').slot.present, false);
  assert.throws(() => runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: 'active' }), (error) => error.code === 'task_retrospective_task_not_terminal');
  runtime.recordTaskReview(root, 'demo-task', {
    reviewType: 'planning', targetIdentity: 'plan:demo', method: 'self', reviewed: ['任务计划'],
    uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: '计划可执行' },
  });
  const reviewBefore = JSON.stringify(runtime.inspectTaskReview(root, 'demo-task'));
  terminal(runtime, root);

  const first = runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# 第一次\n\n可减少重复检查。' });
  assert.equal(first.status, 'recorded');
  assert.deepEqual(first.effects, [{ type: 'created', path: 'workspace-sqlite:task-retrospective/demo-task' }]);
  assert.equal(first.slot.result.focus, 'agent-execution-efficiency');
  const second = runtime.recordTaskRetrospective(root, 'demo-task', { reportMarkdown: '# 第二次\n\n先确认任务范围。' });
  assert.deepEqual(second.effects, [{ type: 'updated', path: 'workspace-sqlite:task-retrospective/demo-task' }]);
  assert.equal(runtime.inspectTaskRetrospective(root, 'demo-task').slot.result.reportMarkdown, '# 第二次\n\n先确认任务范围。');

  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  assert.equal(opened.database.prepare("SELECT count(*) AS count FROM task_retrospective_current WHERE task_id = 'demo-task'").get().count, 1);
  const stored = opened.database.prepare("SELECT result_json FROM task_retrospective_current WHERE task_id = 'demo-task'").get().result_json;
  opened.database.close();
  assert.doesNotMatch(stored, /history|revision|score|resultDigest/);
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

test('Local App只读返回current Result或尚未复盘', async (t) => {
  const { root, runtime } = fixture(t);
  const appData = isolateLocalAppData(t);
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
  assert.equal(response.status, 404, 'Local App不得暴露复盘writer');
});
