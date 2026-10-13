import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { runBuildr, runBuildrJson, taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../src/modules/task/interfaces/http/task-http-schema.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('真实CLI与HTTP共享只读提交结果、闭合输入与错误边界', async t => {
  const { base, root } = taskRecordFixture(t, 'task-commits-http');
  const previousData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => { if (previousData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousData; });
  const runtime = createRuntime();
  runtime.createTask(root, { taskId: 'task-git', title: '实际提交读取', intent: '只读双向关联', projects: ['demo'], services: [], changes: [] });
  function git(args: string[]) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
  git(['init', '--initial-branch=main']); git(['config', 'user.name', 'Commit Reader']); git(['config', 'user.email', 'reader@example.com']);
  fs.writeFileSync(path.join(root, 'full.ts'), Array.from({ length: 120 }, (_, index) => `line-${index + 1}`).join('\n') + '\n');
  git(['add', 'full.ts']);
  git(['-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'feat: task association', '-m', 'Actual body\n\nBuildr-Task: task-git']);
  const hash = git(['rev-parse', 'HEAD']);
  const before = runtime.readTask(root, 'task-git');
  const cli = runBuildrJson(['task', 'commits', 'task-git', '--target', root]);
  assert.equal(cli.schemaVersion, 'buildr.task-commits/v1');
  assert.equal(cli.status, 'complete', `task commits returned ${cli.status}: ${JSON.stringify({ diagnostics: cli.diagnostics, repositories: cli.repositories, coverage: cli.coverage })}`);
  assert.deepEqual(cli.commits.map((item: { hash: string }) => item.hash), [hash]);
  const help = runBuildr(['task', 'commits', '--help']).stdout;
  assert.match(help, /buildr task commits <task-id>/);
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/task-git/commits`;
  const response = await fetch(endpoint); assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.commitsResponse.$id, body).valid, true);
  assert.deepEqual({ ...body, readAt: null }, { ...cli, readAt: null });
  const lines = fs.readFileSync(path.join(root, 'full.ts'), 'utf8').split('\n'); lines[44] = 'changed-45';
  fs.writeFileSync(path.join(root, 'full.ts'), lines.join('\n'));
  const params = new URLSearchParams({ repositoryId: cli.repositories[0].id, filePath: 'full.ts', commitHash: 'worktree' });
  const fullEndpoint = endpoint.replace('/commits', '/file-diff');
  const fullResponse = await fetch(`${fullEndpoint}?${params}`); assert.equal(fullResponse.status, 200);
  const fullBody = await fullResponse.json();
  assert.equal(TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFilesResponse.$id, fullBody).valid, true);
  assert.match(fullBody.files[0].preview, / line-1\n/); assert.match(fullBody.files[0].preview, / line-120\n/);
  assert.match(fullBody.files[0].preview, /-line-45\n\+changed-45/);
  assert.equal((await fetch(`${fullEndpoint}?${params}&unknown=x`)).status, 400);
  assert.equal((await fetch(`${fullEndpoint}?${params}&filePath=another`)).status, 400);

  for (const query of ['?limit=2', '?taskId=another', '?path=/tmp', '?repository=outside']) assert.equal((await fetch(endpoint + query)).status, 400);
  assert.equal((await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/unknown/commits`)).status, 404);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 404);
  const unknown = runBuildrJson(['task', 'commits', 'unknown', '--target', root], 1);
  assert.equal(unknown.schemaVersion, 'buildr.cli-error/v1');
  assert.equal(runtime.readTask(root, 'task-git').recordDigest, before.recordDigest);
  assert.equal(git(['rev-parse', 'HEAD']), hash); assert.deepEqual(cli.effects, []);
  assert.equal(fs.existsSync(path.join(root, '.git', 'FETCH_HEAD')), false);
});

test('组合任务CLI与HTTP共享直接子任务提交、文件及差异，关系读取有界且排除更深后代', async t => {
  const { base, root } = taskRecordFixture(t, 'parent-task-commits-http');
  const previousData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => { if (previousData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousData; });
  const runtime = createRuntime();
  const input = { intent: '关联交付', projects: ['demo'], services: [], changes: [] };
  runtime.createTask(root, { ...input, taskId: 'parent-git', title: '整体交付', isParent: true });
  runtime.createTask(root, { ...input, taskId: 'child-a', title: '子任务甲', parentTaskId: 'parent-git' });
  runtime.createTask(root, { ...input, taskId: 'child-b', title: '子任务乙', parentTaskId: 'parent-git' });
  runtime.createTask(root, { ...input, taskId: 'grandchild', title: '更深任务', parentTaskId: 'child-a' });
  const targets = runtime.readTaskCommitTargets(root, 'parent-git', 100);
  assert.deepEqual(targets.records.map((item: { taskId: string }) => item.taskId), ['parent-git', 'child-a', 'child-b']);
  assert.equal(targets.truncated, false);
  const limited = runtime.readTaskCommitTargets(root, 'parent-git', 2);
  assert.deepEqual(limited.records.map((item: { taskId: string }) => item.taskId), ['parent-git', 'child-a']); assert.equal(limited.truncated, true);
  function git(args: string[]) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
  git(['init', '--initial-branch=main']); git(['config', 'user.name', 'Commit Reader']); git(['config', 'user.email', 'reader@example.com']);
  function delivered(taskId: string, file: string) {
    fs.writeFileSync(path.join(root, file), `${taskId} delivered\n`); git(['add', file]);
    git(['-c', 'commit.gpgSign=false', 'commit', '-m', `feat: ${file}`, '-m', `Buildr-Task: ${taskId}`]);
    return git(['rev-parse', 'HEAD']);
  }
  const parent = delivered('parent-git', 'parent.txt'), childA = delivered('child-a', 'child-a.txt'), childB = delivered('child-b', 'child-b.txt');
  const grandchild = delivered('grandchild', 'grandchild.txt');
  const cli = runBuildrJson(['task', 'commits', 'parent-git', '--target', root]);
  assert.equal(cli.status, 'complete');
  assert.deepEqual(new Set(cli.commits.map((item: { hash: string }) => item.hash)), new Set([parent, childA, childB]));
  assert.deepEqual(new Set(cli.commits.map((item: { taskId: string; taskTitle: string }) => `${item.taskId}:${item.taskTitle}`)), new Set(['parent-git:整体交付', 'child-a:子任务甲', 'child-b:子任务乙']));
  assert.deepEqual(runBuildrJson(['task', 'commits', 'child-b', '--target', root]).commits.map((item: { hash: string }) => item.hash), [childB]);
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/parent-git`;
  const changedResponse = await fetch(`${endpoint}/changed-files`); assert.equal(changedResponse.status, 200);
  const changed = await changedResponse.json();
  assert.equal(TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFilesResponse.$id, changed).valid, true);
  assert.deepEqual(changed.files, []);
  assert.deepEqual(new Set(changed.commits.map((item: { hash: string }) => item.hash)), new Set([parent, childA, childB]));
  const params = new URLSearchParams({ repositoryId: cli.repositories[0].id, filePath: 'child-b.txt', commitHash: childB });
  const diffResponse = await fetch(`${endpoint}/file-diff?${params}`); assert.equal(diffResponse.status, 200);
  const diff = await diffResponse.json(); assert.match(diff.files[0].preview, /\+child-b delivered/);
  params.set('commitHash', grandchild); params.set('filePath', 'grandchild.txt');
  assert.equal((await fetch(`${endpoint}/file-diff?${params}`)).status, 404);
});
