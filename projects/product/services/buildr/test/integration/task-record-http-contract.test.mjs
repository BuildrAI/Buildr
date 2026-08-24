import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.mjs';
import { handleTaskRecordHttpRequest } from '../../src/task/interfaces/http/task-record-http.mjs';
import {
  inspectTaskRecordHttpContractCoverage,
  TASK_RECORD_HTTP_OPERATIONS,
  TASK_RECORD_HTTP_VALIDATORS,
} from '../../src/task/interfaces/http/task-record-http-contracts.mjs';
import { checkTaskRecordHttpDto } from '../../tools/contracts/task-record-dto.mjs';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.mjs';

after(() => cleanupLocalTaskLifecycleSystemContext());

const operations = new Map(TASK_RECORD_HTTP_OPERATIONS.map((operation) => [operation.id, operation]));

function assertSchema(operationId, kind, value) {
  const operation = operations.get(operationId);
  const schemaId = kind === 'success' ? operation.successSchemaId : operation.errorSchemaId;
  const result = TASK_RECORD_HTTP_VALIDATORS.validate(schemaId, value);
  assert.equal(result.valid, true, `${operationId} ${kind}: ${JSON.stringify(result.errors)}`);
}

test('Task Record contract catalog、DTO drift 与未迁移诊断保持局部', async () => {
  assert.equal(TASK_RECORD_HTTP_OPERATIONS.length, 5);
  assert.deepEqual(TASK_RECORD_HTTP_OPERATIONS.map((operation) => operation.id), [
    'task-record.list',
    'task-record.detail',
    'task-record.update',
    'task-record.complete',
    'task-record.abandon',
  ]);
  assert.deepEqual(await checkTaskRecordHttpDto(), []);
  const coverage = inspectTaskRecordHttpContractCoverage([
    ...TASK_RECORD_HTTP_OPERATIONS.map((operation) => operation.id),
    'task-record.overview',
  ]);
  assert.equal(coverage.status, 'attention');
  assert.deepEqual(coverage.unmigratedOperationIds, ['task-record.overview']);
  assert.equal(coverage.blocking, false);
});

test('Ajv request validation is strict and does not mutate input', () => {
  const input = { expectedRecordDigest: 'sha256-record', summary: '完成', noChange: 'false', extra: true };
  const before = structuredClone(input);
  const result = TASK_RECORD_HTTP_VALIDATORS.validate(operations.get('task-record.complete').requestSchemaId, input);
  assert.equal(result.valid, false);
  assert.deepEqual(input, before);
  assert.equal(input.noChange, 'false');
  assert.equal(input.extra, true);
});

test('非法 DTO 在调用 Task Record Application writer 前被拒绝', async () => {
  let calls = 0;
  await assert.rejects(
    handleTaskRecordHttpRequest({
      request: { method: 'PATCH' },
      suffix: '/tasks/contract-task',
      searchParams: new URLSearchParams(),
      root: '/unused',
      runtime: { updateTaskRecord() { calls += 1; } },
      authorizeWrite() {},
      readBody: async () => ({ expectedRecordDigest: 'sha256-record', title: 42 }),
    }),
    (error) => error.code === 'task_record_field_invalid',
  );
  assert.equal(calls, 0);
});

test('五个 Task Record operation 的真实 HTTP 成功与错误响应匹配 Schema', async (t) => {
  const { base, root } = taskRecordFixture(t, 'task-record-http-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  const updateTask = runtime.createTaskRecord(root, { taskId: 'contract-update', title: '更新前', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const completeTask = runtime.createTaskRecord(root, { taskId: 'contract-complete', title: '待完成', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const abandonTask = runtime.createTaskRecord(root, { taskId: 'contract-abandon', title: '待放弃', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options);
    return { status: response.status, body: await response.json() };
  };

  let response = await request(endpoint);
  assert.equal(response.status, 200);
  assertSchema('task-record.list', 'success', response.body);

  response = await request(`${endpoint}/contract-update`);
  assert.equal(response.status, 200);
  assertSchema('task-record.detail', 'success', response.body);

  const originalDigest = response.body.recordDigest;
  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: originalDigest, title: 42 }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'task_record_field_invalid');
  assertSchema('task-record.update', 'error', response.body);
  assert.equal(runtime.inspectTaskRecord(root, 'contract-update').recordDigest, originalDigest);

  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: originalDigest, title: '不可越界', root }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
  assertSchema('task-record.update', 'error', response.body);

  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: originalDigest, title: '不可未知', futureField: true }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'task_api_field_forbidden');
  assertSchema('task-record.update', 'error', response.body);

  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ title: '缺少 digest' }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'task_record_digest_required');
  assertSchema('task-record.update', 'error', response.body);

  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: updateTask.recordDigest, title: '更新后' }),
  });
  assert.equal(response.status, 200);
  assertSchema('task-record.update', 'success', response.body);

  response = await request(`${endpoint}/contract-complete/complete`, {
    method: 'POST', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: completeTask.recordDigest, summary: '契约完成', noChange: false }),
  });
  assert.equal(response.status, 200);
  assertSchema('task-record.complete', 'success', response.body);

  response = await request(`${endpoint}/contract-abandon/abandon`, {
    method: 'POST', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: abandonTask.recordDigest, reason: '契约放弃' }),
  });
  assert.equal(response.status, 200);
  assertSchema('task-record.abandon', 'success', response.body);

  response = await request(`${endpoint}?q=a&q=b`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'task_api_query_invalid');
  assertSchema('task-record.list', 'error', response.body);

  response = await request(`${endpoint}?target=/tmp/private`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'target_forbidden');
  assertSchema('task-record.list', 'error', response.body);
});
