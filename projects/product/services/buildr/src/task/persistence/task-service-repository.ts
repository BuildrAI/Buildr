import type { SQLOutputValue } from 'node:sqlite';

import { sqliteContextDatabaseOrNull, type SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import { TaskService } from '../domain/task-service.ts';

type SqlRow = Record<string, SQLOutputValue>;
const taskRecordError = (code: string, message: string, status = 500, details?: unknown) => Object.assign(new Error(message), { code, status, details, taskRecordBusiness: true });

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task Service数据库字段无效：${field}。`, 500, { field });
  return value;
}

function mapRow(row: SqlRow, taskId = stringColumn(row, 'task_id')): TaskService {
  return new TaskService(taskId, stringColumn(row, 'project'), stringColumn(row, 'service'));
}

export function readTaskServices(context: SqliteContext, taskId: string): TaskService[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT project, service FROM task_services WHERE task_id = ? ORDER BY project, service').all(taskId).map((row) => mapRow(row, taskId));
}

export function readTaskServicesByTaskIds(context: SqliteContext, taskIds: string[]): Map<string, TaskService[]> {
  const values = new Map<string, TaskService[]>();
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return values;
  if (!taskIds.length) return values;
  const slots = taskIds.map(() => '?').join(', ');
  for (const row of database.prepare(`SELECT task_id, project, service FROM task_services WHERE task_id IN (${slots}) ORDER BY task_id, project, service`).all(...taskIds)) {
    const taskId = stringColumn(row, 'task_id');
    const items = values.get(taskId) || [];
    items.push(mapRow(row));
    values.set(taskId, items);
  }
  return values;
}

export function listTaskServiceOptions(context: SqliteContext): TaskService[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT DISTINCT project, service FROM task_services ORDER BY project, service').all()
    .map((row) => mapRow(row, ''));
}

export function findTaskIdsByService(context: SqliteContext, service: { project: string; service: string }): string[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT task_id FROM task_services WHERE project = ? AND service = ? ORDER BY task_id').all(service.project, service.service)
    .map((row) => stringColumn(row, 'task_id'));
}

export function insertTaskServices(context: SqliteContext, services: readonly TaskService[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Service写入缺少事务连接。', 500);
  const statement = database.prepare('INSERT INTO task_services(task_id, project, service) VALUES (?, ?, ?)');
  for (const service of services) statement.run(service.taskId, service.project, service.service);
}

export function replaceTaskServices(context: SqliteContext, taskId: string, services: readonly TaskService[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Service写入缺少事务连接。', 500);
  database.prepare('DELETE FROM task_services WHERE task_id = ?').run(taskId);
  insertTaskServices(context, services);
}

export type TaskServiceRepository = {
  read: typeof readTaskServices;
  readMany: typeof readTaskServicesByTaskIds;
  listOptions: typeof listTaskServiceOptions;
  findTaskIds: typeof findTaskIdsByService;
  insert: typeof insertTaskServices;
  replace: typeof replaceTaskServices;
};

export function createTaskServiceRepository(): TaskServiceRepository {
  return Object.freeze({ read: readTaskServices, readMany: readTaskServicesByTaskIds, listOptions: listTaskServiceOptions, findTaskIds: findTaskIdsByService, insert: insertTaskServices, replace: replaceTaskServices });
}
