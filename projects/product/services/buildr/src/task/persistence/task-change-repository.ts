import type { SQLOutputValue } from 'node:sqlite';

import { sqliteContextDatabaseOrNull, type SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import { TaskChange } from '../domain/task-change.ts';

type SqlRow = Record<string, SQLOutputValue>;
const taskRecordError = (code: string, message: string, status = 500, details?: unknown) => Object.assign(new Error(message), { code, status, details, taskRecordBusiness: true });

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task Change数据库字段无效：${field}。`, 500, { field });
  return value;
}

function mapRow(row: SqlRow, taskId = stringColumn(row, 'task_id')): TaskChange {
  return new TaskChange(taskId, stringColumn(row, 'project'), stringColumn(row, 'change'));
}

export function readTaskChanges(context: SqliteContext, taskId: string): TaskChange[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT project, change_name AS change FROM task_changes WHERE task_id = ? ORDER BY project, change_name').all(taskId).map((row) => mapRow(row, taskId));
}

export function readTaskChangesByTaskIds(context: SqliteContext, taskIds: string[]): Map<string, TaskChange[]> {
  const values = new Map<string, TaskChange[]>();
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return values;
  if (!taskIds.length) return values;
  const slots = taskIds.map(() => '?').join(', ');
  for (const row of database.prepare(`SELECT task_id, project, change_name AS change FROM task_changes WHERE task_id IN (${slots}) ORDER BY task_id, project, change_name`).all(...taskIds)) {
    const taskId = stringColumn(row, 'task_id');
    const items = values.get(taskId) || [];
    items.push(mapRow(row));
    values.set(taskId, items);
  }
  return values;
}

export function insertTaskChanges(context: SqliteContext, changes: readonly TaskChange[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Change写入缺少事务连接。', 500);
  const statement = database.prepare('INSERT INTO task_changes(task_id, project, change_name) VALUES (?, ?, ?)');
  for (const change of changes) statement.run(change.taskId, change.project, change.change);
}

export function replaceTaskChanges(context: SqliteContext, taskId: string, changes: readonly TaskChange[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Change写入缺少事务连接。', 500);
  database.prepare('DELETE FROM task_changes WHERE task_id = ?').run(taskId);
  insertTaskChanges(context, changes);
}

export type TaskChangeRepository = {
  read: typeof readTaskChanges;
  readMany: typeof readTaskChangesByTaskIds;
  insert: typeof insertTaskChanges;
  replace: typeof replaceTaskChanges;
};

export function createTaskChangeRepository(): TaskChangeRepository {
  return Object.freeze({ read: readTaskChanges, readMany: readTaskChangesByTaskIds, insert: insertTaskChanges, replace: replaceTaskChanges });
}
