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
  git(['-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'feat: task association', '-m', 'Actual body\n\nBuildr-Task: task-git']);
  const hash = git(['rev-parse', 'HEAD']);
  const before = runtime.readTask(root, 'task-git');
  const cli = runBuildrJson(['task', 'commits', 'task-git', '--target', root]);
  assert.equal(cli.schemaVersion, 'buildr.task-commits/v1'); assert.equal(cli.status, 'complete');
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
  for (const query of ['?limit=2', '?taskId=another', '?path=/tmp', '?repository=outside']) assert.equal((await fetch(endpoint + query)).status, 400);
  assert.equal((await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/unknown/commits`)).status, 404);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 404);
  const unknown = runBuildrJson(['task', 'commits', 'unknown', '--target', root], 1);
  assert.equal(unknown.schemaVersion, 'buildr.cli-error/v1');
  assert.equal(runtime.readTask(root, 'task-git').recordDigest, before.recordDigest);
  assert.equal(git(['rev-parse', 'HEAD']), hash); assert.deepEqual(cli.effects, []);
  assert.equal(fs.existsSync(path.join(root, '.git', 'FETCH_HEAD')), false);
});
