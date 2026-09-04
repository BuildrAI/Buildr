import type { SQLOutputValue } from 'node:sqlite';

import { sqliteContextDatabaseOrNull, type SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import { TaskProject } from '../domain/task-project.ts';

type SqlRow = Record<string, SQLOutputValue>;
const taskRecordError = (code: string, message: string, status = 500, details?: unknown) => Object.assign(new Error(message), { code, status, details, taskRecordBusiness: true });

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task Project数据库字段无效：${field}。`, 500, { field });
  return value;
}

function group(rows: SqlRow[]): Map<string, TaskProject[]> {
  const values = new Map<string, TaskProject[]>();
  for (const row of rows) {
    const taskId = stringColumn(row, 'task_id');
    const items = values.get(taskId) || [];
    items.push(new TaskProject(taskId, stringColumn(row, 'project')));
    values.set(taskId, items);
  }
  return values;
}

export function readTaskProjects(context: SqliteContext, taskId: string): TaskProject[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT project FROM task_projects WHERE task_id = ? ORDER BY project').all(taskId)
    .map((row) => new TaskProject(taskId, stringColumn(row, 'project')));
}

export function readTaskProjectsByTaskIds(context: SqliteContext, taskIds: string[]): Map<string, TaskProject[]> {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return new Map();
  if (!taskIds.length) return new Map();
  const slots = taskIds.map(() => '?').join(', ');
  return group(database.prepare(`SELECT task_id, project FROM task_projects WHERE task_id IN (${slots}) ORDER BY task_id, project`).all(...taskIds));
}

export function listTaskProjectOptions(context: SqliteContext): string[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT DISTINCT project FROM task_projects ORDER BY project').all().map((row) => stringColumn(row, 'project'));
}

export function findTaskIdsByProject(context: SqliteContext, project: string): string[] {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) return [];
  return database.prepare('SELECT task_id FROM task_projects WHERE project = ? ORDER BY task_id').all(project)
    .map((row) => stringColumn(row, 'task_id'));
}

export function insertTaskProjects(context: SqliteContext, projects: readonly TaskProject[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Project写入缺少事务连接。', 500);
  const statement = database.prepare('INSERT INTO task_projects(task_id, project) VALUES (?, ?)');
  for (const project of projects) statement.run(project.taskId, project.project);
}

export function replaceTaskProjects(context: SqliteContext, taskId: string, projects: readonly TaskProject[]): void {
  const database = sqliteContextDatabaseOrNull(context);
  if (!database) throw taskRecordError('task_record_database_invalid', 'Task Project写入缺少事务连接。', 500);
  database.prepare('DELETE FROM task_projects WHERE task_id = ?').run(taskId);
  insertTaskProjects(context, projects);
}

export type TaskProjectRepository = {
  read: typeof readTaskProjects;
  readMany: typeof readTaskProjectsByTaskIds;
  listOptions: typeof listTaskProjectOptions;
  findTaskIds: typeof findTaskIdsByProject;
  insert: typeof insertTaskProjects;
  replace: typeof replaceTaskProjects;
};

export function createTaskProjectRepository(): TaskProjectRepository {
  return Object.freeze({ read: readTaskProjects, readMany: readTaskProjectsByTaskIds, listOptions: listTaskProjectOptions, findTaskIds: findTaskIdsByProject, insert: insertTaskProjects, replace: replaceTaskProjects });
}
