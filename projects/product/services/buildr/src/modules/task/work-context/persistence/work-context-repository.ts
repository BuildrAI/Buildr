import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { TaskWorkContext, TaskWorkContextResponse } from '../../../../../build/generated/workbench-dto.ts';
import { sqliteContextDatabaseOrNull, transactionDatabase, type SqliteReadContext, type TransactionContext } from '../../../../infrastructure/sqlite/transaction.ts';
import { validateTaskWorkContext, taskWorkContextError as error } from '../domain/work-context.ts';

export type WorkContextStoreRuntime = {
  runWorkspaceSqliteRead<T>(root: string, action: (context: SqliteReadContext) => T): T;
  runWorkspaceTransaction<T>(root: string, action: (context: TransactionContext) => T): T;
};
const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
const empty = (taskId: string): TaskWorkContextResponse => ({ schemaVersion: 'buildr.task-work-context/v1', taskId, context: null, contextDigest: null });
function available(db: DatabaseSync | null): db is DatabaseSync {
  if (!db) return false;
  if (db.prepare("SELECT name FROM sqlite_master WHERE name = 'task_work_context_current'").get()) return true;
  if (Number(db.prepare('SELECT max(version) AS version FROM schema_migrations').get()?.version) >= 33) throw error('task_work_context_store_invalid', '工作摘要数据表缺失，请保留数据库现场。', 409);
  return false;
}
function decode(taskId: string, serialized: string): TaskWorkContextResponse {
  try {
    const value: TaskWorkContextResponse = { ...empty(taskId), context: JSON.parse(serialized), contextDigest: digest(serialized) };
    validateTaskWorkContext('TaskWorkContextResponse', value);
    if (value.context?.attention && (value.context.attention.state === 'resolved') !== Boolean(value.context.attention.response)) throw new Error('attention state and response disagree');
    return value;
  } catch { throw error('task_work_context_invalid', '任务工作摘要无法读取，请保留数据库现场。', 409, { taskId }); }
}
export function createWorkContextRepository(runtime: WorkContextStoreRuntime) {
  function readIn(context: SqliteReadContext, taskId: string): TaskWorkContextResponse {
    const db = sqliteContextDatabaseOrNull(context);
    if (!available(db)) return empty(taskId);
    const row = db.prepare('SELECT context_json FROM task_work_context_current WHERE task_id = ?').get(taskId);
    return row ? decode(taskId, String(row.context_json)) : empty(taskId);
  }
  function read(root: string, taskId: string): TaskWorkContextResponse {
    return runtime.runWorkspaceSqliteRead(root, context => readIn(context, taskId));
  }
  function mutate(root: string, taskId: string, expected: string, transform: (current: TaskWorkContext | null) => TaskWorkContext): TaskWorkContextResponse {
    return runtime.runWorkspaceTransaction(root, (transaction) => {
      const db = transactionDatabase(transaction);
      const row = db.prepare('SELECT context_json FROM task_work_context_current WHERE task_id = ?').get(taskId);
      const current = row ? decode(taskId, String(row.context_json)) : empty(taskId);
      if ((current.contextDigest || 'absent') !== expected) throw error('task_work_context_conflict', '工作摘要已变化，请重新读取后保留当前意见再处理。', 409, { taskId, currentContextDigest: current.contextDigest });
      const context = transform(current.context);
      const serialized = JSON.stringify(context);
      const result = decode(taskId, serialized);
      db.prepare(`INSERT INTO task_work_context_current(task_id, context_json, attention_state, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET context_json=excluded.context_json, attention_state=excluded.attention_state, updated_at=excluded.updated_at`).run(taskId, serialized, context.attention?.state || null, context.updatedAt);
      return result;
    });
  }
  function pending(root: string, project?: string, limit = 12): { taskIds: string[]; total: number } {
    return runtime.runWorkspaceSqliteRead(root, (transaction) => {
      const db = sqliteContextDatabaseOrNull(transaction);
      if (!available(db)) return { taskIds: [], total: 0 };
      const where = "WHERE attention_state = 'pending'" + (project ? ' AND EXISTS (SELECT 1 FROM task_projects p WHERE p.task_id = c.task_id AND p.project = ?)' : '');
      const parameters = project ? [project] : [];
      return { total: Number(db.prepare(`SELECT COUNT(*) AS n FROM task_work_context_current c ${where}`).get(...parameters)?.n || 0), taskIds: db.prepare(`SELECT task_id FROM task_work_context_current c ${where} ORDER BY updated_at DESC, task_id LIMIT ?`).all(...parameters, limit).map((row) => String(row.task_id)) };
    });
  }
  return Object.freeze({ read, readIn, mutate, pending });
}
