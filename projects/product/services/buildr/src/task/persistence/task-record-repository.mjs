import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isTaskRecordId, normalizeTaskRecord, taskRecordError } from '../domain/task-record.mjs';

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
  if (['todo', 'active'].includes(row.status)) return null;
  if (row.status === 'completed') return { summary: row.result_summary, noChange: row.result_no_change === 1,
    ...(row.parent_completion_json == null ? {} : { parentCompletion: JSON.parse(row.parent_completion_json) }) };
  return { summary: row.result_summary };
}

function recordValue(row, { projects = [], services = [], changes = [], childTaskIds = [], retrospectiveSourceTaskIds = [] } = {}) {
  return normalizeTaskRecord({
    schemaVersion: row.schema_version,
    taskId: row.task_id,
    title: row.title,
    intent: row.intent,
    scope: { projects, services },
    changes,
    parentTaskId: row.parent_task_id ?? null,
    childTaskIds,
    ...(row.is_parent === 1 || childTaskIds.length ? { isParent: true } : {}),
    retrospectiveSourceTaskIds,
    status: row.status,
    result: resultValue(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }, { expectedTaskId: row.task_id });
}

export function readTaskRecordFromDatabase(database, taskId) {
  const row = database.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
  if (!row) return null;
  const projects = database.prepare('SELECT project FROM task_projects WHERE task_id = ? ORDER BY project').all(taskId).map((item) => item.project);
  const services = database.prepare('SELECT project, service FROM task_services WHERE task_id = ? ORDER BY project, service').all(taskId);
  const changes = database.prepare('SELECT project, change_name AS change FROM task_changes WHERE task_id = ? ORDER BY project, change_name').all(taskId);
  const childTaskIds = database.prepare('SELECT task_id FROM tasks WHERE parent_task_id = ? ORDER BY task_id').all(taskId).map((item) => item.task_id);
  const retrospectiveSourceTaskIds = database.prepare('SELECT source_task_id FROM task_retrospective_sources WHERE target_task_id = ? ORDER BY source_task_id').all(taskId).map((item) => item.source_task_id);
  return recordValue(row, { projects, services, changes, childTaskIds, retrospectiveSourceTaskIds });
}

function persistence(root, record) {
  return { root, record, recordDigest: digestRecord(record) };
}

function group(rows, key, value = (item) => item) {
  const values = new Map();
  for (const row of rows) {
    const identity = key(row);
    if (!values.has(identity)) values.set(identity, []);
    values.get(identity).push(value(row));
  }
  return values;
}

function appendQuerySearch(conditions, parameters, raw) {
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

function taskViewQuery(filters = {}, taskId = null) {
  const conditions = [];
  const parameters = [];
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
  if (filters.hasRetrospective === 'yes') conditions.push('EXISTS (SELECT 1 FROM task_retrospective_current retrospective_filter WHERE retrospective_filter.task_id = t.task_id)');
  if (filters.hasRetrospective === 'no') conditions.push('NOT EXISTS (SELECT 1 FROM task_retrospective_current retrospective_filter WHERE retrospective_filter.task_id = t.task_id)');
  if (filters.retrospectiveState === 'missing') conditions.push('NOT EXISTS (SELECT 1 FROM task_retrospective_current retrospective_state_filter WHERE retrospective_state_filter.task_id = t.task_id)');
  if (['pending', 'handled', 'no-action'].includes(filters.retrospectiveState)) {
    conditions.push('EXISTS (SELECT 1 FROM task_retrospective_current retrospective_state_filter WHERE retrospective_state_filter.task_id = t.task_id AND retrospective_state_filter.disposition_status = ?)');
    parameters.push(filters.retrospectiveState);
  }
  return {
    sql: `SELECT t.*, parent.title AS parent_title, parent.status AS parent_status,
      (SELECT COUNT(*) FROM tasks child_count WHERE child_count.parent_task_id = t.task_id) AS child_task_count
      FROM tasks t LEFT JOIN tasks parent ON parent.task_id = t.parent_task_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY t.updated_at DESC, t.task_id`,
    parameters,
  };
}

function taskViews(database, rows, root) {
  if (!rows.length) return [];
  const taskIds = rows.map((row) => row.task_id);
  const slots = taskIds.map(() => '?').join(', ');
  const projects = group(database.prepare(`SELECT task_id, project FROM task_projects WHERE task_id IN (${slots}) ORDER BY task_id, project`).all(...taskIds), (row) => row.task_id, (row) => row.project);
  const services = group(database.prepare(`SELECT task_id, project, service FROM task_services WHERE task_id IN (${slots}) ORDER BY task_id, project, service`).all(...taskIds), (row) => row.task_id, ({ project, service }) => ({ project, service }));
  const changes = group(database.prepare(`SELECT task_id, project, change_name AS change FROM task_changes WHERE task_id IN (${slots}) ORDER BY task_id, project, change_name`).all(...taskIds), (row) => row.task_id, ({ project, change }) => ({ project, change }));
  const children = group(database.prepare(`SELECT task_id, parent_task_id, title, status FROM tasks WHERE parent_task_id IN (${slots}) ORDER BY parent_task_id, task_id`).all(...taskIds), (row) => row.parent_task_id);
  const sources = group(database.prepare(`SELECT relation.target_task_id, source.task_id, source.title, source.status
    FROM task_retrospective_sources relation JOIN tasks source ON source.task_id = relation.source_task_id
    WHERE relation.target_task_id IN (${slots}) ORDER BY relation.target_task_id, source.task_id`).all(...taskIds), (row) => row.target_task_id);
  const followups = group(database.prepare(`SELECT relation.source_task_id, target.task_id, target.title, target.status
    FROM task_retrospective_sources relation JOIN tasks target ON target.task_id = relation.target_task_id
    WHERE relation.source_task_id IN (${slots}) ORDER BY relation.source_task_id, target.task_id`).all(...taskIds), (row) => row.source_task_id);
  return rows.map((row) => {
    const childRows = children.get(row.task_id) || [];
    const record = recordValue(row, {
      projects: projects.get(row.task_id) || [],
      services: services.get(row.task_id) || [],
      changes: changes.get(row.task_id) || [],
      childTaskIds: childRows.map((child) => child.task_id),
      retrospectiveSourceTaskIds: (sources.get(row.task_id) || []).map((source) => source.task_id),
    });
    return {
      ...persistence(root, record),
      childTaskCount: Number(row.child_task_count),
      taskRelations: {
        parent: row.parent_task_id ? { taskId: row.parent_task_id, title: row.parent_title, status: row.parent_status } : null,
        children: childRows.map((child) => ({ taskId: child.task_id, title: child.title, status: child.status })),
      },
      retrospectiveRelations: {
        sources: (sources.get(row.task_id) || []).map(({ task_id, title, status }) => ({ taskId: task_id, title, status })),
        followups: (followups.get(row.task_id) || []).map(({ task_id, title, status }) => ({ taskId: task_id, title, status })),
      },
    };
  });
}

function insertRecord(database, record) {
  database.prepare(`INSERT INTO tasks(task_id, schema_version, title, intent, status, result_summary, result_no_change, created_at, updated_at, parent_task_id, is_parent, parent_completion_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.taskId, record.schemaVersion, record.title, record.intent, record.status,
    record.result?.summary ?? null, record.status === 'completed' ? Number(record.result.noChange) : null,
    record.createdAt, record.updatedAt, record.parentTaskId, Number(record.isParent === true), record.result?.parentCompletion ? JSON.stringify(record.result.parentCompletion) : null,
  );
  if (record.parentTaskId) database.prepare('UPDATE tasks SET is_parent = 1 WHERE task_id = ?').run(record.parentTaskId);
  insertRelations(database, record);
}

function assertParentRelation(database, taskId, parentTaskId) {
  if (parentTaskId === null) return;
  if (parentTaskId === taskId) throw taskRecordError('task_record_parent_self_reference', 'Task 不能把自己设为 Parent Task。', 409, { taskId, parentTaskId });
  const parent = database.prepare('SELECT task_id, status FROM tasks WHERE task_id = ?').get(parentTaskId);
  if (!parent) throw taskRecordError('task_record_parent_not_found', `Parent Task 不存在：${parentTaskId}。`, 409, { taskId, parentTaskId }, '选择一个存在且 active 的 Parent Task。');
  if (parent.status !== 'active') throw taskRecordError('task_record_parent_terminal', `Parent Task ${parentTaskId} 已是 ${parent.status}，不能接收新的 Child Task。`, 409, { taskId, parentTaskId, status: parent.status }, '选择一个 active Parent Task。');
  const visited = new Set();
  let cursor = parentTaskId;
  while (cursor) {
    if (cursor === taskId) throw taskRecordError('task_record_parent_cycle', 'Parent Task 关系会形成循环。', 409, { taskId, parentTaskId });
    if (visited.has(cursor)) throw taskRecordError('task_record_parent_graph_invalid', '既有 Parent Task 关系包含循环，无法安全修改。', 409, { taskId, parentTaskId, cursor }, '保留数据库现场并运行 Buildr Doctor。');
    visited.add(cursor);
    cursor = database.prepare('SELECT parent_task_id FROM tasks WHERE task_id = ?').get(cursor)?.parent_task_id ?? null;
  }
}

function insertRelations(database, record, { includeRetrospectiveSources = true } = {}) {
  const projectStatement = database.prepare('INSERT INTO task_projects(task_id, project) VALUES (?, ?)');
  const serviceStatement = database.prepare('INSERT INTO task_services(task_id, project, service) VALUES (?, ?, ?)');
  const changeStatement = database.prepare('INSERT INTO task_changes(task_id, project, change_name) VALUES (?, ?, ?)');
  const retrospectiveSourceStatement = database.prepare('INSERT INTO task_retrospective_sources(target_task_id, source_task_id, created_at) VALUES (?, ?, ?)');
  for (const project of record.scope.projects) projectStatement.run(record.taskId, project);
  for (const service of record.scope.services) serviceStatement.run(record.taskId, service.project, service.service);
  for (const change of record.changes) changeStatement.run(record.taskId, change.project, change.change);
  if (includeRetrospectiveSources) {
    for (const sourceTaskId of record.retrospectiveSourceTaskIds) retrospectiveSourceStatement.run(record.taskId, sourceTaskId, record.updatedAt);
  }
}

function assertRetrospectiveSources(database, taskId, sourceTaskIds) {
  const readSource = database.prepare(`SELECT task.task_id, task.status,
    EXISTS (SELECT 1 FROM task_retrospective_current retrospective WHERE retrospective.task_id = task.task_id) AS has_retrospective
    FROM tasks task WHERE task.task_id = ?`);
  for (const sourceTaskId of sourceTaskIds) {
    if (sourceTaskId === taskId) throw taskRecordError('task_record_retrospective_source_self_reference', 'Task 不能把自己设为复盘来源。', 409, { taskId });
    const source = readSource.get(sourceTaskId);
    if (!source) throw taskRecordError('task_record_retrospective_source_not_found', `复盘来源 Task 不存在：${sourceTaskId}。`, 409, { taskId, sourceTaskId });
    if (!['completed', 'abandoned'].includes(source.status)) throw taskRecordError('task_record_retrospective_source_not_terminal', `复盘来源 Task ${sourceTaskId} 尚未结束。`, 409, { taskId, sourceTaskId, status: source.status });
    if (source.has_retrospective !== 1) throw taskRecordError('task_record_retrospective_source_missing', `Task ${sourceTaskId} 尚无 current 复盘。`, 409, { taskId, sourceTaskId });
  }
}

function replaceRetrospectiveSources(database, record) {
  const desired = new Set(record.retrospectiveSourceTaskIds);
  const current = database.prepare('SELECT source_task_id FROM task_retrospective_sources WHERE target_task_id = ?').all(record.taskId).map((row) => row.source_task_id);
  const remove = database.prepare('DELETE FROM task_retrospective_sources WHERE target_task_id = ? AND source_task_id = ?');
  const insert = database.prepare('INSERT INTO task_retrospective_sources(target_task_id, source_task_id, created_at) VALUES (?, ?, ?)');
  for (const sourceTaskId of current) if (!desired.has(sourceTaskId)) remove.run(record.taskId, sourceTaskId);
  const currentSet = new Set(current);
  for (const sourceTaskId of desired) if (!currentSet.has(sourceTaskId)) insert.run(record.taskId, sourceTaskId, record.updatedAt);
}

function replaceRecord(database, record) {
  database.prepare(`UPDATE tasks SET schema_version = ?, title = ?, intent = ?, status = ?, result_summary = ?, result_no_change = ?, created_at = ?, updated_at = ?, parent_task_id = ?, is_parent = MAX(is_parent, ?), parent_completion_json = ? WHERE task_id = ?`).run(
    record.schemaVersion, record.title, record.intent, record.status, record.result?.summary ?? null,
    record.status === 'completed' ? Number(record.result.noChange) : null, record.createdAt, record.updatedAt, record.parentTaskId,
    Number(record.isParent === true), record.result?.parentCompletion ? JSON.stringify(record.result.parentCompletion) : null, record.taskId,
  );
  if (record.parentTaskId) database.prepare('UPDATE tasks SET is_parent = 1 WHERE task_id = ?').run(record.parentTaskId);
  for (const table of ['task_projects', 'task_services', 'task_changes']) database.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(record.taskId);
  insertRelations(database, record, { includeRetrospectiveSources: false });
  replaceRetrospectiveSources(database, record);
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
  function parentContext(database, root, taskId, record = null) {
    const parent = record || readTaskRecordFromDatabase(database, taskId);
    if (!parent) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404);
    const rows = database.prepare(`SELECT t.*, parent.title AS parent_title, parent.status AS parent_status,
      (SELECT COUNT(*) FROM tasks child WHERE child.parent_task_id = t.task_id) AS child_task_count
      FROM tasks t LEFT JOIN tasks parent ON parent.task_id = t.parent_task_id
      WHERE t.parent_task_id = ? ORDER BY t.task_id`).all(taskId);
    const children = taskViews(database, rows, root).map((view) => view.record).sort((a, b) => a.taskId.localeCompare(b.taskId));
    const legacy = database.prepare('SELECT record_json FROM task_development_current WHERE task_id = ?').get(taskId);
    let legacyPlan = null; let diagnostic = null;
    if (legacy) {
      try { legacyPlan = JSON.parse(legacy.record_json).parentPlan ?? null; }
      catch { diagnostic = { code: 'parent_history_unreadable', message: '旧研发记录不可读；任务关系和结果仍可读取。' }; }
    }
    const isParent = parent.isParent === true || children.length > 0 || legacyPlan !== null;
    return { parent, children, isParent, legacyPlan, diagnostic, recordDigest: digestRecord(parent),
      snapshotIdentity: digestRecord({ parent, children, legacyPlan }) };
  }

  function readParentTaskContext(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened;
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

  function readTaskRecordFromStore(targetRoot, taskId, { writable = false } = {}) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    let opened;
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

  function readTaskRecordPersistence(targetRoot, taskId) {
    return readTaskRecordFromStore(targetRoot, taskId);
  }

  function prepareTaskRecordPersistence(targetRoot, taskId) {
    return readTaskRecordFromStore(targetRoot, taskId, { writable: true });
  }

  function listTaskRecordPersistence(targetRoot) {
    const query = queryTaskRecordViewPersistence(targetRoot);
    return { root: query.root, records: query.views.map(({ childTaskCount, taskRelations, retrospectiveRelations, ...record }) => record), diagnostics: [] };
  }

  function queryTaskRecordViewPersistence(targetRoot, filters = {}) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
      if (!opened.present) return { root, views: [], totalTaskCount: 0, filterOptions: { projects: [], services: [] } };
      const query = taskViewQuery(filters);
      const rows = opened.database.prepare(query.sql).all(...query.parameters);
      const totalTaskCount = Number(opened.database.prepare('SELECT COUNT(*) AS count FROM tasks').get().count);
      const projectOptions = opened.database.prepare('SELECT DISTINCT project FROM task_projects ORDER BY project').all().map((row) => row.project);
      const serviceOptions = opened.database.prepare('SELECT DISTINCT project, service FROM task_services ORDER BY project, service').all();
      return { root, views: taskViews(opened.database, rows, root), totalTaskCount, filterOptions: { projects: projectOptions, services: serviceOptions } };
    } catch (error) {
      throw asTaskRecordError(error, '查询视图读取');
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function readTaskRecordViewPersistence(targetRoot, taskId) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) throw taskRecordError('task_record_identity_invalid', `Task ID 不合法：${taskId || '<missing>'}。`, 400, { taskId });
    let opened;
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

  function createTaskRecordPersistence(targetRoot, value) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const record = normalizeTaskRecord(value, { expectedTaskId: value?.taskId });
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      return withTransaction(opened.database, () => {
        if (readTaskRecordFromDatabase(opened.database, record.taskId)) throw taskRecordError('task_record_already_exists', `Task Record 已存在：${record.taskId}。`, 409, { taskId: record.taskId }, `运行 buildr task inspect ${record.taskId} 查看现有记录。`);
        assertParentRelation(opened.database, record.taskId, record.parentTaskId);
        assertRetrospectiveSources(opened.database, record.taskId, record.retrospectiveSourceTaskIds);
        insertRecord(opened.database, record);
        return persistence(root, readTaskRecordFromDatabase(opened.database, record.taskId));
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
        const currentRecord = readTaskRecordFromDatabase(opened.database, taskId);
        if (!currentRecord) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskId}。`, 404, { taskId }, `运行 buildr task create ${taskId} 创建正式 Task Record。`);
        const current = persistence(root, currentRecord);
        const nextValue = mutator(current, { parentContext: () => parentContext(opened.database, root, taskId, currentRecord) });
        if (!nextValue) return current;
        const next = normalizeTaskRecord(nextValue, { expectedTaskId: taskId });
        if (JSON.stringify(next.childTaskIds) !== JSON.stringify(currentRecord.childTaskIds)) throw taskRecordError('task_record_children_read_only', 'childTaskIds 是由 Child Task 关系派生的只读投影。', 409, { taskId });
        if (next.parentTaskId !== currentRecord.parentTaskId) assertParentRelation(opened.database, taskId, next.parentTaskId);
        assertRetrospectiveSources(opened.database, taskId, next.retrospectiveSourceTaskIds);
        replaceRecord(opened.database, next);
        return persistence(root, readTaskRecordFromDatabase(opened.database, taskId));
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
    readParentTaskContext,
    assertCanonicalTaskWorkspace,
    taskRecordDirectory,
    ensureTaskRecordDirectory,
    readTaskRecordPersistence,
    prepareTaskRecordPersistence,
    listTaskRecordPersistence,
    queryTaskRecordViewPersistence,
    readTaskRecordViewPersistence,
    createTaskRecordPersistence,
    mutateTaskRecordPersistence,
    writeTaskRecordPersistence,
  });
  return runtime;
}
