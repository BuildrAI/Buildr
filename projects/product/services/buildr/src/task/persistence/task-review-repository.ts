import crypto from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { assertTaskReviewType, normalizeTaskReviewResult, taskReviewError, type TaskReviewBusinessError, type TaskReviewResult, type TaskReviewType } from '../domain/task-review.ts';
import type { TaskPersistence } from './task-record-repository.ts';

type SqlRow = Record<string, SQLOutputValue>;
type StructuredStore = { present: boolean; database: DatabaseSync };
export type TaskReviewPersistence = { root: string; file: string; content: string; resultDigest: string; result: TaskReviewResult; subjectIdentity: string; outcome: string; observedAt: string; created?: boolean };
export type TaskReviewRepositoryRuntime = {
  assertCanonicalTaskWorkspace(targetRoot: string): string;
  readTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  openWorkspaceStructuredStore(targetRoot: string, options: { writable: boolean }): StructuredStore;
  taskReviewSerialize?: ((result: TaskReviewResult) => string) | null;
  taskReviewDirectory?: (targetRoot: string, taskId: string) => string;
  taskReviewResultPath?: (targetRoot: string, taskId: string, reviewType: TaskReviewType) => string;
  readTaskReviewResultPersistence?: (targetRoot: string, taskId: string, reviewType: TaskReviewType, options?: { optional?: boolean }) => TaskReviewPersistence | null;
  writeTaskReviewResultPersistence?: (targetRoot: string, result: TaskReviewResult, options: { expectedCurrentDigest: string }) => TaskReviewPersistence & { created: boolean };
  renderTaskReviewResult?: typeof renderTaskReviewResult;
};

function locator(taskId: string, reviewType: TaskReviewType) { return `workspace-sqlite:task-review/${taskId}/${reviewType}`; }
function digest(value: string) { return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`; }
function errorFields(error: unknown): Record<string, unknown> & { message: string } {
  if (!(error instanceof Error)) return { message: String(error) };
  return { message: error.message, ...Object.fromEntries(Object.entries(error)) };
}
function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Task Review query field is invalid: ${field}`);
  return value;
}
function asError(error: unknown, operation: string, taskId: string, reviewType: TaskReviewType, stage?: string): TaskReviewBusinessError {
  const failure = errorFields(error);
  if (failure.taskReviewBusiness === true && error instanceof Error) return error as TaskReviewBusinessError;
  const originalDetails = failure.details && typeof failure.details === 'object' && !Array.isArray(failure.details) ? failure.details as Record<string, unknown> : {};
  const details = { ...originalDetails, taskId, reviewType, ...(stage ? { stage, path: locator(taskId, reviewType), rollback: { status: 'restored' } } : {}) };
  if (failure.structuredStoreBusiness === true) return taskReviewError(typeof failure.code === 'string' ? failure.code : 'workspace_store_failed', failure.message, typeof failure.status === 'number' ? failure.status : 500, details, typeof failure.nextAction === 'string' ? failure.nextAction : undefined);
  return taskReviewError('task_review_write_failed', `Task Review Result ${operation}失败：${failure.message}`, 500, details, '保留Workspace SQLite现场并运行Buildr Doctor。');
}
function decode(serialized: string, taskId: string, reviewType: TaskReviewType): TaskReviewResult {
  try { return normalizeTaskReviewResult(JSON.parse(serialized), { expectedTaskId: taskId, expectedReviewType: reviewType }); }
  catch (error: unknown) {
    const failure = errorFields(error);
    if (failure.taskReviewBusiness === true && typeof failure.code === 'string' && ['task_review_task_identity_mismatch', 'task_review_type_identity_mismatch'].includes(failure.code)) throw error;
    const detail = failure.details && typeof failure.details === 'object' && !Array.isArray(failure.details) ? failure.details as Record<string, unknown> : {};
    throw taskReviewError('task_review_result_invalid', `${locator(taskId, reviewType)} 无法读取：${failure.message}`, 409, { taskId, reviewType, path: locator(taskId, reviewType), cause: typeof failure.code === 'string' ? failure.code : 'invalid_json', ...(detail.field === undefined ? {} : { field: detail.field }) }, '保留数据库现场并运行Buildr Doctor；不要从旧YAML恢复。');
  }
}
function persistence(root: string, taskId: string, reviewType: TaskReviewType, serialized: string, result: TaskReviewResult, row: SqlRow = {}): TaskReviewPersistence {
  return { root, file: locator(taskId, reviewType), content: serialized, resultDigest: digest(serialized), result,
    subjectIdentity: typeof row.subject_identity === 'string' ? row.subject_identity : result.subjectIdentity,
    outcome: typeof row.outcome === 'string' ? row.outcome : result.conclusion.outcome,
    observedAt: typeof row.updated_at === 'string' ? row.updated_at : result.completedAt };
}
export function renderTaskReviewResult(result: TaskReviewResult) { return JSON.stringify(normalizeTaskReviewResult(result, { expectedTaskId: result.taskId, expectedReviewType: result.reviewType })); }

export function registerTaskReviewRepository<T extends TaskReviewRepositoryRuntime>(runtime: T): T {
  function taskReviewDirectory(targetRoot: string, taskId: string) { runtime.assertCanonicalTaskWorkspace(targetRoot); return `workspace-sqlite:task-review/${taskId}`; }
  function taskReviewResultPath(targetRoot: string, taskId: string, reviewTypeValue: unknown) { const reviewType = assertTaskReviewType(reviewTypeValue); runtime.assertCanonicalTaskWorkspace(targetRoot); return locator(taskId, reviewType); }
  function readTaskReviewResultPersistence(targetRoot: string, taskId: string, reviewTypeValue: unknown, { optional = true }: { optional?: boolean } = {}): TaskReviewPersistence | null {
    const reviewType = assertTaskReviewType(reviewTypeValue);
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT result_json, subject_identity, outcome, updated_at FROM task_review_current WHERE task_id = ? AND review_type = ?').get(taskId, reviewType);
      if (!row) {
        if (optional) return null;
        throw taskReviewError('task_review_result_not_found', `Task Review Result 不存在：${taskId}/${reviewType}。`, 404, { taskId, reviewType, path: locator(taskId, reviewType) });
      }
      const serialized = stringColumn(row, 'result_json');
      const result = decode(serialized, taskId, reviewType);
      if (stringColumn(row, 'subject_identity') !== result.subjectIdentity || stringColumn(row, 'outcome') !== result.conclusion.outcome || stringColumn(row, 'updated_at') !== result.completedAt) throw taskReviewError('task_review_query_fields_inconsistent', `${locator(taskId, reviewType)} 查询字段与Result不一致。`, 409, { taskId, reviewType });
      return persistence(task.root, taskId, reviewType, serialized, result, row);
    } catch (error) { throw asError(error, '读取', taskId, reviewType); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  function writeTaskReviewResultPersistence(targetRoot: string, result: TaskReviewResult, { expectedCurrentDigest }: { expectedCurrentDigest: string }): TaskReviewPersistence & { created: boolean } {
    const task = runtime.readTaskRecordPersistence(targetRoot, result.taskId);
    let normalized: TaskReviewResult;
    let serialized: string;
    try {
      normalized = normalizeTaskReviewResult(result, { expectedTaskId: task.record.taskId, expectedReviewType: result.reviewType });
      serialized = (runtime.taskReviewSerialize || renderTaskReviewResult)(normalized);
      normalized = normalizeTaskReviewResult(JSON.parse(serialized), { expectedTaskId: task.record.taskId, expectedReviewType: result.reviewType });
      serialized = JSON.stringify(normalized);
    } catch (error: unknown) {
      const failure = errorFields(error);
      throw taskReviewError('task_review_write_failed', `Task Review Result 写入失败（serialization）：${failure.message}`, 500, { taskId: task.record.taskId, reviewType: result.reviewType, stage: 'serialization', path: locator(task.record.taskId, result.reviewType), rollback: { status: 'not-required' } }, '原current未变化；修复serialization后重试。');
    }
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT result_json FROM task_review_current WHERE task_id = ? AND review_type = ?').get(normalized.taskId, normalized.reviewType);
      if (current) decode(stringColumn(current, 'result_json'), normalized.taskId, normalized.reviewType);
      const existed = Boolean(current);
      const currentDigest = current ? digest(stringColumn(current, 'result_json')) : 'absent';
      if (expectedCurrentDigest !== currentDigest) throw taskReviewError('task_review_current_conflict', 'Task Review current已变化，拒绝覆盖。', 409, { taskId: normalized.taskId, reviewType: normalized.reviewType, expectedCurrentDigest, currentDigest }, '重新inspect current slot后决定是否重做或替换Review。');
      database.prepare(`INSERT INTO task_review_current(task_id, review_type, result_json, subject_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id, review_type) DO UPDATE SET result_json = excluded.result_json, subject_identity = excluded.subject_identity, outcome = excluded.outcome, updated_at = excluded.updated_at`)
        .run(normalized.taskId, normalized.reviewType, serialized, normalized.subjectIdentity, normalized.conclusion.outcome, normalized.completedAt);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, subject_identity, outcome, updated_at FROM task_review_current WHERE task_id = ? AND review_type = ?').get(normalized.taskId, normalized.reviewType);
      if (!row) throw taskReviewError('task_review_post_read_mismatch', 'Task Review Result写后读取不存在。', 500, { taskId: normalized.taskId, reviewType: normalized.reviewType });
      const rowSerialized = stringColumn(row, 'result_json');
      const written = decode(rowSerialized, normalized.taskId, normalized.reviewType);
      if (stringColumn(row, 'subject_identity') !== written.subjectIdentity || stringColumn(row, 'outcome') !== written.conclusion.outcome || stringColumn(row, 'updated_at') !== written.completedAt) throw taskReviewError('task_review_post_read_mismatch', 'Task Review Result与查询字段写后读取不一致。', 500, { taskId: normalized.taskId, reviewType: normalized.reviewType });
      database.exec('COMMIT');
      return { ...persistence(task.root, normalized.taskId, normalized.reviewType, rowSerialized, written, row), created: !existed };
    } catch (error: unknown) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `写入（${stage}）`, task.record.taskId, result.reviewType, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }
  Object.assign(runtime, { taskReviewDirectory, taskReviewResultPath, readTaskReviewResultPersistence, writeTaskReviewResultPersistence, renderTaskReviewResult });
  return runtime;
}
