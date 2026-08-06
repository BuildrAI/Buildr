import { normalizeTaskDevelopmentReceipt, taskDevelopmentError, taskDevelopmentDigest } from '../../domain/task-development/task-development.mjs';

function locator(taskId) { return `workspace-sqlite:task-development/${taskId}`; }

function asError(error, operation, taskId, stage = undefined) {
  if (error.taskDevelopmentBusiness) return error;
  const details = { ...(error.details || {}), taskId, ...(stage ? { stage, path: locator(taskId), rollback: { status: 'restored' } } : {}) };
  if (error.structuredStoreBusiness) return taskDevelopmentError(error.code, error.message, error.status, details, error.nextAction);
  return taskDevelopmentError('task_development_write_failed', `Development Receipt ${operation}失败：${error.message}`, 500, details, '保留Workspace SQLite现场并运行Buildr Doctor。');
}

function decode(serialized, taskId) {
  try { return normalizeTaskDevelopmentReceipt(JSON.parse(serialized), { expectedTaskId: taskId }); }
  catch (error) {
    if (error.taskDevelopmentBusiness && error.code === 'task_development_task_identity_mismatch') throw error;
    throw taskDevelopmentError('task_development_receipt_invalid', `${locator(taskId)} 无法读取：${error.message}`, 409, { taskId, path: locator(taskId), cause: error.code || 'invalid_json', ...(error.details?.field === undefined ? {} : { field: error.details.field }) }, '保留数据库现场并运行Buildr Doctor；不要从旧YAML恢复。');
  }
}

function persistence(root, taskId, serialized, receipt) {
  return { root, file: locator(taskId), content: serialized, receiptDigest: taskDevelopmentDigest(serialized), receipt };
}

export function renderTaskDevelopmentReceipt(receipt) {
  return JSON.stringify(normalizeTaskDevelopmentReceipt(receipt, { expectedTaskId: receipt?.taskId }));
}

export function registerTaskDevelopmentRepository(runtime) {
  function taskDevelopmentReceiptPath(targetRoot, taskId) { runtime.assertCanonicalTaskWorkspace(targetRoot); return locator(taskId); }

  function readTaskDevelopmentPersistence(targetRoot, taskId, { optional = true } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get(taskId);
      if (!row) {
        if (optional) return null;
        throw taskDevelopmentError('task_development_receipt_not_found', `Development Receipt 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) });
      }
      return persistence(task.root, taskId, row.record_json, decode(row.record_json, taskId));
    } catch (error) { throw asError(error, '读取', taskId); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function writeTaskDevelopmentPersistence(targetRoot, receipt) {
    const task = runtime.readTaskRecordPersistence(targetRoot, receipt?.taskId);
    let normalized;
    let serialized;
    try {
      normalized = normalizeTaskDevelopmentReceipt(receipt, { expectedTaskId: task.record.taskId });
      serialized = (runtime.taskDevelopmentSerialize || renderTaskDevelopmentReceipt)(normalized);
      normalized = normalizeTaskDevelopmentReceipt(JSON.parse(serialized), { expectedTaskId: task.record.taskId });
      serialized = JSON.stringify(normalized);
    } catch (error) {
      throw taskDevelopmentError('task_development_write_failed', `Development Receipt 写入失败（serialization）：${error.message}`, 500, { taskId: task.record.taskId, stage: 'serialization', path: locator(task.record.taskId), rollback: { status: 'not-required' } });
    }
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true, writerRole: 'retained-task-state' });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get(normalized.taskId);
      if (current) decode(current.record_json, normalized.taskId);
      const existed = Boolean(current);
      database.prepare(`INSERT INTO task_development_current(task_id, record_json) VALUES (?, ?)
        ON CONFLICT(task_id) DO UPDATE SET record_json = excluded.record_json`).run(normalized.taskId, serialized);
      stage = 'post-read';
      const row = database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get(normalized.taskId);
      const written = decode(row.record_json, normalized.taskId);
      database.exec('COMMIT');
      return { ...persistence(task.root, normalized.taskId, row.record_json, written), created: !existed };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `写入（${stage}）`, task.record.taskId, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }

  Object.assign(runtime, { taskDevelopmentReceiptPath, readTaskDevelopmentPersistence, writeTaskDevelopmentPersistence, renderTaskDevelopmentReceipt });
  return runtime;
}
