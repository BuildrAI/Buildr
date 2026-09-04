import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';

import { sqliteContextDatabaseOrNull, type SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import { Task, type ParentCompletion, type TaskResultHistory, type TaskRetrospective, type TaskStatus } from '../domain/task.ts';

type SqlRow = Record<string, SQLOutputValue>;
export type TaskRelation = { taskId: string; title: string; status: TaskStatus };
export type TaskTableQuery = { q?: string; status?: string; hasChildren?: string; retrospectiveState?: string; taskIds?: string[] };

function taskRecordError(code: string, message: string, status = 500, details?: unknown): Error {
  return Object.assign(new Error(message), { code, status, details, taskRecordBusiness: true });
}

function database(context: SqliteContext) {
  return sqliteContextDatabaseOrNull(context);
}

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task数据库字段无效：${field}。`, 500, { field });
  return value;
}

function nullableStringColumn(row: SqlRow, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  return stringColumn(row, field);
}

function numberColumn(row: SqlRow, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw taskRecordError('task_record_database_invalid', `Task数据库字段无效：${field}。`, 500, { field });
  return value;
}

function statusColumn(row: SqlRow, field = 'status'): TaskStatus {
  const value = stringColumn(row, field);
  if (!['todo', 'active', 'completed', 'abandoned'].includes(value)) throw taskRecordError('task_record_database_invalid', `Task数据库状态无效：${field}。`, 500, { field, value });
  return value as TaskStatus;
}

function jsonColumn<T>(row: SqlRow, field: string, fallback: T): T {
  const value = nullableStringColumn(row, field);
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; }
  catch { throw taskRecordError('task_record_database_invalid', `Task数据库JSON字段无效：${field}。`, 500, { field }); }
}

function mapTask(row: SqlRow): Task {
  const status = statusColumn(row);
  const summary = nullableStringColumn(row, 'result_summary');
  const parentCompletion = jsonColumn<ParentCompletion | undefined>(row, 'parent_completion_json', undefined);
  const retrospectiveState = nullableStringColumn(row, 'retrospective_state');
  const retrospective = retrospectiveState === null ? null : {
    state: retrospectiveState as TaskRetrospective['state'],
    documentDigest: stringColumn(row, 'retrospective_document_digest'),
  };
  return new Task({
    taskId: stringColumn(row, 'task_id'),
    title: stringColumn(row, 'title'),
    intent: stringColumn(row, 'intent'),
    status,
    parentTaskId: nullableStringColumn(row, 'parent_task_id'),
    isParent: numberColumn(row, 'is_parent') === 1,
    result: status === 'todo' || status === 'active' ? null : { summary: summary ?? '', ...(parentCompletion ? { parentCompletion } : {}) },
    resultHistory: jsonColumn<TaskResultHistory[]>(row, 'result_history_json', []),
    retrospective,
    createdAt: stringColumn(row, 'created_at'),
    updatedAt: stringColumn(row, 'updated_at'),
  });
}

function appendSearch(conditions: string[], parameters: SQLInputValue[], raw: string): void {
  const text = raw.trim().replace(/^#/, '');
  if (!text) return;
  const lowered = text.toLowerCase();
  const tokens = [...new Set(lowered.split(/[^0-9a-z\u0080-\uffff]+/).filter(Boolean))];
  const needles = tokens.length ? tokens : [lowered];
  const clause = needles.map(() => '(instr(lower(title), ?) > 0 OR instr(lower(intent), ?) > 0 OR instr(lower(task_id), ?) > 0)').join(' AND ');
  conditions.push(`(${clause})`);
  parameters.push(...needles.flatMap((needle) => [needle, needle, needle]));
}

function query(input: TaskTableQuery = {}): { sql: string; parameters: SQLInputValue[] } {
  const conditions: string[] = [];
  const parameters: SQLInputValue[] = [];
  if (input.taskIds) {
    if (!input.taskIds.length) conditions.push('0 = 1');
    else { conditions.push(`task_id IN (${input.taskIds.map(() => '?').join(', ')})`); parameters.push(...input.taskIds); }
  }
  if (input.q) appendSearch(conditions, parameters, input.q);
  if (input.status === 'open') conditions.push("status IN ('todo', 'active')");
  else if (input.status && input.status !== 'all') { conditions.push('status = ?'); parameters.push(input.status); }
  if (input.hasChildren === 'yes') conditions.push('EXISTS (SELECT 1 FROM tasks child WHERE child.parent_task_id = tasks.task_id)');
  if (input.hasChildren === 'no') conditions.push('NOT EXISTS (SELECT 1 FROM tasks child WHERE child.parent_task_id = tasks.task_id)');
  if (input.retrospectiveState === 'missing') conditions.push('retrospective_state IS NULL');
  else if (input.retrospectiveState && input.retrospectiveState !== 'all') { conditions.push('retrospective_state = ?'); parameters.push(input.retrospectiveState); }
  return { sql: `SELECT * FROM tasks ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY updated_at DESC, task_id`, parameters };
}

export function createTaskRepository() {
  return Object.freeze({
    read(context: SqliteContext, taskId: string): Task | null {
      const db = database(context);
      if (!db) return null;
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
      return row ? mapTask(row) : null;
    },
    readMany(context: SqliteContext, input: TaskTableQuery = {}): Task[] {
      const db = database(context);
      if (!db) return [];
      const statement = query(input);
      return db.prepare(statement.sql).all(...statement.parameters).map(mapTask);
    },
    count(context: SqliteContext): number {
      const db = database(context);
      if (!db) return 0;
      const row = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
      return row ? numberColumn(row, 'count') : 0;
    },
    relations(context: SqliteContext, taskIds: string[]): Map<string, { parent: TaskRelation | null; children: TaskRelation[] }> {
      const result = new Map<string, { parent: TaskRelation | null; children: TaskRelation[] }>();
      const db = database(context);
      if (!db || !taskIds.length) return result;
      const slots = taskIds.map(() => '?').join(', ');
      for (const taskId of taskIds) result.set(taskId, { parent: null, children: [] });
      const rows = db.prepare(`
        SELECT 'parent' AS relation_kind, t.task_id AS owner_id, p.task_id AS related_task_id, p.title AS related_title, p.status AS related_status
        FROM tasks t LEFT JOIN tasks p ON p.task_id = t.parent_task_id WHERE t.task_id IN (${slots})
        UNION ALL
        SELECT 'child' AS relation_kind, c.parent_task_id AS owner_id, c.task_id AS related_task_id, c.title AS related_title, c.status AS related_status
        FROM tasks c WHERE c.parent_task_id IN (${slots})
        ORDER BY owner_id, relation_kind, related_task_id`).all(...taskIds, ...taskIds);
      for (const row of rows) {
        const owner = result.get(stringColumn(row, 'owner_id'));
        const relatedTaskId = nullableStringColumn(row, 'related_task_id');
        if (!owner || !relatedTaskId) continue;
        const relation = { taskId: relatedTaskId, title: stringColumn(row, 'related_title'), status: statusColumn(row, 'related_status') };
        if (stringColumn(row, 'relation_kind') === 'parent') owner.parent = relation;
        else owner.children.push(relation);
      }
      return result;
    },
    parentId(context: SqliteContext, taskId: string): string | null | undefined {
      const db = database(context);
      const row = db?.prepare('SELECT parent_task_id FROM tasks WHERE task_id = ?').get(taskId);
      return row ? nullableStringColumn(row, 'parent_task_id') : undefined;
    },
    legacyParentPlan(context: SqliteContext, taskId: string): unknown {
      const db = database(context);
      const row = db?.prepare('SELECT legacy_parent_plan_json FROM tasks WHERE task_id = ?').get(taskId);
      return row ? jsonColumn(row, 'legacy_parent_plan_json', null) : null;
    },
    insert(context: SqliteContext, task: Task): void {
      const db = database(context);
      if (!db) throw taskRecordError('task_record_database_invalid', 'Task写入缺少事务连接。', 500);
      db.prepare(`INSERT INTO tasks(task_id, title, intent, status, result_summary, created_at, updated_at, parent_task_id, is_parent, parent_completion_json, result_history_json, retrospective_state, retrospective_document_digest)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(task.taskId, task.title, task.intent, task.status, task.result?.summary ?? null, task.createdAt, task.updatedAt, task.parentTaskId, Number(task.isParent), task.result?.parentCompletion ? JSON.stringify(task.result.parentCompletion) : null, JSON.stringify(task.resultHistory), task.retrospective?.state ?? null, task.retrospective?.documentDigest ?? null);
    },
    update(context: SqliteContext, task: Task): void {
      const db = database(context);
      if (!db) throw taskRecordError('task_record_database_invalid', 'Task写入缺少事务连接。', 500);
      db.prepare(`UPDATE tasks SET title = ?, intent = ?, status = ?, result_summary = ?, created_at = ?, updated_at = ?, parent_task_id = ?, is_parent = MAX(is_parent, ?), parent_completion_json = ?, result_history_json = ?, retrospective_state = ?, retrospective_document_digest = ? WHERE task_id = ?`).run(task.title, task.intent, task.status, task.result?.summary ?? null, task.createdAt, task.updatedAt, task.parentTaskId, Number(task.isParent), task.result?.parentCompletion ? JSON.stringify(task.result.parentCompletion) : null, JSON.stringify(task.resultHistory), task.retrospective?.state ?? null, task.retrospective?.documentDigest ?? null, task.taskId);
    },
    markParent(context: SqliteContext, taskId: string): void {
      const db = database(context);
      if (!db) throw taskRecordError('task_record_database_invalid', 'Task写入缺少事务连接。', 500);
      db.prepare('UPDATE tasks SET is_parent = 1 WHERE task_id = ?').run(taskId);
    },
  });
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
