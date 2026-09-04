import path from 'node:path';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import { normalizeTaskReviewResult, taskReviewError, type TaskReviewResult, type TaskReviewType } from '../domain/task-review.ts';
import type { TaskPersistence } from './task-record-dto.ts';
import type { TaskReviewPersistence, TaskReviewRepositoryRuntime } from '../persistence/task-review-repository.ts';
import type { TransactionContext } from '../../infrastructure/sqlite/transaction.ts';

type ReviewSlot = { path: string; present: boolean; result: TaskReviewResult | null; resultDigest: string | null; observedAt: string | null };
type ReviewSlots = { planning: ReviewSlot; completion: ReviewSlot };
export type TaskReviewApplicationRuntime = Omit<TaskReviewRepositoryRuntime, 'readTaskRecordPersistence'> & {
  readTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  runWorkspaceTransaction<T>(targetRoot: string, action: (context: TransactionContext) => T): T;
  prepareTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  inspectTaskReview?: (targetRoot: string, taskId: string, input?: unknown) => unknown;
  recordTaskReview?: (targetRoot: string, taskId: string, input: unknown) => unknown;
};

function assertObject(input: unknown, label: string): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskReviewError('task_review_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input: unknown, fields: ReadonlySet<string>, label: string): asserts input is Record<string, unknown> {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskReviewError('task_review_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function relative(root: string, file: string) {
  if (file.startsWith('workspace-sqlite:')) return file;
  return path.relative(root, file).split(path.sep).join('/');
}

export function registerTaskReviewApplication<T extends TaskReviewApplicationRuntime>(runtime: T): T {
  function slot(targetRoot: string, taskId: string, reviewType: TaskReviewType): ReviewSlot {
    if (!runtime.readTaskReviewResultPersistence || !runtime.taskReviewResultPath) throw new Error('Task Review Repository ports are unavailable.');
    const persisted = runtime.readTaskReviewResultPersistence(targetRoot, taskId, reviewType, { optional: true });
    if (!persisted) {
      return { path: runtime.taskReviewResultPath(targetRoot, taskId, reviewType), present: false, result: null, resultDigest: null, observedAt: null };
    }
    return { path: persisted.file, present: true, result: persisted.result, resultDigest: persisted.resultDigest, observedAt: persisted.observedAt };
  }

  function slots(targetRoot: string, taskId: string, input: unknown = {}): ReviewSlots {
    assertFields(input, new Set(), 'Task Review inspect');
    return {
      planning: slot(targetRoot, taskId, 'planning'),
      completion: slot(targetRoot, taskId, 'completion'),
    };
  }

  function operationResult(operation: 'inspect' | 'record', status: 'inspected' | 'recorded', taskId: string, reviewSlots: ReviewSlots, effects: Array<{ type: string; path: string }> = []) {
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

  function inspectTaskReview(targetRoot: string, taskId: string, input: unknown = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    return operationResult('inspect', 'inspected', task.record.taskId, slots(task.root, task.record.taskId, input));
  }

  function recordTaskReview(targetRoot: string, taskId: string, input: unknown) {
    assertFields(input, new Set(['reviewType', 'subjectIdentity', 'method', 'reviewed', 'uncovered', 'findings', 'conclusion', 'expectedCurrentDigest']), 'Task Review record');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') {
      throw taskReviewError('task_review_task_terminal', `Task ${taskId} 已是 ${task.record.status}，不能记录新的 Review Result。`, 409, { status: task.record.status }, `运行 buildr task review inspect ${taskId} 查看已有结果。`);
    }
    const reviewType = input.reviewType === 'planning' || input.reviewType === 'completion' ? input.reviewType : null;
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
    }, { expectedTaskId: task.record.taskId, expectedReviewType: reviewType });
    const expectedCurrentDigest = typeof input.expectedCurrentDigest === 'string' ? input.expectedCurrentDigest.trim() : '';
    if (expectedCurrentDigest !== 'absent' && !/^sha256-[a-f0-9]{64}$/u.test(expectedCurrentDigest)) throw taskReviewError('task_review_expected_digest_invalid', 'expectedCurrentDigest 必须是absent或sha256 digest。', 400, { field: 'expectedCurrentDigest' });
    if (!runtime.writeTaskReviewResultPersistence) throw new Error('Task Review write port is unavailable.');
    const written = runtime.runWorkspaceTransaction(task.root, (transaction) => runtime.writeTaskReviewResultPersistence!(task.root, result, { expectedCurrentDigest }, transaction));
    const reviewSlots = slots(task.root, task.record.taskId);
    return operationResult('record', 'recorded', task.record.taskId, reviewSlots, [{
      type: written.created ? 'created' : 'updated',
      path: relative(task.root, written.file),
    }]);
  }

  return Object.assign(runtime, { inspectTaskReview, recordTaskReview });
}
