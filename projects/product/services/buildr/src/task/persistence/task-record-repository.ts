import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';

import { isTaskRecordId, normalizeTaskRecord, taskRecordError, type TaskRecord, type TaskRecordBusinessError, type TaskRecordStatus, type TaskServiceReference } from '../domain/task-record.ts';

type SqlRow = Record<string, SQLOutputValue>;
export type TaskPersistence = { root: string; record: TaskRecord; recordDigest: string };
export type TaskRelation = { taskId: string; title: string; status: TaskRecordStatus };
export type TaskView = TaskPersistence & { taskRelations: { parent: TaskRelation | null; children: TaskRelation[] } };
export type TaskQueryFilters = { q?: string; project?: string; service?: TaskServiceReference; status?: string; hasChildren?: string; retrospectiveState?: string };
type StructuredStore = { present: boolean; database: DatabaseSync };
export type RepositoryRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string): string;
  openWorkspaceStructuredStore(targetRoot: string, options: { writable: boolean }): StructuredStore;
};
export type TaskMutationContext = { parentContext(): ReturnType<typeof parentContextShape> };
export type TaskRecordRepository = {
  readParentTaskContext(targetRoot: string, taskId: string): ReturnType<typeof parentContextShape>;
  assertCanonicalTaskWorkspace(targetRoot: string): string;
  taskRecordDirectory(targetRoot: string, taskId: string): string;
  ensureTaskRecordDirectory(targetRoot: string, taskId: string, io?: Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'lstatSync'>): string;
  readTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  prepareTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence;
  queryTaskRecordViewPersistence(targetRoot: string, filters?: TaskQueryFilters): { root: string; views: TaskView[]; totalTaskCount: number; filterOptions: { projects: string[]; services: TaskServiceReference[] } };
  readTaskRecordViewPersistence(targetRoot: string, taskId: string): TaskView;
  createTaskRecordPersistence(targetRoot: string, value: unknown): TaskPersistence;
  mutateTaskRecordPersistence(targetRoot: string, taskId: string, mutator: (current: TaskPersistence, context: TaskMutationContext) => unknown): TaskPersistence;
  writeTaskRecordPersistence(targetRoot: string, record: TaskRecord): TaskPersistence;
};

function parentContextShape(parent: TaskRecord, children: TaskRecord[], legacyPlan: unknown, diagnostic: { code: string; message: string } | null) {
  const relevant = (record: TaskRecord) => ({ taskId: record.taskId, title: record.title, intent: record.intent, scope: record.scope, changes: record.changes, parentTaskId: record.parentTaskId, isParent: record.isParent === true, status: record.status, result: record.result });
  return { parent, children, isParent: parent.isParent === true || children.length > 0, legacyPlan, diagnostic, recordDigest: digestRecord(parent), snapshotIdentity: digestRecord({ parent: relevant(parent), children: children.map(relevant) }) };
}

function stringColumn(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task Record数据库字段无效：${field}。`, 500, { field });
  return value;
}

function nullableStringColumn(row: SqlRow, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') throw taskRecordError('task_record_database_invalid', `Task Record数据库字段无效：${field}。`, 500, { field });
  return value;
}

function numberColumn(row: SqlRow, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw taskRecordError('task_record_database_invalid', `Task Record数据库字段无效：${field}。`, 500, { field });
  return value;
}

function statusColumn(row: SqlRow, field: string): TaskRecordStatus {
  const value = stringColumn(row, field);
  if (value !== 'todo' && value !== 'active' && value !== 'completed' && value !== 'abandoned') {
    throw taskRecordError('task_record_database_invalid', `Task Record数据库状态无效：${field}。`, 500, { field, value });
  }
  return value;
}

function errorRecord(error: unknown): Record<string, unknown> {
  return error !== null && typeof error === 'object' && !Array.isArray(error) ? Object.fromEntries(Object.entries(error)) : {};
}

function digestRecord(record: unknown): string {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')}`;
}

function asTaskRecordError(error: unknown, operation: string): TaskRecordBusinessError {
  const detail = errorRecord(error);
  if (detail.taskRecordBusiness === true && error instanceof Error && typeof detail.code === 'string' && typeof detail.status === 'number') {
    const taskRecordBusiness: true = true;
    return Object.assign(error, { code: detail.code, status: detail.status, taskRecordBusiness, ...(detail.details === undefined ? {} : { details: detail.details }), ...(typeof detail.nextAction === 'string' ? { nextAction: detail.nextAction } : {}) });
  }
  if (detail.structuredStoreBusiness === true) {
    const originalCode = typeof detail.code === 'string' ? detail.code : 'workspace_store_failed';
    const code = originalCode === 'workspace_store_workspace_not_canonical'
      ? 'task_record_workspace_not_canonical'
      : originalCode === 'workspace_store_workspace_invalid'
        ? 'task_record_workspace_invalid'
        : originalCode;
    return taskRecordError(code, error instanceof Error ? error.message : String(error), typeof detail.status === 'number' ? detail.status : 500, detail.details, typeof detail.nextAction === 'string' ? detail.nextAction : undefined);
  }
  return taskRecordError('task_record_database_failed', `Task Record ${operation} 失败：${error instanceof Error ? error.message : String(error)}`, 500, undefined, '保留数据库现场并运行 Buildr Doctor。');
}

function resultValue(row: SqlRow): unknown {
  const status = stringColumn(row, 'status');
  if (status === 'todo' || status === 'active') return null;
  const summary = stringColumn(row, 'result_summary');
  if (status === 'completed') {
    const parentCompletionJson = nullableStringColumn(row, 'parent_completion_json');
    const parentCompletion: unknown = parentCompletionJson === null ? undefined : JSON.parse(parentCompletionJson);
    return { summary, ...(parentCompletion === undefined ? {} : { parentCompletion }) };
  }
  return { summary };
}

function recordValue(row: SqlRow, { projects = [], services = [], changes = [] }: { projects?: string[]; services?: TaskServiceReference[]; changes?: Array<{ project: string; change: string }> } = {}): TaskRecord {
  const retrospectiveState = nullableStringColumn(row, 'retrospective_state');
  const resultHistory: unknown = JSON.parse(nullableStringColumn(row, 'result_history_json') || '[]');
  return normalizeTaskRecord({
    schemaVersion: 'buildr.task-record/v3',
    taskId: stringColumn(row, 'task_id'),
    title: stringColumn(row, 'title'),
    intent: stringColumn(row, 'intent'),
    scope: { projects, services },
    changes,
    parentTaskId: nullableStringColumn(row, 'parent_task_id'),
    ...(numberColumn(row, 'is_parent') === 1 ? { isParent: true } : {}),
    retrospective: retrospectiveState === null ? null : {
      state: retrospectiveState,
      documentDigest: nullableStringColumn(row, 'retrospective_document_digest'),
    },
    status: stringColumn(row, 'status'),
    result: resultValue(row),
    resultHistory,
    createdAt: stringColumn(row, 'created_at'),
    updatedAt: stringColumn(row, 'updated_at'),
  }, { expectedTaskId: stringColumn(row, 'task_id') });
}

export function readTaskRecordFromDatabase(database: DatabaseSync, taskId: string): TaskRecord | null {
  const row = database.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
  if (!row) return null;
  const projects = database.prepare('SELECT project FROM task_projects WHERE task_id = ? ORDER BY project').all(taskId).map((item) => stringColumn(item, 'project'));
  const services = database.prepare('SELECT project, service FROM task_services WHERE task_id = ? ORDER BY project, service').all(taskId).map((item) => ({ project: stringColumn(item, 'project'), service: stringColumn(item, 'service') }));
  const changes = database.prepare('SELECT project, change_name AS change FROM task_changes WHERE task_id = ? ORDER BY project, change_name').all(taskId).map((item) => ({ project: stringColumn(item, 'project'), change: stringColumn(item, 'change') }));
  return recordValue(row, { projects, services, changes });
}

function persistence(root: string, record: TaskRecord): TaskPersistence {
  return { root, record, recordDigest: digestRecord(record) };
}

function group<T, V>(rows: T[], key: (row: T) => string, value: (row: T) => V): Map<string, V[]> {
  const values = new Map<string, V[]>();
  for (const row of rows) {
    const identity = key(row);
    if (!values.has(identity)) values.set(identity, []);
    values.get(identity)?.push(value(row));
  }
  return values;
}

function appendQuerySearch(conditions: string[], parameters: SQLInputValue[], raw: string): void {
  const text = String(raw || '').trim().replace(/^#/, '');
  if (!text) return;
  const lowered = text.toLowerCase();
  const tokens = [...new Set(lowered.split(/[^0-9a-z\u0080-\uffff]+/).filter(Boolean))];
  const needles = tokens.length ? tokens : [lowered];
  const tokenClause = needles
    .map(() => '(instr(lower(t.title), ?) > 0 OR instr(lower(t.intent), ?) > 0 OR instr(lower(t.task_id), ?) > 0)')
    .join(' AND ');
  const tokenParams = needles.flatMap((needle) => [needle, needle, needle]);
  const compact = lowered.replace(/[^0-9a-z\u0080-\uffff]/g, '');
  if (compact && compact !== lowered) {
    conditions.push(`((${tokenClause}) OR instr(replace(replace(replace(lower(t.task_id), '-', ''), '_', ''), '.', ''), ?) > 0)`);
    parameters.push(...tokenParams, compact);
  } else {
    conditions.push(`(${tokenClause})`);
    parameters.push(...tokenParams);
  }
}

function taskViewQuery(filters: TaskQueryFilters = {}, taskId: string | null = null): { sql: string; parameters: SQLInputValue[] } {
  const conditions: string[] = [];
  const parameters: SQLInputValue[] = [];
  if (taskId) { conditions.push('t.task_id = ?'); parameters.push(taskId); }
  if (filters.q) appendQuerySearch(conditions, parameters, filters.q);
  if (filters.project) {
    conditions.push('EXISTS (SELECT 1 FROM task_projects project_filter WHERE project_filter.task_id = t.task_id AND project_filter.project = ?)');
    parameters.push(filters.project);
  }
  if (filters.service) {
    conditions.push('EXISTS (SELECT 1 FROM task_services service_filter WHERE service_filter.task_id = t.task_id AND service_filter.project = ? AND service_filter.service = ?)');
    parameters.push(filters.service.project, filters.service.service);
  }
  if (filters.status === 'open') conditions.push("t.status IN ('todo', 'active')");
  else if (filters.status && filters.status !== 'all') { conditions.push('t.status = ?'); parameters.push(filters.status); }
  if (filters.hasChildren === 'yes') conditions.push('EXISTS (SELECT 1 FROM tasks child_filter WHERE child_filter.parent_task_id = t.task_id)');
  if (filters.hasChildren === 'no') conditions.push('NOT EXISTS (SELECT 1 FROM tasks child_filter WHERE child_filter.parent_task_id = t.task_id)');
  if (filters.retrospectiveState === 'missing') conditions.push('t.retrospective_state IS NULL');
  if (filters.retrospectiveState === 'pending-decision' || filters.retrospectiveState === 'decided') {
    conditions.push('t.retrospective_state = ?');
    parameters.push(filters.retrospectiveState);
  }
  return {
    sql: `SELECT t.*, parent.title AS parent_title, parent.status AS parent_status
      FROM tasks t LEFT JOIN tasks parent ON parent.task_id = t.parent_task_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY t.updated_at DESC, t.task_id`,
    parameters,
  };
}

function taskViews(database: DatabaseSync, rows: SqlRow[], root: string): TaskView[] {
  if (!rows.length) return [];
  const taskIds = rows.map((row) => stringColumn(row, 'task_id'));
  const slots = taskIds.map(() => '?').join(', ');
  const projects = group(database.prepare(`SELECT task_id, project FROM task_projects WHERE task_id IN (${slots}) ORDER BY task_id, project`).all(...taskIds), (row) => stringColumn(row, 'task_id'), (row) => stringColumn(row, 'project'));
  const services = group(database.prepare(`SELECT task_id, project, service FROM task_services WHERE task_id IN (${slots}) ORDER BY task_id, project, service`).all(...taskIds), (row) => stringColumn(row, 'task_id'), (row) => ({ project: stringColumn(row, 'project'), service: stringColumn(row, 'service') }));
  const changes = group(database.prepare(`SELECT task_id, project, change_name AS change FROM task_changes WHERE task_id IN (${slots}) ORDER BY task_id, project, change_name`).all(...taskIds), (row) => stringColumn(row, 'task_id'), (row) => ({ project: stringColumn(row, 'project'), change: stringColumn(row, 'change') }));
  const children = group(database.prepare(`SELECT task_id, parent_task_id, title, status FROM tasks WHERE parent_task_id IN (${slots}) ORDER BY parent_task_id, task_id`).all(...taskIds), (row) => stringColumn(row, 'parent_task_id'), (row) => row);
  return rows.map((row) => {
    const rowTaskId = stringColumn(row, 'task_id');
    const childRows = children.get(rowTaskId) || [];
    const record = recordValue(row, {
      projects: projects.get(rowTaskId) || [],
      services: services.get(rowTaskId) || [],
      changes: changes.get(rowTaskId) || [],
    });
    return {
      ...persistence(root, record),
      taskRelations: {
        parent: nullableStringColumn(row, 'parent_task_id') ? { taskId: stringColumn(row, 'parent_task_id'), title: stringColumn(row, 'parent_title'), status: statusColumn(row, 'parent_status') } : null,
        children: childRows.map((child) => ({ taskId: stringColumn(child, 'task_id'), title: stringColumn(child, 'title'), status: statusColumn(child, 'status') })),
      },
    };
  });
}

function insertRecord(database: DatabaseSync, record: TaskRecord): void {
  database.prepare(`INSERT INTO tasks(task_id, title, intent, status, result_summary, created_at, updated_at, parent_task_id, is_parent, parent_completion_json, result_history_json, retrospective_state, retrospective_document_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.taskId, record.title, record.intent, record.status,
    record.result?.summary ?? null,
    record.createdAt, record.updatedAt, record.parentTaskId, Number(record.isParent === true), record.result?.parentCompletion ? JSON.stringify(record.result.parentCompletion) : null, JSON.stringify(record.resultHistory || []),
    record.retrospective?.state ?? null, record.retrospective?.documentDigest ?? null,
  );
  if (record.parentTaskId) database.prepare('UPDATE tasks SET is_parent = 1 WHERE task_id = ?').run(record.parentTaskId);
  insertRelations(database, record);
}

function assertParentRelation(database: DatabaseSync, taskId: string, parentTaskId: string | null): void {
  if (parentTaskId === null) return;
  if (parentTaskId === taskId) throw taskRecordError('task_record_parent_self_reference', 'Task 不能把自己设为 Parent Task。', 409, { taskId, parentTaskId });
  const parent = database.prepare('SELECT task_id, status FROM tasks WHERE task_id = ?').get(parentTaskId);
  if (!parent) throw taskRecordError('task_record_parent_not_found', `Parent Task 不存在：${parentTaskId}。`, 409, { taskId, parentTaskId }, '选择一个存在且 active 的 Parent Task。');
  const parentStatus = statusColumn(parent, 'status');
  if (parentStatus !== 'active') throw taskRecordError('task_record_parent_terminal', `Parent Task ${parentTaskId} 已是 ${parentStatus}，不能接收新的 Child Task。`, 409, { taskId, parentTaskId, status: parentStatus }, '选择一个 active Parent Task。');
  const visited = new Set<string>();
  let cursor: string | null = parentTaskId;
  while (cursor) {
    if (cursor === taskId) throw taskRecordError('task_record_parent_cycle', 'Parent Task 关系会形成循环。', 409, { taskId, parentTaskId });
    if (visited.has(cursor)) throw taskRecordError('task_record_parent_graph_invalid', '既有 Parent Task 关系包含循环，无法安全修改。', 409, { taskId, parentTaskId, cursor }, '保留数据库现场并运行 Buildr Doctor。');
    visited.add(cursor);
    const ancestor: SqlRow | undefined = database.prepare('SELECT parent_task_id FROM tasks WHERE task_id = ?').get(cursor);
    cursor = ancestor ? nullableStringColumn(ancestor, 'parent_task_id') : null;
  }
}

function insertRelations(database: DatabaseSync, record: TaskRecord): void {
  const projectStatement = database.prepare('INSERT INTO task_projects(task_id, project) VALUES (?, ?)');
  const serviceStatement = database.prepare('INSERT INTO task_services(task_id, project, service) VALUES (?, ?, ?)');
  const changeStatement = database.prepare('INSERT INTO task_changes(task_id, project, change_name) VALUES (?, ?, ?)');
  for (const project of record.scope.projects) projectStatement.run(record.taskId, project);
  for (const service of record.scope.services) serviceStatement.run(record.taskId, service.project, service.service);
  for (const change of record.changes) changeStatement.run(record.taskId, change.project, change.change);
}

function replaceRecord(database: DatabaseSync, record: TaskRecord): void {
  database.prepare(`UPDATE tasks SET title = ?, intent = ?, status = ?, result_summary = ?, created_at = ?, updated_at = ?, parent_task_id = ?, is_parent = MAX(is_parent, ?), parent_completion_json = ?, result_history_json = ?, retrospective_state = ?, retrospective_document_digest = ? WHERE task_id = ?`).run(
    record.title, record.intent, record.status, record.result?.summary ?? null, record.createdAt, record.updatedAt, record.parentTaskId,
    Number(record.isParent === true), record.result?.parentCompletion ? JSON.stringify(record.result.parentCompletion) : null, JSON.stringify(record.resultHistory || []),
    record.retrospective?.state ?? null, record.retrospective?.documentDigest ?? null, record.taskId,
  );
  if (record.parentTaskId) database.prepare('UPDATE tasks SET is_parent = 1 WHERE task_id = ?').run(record.parentTaskId);
  for (const table of ['task_projects', 'task_services', 'task_changes']) database.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(record.taskId);
  insertRelations(database, record);
}

function withTransaction<T>(database: DatabaseSync, callback: () => T): T {
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

export function registerTaskRecordRepository<T extends RepositoryRuntime>(runtime: T): T & TaskRecordRepository {
  function parentContext(database: DatabaseSync, root: string, taskId: string, record: TaskRecord | null = null): ReturnType<typeof parentContextShape> {
    const parent = record || readTaskRecordFromDatabase(database, taskId);
    if (!parent) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404);
    const rows = database.prepare(`SELECT t.*, parent.title AS parent_title, parent.status AS parent_status,
      (SELECT COUNT(*) FROM tasks child WHERE child.parent_task_id = t.task_id) AS child_task_count
      FROM tasks t LEFT JOIN tasks parent ON parent.task_id = t.parent_task_id
      WHERE t.parent_task_id = ? ORDER BY t.task_id`).all(taskId);
    const children = taskViews(database, rows, root).map((view) => view.record).sort((a, b) => a.taskId.localeCompare(b.taskId));
    const legacy = database.prepare('SELECT legacy_parent_plan_json FROM tasks WHERE task_id = ?').get(taskId);
    let legacyPlan = null; let diagnostic = null;
    if (legacy?.legacy_parent_plan_json) {
      try { legacyPlan = JSON.parse(stringColumn(legacy, 'legacy_parent_plan_json')); }
      catch { diagnostic = { code: 'parent_history_unreadable', message: '旧研发记录不可读；任务关系和结果仍可读取。' }; }
    }
    return parentContextShape(parent, children, legacyPlan, diagnostic);
  }

  function readParentTaskContext(targetRoot: string, taskId: string): ReturnType<typeof parentContextShape> {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404);
      // One read snapshot: the confirmation must describe a coherent parent/children set.
      opened.database.exec('BEGIN');
      const result = parentContext(opened.database, root, taskId);
      opened.database.exec('COMMIT');
      return result;
    } finally { opened?.database?.close(); }
  }
  function assertCanonicalTaskWorkspace(targetRoot: string): string {
    try { return runtime.assertCanonicalStructuredWorkspace(targetRoot); }
    catch (error) { throw asTaskRecordError(error, 'Workspace 解析'); }
  }

  function taskRecordDirectory(targetRoot: string, taskId: string): string {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    const recordsRoot = path.join(root, '.buildr', 'tasks');
    const directory = path.resolve(recordsRoot, taskId);
    if (path.dirname(directory) !== recordsRoot) throw taskRecordError('task_record_path_escape', 'Task 专业记录路径逃逸。', 400, { taskId });
    return directory;
  }

  function ensureTaskRecordDirectory(targetRoot: string, taskId: string, io: Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'lstatSync'> = fs): string {
    const directory = taskRecordDirectory(targetRoot, taskId);
    const recordsRoot = path.dirname(directory);
    for (const candidate of [recordsRoot, directory]) {
      if (!io.existsSync(candidate)) {
        try { io.mkdirSync(candidate); }
        catch (error) { if (errorRecord(error).code !== 'EEXIST') throw error; }
      }
      const stat = io.lstatSync(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw taskRecordError('task_record_directory_invalid', 'Task 专业记录容器必须是普通目录。', 409, { taskId });
      }
    }
    return directory;
  }

  function readTaskRecordFromStore(targetRoot: string, taskId: string, { writable = false }: { writable?: boolean } = {}): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable });
      if (!opened.present) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
      const record = readTaskRecordFromDatabase(opened.database, taskId);
      if (!record) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
      return persistence(root, record);
    } catch (error) {
      throw asTaskRecordError(error, '读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function readTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence {
    return readTaskRecordFromStore(targetRoot, taskId);
  }

  function prepareTaskRecordPersistence(targetRoot: string, taskId: string): TaskPersistence {
    return readTaskRecordFromStore(targetRoot, taskId, { writable: true });
  }

  function queryTaskRecordViewPersistence(targetRoot: string, filters: TaskQueryFilters = {}): { root: string; views: TaskView[]; totalTaskCount: number; filterOptions: { projects: string[]; services: TaskServiceReference[] } } {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) return { root, views: [], totalTaskCount: 0, filterOptions: { projects: [], services: [] } };
      const query = taskViewQuery(filters);
      const rows = opened.database.prepare(query.sql).all(...query.parameters);
      const countRow = opened.database.prepare('SELECT COUNT(*) AS count FROM tasks').get();
      if (!countRow) throw taskRecordError('task_record_database_invalid', 'Task总数查询没有返回结果。', 500);
      const totalTaskCount = numberColumn(countRow, 'count');
      const projectOptions = opened.database.prepare('SELECT DISTINCT project FROM task_projects ORDER BY project').all().map((row) => stringColumn(row, 'project'));
      const serviceOptions = opened.database.prepare('SELECT DISTINCT project, service FROM task_services ORDER BY project, service').all().map((row) => ({ project: stringColumn(row, 'project'), service: stringColumn(row, 'service') }));
      return { root, views: taskViews(opened.database, rows, root), totalTaskCount, filterOptions: { projects: projectOptions, services: serviceOptions } };
    } catch (error) {
      throw asTaskRecordError(error, '查询视图读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function readTaskRecordViewPersistence(targetRoot: string, taskId: string): TaskView {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId });
      const query = taskViewQuery({}, taskId);
      const rows = opened.database.prepare(query.sql).all(...query.parameters);
      if (!rows.length) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId });
      return taskViews(opened.database, rows, root)[0];
    } catch (error) {
      throw asTaskRecordError(error, '详情视图读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function createTaskRecordPersistence(targetRoot: string, value: unknown): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const candidate = errorRecord(value);
    const record = normalizeTaskRecord(value, { expectedTaskId: typeof candidate.taskId === 'string' ? candidate.taskId : null });
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      const database = opened.database;
      return withTransaction(database, () => {
        if (readTaskRecordFromDatabase(database, record.taskId)) throw taskRecordError('task_record_already_exists', `Task Record 已存在：${record.taskId}。`, 409, { taskId: record.taskId }, `运行 buildr task inspect ${record.taskId} 查看现有记录。`);
        assertParentRelation(database, record.taskId, record.parentTaskId);
        insertRecord(database, record);
        const created = readTaskRecordFromDatabase(database, record.taskId);
        if (!created) throw taskRecordError('task_record_database_invalid', 'Task Record创建后无法读取。', 500, { taskId: record.taskId });
        return persistence(root, created);
      });
    } catch (error) {
      throw asTaskRecordError(error, '创建');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function mutateTaskRecordPersistence(targetRoot: string, taskId: string, mutator: (current: TaskPersistence, context: TaskMutationContext) => unknown): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened: StructuredStore | undefined;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      const database = opened.database;
      return withTransaction(database, () => {
        const currentRecord = readTaskRecordFromDatabase(database, taskId);
        if (!currentRecord) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
        const current = persistence(root, currentRecord);
        const nextValue = mutator(current, { parentContext: () => parentContext(database, root, taskId, currentRecord) });
        if (!nextValue) return current;
        const next = normalizeTaskRecord(nextValue, { expectedTaskId: taskId });
        if (next.parentTaskId !== currentRecord.parentTaskId) assertParentRelation(database, taskId, next.parentTaskId);
        replaceRecord(database, next);
        const updated = readTaskRecordFromDatabase(database, taskId);
        if (!updated) throw taskRecordError('task_record_database_invalid', 'Task Record更新后无法读取。', 500, { taskId });
        return persistence(root, updated);
      });
    } catch (error) {
      throw asTaskRecordError(error, '修改');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function writeTaskRecordPersistence(targetRoot: string, record: TaskRecord): TaskPersistence {
    return mutateTaskRecordPersistence(targetRoot, record.taskId, () => record);
  }

  return Object.assign(runtime, {
    readParentTaskContext,
    assertCanonicalTaskWorkspace,
    taskRecordDirectory,
    ensureTaskRecordDirectory,
    readTaskRecordPersistence,
    prepareTaskRecordPersistence,
    queryTaskRecordViewPersistence,
    readTaskRecordViewPersistence,
    createTaskRecordPersistence,
    mutateTaskRecordPersistence,
    writeTaskRecordPersistence,
  });
}
