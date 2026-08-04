import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function json(args, expected = 0) {
  const result = run([...args, '--json'], expected);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

after(() => cleanupLocalTaskLifecycleSystemContext());

function fixture(t) {
  const { base, root } = copyTaskLifecycleWorkspace(t, 'task-review-product');
  createRuntime().createTaskRecord(root, { taskId: 'review-task', title: 'Review Task', intent: '验证宽而薄的 Review Result', projects: [], services: [], changes: ['demo/review-change'] });
  return { base, root };
}

test('Task Review CLI 提供单一稳定 JSON、两槽位与 current/stale/unknown', (t) => {
  const { root } = fixture(t);
  const runtime = createRuntime();
  let response = json(['task', 'review', 'inspect', 'review-task', '--target', root]);
  assert.equal(response.schemaVersion, 'buildr.task-review-operation-result/v1');
  assert.equal(response.status, 'inspected');
  assert.equal(response.slots.planning.present, false);

  response = json(['task', 'review', 'record', 'review-task', '--type', 'planning', '--target-identity', 'plan:v1', '--method', 'self', '--reviewed', 'task intent', '--uncovered', 'browser::not relevant', '--finding', 'No blocking finding', '--outcome', 'ready', '--summary', 'Plan is ready', '--target', root]);
  assert.equal(response.status, 'recorded');
  assert.equal(response.slots.planning.applicability, 'current');
  assert.deepEqual(response.effects, [{ type: 'created', path: '.buildr/tasks/review-task/reviews/planning.yml' }]);
  assert.equal('resultDigest' in response.slots.planning.result, false);

  response = json(['task', 'review', 'inspect', 'review-task', '--planning-target', 'plan:v2', '--target', root]);
  assert.equal(response.slots.planning.applicability, 'stale');
  response = runtime.inspectTaskReview(root, 'review-task');
  assert.equal(response.slots.planning.applicability, 'unknown');

  const missingIdentity = json(['task', 'review', 'record', 'review-task', '--type', 'completion', '--method', 'self', '--reviewed', 'candidate', '--outcome', 'ready', '--summary', 'done', '--target', root], 1);
  assert.equal(missingIdentity.status, 'blocked');
  assert.equal(missingIdentity.diagnostic.code, 'task_review_field_invalid');
  assert.deepEqual(missingIdentity.effects, []);
});

test('Review Result 可 Git 跟踪且 Environment ignore 不吞掉 review slots', (t) => {
  const { root } = fixture(t);
  createRuntime().recordTaskReview(root, 'review-task', {
    reviewType: 'completion',
    targetIdentity: 'candidate:g1',
    method: 'human',
    reviewed: ['candidate:g1'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'ready', summary: 'Candidate approved' },
  });
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.appendFileSync(path.join(root, '.gitignore'), '\n.buildr/tasks/*/environment.json\n');
  const result = spawnSync('git', ['check-ignore', '-q', '.buildr/tasks/review-task/reviews/completion.yml'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const yaml = fs.readFileSync(path.join(root, '.buildr', 'tasks', 'review-task', 'reviews', 'completion.yml'), 'utf8');
  assert.doesNotMatch(yaml, /revision|resultDigest|applicability/);
});

test('Local App 只读查看双槽位，并只生成 Task Review Agent prompt', async (t) => {
  const { base, root } = fixture(t);
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
  });
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };

  let response = await request(`${endpoint}/tasks/review-task/reviews`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.body.slots.planning.present, false);
  assert.equal(response.body.slots.completion.present, false);
  response = await request(`${endpoint}/tasks/review-task/reviews?target=plan:v1`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/tasks/missing-task/reviews`);
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'task_record_not_found');
  response = await request(`${endpoint}/tasks/review-task/reviews`, { method: 'POST', headers: writeHeaders, body: '{}' });
  assert.equal(response.status, 404, 'Local App must not expose direct Review Result writer');

  runtime.ensureTaskRecordDirectory(root, 'review-task');
  const environmentFile = path.join(root, '.buildr', 'tasks', 'review-task', 'environment.json');
  fs.writeFileSync(environmentFile, '{"owner":"environment-fixture"}\n');
  const taskBefore = runtime.inspectTaskRecord(root, 'review-task');
  const environmentBytes = fs.readFileSync(environmentFile);
  runtime.recordTaskReview(root, 'review-task', {
    reviewType: 'planning', targetIdentity: 'plan:local-app', method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Plan ready' },
  });
  response = await request(`${endpoint}/tasks/review-task/reviews`);
  assert.equal(response.body.slots.planning.present, true);
  assert.equal(response.body.slots.planning.applicability, 'unknown');
  assert.equal(response.body.slots.completion.present, false);
  const taskAfter = runtime.inspectTaskRecord(root, 'review-task');
  assert.equal(taskAfter.recordDigest, taskBefore.recordDigest);
  assert.deepEqual(taskAfter.record, taskBefore.record);
  assert.deepEqual(fs.readFileSync(environmentFile), environmentBytes);

  response = await request(`${endpoint}/prompts/task-review`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'review-task', reviewType: 'planning' }) });
  assert.equal(response.status, 200);
  assert.match(response.body.prompt, /task-review Skill/);
  assert.match(response.body.prompt, /中断、目标不明或结论不完整时不得覆盖/);
  response = await request(`${endpoint}/prompts/task-review`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'review-task', reviewType: 'planning', projectCode: 'demo', change: 'review-change' }) });
  assert.equal(response.status, 200);
  assert.match(response.body.prompt, /限定的 Task-scoped Change：demo\/review-change/);
  response = await request(`${endpoint}/prompts/task-review`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'review-task', reviewType: 'completion', projectCode: 'demo', change: 'unlinked' }) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'task_review_change_not_linked');
  response = await request(`${endpoint}/prompts/task-review`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'review-task', reviewType: 'planning', path: root }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
  const taskAtEnd = runtime.inspectTaskRecord(root, 'review-task');
  assert.equal(taskAtEnd.recordDigest, taskBefore.recordDigest);
  assert.deepEqual(taskAtEnd.record, taskBefore.record);
  assert.deepEqual(fs.readFileSync(environmentFile), environmentBytes);
});
