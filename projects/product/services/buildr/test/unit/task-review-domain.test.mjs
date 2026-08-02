import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTaskReviewResult,
  TASK_REVIEW_RESULT_SCHEMA,
} from '../../src/domain/task-review/task-review.mjs';

function result(overrides = {}) {
  return {
    schemaVersion: TASK_REVIEW_RESULT_SCHEMA,
    taskId: 'demo-task',
    reviewType: 'planning',
    targetIdentity: 'plan:sha256-demo',
    method: 'self',
    reviewed: ['task intent'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'ready', summary: '边界清晰，可以实现。' },
    completedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

test('Task Review Result v1 规范化两种类型和最小完整结果', () => {
  assert.deepEqual(normalizeTaskReviewResult(result()), result());
  assert.equal(normalizeTaskReviewResult(result({
    reviewType: 'completion',
    targetIdentity: 'candidate:generation-1',
    method: 'independent-agent',
    reviewed: ['candidate:generation-1'],
    uncovered: [{ subject: 'browser smoke', reason: '当前环境没有浏览器。' }],
    findings: ['未发现阻断问题。'],
    conclusion: { outcome: 'changes-required', summary: '先补浏览器证据。' },
  })).reviewType, 'completion');
});

test('Task Review Result 是 closed schema，不接纳 revision 或其他预设计字段', () => {
  for (const field of ['revision', 'resultId', 'current', 'applicability', 'status', 'reviewer', 'session', 'model', 'duration', 'policy', 'environment', 'candidate', 'history']) {
    assert.throws(() => normalizeTaskReviewResult({ ...result(), [field]: 'forbidden' }), (error) => error.code === 'task_review_field_forbidden' && error.details.field === field, field);
  }
  assert.throws(() => normalizeTaskReviewResult(result({ conclusion: { outcome: 'ready', summary: 'ok', severity: 'p0' } })), (error) => error.code === 'task_review_field_forbidden' && error.details.field === 'conclusion.severity');
  assert.throws(() => normalizeTaskReviewResult(result({ uncovered: [{ subject: 'browser', reason: 'missing', owner: 'agent' }] })), (error) => error.code === 'task_review_field_forbidden' && error.details.field === 'uncovered[0].owner');
});

test('Task Review Result 拒绝不完整结论、identity mismatch 与本机路径引用', () => {
  assert.throws(() => normalizeTaskReviewResult(result({ reviewed: [] })), (error) => error.code === 'task_review_field_invalid');
  assert.throws(() => normalizeTaskReviewResult(result({ targetIdentity: '' })), (error) => error.code === 'task_review_field_invalid');
  assert.throws(() => normalizeTaskReviewResult(result({ method: 'agent' })), (error) => error.code === 'task_review_method_invalid');
  assert.throws(() => normalizeTaskReviewResult(result({ conclusion: { outcome: 'blocked', summary: 'not complete' } })), (error) => error.code === 'task_review_outcome_invalid');
  assert.throws(() => normalizeTaskReviewResult(result({ uncovered: [{ subject: 'browser' }] })), (error) => error.code === 'task_review_field_invalid');
  assert.throws(() => normalizeTaskReviewResult(result({ reviewed: ['/Users/example/private.log'] })), (error) => error.code === 'task_review_reference_not_portable');
  assert.throws(() => normalizeTaskReviewResult(result(), { expectedTaskId: 'other-task' }), (error) => error.code === 'task_review_task_identity_mismatch');
  assert.throws(() => normalizeTaskReviewResult(result(), { expectedReviewType: 'completion' }), (error) => error.code === 'task_review_type_identity_mismatch');
});
