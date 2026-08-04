import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isTaskRecordId, normalizeTaskRecord, taskRecordError } from '../../domain/task-record/task-record.mjs';

function digestRecord(record) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')}`;
}

function asTaskRecordError(error, operation) {
  if (error.taskRecordBusiness) return error;
  if (error.structuredStoreBusiness) {
    const code = error.code === 'workspace_store_workspace_not_canonical'
      ? 'task_record_workspace_not_canonical'
      : error.code === 'workspace_store_workspace_invalid'
        ? 'task_record_workspace_invalid'
        : error.code;
    return taskRecordError(code, error.message, error.status, error.details, error.nextAction);
  }
  return taskRecordError('task_record_database_failed', `Task Record ${operation} 失败：${error.message}`, 500, undefined, '保留数据库现场并运行 Buildr Doctor。');
}

function resultValue(row) {
  if (row.status === 'active') return null;
  if (row.status === 'completed') return { summary: row.result_summary, noChange: row.result_no_change === 1 };
  return { summary: row.result_summary };
}

function readRecord(database, taskId) {
  const row = database.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
  if (!row) return null;
  const projects = database.prepare('SELECT project FROM task_projects WHERE task_id = ? ORDER BY project').all(taskId).map((item) => item.project);
  const services = database.prepare('SELECT project, service FROM task_services WHERE task_id = ? ORDER BY project, service').all(taskId);
  const changes = database.prepare('SELECT project, change_name AS change FROM task_changes WHERE task_id = ? ORDER BY project, change_name').all(taskId);
  return normalizeTaskRecord({
    schemaVersion: row.schema_version,
    taskId: row.task_id,
    title: row.title,
    intent: row.intent,
    scope: { projects, services },
    changes,
    status: row.status,
    result: resultValue(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }, { expectedTaskId: taskId });
}

function persistence(root, record) {
  return { root, record, recordDigest: digestRecord(record) };
}

function insertRecord(database, record) {
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.taskId, record.schemaVersion, record.title, record.intent, record.status,
    record.result?.summary ?? null, record.status === 'completed' ? Number(record.result.noChange) : null,
    record.createdAt, record.updatedAt,
  );
  insertRelations(database, record);
}

function insertRelations(database, record) {
  const projectStatement = database.prepare('INSERT INTO task_projects(task_id, project) VALUES (?, ?)');
  const serviceStatement = database.prepare('INSERT INTO task_services(task_id, project, service) VALUES (?, ?, ?)');
  const changeStatement = database.prepare('INSERT INTO task_changes(task_id, project, change_name) VALUES (?, ?, ?)');
  for (const project of record.scope.projects) projectStatement.run(record.taskId, project);
  for (const service of record.scope.services) serviceStatement.run(record.taskId, service.project, service.service);
  for (const change of record.changes) changeStatement.run(record.taskId, change.project, change.change);
}

function replaceRecord(database, record) {
  database.prepare(`UPDATE tasks SET schema_version = ?, title = ?, intent = ?, status = ?, result_summary = ?, result_no_change = ?, created_at = ?, updated_at = ? WHERE task_id = ?`).run(
    record.schemaVersion, record.title, record.intent, record.status, record.result?.summary ?? null,
    record.status === 'completed' ? Number(record.result.noChange) : null, record.createdAt, record.updatedAt, record.taskId,
  );
  for (const table of ['task_projects', 'task_services', 'task_changes']) database.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(record.taskId);
  insertRelations(database, record);
}

function withTransaction(database, callback) {
  try {
    database.exec('BEGIN IMMEDIATE');
    const value = callback();
    database.exec('COMMIT');
    return value;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function registerTaskRecordRepository(runtime) {
  function assertCanonicalTaskWorkspace(targetRoot) {
    try { return runtime.assertCanonicalStructuredWorkspace(targetRoot); }
    catch (error) { throw asTaskRecordError(error, 'Workspace 解析'); }
  }

  function taskRecordDirectory(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    const recordsRoot = path.join(root, '.buildr', 'tasks');
    const directory = path.resolve(recordsRoot, taskId);
    if (path.dirname(directory) !== recordsRoot) throw taskRecordError('task_record_path_escape', 'Task 专业记录路径逃逸。', 400, { taskId });
    return directory;
  }

  function ensureTaskRecordDirectory(targetRoot, taskId, io = fs) {
    const directory = taskRecordDirectory(targetRoot, taskId);
    const recordsRoot = path.dirname(directory);
    for (const candidate of [recordsRoot, directory]) {
      if (!io.existsSync(candidate)) {
        try { io.mkdirSync(candidate); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      const stat = io.lstatSync(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw taskRecordError('task_record_directory_invalid', 'Task 专业记录容器必须是普通目录。', 409, { taskId });
      }
    }
    return directory;
  }

  function readTaskRecordPersistence(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
      const record = readRecord(opened.database, taskId);
      if (!record) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
      return persistence(root, record);
    } catch (error) {
      throw asTaskRecordError(error, '读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function listTaskRecordPersistence(targetRoot) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) return { root, records: [], diagnostics: [] };
      const taskIds = opened.database.prepare('SELECT task_id FROM tasks ORDER BY updated_at DESC, task_id').all().map((row) => row.task_id);
      return { root, records: taskIds.map((taskId) => persistence(root, readRecord(opened.database, taskId))), diagnostics: [] };
    } catch (error) {
      throw asTaskRecordError(error, '列表读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function createTaskRecordPersistence(targetRoot, value) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const record = normalizeTaskRecord(value, { expectedTaskId: value?.taskId });
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      return withTransaction(opened.database, () => {
        if (readRecord(opened.database, record.taskId)) throw taskRecordError('task_record_already_exists', `Task Record 已存在：${record.taskId}。`, 409, { taskId: record.taskId }, `运行 buildr task inspect ${record.taskId} 查看现有记录。`);
        insertRecord(opened.database, record);
        return persistence(root, readRecord(opened.database, record.taskId));
      });
    } catch (error) {
      throw asTaskRecordError(error, '创建');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function mutateTaskRecordPersistence(targetRoot, taskId, mutator) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      return withTransaction(opened.database, () => {
        const currentRecord = readRecord(opened.database, taskId);
        if (!currentRecord) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
        const current = persistence(root, currentRecord);
        const nextValue = mutator(current);
        if (!nextValue) return current;
        const next = normalizeTaskRecord(nextValue, { expectedTaskId: taskId });
        replaceRecord(opened.database, next);
        return persistence(root, readRecord(opened.database, taskId));
      });
    } catch (error) {
      throw asTaskRecordError(error, '修改');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function writeTaskRecordPersistence(targetRoot, record) {
    return mutateTaskRecordPersistence(targetRoot, record?.taskId, () => record);
  }

  Object.assign(runtime, {
    assertCanonicalTaskWorkspace,
    taskRecordDirectory,
    ensureTaskRecordDirectory,
    readTaskRecordPersistence,
    listTaskRecordPersistence,
    createTaskRecordPersistence,
    mutateTaskRecordPersistence,
    writeTaskRecordPersistence,
  });
  return runtime;
}
