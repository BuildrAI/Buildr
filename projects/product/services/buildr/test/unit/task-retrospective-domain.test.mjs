import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskRetrospectiveDisposition, normalizeTaskRetrospectiveResult } from '../../src/task/domain/task-retrospective.mjs';

const valid = {
  schemaVersion: 'buildr.task-retrospective-result/v1',
  taskId: 'demo-task',
  focus: 'agent-execution-efficiency',
  reportMarkdown: '# 复盘\n\n减少重复验证。',
  completedAt: '2026-08-05T00:00:00.000Z',
};

test('Task Retrospective Result 保持closed且focus固定', () => {
  assert.deepEqual(normalizeTaskRetrospectiveResult(valid, { expectedTaskId: 'demo-task' }), valid);
  assert.throws(() => normalizeTaskRetrospectiveResult({ ...valid, score: 5 }), (error) => error.code === 'task_retrospective_field_forbidden');
  assert.throws(() => normalizeTaskRetrospectiveResult({ ...valid, focus: 'general-quality' }), (error) => error.code === 'task_retrospective_focus_invalid');
  assert.throws(() => normalizeTaskRetrospectiveResult({ ...valid, reportMarkdown: '   ' }), (error) => error.code === 'task_retrospective_field_invalid');
});

test('Task Retrospective disposition保持三态与字段一致性', () => {
  assert.deepEqual(normalizeTaskRetrospectiveDisposition({ status: 'pending', note: null, disposedAt: null }), { status: 'pending', note: null, disposedAt: null });
  assert.deepEqual(normalizeTaskRetrospectiveDisposition({ status: 'handled', note: '  已建立 follow-up Task。 ', disposedAt: '2026-08-08T00:00:00.000Z' }), {
    status: 'handled', note: '已建立 follow-up Task。', disposedAt: '2026-08-08T00:00:00.000Z',
  });
  assert.deepEqual(normalizeTaskRetrospectiveDisposition({ status: 'no-action', note: '当前成本可接受。', disposedAt: '2026-08-08T00:00:00.000Z' }).status, 'no-action');
  assert.throws(() => normalizeTaskRetrospectiveDisposition({ status: 'ignored', note: null, disposedAt: null }), (error) => error.code === 'task_retrospective_disposition_status_invalid');
  assert.throws(() => normalizeTaskRetrospectiveDisposition({ status: 'pending', note: '旧说明', disposedAt: null }), (error) => error.code === 'task_retrospective_disposition_pending_note_forbidden');
  assert.throws(() => normalizeTaskRetrospectiveDisposition({ status: 'handled', note: ' ', disposedAt: '2026-08-08T00:00:00.000Z' }), (error) => error.code === 'task_retrospective_field_invalid');
});
