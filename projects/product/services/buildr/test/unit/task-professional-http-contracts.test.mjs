import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_PROFESSIONAL_HTTP_OPERATIONS,
  TASK_PROFESSIONAL_HTTP_SCHEMAS,
  TASK_PROFESSIONAL_HTTP_VALIDATORS,
  inspectTaskProfessionalHttpContractCoverage,
  validateTaskProfessionalRequest,
} from '../../src/task/interfaces/http/task-professional-http-contracts.ts';
import { mapTaskRetrospectiveRequest } from '../../src/task/interfaces/http/task-professional-http-mapping.ts';

test('专业 HTTP catalog 为每个 operation 提供稳定 request/success/error schema', () => {
  const ids = TASK_PROFESSIONAL_HTTP_OPERATIONS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 6);
  assert.equal(ids.includes('task-environment.detail'), false);
  assert.equal(ids.includes('task-development.detail'), false);
  assert.equal(ids.includes('task-review.prompt'), false);
  assert.equal(ids.includes('task-verification.prompt'), false);
  for (const operation of TASK_PROFESSIONAL_HTTP_OPERATIONS) {
    assert.ok(TASK_PROFESSIONAL_HTTP_VALIDATORS.schemaIds.includes(operation.requestSchemaId));
    assert.ok(TASK_PROFESSIONAL_HTTP_VALIDATORS.schemaIds.includes(operation.successSchemaId));
    assert.ok(TASK_PROFESSIONAL_HTTP_VALIDATORS.schemaIds.includes(operation.errorSchemaId));
  }
});

test('strict validator 拒绝未知字段、缺失字段和非法类型且不变异输入', () => {
  const input = { expectedCurrentDigest: 'sha256-current', note: '保留', extra: true };
  const before = structuredClone(input);
  assert.throws(() => validateTaskProfessionalRequest('task-retrospective.patch', input, 'retrospective'), (error) => error.code === 'task_api_field_forbidden');
  assert.deepEqual(input, before);
  assert.throws(() => validateTaskProfessionalRequest('task-retrospective.patch', {}, 'retrospective'), (error) => error.code === 'task_retrospective_digest_required');
  assert.throws(() => validateTaskProfessionalRequest('task-execution-record.list', {}, 'execution records'), /not registered/);
});

test('Interface mapping 返回新对象，不把 DTO 原对象传入 Application', () => {
  const retrospective = { status: 'handled', note: '已处理', expectedCurrentDigest: 'sha256-current' };
  const mappedRetrospective = mapTaskRetrospectiveRequest(retrospective);
  assert.notEqual(mappedRetrospective, retrospective);
  assert.deepEqual(mappedRetrospective, retrospective);
});

test('未迁移 operation 只形成 attention diagnostic，不阻断其他能力', () => {
  const result = inspectTaskProfessionalHttpContractCoverage(['task-overview.detail', 'workspace.projects.list']);
  assert.equal(result.status, 'attention');
  assert.deepEqual(result.unmigratedOperationIds, ['workspace.projects.list']);
  assert.equal(result.blocking, false);
});

test('专业 response Schema 与 error Schema 已注册', () => {
  assert.equal(TASK_PROFESSIONAL_HTTP_SCHEMAS.errorResponse.$id, 'https://schemas.buildr.ai/http/task-professional/error/response/v1');
  assert.equal(TASK_PROFESSIONAL_HTTP_VALIDATORS.validate(TASK_PROFESSIONAL_HTTP_SCHEMAS.overviewResponse.$id, {}).valid, true);
});
