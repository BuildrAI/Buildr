import crypto from 'node:crypto';

const SCHEMA_VERSION = 'buildr.task-lifecycle-read-model/v1';

function locator(taskId) { return `workspace-sqlite:task-lifecycle/${taskId}`; }

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function error(code, message, status = 409, details = undefined) {
  const failure = new Error(message);
  Object.assign(failure, { code, status, details, taskLifecycleBusiness: true });
  return failure;
}

function normalize(value, expectedTaskId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('task_lifecycle_model_invalid', 'Task lifecycle read model 必须是对象。');
  if (value.schemaVersion !== SCHEMA_VERSION) throw error('task_lifecycle_model_schema_invalid', `Task lifecycle read model schema 不支持：${value.schemaVersion || '<missing>'}。`);
  if (value.taskId !== expectedTaskId) throw error('task_lifecycle_task_identity_mismatch', `Task lifecycle read model 不属于 Task：${expectedTaskId}。`, 409, { expectedTaskId, actualTaskId: value.taskId });
  if (!value.updatedAt || Number.isNaN(Date.parse(value.updatedAt))) throw error('task_lifecycle_timestamp_invalid', 'Task lifecycle read model updatedAt 无效。');
  return JSON.parse(JSON.stringify(value));
}

function persistence(root, taskId, serialized, model) {
  return { root, file: locator(taskId), content: serialized, modelDigest: digest(serialized), model };
}

export function registerTaskLifecycleRepository(runtime) {
  function taskLifecycleReadModelPath(targetRoot, taskId) {
    runtime.assertCanonicalTaskWorkspace(targetRoot);
    return locator(taskId);
  }

  function readTaskLifecyclePersistence(targetRoot, taskId, { optional = true } = {}) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: false });
      const row = opened.database.prepare('SELECT model_json FROM task_lifecycle_current WHERE task_id = ?').get(taskId);
      if (!row) {
        if (optional) return null;
        throw error('task_lifecycle_model_not_found', `Task lifecycle read model 不存在：${taskId}。`, 404, { taskId, path: locator(taskId) });
      }
      const model = normalize(JSON.parse(row.model_json), taskId);
      return persistence(task.root, taskId, row.model_json, model);
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function updateTaskLifecyclePersistence(targetRoot, taskId, update) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(task.root, { writable: true });
      const database = opened.database;
      database.exec('BEGIN IMMEDIATE');
      const current = database.prepare('SELECT model_json FROM task_lifecycle_current WHERE task_id = ?').get(taskId);
      const previous = current ? normalize(JSON.parse(current.model_json), taskId) : null;
      const next = normalize(update(previous), taskId);
      const serialized = JSON.stringify(next);
      database.prepare(`INSERT INTO task_lifecycle_current(task_id, model_json) VALUES (?, ?)
        ON CONFLICT(task_id) DO UPDATE SET model_json = excluded.model_json`).run(taskId, serialized);
      const row = database.prepare('SELECT model_json FROM task_lifecycle_current WHERE task_id = ?').get(taskId);
      const written = normalize(JSON.parse(row.model_json), taskId);
      database.exec('COMMIT');
      return { ...persistence(task.root, taskId, row.model_json, written), created: !previous };
    } catch (cause) {
      try { opened?.database?.exec('ROLLBACK'); } catch {}
      if (cause.taskLifecycleBusiness || cause.structuredStoreBusiness) throw cause;
      throw error('task_lifecycle_write_failed', `Task lifecycle read model 写入失败：${cause.message}`, 500, { taskId, path: locator(taskId) });
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  Object.assign(runtime, { taskLifecycleReadModelPath, readTaskLifecyclePersistence, updateTaskLifecyclePersistence });
  return runtime;
}
