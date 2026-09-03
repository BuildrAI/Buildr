// @ts-nocheck -- Existing behavioral suite migrated with its public interface.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
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

test('Task Review CLI 提供单一稳定 JSON、两槽位与CAS写入', (t) => {
  const { root } = fixture(t);
  const runtime = createRuntime();
  let response = json(['task', 'review', 'inspect', 'review-task', '--target', root]);
  assert.equal(response.schemaVersion, 'buildr.task-review-operation-result/v2');
  assert.equal(response.status, 'inspected');
  assert.equal(response.slots.planning.present, false);

  response = json(['task', 'review', 'record', 'review-task', '--type', 'planning', '--subject-identity', 'plan:v1', '--method', 'self', '--reviewed', 'task intent', '--uncovered', 'browser::not relevant', '--finding', 'No blocking finding', '--outcome', 'accepted', '--summary', 'Plan is accepted', '--expected-current', 'absent', '--target', root]);
  assert.equal(response.status, 'recorded');
  assert.equal(response.slots.planning.result.subjectIdentity, 'plan:v1');
  assert.deepEqual(response.effects, [{ type: 'created', path: 'workspace-sqlite:task-review/review-task/planning' }]);
  assert.equal('resultDigest' in response.slots.planning.result, false);

  assert.equal('applicability' in response.slots.planning, false);

  const missingIdentity = json(['task', 'review', 'record', 'review-task', '--type', 'completion', '--method', 'self', '--reviewed', 'result', '--outcome', 'accepted', '--summary', 'done', '--expected-current', 'absent', '--target', root], 1);
  assert.equal(missingIdentity.status, 'blocked');
  assert.equal(missingIdentity.diagnostic.code, 'task_review_field_invalid');
  assert.deepEqual(missingIdentity.effects, []);
});

test('Review Result只在SQLite持久化且数据库保持Git ignore', (t) => {
  const { root } = fixture(t);
  createRuntime().recordTaskReview(root, 'review-task', {
    reviewType: 'completion',
    subjectIdentity: 'git:content-g1',
    method: 'human',
    reviewed: ['git:content-g1'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'accepted', summary: 'Result accepted' },
    expectedCurrentDigest: 'absent',
  });
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  const result = spawnSync('git', ['check-ignore', '-q', '.buildr/local/workspace.sqlite'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const runtime = createRuntime();
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  const payload = opened.database.prepare("SELECT result_json FROM task_review_current WHERE task_id = 'review-task' AND review_type = 'completion'").get().result_json;
  opened.database.close();
  assert.doesNotMatch(payload, /revision|resultDigest|applicability/);
});

test('Buildr Web 只读查看双槽位且不提供后台Prompt或Result writer', async (t) => {
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-review-product-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
  });
  const { root } = fixture(t, { base });
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
  assert.equal(response.status, 404, 'Buildr Web must not expose direct Review Result writer');

  runtime.ensureTaskRecordDirectory(root, 'review-task');
  const environmentFile = path.join(root, '.buildr', 'tasks', 'review-task', 'environment.json');
  fs.writeFileSync(environmentFile, '{"owner":"environment-fixture"}\n');
  const taskBefore = runtime.inspectTaskRecord(root, 'review-task');
  const environmentBytes = fs.readFileSync(environmentFile);
  runtime.recordTaskReview(root, 'review-task', {
    reviewType: 'planning', subjectIdentity: 'plan:local-app', method: 'self', reviewed: ['task intent'], uncovered: [], findings: [], conclusion: { outcome: 'accepted', summary: 'Plan accepted' }, expectedCurrentDigest: 'absent',
  });
  response = await request(`${endpoint}/tasks/review-task/reviews`);
  assert.equal(response.body.slots.planning.present, true);
  assert.equal('applicability' in response.body.slots.planning, false);
  assert.equal(response.body.slots.completion.present, false);
  const taskAfter = runtime.inspectTaskRecord(root, 'review-task');
  assert.equal(taskAfter.recordDigest, taskBefore.recordDigest);
  assert.deepEqual(taskAfter.record, taskBefore.record);
  assert.deepEqual(fs.readFileSync(environmentFile), environmentBytes);

  response = await request(`${endpoint}/prompts/task-review`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'review-task', reviewType: 'planning' }) });
  assert.equal(response.status, 404);
  const taskAtEnd = runtime.inspectTaskRecord(root, 'review-task');
  assert.equal(taskAtEnd.recordDigest, taskBefore.recordDigest);
  assert.deepEqual(taskAtEnd.record, taskBefore.record);
  assert.deepEqual(fs.readFileSync(environmentFile), environmentBytes);
});
