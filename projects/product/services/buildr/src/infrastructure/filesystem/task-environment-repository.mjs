import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeTaskEnvironmentReceipt, taskEnvironmentError } from '../../domain/task-environment/task-environment.mjs';
import { sameFilesystemPath } from './filesystem-path-identity.mjs';

function locator(taskId) { return `workspace-sqlite:task-environment/${taskId}`; }

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function decode(serialized, taskId, status = null) {
  let receipt;
  try {
    receipt = normalizeTaskEnvironmentReceipt(JSON.parse(serialized), { expectedTaskId: taskId });
  } catch (error) {
    if (error.taskEnvironmentBusiness) throw error;
    throw taskEnvironmentError('task_environment_invalid', `${locator(taskId)} 无法读取：${error.message}`, 409, { taskId, path: locator(taskId), cause: error.code || 'invalid_json' }, '保留Workspace SQLite现场并运行Buildr Doctor。');
  }
  if (status && receipt.status !== status) {
    throw taskEnvironmentError('task_environment_status_mismatch', `${locator(taskId)} 的 status 与 Receipt payload 不一致。`, 409, { taskId, rowStatus: status, receiptStatus: receipt.status }, '保留Workspace SQLite现场并运行Buildr Doctor。');
  }
  return receipt;
}

function persistence(root, taskId, serialized, receipt) {
  return {
    root,
    file: locator(taskId),
    content: serialized,
    receiptDigest: digest(serialized),
    receipt,
  };
}

export function renderTaskEnvironmentReceipt(receipt) {
  return JSON.stringify(normalizeTaskEnvironmentReceipt(receipt, { expectedTaskId: receipt?.taskId }));
}

export function registerTaskEnvironmentRepository(runtime) {
  function taskEnvironmentPath(targetRoot, taskId) {
    runtime.assertCanonicalTaskWorkspace(targetRoot);
    return locator(taskId);
  }

  function readTaskEnvironmentPersistence(targetRoot, taskId, { optional = false } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT status, receipt_json, updated_at FROM task_environment_current WHERE task_id = ?').get(taskId);
      if (!row) {
        if (optional) return null;
        throw taskEnvironmentError('task_environment_not_found', `Environment current 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) }, `运行 buildr task environment prepare ${taskId}。`);
      }
      const receipt = decode(row.receipt_json, taskId, row.status);
      if (receipt.updatedAt !== row.updated_at) {
        throw taskEnvironmentError('task_environment_timestamp_mismatch', `${locator(taskId)} 的 updatedAt 与 current row 不一致。`, 409, { taskId, rowUpdatedAt: row.updated_at, receiptUpdatedAt: receipt.updatedAt }, '保留Workspace SQLite现场并运行Buildr Doctor。');
      }
      return persistence(task.root, taskId, row.receipt_json, receipt);
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function writeTaskEnvironmentPersistence(targetRoot, receipt) {
    const task = runtime.readTaskRecordPersistence(targetRoot, receipt?.taskId);
    let normalized;
    let serialized;
    try {
      normalized = normalizeTaskEnvironmentReceipt(receipt, { expectedTaskId: task.record.taskId });
      let receiptRoot;
      let taskRoot;
      try { receiptRoot = fs.realpathSync(normalized.workspace.root); } catch { throw taskEnvironmentError('task_environment_workspace_mismatch', 'Environment Receipt 不属于当前 canonical Workspace。', 409, { expected: path.resolve(task.root), actual: path.resolve(normalized.workspace.root) }); }
      try { taskRoot = fs.realpathSync(task.root); } catch { throw taskEnvironmentError('task_environment_workspace_mismatch', '当前 Task Record 不属于可访问的 canonical Workspace。', 409, { expected: path.resolve(task.root) }); }
      if (!sameFilesystemPath(receiptRoot, taskRoot)) {
        throw taskEnvironmentError('task_environment_workspace_mismatch', 'Environment Receipt 不属于当前 canonical Workspace。', 409, { expected: path.resolve(taskRoot), actual: path.resolve(receiptRoot) });
      }
      normalized = { ...normalized, workspace: { ...normalized.workspace, root: taskRoot } };
      serialized = JSON.stringify(normalized);
    } catch (error) {
      if (error.taskEnvironmentBusiness) throw error;
      throw taskEnvironmentError('task_environment_write_failed', `Environment current 写入失败（serialization）：${error.message}`, 500, { taskId: task.record.taskId, path: locator(task.record.taskId), rollback: { status: 'not-required' } });
    }

    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT status, receipt_json, updated_at FROM task_environment_current WHERE task_id = ?').get(normalized.taskId);
      if (current) decode(current.receipt_json, normalized.taskId, current.status);
      const existed = Boolean(current);
      database.prepare(`INSERT INTO task_environment_current(task_id, status, receipt_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET status = excluded.status, receipt_json = excluded.receipt_json, updated_at = excluded.updated_at`)
        .run(normalized.taskId, normalized.status, serialized, normalized.updatedAt);
      const row = database.prepare('SELECT status, receipt_json, updated_at FROM task_environment_current WHERE task_id = ?').get(normalized.taskId);
      const written = decode(row.receipt_json, normalized.taskId, row.status);
      if (row.updated_at !== written.updatedAt) throw taskEnvironmentError('task_environment_timestamp_mismatch', 'Environment current 写后校验失败。', 409, { taskId: normalized.taskId });
      database.exec('COMMIT');
      return { ...persistence(task.root, normalized.taskId, row.receipt_json, written), created: !existed };
    } catch (error) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (error.taskEnvironmentBusiness || error.structuredStoreBusiness) throw error;
      throw taskEnvironmentError('task_environment_write_failed', `Environment current 写入失败：${error.message}`, 500, { taskId: task.record.taskId, path: locator(task.record.taskId), rollback: { status: 'restored' } }, '保留Workspace SQLite现场并运行Buildr Doctor。');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  Object.assign(runtime, {
    taskEnvironmentPath,
    readTaskEnvironmentPersistence,
    writeTaskEnvironmentPersistence,
    renderTaskEnvironmentReceipt,
  });
  return runtime;
}
