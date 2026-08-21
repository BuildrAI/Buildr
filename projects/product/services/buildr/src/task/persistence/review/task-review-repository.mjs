import crypto from 'node:crypto';
import { assertTaskReviewType, normalizeTaskReviewResult, taskReviewError } from '../../../domain/task-review/task-review.mjs';

function locator(taskId, reviewType) { return `workspace-sqlite:task-review/${taskId}/${reviewType}`; }
function digest(value) { return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`; }
function asError(error, operation, taskId, reviewType, stage = undefined) {
  if (error.taskReviewBusiness) return error;
  const details = { ...(error.details || {}), taskId, reviewType, ...(stage ? { stage, path: locator(taskId, reviewType), rollback: { status: 'restored' } } : {}) };
  if (error.structuredStoreBusiness) return taskReviewError(error.code, error.message, error.status, details, error.nextAction);
  return taskReviewError('task_review_write_failed', `Task Review Result ${operation}失败：${error.message}`, 500, details, '保留Workspace SQLite现场并运行Buildr Doctor。');
}
function decode(serialized, taskId, reviewType) {
  try { return normalizeTaskReviewResult(JSON.parse(serialized), { expectedTaskId: taskId, expectedReviewType: reviewType }); }
  catch (error) {
    if (error.taskReviewBusiness && ['task_review_task_identity_mismatch', 'task_review_type_identity_mismatch'].includes(error.code)) throw error;
    throw taskReviewError('task_review_result_invalid', `${locator(taskId, reviewType)} 无法读取：${error.message}`, 409, { taskId, reviewType, path: locator(taskId, reviewType), cause: error.code || 'invalid_json', ...(error.details?.field === undefined ? {} : { field: error.details.field }) }, '保留数据库现场并运行Buildr Doctor；不要从旧YAML恢复。');
  }
}
function persistence(root, taskId, reviewType, serialized, result, row = {}) {
  return { root, file: locator(taskId, reviewType), content: serialized, resultDigest: digest(serialized), result, targetIdentity: row.target_identity ?? result.targetIdentity, outcome: row.outcome ?? result.conclusion.outcome, observedAt: row.updated_at ?? result.completedAt };
}
export function renderTaskReviewResult(result) { return JSON.stringify(normalizeTaskReviewResult(result, { expectedTaskId: result?.taskId, expectedReviewType: result?.reviewType })); }

export function registerTaskReviewRepository(runtime) {
  function taskReviewDirectory(targetRoot, taskId) { runtime.assertCanonicalTaskWorkspace(targetRoot); return `workspace-sqlite:task-review/${taskId}`; }
  function taskReviewResultPath(targetRoot, taskId, reviewType) { assertTaskReviewType(reviewType); runtime.assertCanonicalTaskWorkspace(targetRoot); return locator(taskId, reviewType); }
  function readTaskReviewResultPersistence(targetRoot, taskId, reviewType, { optional = true } = {}) {
    assertTaskReviewType(reviewType);
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_review_current WHERE task_id = ? AND review_type = ?').get(taskId, reviewType);
      if (!row) {
        if (optional) return null;
        throw taskReviewError('task_review_result_not_found', `Task Review Result 不存在：${taskId}/${reviewType}。`, 404, { taskId, reviewType, path: locator(taskId, reviewType) });
      }
      const result = decode(row.result_json, taskId, reviewType);
      if (row.target_identity !== result.targetIdentity || row.outcome !== result.conclusion.outcome || row.updated_at !== result.completedAt) throw taskReviewError('task_review_query_fields_inconsistent', `${locator(taskId, reviewType)} 查询字段与Result不一致。`, 409, { taskId, reviewType });
      return persistence(task.root, taskId, reviewType, row.result_json, result, row);
    } catch (error) { throw asError(error, '读取', taskId, reviewType); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  function writeTaskReviewResultPersistence(targetRoot, result) {
    const task = runtime.readTaskRecordPersistence(targetRoot, result?.taskId);
    let normalized;
    let serialized;
    try {
      normalized = normalizeTaskReviewResult(result, { expectedTaskId: task.record.taskId, expectedReviewType: result?.reviewType });
      serialized = (runtime.taskReviewSerialize || renderTaskReviewResult)(normalized);
      normalized = normalizeTaskReviewResult(JSON.parse(serialized), { expectedTaskId: task.record.taskId, expectedReviewType: result?.reviewType });
      serialized = JSON.stringify(normalized);
    } catch (error) {
      throw taskReviewError('task_review_write_failed', `Task Review Result 写入失败（serialization）：${error.message}`, 500, { taskId: task.record.taskId, reviewType: result?.reviewType, stage: 'serialization', path: locator(task.record.taskId, result?.reviewType), rollback: { status: 'not-required' } }, '原current未变化；修复serialization后重试。');
    }
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT result_json FROM task_review_current WHERE task_id = ? AND review_type = ?').get(normalized.taskId, normalized.reviewType);
      if (current) decode(current.result_json, normalized.taskId, normalized.reviewType);
      const existed = Boolean(current);
      database.prepare(`INSERT INTO task_review_current(task_id, review_type, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id, review_type) DO UPDATE SET result_json = excluded.result_json, target_identity = excluded.target_identity, outcome = excluded.outcome, updated_at = excluded.updated_at`)
        .run(normalized.taskId, normalized.reviewType, serialized, normalized.targetIdentity, normalized.conclusion.outcome, normalized.completedAt);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_review_current WHERE task_id = ? AND review_type = ?').get(normalized.taskId, normalized.reviewType);
      const written = decode(row.result_json, normalized.taskId, normalized.reviewType);
      if (row.target_identity !== written.targetIdentity || row.outcome !== written.conclusion.outcome || row.updated_at !== written.completedAt) throw taskReviewError('task_review_post_read_mismatch', 'Task Review Result与查询字段写后读取不一致。', 500, { taskId: normalized.taskId, reviewType: normalized.reviewType });
      database.exec('COMMIT');
      return { ...persistence(task.root, normalized.taskId, normalized.reviewType, row.result_json, written, row), created: !existed };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `写入（${stage}）`, task.record.taskId, result?.reviewType, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }
  Object.assign(runtime, { taskReviewDirectory, taskReviewResultPath, readTaskReviewResultPersistence, writeTaskReviewResultPersistence, renderTaskReviewResult });
  return runtime;
}
