import crypto from 'node:crypto';

import { normalizeTaskRetrospectiveDisposition, normalizeTaskRetrospectiveResult, taskRetrospectiveError } from '../../../domain/task-retrospective/task-retrospective.mjs';

function locator(taskId) { return `workspace-sqlite:task-retrospective/${taskId}`; }
function digest(value) { return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`; }

function decode(serialized, taskId) {
  try { return normalizeTaskRetrospectiveResult(JSON.parse(serialized), { expectedTaskId: taskId }); }
  catch (error) {
    if (error.taskRetrospectiveBusiness && error.code === 'task_retrospective_task_identity_mismatch') throw error;
    throw taskRetrospectiveError('task_retrospective_result_invalid', `${locator(taskId)} 无法读取：${error.message}`, 409, { taskId, path: locator(taskId), cause: error.code || 'invalid_json' }, '保留数据库现场并运行Buildr Doctor。');
  }
}

function asError(error, operation, taskId, stage = undefined) {
  if (error.taskRetrospectiveBusiness) return error;
  const details = { ...(error.details || {}), taskId, ...(stage ? { stage, path: locator(taskId), rollback: { status: 'restored' } } : {}) };
  if (error.structuredStoreBusiness) return taskRetrospectiveError(error.code, error.message, error.status, details, error.nextAction);
  return taskRetrospectiveError('task_retrospective_write_failed', `Task Retrospective ${operation}失败：${error.message}`, 500, details, '保留Workspace SQLite现场并运行Buildr Doctor。');
}

function decodeDisposition(row) {
  return normalizeTaskRetrospectiveDisposition({
    status: row.disposition_status,
    note: row.disposition_note,
    disposedAt: row.disposed_at,
  });
}

function persistence(root, taskId, row) {
  const result = decode(row.result_json, taskId);
  const disposition = decodeDisposition(row);
  const current = JSON.stringify({ result, disposition });
  return {
    root,
    file: locator(taskId),
    content: row.result_json,
    resultDigest: digest(row.result_json),
    currentDigest: digest(current),
    result,
    disposition,
  };
}

export function renderTaskRetrospectiveResult(result) {
  return JSON.stringify(normalizeTaskRetrospectiveResult(result, { expectedTaskId: result?.taskId }));
}

export function registerTaskRetrospectiveRepository(runtime) {
  function taskRetrospectiveResultPath(targetRoot, taskId) {
    runtime.assertCanonicalTaskWorkspace(targetRoot);
    return locator(taskId);
  }

  function readTaskRetrospectiveResultPersistence(targetRoot, taskId, { optional = true } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      if (!opened.present) {
        if (optional) return null;
        throw taskRetrospectiveError('task_retrospective_result_not_found', `Task Retrospective 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) });
      }
      const row = opened.database.prepare('SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = ?').get(taskId);
      if (!row) {
        if (optional) return null;
        throw taskRetrospectiveError('task_retrospective_result_not_found', `Task Retrospective 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) });
      }
      return persistence(task.root, taskId, row);
    } catch (error) { throw asError(error, '读取', taskId); }
    finally { try { opened?.database?.close(); } catch {} }
  }

  function writeTaskRetrospectiveResultPersistence(targetRoot, result) {
    const task = runtime.readTaskRecordPersistence(targetRoot, result?.taskId);
    let normalized;
    let serialized;
    try {
      normalized = normalizeTaskRetrospectiveResult(result, { expectedTaskId: task.record.taskId });
      serialized = (runtime.taskRetrospectiveSerialize || renderTaskRetrospectiveResult)(normalized);
      normalized = normalizeTaskRetrospectiveResult(JSON.parse(serialized), { expectedTaskId: task.record.taskId });
      serialized = JSON.stringify(normalized);
    } catch (error) {
      throw taskRetrospectiveError('task_retrospective_write_failed', `Task Retrospective 写入失败（serialization）：${error.message}`, 500, { taskId: task.record.taskId, stage: 'serialization', path: locator(task.record.taskId), rollback: { status: 'not-required' } }, '原current未变化；修复serialization后重试。');
    }
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = ?').get(normalized.taskId);
      if (current) persistence(task.root, normalized.taskId, current);
      const existed = Boolean(current);
      database.prepare(`INSERT INTO task_retrospective_current(task_id, result_json, disposition_status, disposition_note, disposed_at)
        VALUES (?, ?, 'pending', NULL, NULL)
        ON CONFLICT(task_id) DO UPDATE SET
          result_json = excluded.result_json,
          disposition_status = 'pending',
          disposition_note = NULL,
          disposed_at = NULL`).run(normalized.taskId, serialized);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = ?').get(normalized.taskId);
      const written = persistence(task.root, normalized.taskId, row);
      database.exec('COMMIT');
      return { ...written, created: !existed };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `写入（${stage}）`, task.record.taskId, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }

  function writeTaskRetrospectiveDispositionPersistence(targetRoot, taskId, value, expectedCurrentDigest) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const disposition = normalizeTaskRetrospectiveDisposition(value);
    let opened;
    let stage = 'mutation';
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const currentRow = database.prepare('SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = ?').get(task.record.taskId);
      if (!currentRow) throw taskRetrospectiveError('task_retrospective_result_not_found', `Task Retrospective 不存在：${task.record.taskId}。`, 404, { taskId: task.record.taskId, path: locator(task.record.taskId) }, '先完成任务复盘，再记录处置结论。');
      const current = persistence(task.root, task.record.taskId, currentRow);
      if (current.currentDigest !== expectedCurrentDigest) {
        throw taskRetrospectiveError('task_retrospective_conflict', 'Task Retrospective current 已变化，请刷新后重试。', 409, {
          taskId: task.record.taskId,
          expectedCurrentDigest,
          actualCurrentDigest: current.currentDigest,
        }, '重新 inspect current 复盘并基于最新 currentDigest 决定处置。');
      }
      database.prepare(`UPDATE task_retrospective_current
        SET disposition_status = ?, disposition_note = ?, disposed_at = ?
        WHERE task_id = ?`).run(disposition.status, disposition.note, disposition.disposedAt, task.record.taskId);
      stage = 'post-read';
      const row = database.prepare('SELECT result_json, disposition_status, disposition_note, disposed_at FROM task_retrospective_current WHERE task_id = ?').get(task.record.taskId);
      const written = persistence(task.root, task.record.taskId, row);
      database.exec('COMMIT');
      return written;
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      throw asError(error, `处置（${stage}）`, task.record.taskId, stage);
    } finally { try { opened?.database?.close(); } catch {} }
  }

  Object.assign(runtime, {
    taskRetrospectiveResultPath,
    readTaskRetrospectiveResultPersistence,
    writeTaskRetrospectiveResultPersistence,
    writeTaskRetrospectiveDispositionPersistence,
    renderTaskRetrospectiveResult,
  });
  return runtime;
}
