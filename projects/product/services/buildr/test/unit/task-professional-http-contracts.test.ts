import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_PROFESSIONAL_HTTP_OPERATIONS,
  TASK_PROFESSIONAL_HTTP_SCHEMAS,
  TASK_PROFESSIONAL_HTTP_VALIDATORS,
  inspectTaskProfessionalHttpContractCoverage,
  validateTaskProfessionalRequest,
} from '../../src/task/interfaces/http/task-professional-http-contracts.ts';

test('专业 HTTP catalog 为每个 operation 提供稳定 request/success/error schema', () => {
  const ids: any = TASK_PROFESSIONAL_HTTP_OPERATIONS.map((item: any) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 3);
  assert.equal(ids.includes('task-overview.detail'), false);
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
  const input: any = { expectedCurrentDigest: 'sha256-current', note: '保留', extra: true };
  const before: any = structuredClone(input);
  assert.throws(() => validateTaskProfessionalRequest('task-review.detail', input, 'review'), (error: any) => error.code === 'task_api_field_forbidden');
  assert.deepEqual(input, before);
  assert.throws(() => validateTaskProfessionalRequest('task-retrospective.patch', {}, 'retrospective'), /not registered/);
  assert.throws(() => validateTaskProfessionalRequest('task-execution-record.list', {}, 'execution records'), /not registered/);
});

test('未迁移 operation 只形成 attention diagnostic，不阻断其他能力', () => {
  const result: any = inspectTaskProfessionalHttpContractCoverage(['task-review.detail', 'workspace.projects.list']);
  assert.equal(result.status, 'attention');
  assert.deepEqual(result.unmigratedOperationIds, ['workspace.projects.list']);
  assert.equal(result.blocking, false);
});

test('专业 response Schema 与 error Schema 已注册', () => {
  assert.equal(TASK_PROFESSIONAL_HTTP_SCHEMAS.errorResponse.$id, 'https://schemas.buildr.ai/http/task-professional/error/response/v1');
  assert.equal(TASK_PROFESSIONAL_HTTP_SCHEMAS.reviewsResponse.additionalProperties, false);
  assert.equal(TASK_PROFESSIONAL_HTTP_SCHEMAS.verificationResponse.additionalProperties, false);
  assert.equal(TASK_PROFESSIONAL_HTTP_SCHEMAS.coordinationResponse.additionalProperties, false);
  assert.equal(TASK_PROFESSIONAL_HTTP_VALIDATORS.validate(TASK_PROFESSIONAL_HTTP_SCHEMAS.reviewsResponse.$id, {}).valid, false);
});
