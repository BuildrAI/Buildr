import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';

import { sqliteContextDatabaseOrNull, type SqliteContext } from '../../../infrastructure/sqlite/transaction.ts';

type SqlRow = Record<string, SQLOutputValue>;

export const TASK_STATUS_ORDER_SQL = "CASE tasks.status WHEN 'active' THEN 0 WHEN 'todo' THEN 1 WHEN 'completed' THEN 2 WHEN 'abandoned' THEN 3 END";
const TASK_STATUS_ORDER = ['active', 'todo', 'completed', 'abandoned'] as const;

export type TaskListCursor = { statusRank: number; updatedAt: string; taskId: string };
export type TaskListSearch = { kind: 'fts'; expression: string } | { kind: 'task-id'; taskId: string };
export type TaskListQuery = {
  search?: TaskListSearch;
  project?: string;
  service?: { project: string; service: string };
  status?: string;
  hasChildren?: string;
  retrospectiveState?: string;
  cursor?: TaskListCursor;
  limit?: number;
};
export type TaskListBoundary = { taskId: string; statusRank: number; updatedAt: string };

function taskListError(message: string, details?: unknown): Error {
  return Object.assign(new Error(message), { code: 'task_record_database_invalid', status: 500, details, taskRecordBusiness: true });
}

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskListError(`Task list数据库字段无效：${field}。`, { field });
  return value;
}

function numberColumn(row: SqlRow, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw taskListError(`Task list数据库字段无效：${field}。`, { field });
  return value;
}

function exactStatus(status?: string): boolean {
  return Boolean(status && !['all', 'open'].includes(status));
}

type QueryShape = {
  from: string;
  searchHandled?: boolean;
  projectHandled?: boolean;
  serviceHandled?: boolean;
  childrenHandled?: boolean;
};

function queryShape(input: TaskListQuery): QueryShape {
  if (input.search?.kind === 'task-id') return { from: 'FROM tasks' };
  if (input.search?.kind === 'fts') {
    return { from: 'FROM task_search JOIN tasks ON tasks.rowid = task_search.rowid', searchHandled: true };
  }
  if (input.service) {
    return {
      from: 'FROM task_services AS scoped_service INDEXED BY task_services_identity_idx JOIN tasks ON tasks.task_id = scoped_service.task_id',
      projectHandled: true,
      serviceHandled: true,
    };
  }
  if (input.project) {
    return {
      from: 'FROM task_projects AS scoped_project INDEXED BY task_projects_project_idx JOIN tasks ON tasks.task_id = scoped_project.task_id',
      projectHandled: true,
    };
  }
  if (input.hasChildren === 'yes') {
    return {
      from: 'FROM (SELECT DISTINCT parent_task_id FROM tasks INDEXED BY tasks_parent_task_idx WHERE parent_task_id IS NOT NULL) AS child_parent JOIN tasks ON tasks.task_id = child_parent.parent_task_id',
      childrenHandled: true,
    };
  }
  if (input.retrospectiveState && input.retrospectiveState !== 'all' && input.retrospectiveState !== 'missing') {
    return { from: 'FROM tasks INDEXED BY tasks_retrospective_state_idx' };
  }
  if (exactStatus(input.status)) return { from: 'FROM tasks INDEXED BY tasks_status_updated_at_idx' };
  return { from: 'FROM tasks INDEXED BY tasks_feed_order_idx' };
}

function appendConditions(input: TaskListQuery, includeCursor: boolean, shape: QueryShape): { sql: string; parameters: SQLInputValue[] } {
  const conditions: string[] = [];
  const parameters: SQLInputValue[] = [];
  if (input.search?.kind === 'task-id') {
    conditions.push('tasks.task_id = ?');
    parameters.push(input.search.taskId);
  } else if (input.search?.kind === 'fts') {
    conditions.push(shape.searchHandled ? 'task_search MATCH ?' : 'tasks.rowid IN (SELECT rowid FROM task_search WHERE task_search MATCH ?)');
    parameters.push(input.search.expression);
  }
  if (shape.projectHandled && input.project) {
    conditions.push(shape.serviceHandled ? 'scoped_service.project = ?' : 'scoped_project.project = ?');
    parameters.push(input.project);
  } else if (input.project && !shape.serviceHandled) {
    conditions.push('EXISTS (SELECT 1 FROM task_projects scoped_project WHERE scoped_project.task_id = tasks.task_id AND scoped_project.project = ?)');
    parameters.push(input.project);
  }
  if (shape.serviceHandled && input.service) {
    conditions.push('scoped_service.project = ? AND scoped_service.service = ?');
    parameters.push(input.service.project, input.service.service);
  } else if (input.service) {
    conditions.push('EXISTS (SELECT 1 FROM task_services scoped_service WHERE scoped_service.task_id = tasks.task_id AND scoped_service.project = ? AND scoped_service.service = ?)');
    parameters.push(input.service.project, input.service.service);
  }
  if (input.status === 'open') conditions.push("tasks.status IN ('active', 'todo')");
  else if (exactStatus(input.status)) { conditions.push('tasks.status = ?'); parameters.push(input.status as string); }
  if (input.hasChildren === 'yes' && !shape.childrenHandled) conditions.push('EXISTS (SELECT 1 FROM tasks child WHERE child.parent_task_id = tasks.task_id)');
  if (input.hasChildren === 'no') conditions.push('tasks.task_id NOT IN (SELECT parent_task_id FROM tasks INDEXED BY tasks_parent_task_idx WHERE parent_task_id IS NOT NULL)');
  if (input.retrospectiveState === 'missing') conditions.push('tasks.retrospective_state IS NULL');
  else if (input.retrospectiveState && input.retrospectiveState !== 'all') {
    conditions.push('tasks.retrospective_state = ?');
    parameters.push(input.retrospectiveState);
  }
  if (includeCursor && input.cursor) {
    if (exactStatus(input.status)) {
      conditions.push('(tasks.updated_at < ? OR (tasks.updated_at = ? AND tasks.task_id > ?))');
      parameters.push(input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.taskId);
    } else {
      conditions.push(`(${TASK_STATUS_ORDER_SQL} > ? OR (${TASK_STATUS_ORDER_SQL} = ? AND (tasks.updated_at < ? OR (tasks.updated_at = ? AND tasks.task_id > ?))))`);
      parameters.push(input.cursor.statusRank, input.cursor.statusRank, input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.taskId);
    }
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', parameters };
}

function orderBy(input: TaskListQuery): string {
  return exactStatus(input.status)
    ? 'ORDER BY tasks.updated_at DESC, tasks.task_id'
    : `ORDER BY ${TASK_STATUS_ORDER_SQL}, tasks.updated_at DESC, tasks.task_id`;
}

export function buildTaskListPageStatement(input: TaskListQuery): { sql: string; parameters: SQLInputValue[] } {
  const shape = queryShape(input);
  const clause = appendConditions(input, true, shape);
  const limit = input.limit === undefined ? '' : ' LIMIT ?';
  return {
    sql: `SELECT tasks.task_id, ${TASK_STATUS_ORDER_SQL} AS status_rank, tasks.updated_at ${shape.from} ${clause.sql} ${orderBy(input)}${limit}`,
    parameters: input.limit === undefined ? clause.parameters : [...clause.parameters, input.limit],
  };
}

export function buildTaskListCountStatement(input: TaskListQuery): { sql: string; parameters: SQLInputValue[] } {
  if (input.hasChildren === 'no' && !input.search && !input.project && !input.service
    && (!input.retrospectiveState || input.retrospectiveState === 'all')) {
    const statusSql = input.status === 'open' ? "status IN ('active', 'todo')" : exactStatus(input.status) ? 'status = ?' : '';
    const totalWhere = statusSql ? `WHERE all_tasks.${statusSql}` : '';
    const parentWhere = statusSql ? `WHERE parent_task.${statusSql}` : '';
    const parameters: SQLInputValue[] = exactStatus(input.status) ? [input.status as string, input.status as string] : [];
    return {
      sql: `SELECT (
        SELECT COUNT(*) FROM tasks AS all_tasks ${totalWhere}
      ) - (
        SELECT COUNT(*)
        FROM (SELECT DISTINCT parent_task_id FROM tasks INDEXED BY tasks_parent_task_idx WHERE parent_task_id IS NOT NULL) AS child_parent
        JOIN tasks AS parent_task ON parent_task.task_id = child_parent.parent_task_id
        ${parentWhere}
      ) AS count`,
      parameters,
    };
  }
  const shape = queryShape(input);
  const clause = appendConditions(input, false, shape);
  return { sql: `SELECT COUNT(*) AS count ${shape.from} ${clause.sql}`, parameters: clause.parameters };
}

function mapBoundary(row: SqlRow): TaskListBoundary {
  return { taskId: stringColumn(row, 'task_id'), statusRank: numberColumn(row, 'status_rank'), updatedAt: stringColumn(row, 'updated_at') };
}

export function createTaskListRepository() {
  return Object.freeze({
    readPage(context: SqliteContext, input: TaskListQuery): TaskListBoundary[] {
      const database = sqliteContextDatabaseOrNull(context);
      if (!database) return [];
      if (input.cursor && !exactStatus(input.status) && input.limit !== undefined) {
        const allowed = input.status === 'open' ? TASK_STATUS_ORDER.slice(0, 2) : TASK_STATUS_ORDER;
        const cursorPosition = allowed.findIndex((status) => TASK_STATUS_ORDER.indexOf(status) === input.cursor?.statusRank);
        if (cursorPosition < 0) throw taskListError('Task list游标状态不属于当前查询。', { status: input.status, statusRank: input.cursor.statusRank });
        const result: TaskListBoundary[] = [];
        for (const [offset, status] of allowed.slice(cursorPosition).entries()) {
          const remaining = input.limit - result.length;
          if (remaining <= 0) break;
          const statement = buildTaskListPageStatement({
            ...input,
            status,
            limit: remaining,
            ...(offset === 0 ? { cursor: input.cursor } : { cursor: undefined }),
          });
          result.push(...database.prepare(statement.sql).all(...statement.parameters).map(mapBoundary));
        }
        return result;
      }
      const statement = buildTaskListPageStatement(input);
      return database.prepare(statement.sql).all(...statement.parameters).map(mapBoundary);
    },
    count(context: SqliteContext, input: TaskListQuery): number {
      const database = sqliteContextDatabaseOrNull(context);
      if (!database) return 0;
      const statement = buildTaskListCountStatement(input);
      const row = database.prepare(statement.sql).get(...statement.parameters);
      return row ? numberColumn(row, 'count') : 0;
    },
    explain(context: SqliteContext, input: TaskListQuery): string[] {
      const database = sqliteContextDatabaseOrNull(context);
      if (!database) return [];
      const statement = buildTaskListPageStatement(input);
      return database.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.parameters).map((row) => stringColumn(row, 'detail'));
    },
  });
}

export type TaskListRepository = ReturnType<typeof createTaskListRepository>;
