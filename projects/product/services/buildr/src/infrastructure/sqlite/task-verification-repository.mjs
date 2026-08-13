import crypto from 'node:crypto';
import { normalizeTaskVerificationResult, taskVerificationError } from '../../domain/task-verification/task-verification.mjs';
import { taskRecordEffectiveProjectCodes } from '../../domain/task-record/task-record.mjs';

function locator(taskId) { return `workspace-sqlite:task-verification/${taskId}`; }
function digest(value) { return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`; }
function asError(error, operation, taskId, stage = undefined) {
  if (error.taskVerificationBusiness) return error;
  const details = { ...(error.details || {}), taskId, ...(stage ? { stage, path: locator(taskId), rollback: { status: 'restored' } } : {}) };
  if (error.structuredStoreBusiness) return taskVerificationError(error.code, error.message, error.status, details, error.nextAction);
  return taskVerificationError('task_verification_write_failed', `Task Verification Result ${operation}失败：${error.message}`, 500, details, '保留Workspace SQLite现场并运行Buildr Doctor。');
}
function decode(serialized, taskId) {
  try { return normalizeTaskVerificationResult(JSON.parse(serialized), { expectedTaskId: taskId }); }
  catch (error) {
    if (error.taskVerificationBusiness && error.code === 'task_verification_task_identity_mismatch') throw error;
    throw taskVerificationError('task_verification_result_invalid', `${locator(taskId)} 无法读取：${error.message}`, 409, { taskId, path: locator(taskId), cause: error.code || 'invalid_json', ...(error.details?.field === undefined ? {} : { field: error.details.field }) }, '保留数据库现场并运行Buildr Doctor；不要从旧YAML恢复。');
  }
}
function persistence(root, taskId, serialized, result, row = {}) {
  return { root, file: locator(taskId), content: serialized, resultDigest: digest(serialized), result, targetIdentity: row.target_identity ?? result.target.identity, outcome: row.outcome ?? result.conclusion.outcome, observedAt: row.updated_at ?? result.completedAt };
}
export function renderTaskVerificationResult(result) { return JSON.stringify(normalizeTaskVerificationResult(result, { expectedTaskId: result?.taskId })); }

export function registerTaskVerificationRepository(runtime) {
  function taskVerificationResultPath(targetRoot, taskId) { runtime.assertCanonicalTaskWorkspace(targetRoot); return locator(taskId); }
  function readTaskVerificationResultPersistence(targetRoot, taskId, { optional = true } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = ?').get(taskId);
      if (!row) {
        if (optional) return null;
        throw taskVerificationError('task_verification_result_not_found', `Task Verification Result 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) });
      }
      const result = decode(row.result_json, taskId);
      if (row.target_identity !== result.target.identity || row.outcome !== result.conclusion.outcome || row.updated_at !== result.completedAt) throw taskVerificationError('task_verification_query_fields_inconsistent', `${locator(taskId)} 查询字段与Result不一致。`, 409, { taskId });
      return persistence(task.root, taskId, row.result_json, result, row);
    } catch (error) { throw asError(error, '读取', taskId); }
    finally { try { opened?.database?.close(); } catch {} }
  }
  function writeTaskVerificationResultPersistence(targetRoot, result) {
    const task = runtime.readTaskRecordPersistence(targetRoot, result?.taskId);
    let normalized;
    let serialized;
    try {
      normalized = normalizeTaskVerificationResult(result, { expectedTaskId: task.record.taskId });
      const expectedProjects = taskRecordEffectiveProjectCodes(task.record);
      const actualProjects = normalized.declarations.map((item) => item.project).sort((left, right) => left.localeCompare(right));
      if (JSON.stringify(actualProjects) !== JSON.stringify(expectedProjects)) throw taskVerificationError('task_verification_declarations_scope_mismatch', 'Task Verification declarations 必须精确匹配 current Task 的有效 Project 集合。', 409, { expectedProjects, actualProjects });
      serialized = (runtime.taskVerificationSerialize || renderTaskVerificationResult)(normalized);
      normalized = normalizeTaskVerificationResult(JSON.parse(serialized), { expectedTaskId: task.record.taskId });
      serialized = JSON.stringify(normalized);
    } catch (error) {
      throw taskVerificationError('task_verification_write_failed', `Task Verification Result 写入失败（serialization）：${error.message}`, 500, { taskId: task.record.taskId, stage: 'serialization', path: locator(task.record.taskId), rollback: { status: 'not-required' } }, '原current未变化；修复serialization后重试。');
    }
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT result_json FROM task_verification_current WHERE task_id = ?').get(normalized.taskId);
      if (current) decode(current.result_json, normalized.taskId);
      const existed = Boolean(current);
      database.prepare(`INSERT INTO task_verification_current(task_id, result_json, target_identity, outcome, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET result_json = excluded.result_json, target_identity = excluded.target_identity, outcome = excluded.outcome, updated_at = excluded.updated_at`)
        .run(normalized.taskId, serialized, normalized.target.identity, normalized.conclusion.outcome, normalized.completedAt);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, target_identity, outcome, updated_at FROM task_verification_current WHERE task_id = ?').get(normalized.taskId);
      const written = decode(row.result_json, normalized.taskId);
      if (row.target_identity !== written.target.identity || row.outcome !== written.conclusion.outcome || row.updated_at !== written.completedAt) throw taskVerificationError('task_verification_post_read_mismatch', 'Task Verification Result与查询字段写后读取不一致。', 500, { taskId: normalized.taskId });
      database.exec('COMMIT');
      return { ...persistence(task.root, normalized.taskId, row.result_json, written, row), created: !existed };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `写入（${stage}）`, task.record.taskId, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }
  Object.assign(runtime, { taskVerificationResultPath, readTaskVerificationResultPersistence, writeTaskVerificationResultPersistence, renderTaskVerificationResult });
  return runtime;
}
