import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { handleTaskHttpRequest } from '../../src/task/interfaces/http/task-http.ts';
import {
  inspectTaskHttpContractCoverage,
  TASK_HTTP_OPERATIONS,
  TASK_HTTP_VALIDATORS,
} from '../../src/task/interfaces/http/task-http-schema.ts';
import { checkTaskRecordHttpDto } from '../../tools/contracts/task-dto.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

const operations: any = new Map(TASK_HTTP_OPERATIONS.map((operation: any) => [operation.id, operation]));

function assertSchema(operationId: any, kind: any, value: any): any  {
  const operation: any = operations.get(operationId);
  const schemaId: any = kind === 'success' ? operation.successSchemaId : operation.errorSchemaId;
  const result: any = TASK_HTTP_VALIDATORS.validate(schemaId, value);
  assert.equal(result.valid, true, `${operationId} ${kind}: ${JSON.stringify(result.errors)}`);
}

test('Task Record contract catalog、DTO drift 与未迁移诊断保持局部', async () => {
  assert.equal(TASK_HTTP_OPERATIONS.length, 6);
  assert.deepEqual(TASK_HTTP_OPERATIONS.map((operation: any) => operation.id), [
    'task-record.list',
    'task-record.detail',
    'task-record.update',
    'task-record.complete',
    'task-record.abandon',
    'task-record.retrospective-document',
  ]);
  assert.deepEqual(await checkTaskRecordHttpDto(), []);
  const coverage: any = inspectTaskHttpContractCoverage([
    ...TASK_HTTP_OPERATIONS.map((operation: any) => operation.id),
    'task-record.overview',
  ]);
  assert.equal(coverage.status, 'attention');
  assert.deepEqual(coverage.unmigratedOperationIds, ['task-record.overview']);
  assert.equal(coverage.blocking, false);
});

test('Ajv request validation rejects retired and unknown fields without mutating input', () => {
  const input: any = { expectedRecordDigest: 'sha256-record', summary: '完成', noChange: false, extra: true };
  const before: any = structuredClone(input);
  const result: any = TASK_HTTP_VALIDATORS.validate(operations.get('task-record.complete').requestSchemaId, input);
  assert.equal(result.valid, false);
  assert.deepEqual(input, before);
  assert.equal(input.noChange, false);
  assert.equal(input.extra, true);
});

test('非法 DTO 在调用 Task Record Application writer 前被拒绝', async () => {
  let calls: any = 0;
  await assert.rejects(
    handleTaskHttpRequest({
      request: { method: 'PATCH' },
      suffix: '/tasks/contract-task',
      searchParams: new URLSearchParams(),
      root: '/unused',
      runtime: { updateTask(): any  { calls += 1; } },
      authorizeWrite(): any  {},
      readBody: async () => ({ expectedRecordDigest: 'sha256-record', title: 42 }),
    }),
    (error: any) => error.code === 'task_record_field_invalid',
  );
  assert.equal(calls, 0);
});

test('六个 Task Record operation 的真实 HTTP 成功与错误响应匹配 Schema', async (t: any) => {
  const { base, root }: any = taskRecordFixture(t, 'task-record-http-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime: any = createRuntime();
  const updateTask: any = runtime.createTask(root, { taskId: 'contract-update', title: '更新前', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const completeTask: any = runtime.createTask(root, { taskId: 'contract-complete', title: '待完成', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const abandonTask: any = runtime.createTask(root, { taskId: 'contract-abandon', title: '待放弃', intent: 'HTTP contract', projects: [], services: [], changes: [] });
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken }: any = await instance.ready;
  const endpoint: any = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders: any = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request: any = async (resource: any, options: any = {}) => {
    const response: any = await fetch(resource, options);
    return { status: response.status, body: await response.json() };
  };

  let response: any = await request(endpoint);
  assert.equal(response.status, 200);
  assertSchema('task-record.list', 'success', response.body);

  response = await request(`${endpoint}/contract-update`);
  assert.equal(response.status, 200);
  assertSchema('task-record.detail', 'success', response.body);

  const originalDigest: any = response.body.recordDigest;
  response = await request(`${endpoint}/contract-update`, {
    method: 'PATCH', headers: writeHeaders,
    body: JSON.stringify({ expectedRecordDigest: originalDigest, title: 42 }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'task_record_field_invalid');
  assertSchema('task-record.update', 'error', response.body);
  assert.equal(runtime.inspectTask(root, 'contract-update').recordDigest, originalDigest);

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
    body: JSON.stringify({ expectedRecordDigest: completeTask.recordDigest, summary: '契约完成' }),
  });
  assert.equal(response.status, 200);
  assertSchema('task-record.complete', 'success', response.body);

  response = await request(`${endpoint}/contract-complete/retrospective-document`);
  assert.equal(response.status, 200);
  assert.equal(response.body.effectiveState, 'missing');
  assertSchema('task-record.retrospective-document', 'success', response.body);

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
  runtime.createTask(root, { taskId: 'http-parent', title: '父任务', intent: '完整目标', isParent: true });
  runtime.createTask(root, { taskId: 'http-child', title: '子任务', intent: '独立成果', parentTaskId: 'http-parent' });
  runtime.completeTask(root, 'http-child', { expectedRecordDigest: runtime.inspectTask(root, 'http-child').recordDigest, summary: '真实成果已完成' });
  const parentRecord: any = runtime.inspectTask(root, 'http-parent');
  response = await request(`${endpoint}/http-parent/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: parentRecord.recordDigest, summary: '整体完成' }) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'parent_completion_authorization_required');
  const parentView: any = (await request(`${endpoint}/http-parent/coordination`)).body;
  assert.equal(parentView.completion.authorizationRequired, true);
  response = await request(`${endpoint}/http-parent/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: parentRecord.recordDigest, summary: '整体完成', parentCompletion: {
    expectedSnapshot: parentView.completion.snapshotIdentity,
    acceptance: { summary: '整体目标与真实成果已核对', children: [{ taskId: 'http-child', summary: '子任务范围完整覆盖' }] },
    authorization: { source: 'test:user-confirmation', statement: '用户明确授权完成 http-parent' },
  } }) });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assertSchema('task-record.complete', 'success', response.body);
  assert.equal(response.body.record.result.parentCompletion.authorization.source, 'test:user-confirmation');
  assert.equal(runtime.inspectTask(root, 'http-child').record.status, 'completed');

});
