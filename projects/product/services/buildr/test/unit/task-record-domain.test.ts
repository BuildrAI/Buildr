import assert from 'node:assert/strict';
import test from 'node:test';

import { isWorkspaceOnlyTaskRecord, normalizeTaskRecord, taskRecordEffectiveProjectCodes, TASK_RECORD_SCHEMA } from '../../src/task/domain/task-record.ts';

function active(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: TASK_RECORD_SCHEMA,
    taskId: 'demo-task',
    title: '演示任务',
    intent: '验证最小 Task Record',
    scope: { projects: ['demo'], services: [{ project: 'demo', service: 'api' }] },
    changes: [{ project: 'demo', change: 'change-one' }],
    parentTaskId: null,
    childTaskIds: [],
    retrospective: null,
    status: 'active',
    result: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}

function hasDetailField(cause: unknown, field: string): boolean {
  if (!(cause instanceof Error) || !('details' in cause) || !cause.details || typeof cause.details !== 'object' || Array.isArray(cause.details) || !('field' in cause.details)) return false;
  return cause.details.field === field;
}

test('Task Record v3 规范化 todo/active/terminal 事实并保持限定 identity', () => {
  assert.deepEqual(normalizeTaskRecord(active()), active());
  assert.deepEqual(normalizeTaskRecord(active({ status: 'todo', changes: [] })).result, null);
  assert.deepEqual(normalizeTaskRecord(active({
    status: 'completed', result: { summary: '已交付', noChange: false }, updatedAt: '2026-08-01T01:00:00.000Z',
  })).result, { summary: '已交付', noChange: false });
  assert.deepEqual(normalizeTaskRecord(active({
    status: 'abandoned', result: { summary: '目标取消' }, updatedAt: '2026-08-01T01:00:00.000Z',
  })).result, { summary: '目标取消' });
  assert.throws(() => normalizeTaskRecord(active({ status: 'completed', result: { summary: '缺少 noChange' } })), (error) => hasCode(error, 'task_record_result_invalid'));
  assert.throws(() => normalizeTaskRecord(active({ status: 'active', result: { summary: '不应存在' } })), (error) => hasCode(error, 'task_record_result_invalid'));
  assert.throws(() => normalizeTaskRecord(active({ status: 'todo' })), (error) => hasCode(error, 'task_record_todo_change_forbidden'));
});

test('Task Record v3 是 closed schema，不接纳 Environment 或专业字段', () => {
  for (const field of ['revision', 'recordDigest', 'workspaceId', 'executionOwner', 'boardId', 'relations', 'blocker', 'records', 'overview', 'publication', 'worktree', 'branch', 'runtime', 'process', 'port', 'verification']) {
    assert.throws(() => normalizeTaskRecord({ ...active(), [field]: 'forbidden' }), (error) => hasCode(error, 'task_record_field_forbidden') && hasDetailField(error, field), field);
  }
  assert.throws(() => normalizeTaskRecord(active({ scope: { ...active().scope, environment: { path: '/tmp' } } })), (error) => hasCode(error, 'task_record_field_forbidden') && hasDetailField(error, 'scope.environment'));
  assert.doesNotThrow(() => normalizeTaskRecord(active({ title: '修复 branch/runtime 文案', intent: '业务文本可以描述 worktree 和 verification，不做启发式扫描' })));
});

test('Task identity、当前记录引用去重与时间关系 fail closed', () => {
  assert.throws(() => normalizeTaskRecord(active({ taskId: '../escape' })), (error) => hasCode(error, 'task_record_identity_invalid'));
  assert.throws(() => normalizeTaskRecord(active(), { expectedTaskId: 'other-task' }), (error) => hasCode(error, 'task_record_identity_mismatch'));
  assert.throws(() => normalizeTaskRecord(active({ changes: [{ project: 'demo', change: 'same' }, { project: 'demo', change: 'same' }] })), (error) => hasCode(error, 'task_record_reference_duplicate'));
  assert.throws(() => normalizeTaskRecord(active({ parentTaskId: '../parent' })), (error) => hasCode(error, 'task_record_identity_invalid'));
  assert.throws(() => normalizeTaskRecord(active({ childTaskIds: ['child-b', 'child-b'] })), (error) => hasCode(error, 'task_record_reference_duplicate'));
  assert.deepEqual(normalizeTaskRecord(active({ parentTaskId: 'parent-task', childTaskIds: ['child-b', 'child-a'] })).childTaskIds, ['child-a', 'child-b']);
  assert.throws(() => normalizeTaskRecord(active({ retrospectiveSourceTaskIds: ['source-a'] })), (error) => hasCode(error, 'task_record_field_forbidden'));
  assert.doesNotThrow(() => normalizeTaskRecord(active({ changes: [{ project: 'demo', change: 'same' }, { project: 'other', change: 'same' }] })));
  assert.throws(() => normalizeTaskRecord(active({ updatedAt: '2026-07-31T23:59:59.000Z' })), (error) => hasCode(error, 'task_record_timestamp_invalid'));
});

test('Task Record v3 只在终态保存复盘文档摘要与两种决定状态', () => {
  const documentDigest = `sha256-${'a'.repeat(64)}`;
  const pending = normalizeTaskRecord(active({
    status: 'completed',
    result: { summary: '已交付', noChange: false },
    retrospective: { state: 'pending-decision', documentDigest },
  }));
  assert.deepEqual(pending.retrospective, { state: 'pending-decision', documentDigest });
  const decided = normalizeTaskRecord({ ...pending, retrospective: { state: 'decided', documentDigest } });
  assert.equal(decided.retrospective?.state, 'decided');
  assert.throws(() => normalizeTaskRecord(active({ retrospective: { state: 'pending-decision', documentDigest } })), (error) => hasCode(error, 'task_record_retrospective_task_not_terminal'));
  assert.throws(() => normalizeTaskRecord({ ...pending, retrospective: { state: 'handled', documentDigest } }), (error) => hasCode(error, 'task_record_retrospective_state_invalid'));
  assert.throws(() => normalizeTaskRecord({ ...pending, retrospective: { state: 'decided', documentDigest: 'sha256-invalid' } }), (error) => hasCode(error, 'task_record_retrospective_digest_invalid'));
  assert.throws(() => normalizeTaskRecord({ ...pending, retrospective: { state: 'decided', documentDigest, note: '不保存处置说明' } }), (error) => hasCode(error, 'task_record_field_forbidden'));
});

test('有效 Project 集合合并显式 Project、Service 与 Change，只有空并集才是仅工作区', () => {
  const record = normalizeTaskRecord(active({
    scope: { projects: ['zeta', 'demo'], services: [{ project: 'alpha', service: 'api' }, { project: 'demo', service: 'web' }] },
    changes: [{ project: 'beta', change: 'one' }, { project: 'alpha', change: 'two' }],
  }));
  assert.deepEqual(taskRecordEffectiveProjectCodes(record), ['alpha', 'beta', 'demo', 'zeta']);
  assert.equal(isWorkspaceOnlyTaskRecord(record), false);
  const workspaceOnly = normalizeTaskRecord(active({ scope: { projects: [], services: [] }, changes: [] }));
  assert.deepEqual(taskRecordEffectiveProjectCodes(workspaceOnly), []);
  assert.equal(isWorkspaceOnlyTaskRecord(workspaceOnly), true);
});
