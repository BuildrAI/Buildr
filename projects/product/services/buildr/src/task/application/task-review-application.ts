// @ts-nocheck -- Existing application migrated to the single TypeScript source in this change.
import path from 'node:path';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import { normalizeTaskReviewResult, taskReviewError } from '../domain/task-review.ts';

function assertObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskReviewError('task_review_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input, fields, label) {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskReviewError('task_review_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function relative(root, file) {
  if (file.startsWith('workspace-sqlite:')) return file;
  return path.relative(root, file).split(path.sep).join('/');
}

export function registerTaskReviewApplication(runtime) {
  function slot(targetRoot, taskId, reviewType) {
    const persisted = runtime.readTaskReviewResultPersistence(targetRoot, taskId, reviewType, { optional: true });
    if (!persisted) {
      return { path: runtime.taskReviewResultPath(targetRoot, taskId, reviewType), present: false, result: null, resultDigest: null, observedAt: null };
    }
    return { path: persisted.file, present: true, result: persisted.result, resultDigest: persisted.resultDigest, observedAt: persisted.observedAt };
  }

  function slots(targetRoot, taskId, input = {}) {
    assertFields(input, new Set(), 'Task Review inspect');
    return {
      planning: slot(targetRoot, taskId, 'planning'),
      completion: slot(targetRoot, taskId, 'completion'),
    };
  }

  function operationResult(operation, status, taskId, reviewSlots, effects = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskReviewOperationResult, {
      operation,
      status,
      taskId,
      slots: reviewSlots,
      diagnostic: null,
      effects,
      nextActions: [],
    });
  }

  function inspectTaskReview(targetRoot, taskId, input = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    return operationResult('inspect', 'inspected', task.record.taskId, slots(task.root, task.record.taskId, input));
  }

  function recordTaskReview(targetRoot, taskId, input) {
    assertFields(input, new Set(['reviewType', 'subjectIdentity', 'method', 'reviewed', 'uncovered', 'findings', 'conclusion', 'expectedCurrentDigest']), 'Task Review record');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskReviewError('task_review_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的 Review Result。`, 409, { status: task.record.status }, `运行 buildr task review inspect ${taskId} 查看已有结果。`);
    }
    const result = normalizeTaskReviewResult({
      schemaVersion: 'buildr.task-review-result/v2',
      taskId: task.record.taskId,
      reviewType: input.reviewType,
      subjectIdentity: input.subjectIdentity,
      method: input.method,
      reviewed: input.reviewed,
      uncovered: input.uncovered,
      findings: input.findings,
      conclusion: input.conclusion,
      completedAt: new Date().toISOString(),
    }, { expectedTaskId: task.record.taskId, expectedReviewType: input.reviewType });
    const expectedCurrentDigest = typeof input.expectedCurrentDigest === 'string' ? input.expectedCurrentDigest.trim() : '';
    if (expectedCurrentDigest !== 'absent' && !/^sha256-[a-f0-9]{64}$/u.test(expectedCurrentDigest)) throw taskReviewError('task_review_expected_digest_invalid', 'expectedCurrentDigest 必须是absent或sha256 digest。', 400, { field: 'expectedCurrentDigest' });
    const written = runtime.writeTaskReviewResultPersistence(task.root, result, { expectedCurrentDigest });
    const reviewSlots = slots(task.root, task.record.taskId);
    return operationResult('record', 'recorded', task.record.taskId, reviewSlots, [{
      type: written.created ? 'created' : 'updated',
      path: relative(task.root, written.file),
    }]);
  }

  Object.assign(runtime, { inspectTaskReview, recordTaskReview });
  return runtime;
}
