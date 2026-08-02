import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskRecord, TASK_RECORD_SCHEMA } from '../../src/domain/task-record/task-record.mjs';

function active(overrides = {}) {
  return {
    schemaVersion: TASK_RECORD_SCHEMA,
    taskId: 'demo-task',
    title: '演示任务',
    intent: '验证最小 Task Record',
    scope: { projects: ['demo'], services: [{ project: 'demo', service: 'api' }] },
    changes: [{ project: 'demo', change: 'change-one' }],
    status: 'active',
    result: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

test('Task Record v1 规范化最小 active/terminal 事实并保持限定 identity', () => {
  assert.deepEqual(normalizeTaskRecord(active()), active());
  assert.deepEqual(normalizeTaskRecord(active({
    status: 'completed', result: { summary: '已交付', noChange: false }, updatedAt: '2026-08-01T01:00:00.000Z',
  })).result, { summary: '已交付', noChange: false });
  assert.deepEqual(normalizeTaskRecord(active({
    status: 'abandoned', result: { summary: '目标取消' }, updatedAt: '2026-08-01T01:00:00.000Z',
  })).result, { summary: '目标取消' });
  assert.throws(() => normalizeTaskRecord(active({ status: 'completed', result: { summary: '缺少 noChange' } })), (error) => error.code === 'task_record_result_invalid');
  assert.throws(() => normalizeTaskRecord(active({ status: 'active', result: { summary: '不应存在' } })), (error) => error.code === 'task_record_result_invalid');
});

test('Task Record v1 是 closed schema，不接纳暂缓、Environment 或专业字段', () => {
  for (const field of ['revision', 'recordDigest', 'workspaceId', 'executionOwner', 'boardId', 'relations', 'blocker', 'records', 'overview', 'publication', 'worktree', 'branch', 'runtime', 'process', 'port', 'verification']) {
    assert.throws(() => normalizeTaskRecord({ ...active(), [field]: 'forbidden' }), (error) => error.code === 'task_record_field_forbidden' && error.details.field === field, field);
  }
  assert.throws(() => normalizeTaskRecord(active({ scope: { ...active().scope, environment: { path: '/tmp' } } })), (error) => error.code === 'task_record_field_forbidden' && error.details.field === 'scope.environment');
  assert.doesNotThrow(() => normalizeTaskRecord(active({ title: '修复 branch/runtime 文案', intent: '业务文本可以描述 worktree 和 verification，不做启发式扫描' })));
});

test('Task identity、当前记录引用去重与时间关系 fail closed', () => {
  assert.throws(() => normalizeTaskRecord(active({ taskId: '../escape' })), (error) => error.code === 'task_record_identity_invalid');
  assert.throws(() => normalizeTaskRecord(active(), { expectedTaskId: 'other-task' }), (error) => error.code === 'task_record_identity_mismatch');
  assert.throws(() => normalizeTaskRecord(active({ changes: [{ project: 'demo', change: 'same' }, { project: 'demo', change: 'same' }] })), (error) => error.code === 'task_record_reference_duplicate');
  assert.doesNotThrow(() => normalizeTaskRecord(active({ changes: [{ project: 'demo', change: 'same' }, { project: 'other', change: 'same' }] })));
  assert.throws(() => normalizeTaskRecord(active({ updatedAt: '2026-07-31T23:59:59.000Z' })), (error) => error.code === 'task_record_timestamp_invalid');
});
