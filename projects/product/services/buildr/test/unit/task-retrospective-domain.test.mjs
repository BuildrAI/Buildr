import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskRetrospectiveResult } from '../../src/domain/task-retrospective/task-retrospective.mjs';

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
