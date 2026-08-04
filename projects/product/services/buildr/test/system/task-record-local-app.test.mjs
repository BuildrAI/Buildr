import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
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

test('Local App Task API 保持 workspaceId、Origin/session/JSON/body/字段边界和 digest 冲突', async (t) => {
  const { base, root } = fixture(t, 'task-local-app');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options); return { status: response.status, headers: response.headers, body: await response.json() };
  };

  let response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'app-parent', title: '页面协调任务', intent: '作为 Parent' }) });
  assert.equal(response.status, 201);
  response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'app-task', title: '页面任务', intent: '通过共享 Application 创建', parentTaskId: 'app-parent', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] }) });
  assert.equal(response.status, 201); assert.equal(response.body.status, 'created'); const staleDigest = response.body.recordDigest;
  assert.equal(response.body.record.parentTaskId, 'app-parent'); assert.equal(response.body.taskRelations.parent.title, '页面协调任务');
  response = await request(endpoint); assert.deepEqual(new Set(response.body.tasks.map((item) => item.record.taskId)), new Set(['app-parent', 'app-task']));
  const parentReadModel = response.body.tasks.find((item) => item.record.taskId === 'app-parent'); assert.deepEqual(parentReadModel.record.childTaskIds, ['app-task']); assert.equal(parentReadModel.taskRelations.children[0].status, 'active');
  const taskEndpoint = `${endpoint}/app-task`;
  response = await request(`${taskEndpoint}/development`); assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.schemaVersion, 'buildr.task-development-operation-result/v1'); assert.equal(response.body.status, 'missing'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const inspectDevelopment = runtime.inspectTaskDevelopment.bind(runtime);
  const developmentReadModel = { schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'inspected', taskId: 'app-task', development: { path: '.buildr/tasks/app-task/development.yml', receiptDigest: 'sha256-development', receipt: { generation: 2 }, applicability: { status: 'candidate-current' } }, diagnostic: null, effects: [], nextActions: [] };
  let developmentReads = 0;
  runtime.inspectTaskDevelopment = (target, taskId) => {
    if (taskId !== 'app-task') return inspectDevelopment(target, taskId);
    developmentReads += 1;
    assert.equal(target, root);
    return developmentReadModel;
  };
  response = await request(`${taskEndpoint}/development`); assert.equal(response.status, 200); assert.deepEqual(response.body, developmentReadModel); assert.equal(developmentReads, 1);
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

  for (const [body, code] of [[{ taskId: 'path-task', title: 'x', intent: 'x', path: root }, 'target_forbidden'], [{ taskId: 'unknown-task', title: 'x', intent: 'x', revision: 1 }, 'task_api_field_forbidden']]) {
    response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify(body) }); assert.equal(response.status, 400); assert.equal(response.body.error.code, code);
  }
  response = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ taskId: 'origin-task', title: 'x', intent: 'x' }) }); assert.equal(response.status, 403); assert.equal(response.body.error.code, 'origin_forbidden');
  response = await request(endpoint, { method: 'POST', headers: { origin: url, 'x-buildr-session': 'wrong', 'content-type': 'application/json' }, body: '{}' }); assert.equal(response.status, 403); assert.equal(response.body.error.code, 'session_forbidden');
  response = await request(endpoint, { method: 'POST', headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'text/plain' }, body: '{}' }); assert.equal(response.status, 415); assert.equal(response.body.error.code, 'content_type_unsupported');
  response = await request(`${endpoint}?filter=active`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_forbidden');
  response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'large-task', title: 'x', intent: 'x'.repeat(40 * 1024) }) }); assert.equal(response.status, 413); assert.equal(response.body.error.code, 'request_body_too_large');

  const latest = (await request(taskEndpoint)).body;
  response = await request(`${taskEndpoint}/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: latest.recordDigest, summary: '页面确认完成', noChange: false }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.status, 'completed');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: response.body.recordDigest, title: '不可重开' }) }); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_terminal');

  const other = path.join(base, 'other-workspace'); run(['init', '--target', other, '--name', 'other', '--description', 'other fixture', '--profile', 'team']);
  let registry = runtime.listRegisteredWorkspaces(); registry = runtime.registerLocalWorkspace({ rootPath: other, revision: registry.revision }); const otherId = registry.workspaces.find((item) => item.rootPath === other).workspace.id;
  response = await request(`${url}/api/v1/workspaces/${otherId}/tasks`); assert.deepEqual(response.body.tasks, []);
});
