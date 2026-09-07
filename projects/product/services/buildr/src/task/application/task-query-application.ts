import crypto from 'node:crypto';

import {
  assertTaskActionFields as assertFields,
  normalizeTaskRecord,
  taskActionId as taskId,
  taskActionQualifiedReference as qualified,
  taskActionText as text,
  taskRecordError,
  taskRecordErrorFields as errorFields,
} from './task-validation.ts';
import { Task } from '../domain/task.ts';
import { TaskChange } from '../domain/task-change.ts';
import { TaskProject } from '../domain/task-project.ts';
import { TaskService } from '../domain/task-service.ts';
import type { SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import type { TaskRepository } from '../persistence/task-repository.ts';
import type { TaskListBoundary, TaskListCursor, TaskListRepository, TaskListSearch } from '../persistence/task-list-repository.ts';
import type { TaskChangeReference, TaskPersistence, TaskQueryFilters, TaskRecord, TaskServiceReference, TaskView } from './task-dto.ts';
import type { TaskProjectRepository } from '../persistence/task-project-repository.ts';
import type { TaskServiceRepository } from '../persistence/task-service-repository.ts';
import type { TaskChangeRepository } from '../persistence/task-change-repository.ts';
import { taskRetrospectiveDocumentRelativePath, type TaskDocumentOwner, type TaskRetrospectiveDocument } from '../persistence/task-retrospective-document.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import type { TaskListInputDto } from './task-dto.ts';

const MAX_TASK_PAGE_SIZE = 100;

type ChangeResolution = {
  schemaVersion: string;
  taskId: string;
  reference: TaskChangeReference;
  availability: string;
  workingCopy: unknown;
  retainedBaseline: unknown;
  diagnostic?: { code: string; message: string; details?: unknown };
};
export type TaskQueryApplicationRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string, options?: { writable?: boolean }): string;
  prepareWorkspaceStructuredStore(targetRoot: string): { root: string; present: boolean; version: number | null };
  runWorkspaceSqliteRead<T>(targetRoot: string, action: (context: SqliteContext) => T): T;
  taskRepository: TaskRepository;
  taskListRepository: TaskListRepository;
  taskProjectRepository: TaskProjectRepository;
  taskServiceRepository: TaskServiceRepository;
  taskChangeRepository: TaskChangeRepository;
  readProjectRegistryRecord(targetRoot: string): { registry: { migrationRequired: boolean }; projects: Record<string, unknown> };
  readServiceRegistryRecord(targetRoot: string, project: string): { services: Record<string, unknown> };
  resolveTaskScopedChange(targetRoot: string, taskId: string, change: TaskChangeReference, options: Record<string, unknown>): ChangeResolution;
  memoizeWorkspaceOperation?<T>(targetRoot: string, key: string, operation: () => T): T;
  readTaskRetrospectiveDocumentPersistence(task: TaskDocumentOwner): TaskRetrospectiveDocument;
};
type TaskEffect = { type: string; taskId: string };
export type TaskReferenceDiagnostic = {
  taskId: string; kind: 'project' | 'service' | 'change'; reference: string;
  code: string; message: string; details?: unknown;
};

function serviceKey(value: TaskServiceReference): string {
  return `${value.project}/${value.service}`;
}

function changeKey(value: TaskChangeReference): string {
  return `${value.project}/${value.change}`;
}

function retrospectiveDocument(record: TaskRecord): { path: string; registered: TaskRecord['retrospective'] } {
  return {
    path: taskRetrospectiveDocumentRelativePath(record.taskId),
    registered: record.retrospective,
  };
}

function storedView(view: TaskView, referenceDiagnostics: TaskReferenceDiagnostic[] = []) {
  return {
    record: view.record,
    recordDigest: view.recordDigest,
    taskRelations: view.taskRelations,
    retrospectiveDocument: retrospectiveDocument(view.record),
    referenceDiagnostics,
  };
}

function digestRecord(record: unknown): string {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')}`;
}

function cursorIdentity(filters: TaskQueryFilters): string {
  return digestRecord({
    q: filters.q ?? '', project: filters.project ?? null,
    service: filters.service ? serviceKey(filters.service) : null,
    status: filters.status ?? 'all', hasChildren: filters.hasChildren ?? 'all', retrospectiveState: filters.retrospectiveState ?? 'all',
    pageSize: filters.pageSize ?? null,
  });
}

type DecodedTaskCursor = { boundary: TaskListCursor; totalTaskCount: number; matchingTaskCount: number };

function decodeTaskCursor(raw: string, expectedIdentity: string): DecodedTaskCursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (value.v !== 2 || value.query !== expectedIdentity || !Number.isInteger(value.statusRank) || Number(value.statusRank) < 0 || Number(value.statusRank) > 3
      || typeof value.updatedAt !== 'string' || !value.updatedAt || typeof value.taskId !== 'string'
      || !Number.isInteger(value.totalTaskCount) || Number(value.totalTaskCount) < 0
      || !Number.isInteger(value.matchingTaskCount) || Number(value.matchingTaskCount) < 0) throw new Error('invalid cursor');
    const normalizedTaskId = taskId(value.taskId, 'cursor.taskId');
    return {
      boundary: { statusRank: Number(value.statusRank), updatedAt: value.updatedAt, taskId: normalizedTaskId },
      totalTaskCount: Number(value.totalTaskCount),
      matchingTaskCount: Number(value.matchingTaskCount),
    };
  } catch {
    throw taskRecordError('task_record_filter_invalid', 'cursor 无效或与当前 Task query 不匹配。', 400, { field: 'cursor' });
  }
}

function encodeTaskCursor(filters: TaskQueryFilters, boundary: TaskListBoundary, totalTaskCount: number, matchingTaskCount: number): string {
  return Buffer.from(JSON.stringify({
    v: 2,
    query: cursorIdentity(filters),
    statusRank: boundary.statusRank,
    updatedAt: boundary.updatedAt,
    taskId: boundary.taskId,
    totalTaskCount,
    matchingTaskCount,
  }), 'utf8').toString('base64url');
}

function taskSearch(raw: string | undefined): TaskListSearch | undefined {
  if (!raw) return undefined;
  if (raw.startsWith('#')) return { kind: 'task-id', taskId: taskId(raw.slice(1), 'q') };
  const tokens = [...new Set(raw.toLowerCase().split(/[^0-9a-z\u0080-\uffff]+/u).filter(Boolean))];
  if (!tokens.length || tokens.some((token) => [...token].length < 3)) throw taskRecordError('task_record_filter_invalid', '普通关键词的每个有效分词至少需要3个字符；完整Task ID可使用#前缀精确查询。', 400, { field: 'q' });
  return { kind: 'fts', expression: tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' AND ') };
}

function parentContextShape(parent: TaskRecord, children: TaskRecord[], legacyPlan: unknown, diagnostic: { code: string; message: string } | null) {
  const relevant = (record: TaskRecord) => ({ taskId: record.taskId, title: record.title, intent: record.intent, scope: record.scope, changes: record.changes, parentTaskId: record.parentTaskId, isParent: record.isParent === true, status: record.status, result: record.result });
  return { parent, children, isParent: parent.isParent === true || children.length > 0, legacyPlan, diagnostic, recordDigest: digestRecord(parent), snapshotIdentity: digestRecord({ parent: relevant(parent), children: children.map(relevant) }) };
}
export function registerTaskQueryApplication(runtime: TaskQueryApplicationRuntime) {
  const tasks = runtime.taskRepository;
  const taskList = runtime.taskListRepository;
  const projects = runtime.taskProjectRepository;
  const services = runtime.taskServiceRepository;
  const changes = runtime.taskChangeRepository;

  function assertCanonicalTaskWorkspace(targetRoot: string): string {
    try { return runtime.assertCanonicalStructuredWorkspace(targetRoot); }
    catch (error) {
      const failure = errorFields(error);
      const raw = error && typeof error === 'object' ? Object.fromEntries(Object.entries(error)) : {};
      const code = raw.code === 'workspace_store_workspace_not_canonical' ? 'task_record_workspace_not_canonical' : raw.code === 'workspace_store_workspace_invalid' ? 'task_record_workspace_invalid' : String(raw.code || 'workspace_store_failed');
      throw taskRecordError(code, failure.message, typeof raw.status === 'number' ? raw.status : 500, raw.details, typeof raw.nextAction === 'string' ? raw.nextAction : undefined);
    }
  }

  function recordWith(task: Task, taskProjects: readonly TaskProject[], taskServices: readonly TaskService[], taskChanges: readonly TaskChange[]): TaskRecord {
    return normalizeTaskRecord({
      schemaVersion: 'buildr.task-record/v3', taskId: task.taskId, title: task.title, intent: task.intent,
      scope: {
        projects: taskProjects.map((item) => item.project),
        services: taskServices.map((item) => ({ project: item.project, service: item.service })),
      },
      changes: taskChanges.map((item) => ({ project: item.project, change: item.change })),
      parentTaskId: task.parentTaskId, ...(task.isParent ? { isParent: true } : {}),
      retrospective: task.retrospective, status: task.status, result: task.result,
      ...(task.resultHistory.length ? { resultHistory: task.resultHistory } : {}),
      createdAt: task.createdAt, updatedAt: task.updatedAt,
    }, { expectedTaskId: task.taskId });
  }

  function recordFrom(context: SqliteContext, task: Task): TaskRecord {
    return recordWith(task, projects.read(context, task.taskId), services.read(context, task.taskId), changes.read(context, task.taskId));
  }

  function persistence(root: string, context: SqliteContext, task: Task): TaskPersistence {
    const record = recordFrom(context, task);
    return { root, record, recordDigest: digestRecord(record) };
  }

  function readIn(context: SqliteContext, root: string, taskIdValue: string): TaskPersistence {
    const task = tasks.read(context, taskIdValue);
    if (!task) throw taskRecordError('task_record_not_found', `Task Record 不存在：${taskIdValue}。`, 404, { taskId: taskIdValue }, `运行 buildr task create ${taskIdValue} 创建正式 Task Record。`);
    return persistence(root, context, task);
  }

  function relationMap(context: SqliteContext, taskIds: string[]) {
    return tasks.relations(context, taskIds);
  }

  function readTask(targetRoot: string, taskIdValue: string): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    taskId(taskIdValue, 'taskId');
    return runtime.runWorkspaceSqliteRead(root, (context) => readIn(context, root, taskIdValue));
  }

  function prepareTask(targetRoot: string, taskIdValue: string): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    runtime.prepareWorkspaceStructuredStore(root);
    return runtime.runWorkspaceSqliteRead(root, (context) => readIn(context, root, taskIdValue));
  }

  function readTaskView(targetRoot: string, taskIdValue: string): TaskView {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    return runtime.runWorkspaceSqliteRead(root, (context) => {
      const current = readIn(context, root, taskIdValue);
      return { ...current, taskRelations: relationMap(context, [taskIdValue]).get(taskIdValue) || { parent: null, children: [] } };
    });
  }

  function queryTaskViews(targetRoot: string, filters: TaskQueryFilters = {}) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    return runtime.runWorkspaceSqliteRead(root, (context) => {
      const decodedCursor = filters.cursor ? decodeTaskCursor(filters.cursor, cursorIdentity(filters)) : null;
      const tableFilters = {
        search: taskSearch(filters.q), project: filters.project, service: filters.service,
        status: filters.status, hasChildren: filters.hasChildren, retrospectiveState: filters.retrospectiveState,
      };
      if (decodedCursor) {
        const statusRanks: Record<string, number[]> = { active: [0], todo: [1], completed: [2], abandoned: [3], open: [0, 1], all: [0, 1, 2, 3] };
        const allowedRanks = statusRanks[filters.status ?? 'all'];
        if (!allowedRanks?.includes(decodedCursor.boundary.statusRank)) {
          throw taskRecordError('task_record_filter_invalid', 'cursor 状态与当前 Task query 不匹配。', 400, { field: 'cursor' });
        }
      }
      const fetched = taskList.readPage(context, {
        ...tableFilters,
        ...(decodedCursor ? { cursor: decodedCursor.boundary } : {}),
        ...(filters.pageSize ? { limit: filters.pageSize + 1 } : {}),
      });
      const hasMore = Boolean(filters.pageSize && fetched.length > filters.pageSize);
      const boundaries = hasMore ? fetched.slice(0, filters.pageSize) : fetched;
      const ids = boundaries.map((item) => item.taskId);
      const tasksById = new Map(tasks.readMany(context, { taskIds: ids }).map((item) => [item.taskId, item]));
      const found = ids.map((id) => tasksById.get(id)).filter((item): item is Task => Boolean(item));
      if (found.length !== ids.length) throw taskRecordError('task_record_database_invalid', 'Task list批量组装缺少已选择的Task。', 500, { expected: ids.length, actual: found.length });
      const projectValues = projects.readMany(context, ids);
      const serviceValues = services.readMany(context, ids);
      const changeValues = changes.readMany(context, ids);
      const relations = relationMap(context, ids);
      const views = found.map((task) => {
        const record = recordWith(task, projectValues.get(task.taskId) || [], serviceValues.get(task.taskId) || [], changeValues.get(task.taskId) || []);
        return { root, record, recordDigest: digestRecord(record), taskRelations: relations.get(task.taskId) || { parent: null, children: [] } };
      });
      const totalTaskCount = decodedCursor?.totalTaskCount ?? tasks.count(context);
      const matchingTaskCount = decodedCursor?.matchingTaskCount ?? (filters.pageSize ? taskList.count(context, tableFilters) : found.length);
      return {
        root,
        views,
        totalTaskCount,
        matchingTaskCount,
        pageSize: filters.pageSize ?? null,
        hasMore,
        nextCursor: hasMore && boundaries.length ? encodeTaskCursor(filters, boundaries[boundaries.length - 1], totalTaskCount, matchingTaskCount) : null,
        filterOptions: decodedCursor ? null : { projects: projects.listOptions(context), services: services.listOptions(context).map((item) => ({ project: item.project, service: item.service })) },
      };
    });
  }

  function parentContext(context: SqliteContext, root: string, taskIdValue: string, current?: TaskRecord) {
    const parent = current || readIn(context, root, taskIdValue).record;
    const childTasks = tasks.readMany(context).filter((item) => item.parentTaskId === taskIdValue);
    const childIds = childTasks.map((item) => item.taskId);
    const childProjects = projects.readMany(context, childIds);
    const childServices = services.readMany(context, childIds);
    const childChanges = changes.readMany(context, childIds);
    const children = childTasks.map((item) => recordWith(item, childProjects.get(item.taskId) || [], childServices.get(item.taskId) || [], childChanges.get(item.taskId) || [])).sort((a, b) => a.taskId.localeCompare(b.taskId));
    let legacyPlan = null; let diagnostic = null;
    try { legacyPlan = tasks.legacyParentPlan(context, taskIdValue); }
    catch { diagnostic = { code: 'parent_history_unreadable', message: '旧研发记录不可读；任务关系和结果仍可读取。' }; }
    return parentContextShape(parent, children, legacyPlan, diagnostic);
  }

  function readParentTaskContext(targetRoot: string, taskIdValue: string) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    return runtime.runWorkspaceSqliteRead(root, (context) => parentContext(context, root, taskIdValue));
  }
  function normalizedQueryFilters(input: TaskListInputDto = {}): TaskQueryFilters {
    assertFields(input, new Set(['q', 'project', 'service', 'status', 'hasChildren', 'retrospectiveState', 'pageSize', 'cursor']), 'Task query');
    const filters: TaskQueryFilters = {};
    if (input.q !== undefined && String(input.q).trim()) filters.q = String(input.q).trim();
    if (input.project !== undefined && String(input.project).trim()) filters.project = text(input.project, 'project');
    if (input.service !== undefined && String(input.service).trim()) filters.service = qualified(input.service, 'service', 'service');
    if (input.status !== undefined) {
      if (typeof input.status !== 'string' || !['open', 'todo', 'active', 'completed', 'abandoned', 'all'].includes(input.status)) throw taskRecordError('task_record_filter_invalid', 'status 只支持 open、todo、active、completed、abandoned 或 all。', 400, { field: 'status', value: input.status });
      filters.status = input.status;
    }
    if (input.hasChildren !== undefined) {
      if (typeof input.hasChildren !== 'string' || !['yes', 'no', 'all'].includes(input.hasChildren)) throw taskRecordError('task_record_filter_invalid', 'hasChildren 只支持 yes、no 或 all。', 400, { field: 'hasChildren', value: input.hasChildren });
      filters.hasChildren = input.hasChildren;
    }
    if (input.retrospectiveState !== undefined) {
      if (typeof input.retrospectiveState !== 'string' || !['missing', 'pending-decision', 'decided', 'all'].includes(input.retrospectiveState)) throw taskRecordError('task_record_filter_invalid', 'retrospectiveState只支持missing、pending-decision、decided或all。', 400, { field: 'retrospectiveState', value: input.retrospectiveState });
      filters.retrospectiveState = input.retrospectiveState;
    }
    if (input.pageSize !== undefined) {
      const normalizedPageSize = typeof input.pageSize === 'number' ? input.pageSize : Number(String(input.pageSize));
      if (!Number.isInteger(normalizedPageSize) || normalizedPageSize < 1 || normalizedPageSize > MAX_TASK_PAGE_SIZE) throw taskRecordError('task_record_filter_invalid', `pageSize 只支持 1-${MAX_TASK_PAGE_SIZE} 的整数。`, 400, { field: 'pageSize', value: input.pageSize });
      filters.pageSize = normalizedPageSize;
    }
    if (input.cursor !== undefined) {
      if (!filters.pageSize || typeof input.cursor !== 'string' || !input.cursor.trim()) throw taskRecordError('task_record_filter_invalid', 'cursor 必须与 pageSize 一起提供。', 400, { field: 'cursor' });
      filters.cursor = input.cursor.trim();
    }
    return filters;
  }
  function referenceDiagnostic(taskIdValue: string, kind: TaskReferenceDiagnostic['kind'], reference: string, code: string, message: string, details?: unknown): TaskReferenceDiagnostic {
    return { taskId: taskIdValue, kind, reference, code, message, ...(details === undefined ? {} : { details }) };
  }

  function inspectReferenceAvailability(targetRoot: string, record: TaskRecord): TaskReferenceDiagnostic[] {
    const diagnostics: TaskReferenceDiagnostic[] = [];
    const projectCodes = [...new Set([...record.scope.projects, ...record.scope.services.map((item) => item.project), ...record.changes.map((item) => item.project)])].sort();
    let projects: ReturnType<TaskQueryApplicationRuntime['readProjectRegistryRecord']> | null = null;
    try { projects = runtime.readProjectRegistryRecord(targetRoot); }
    catch (error) {
      const failure = errorFields(error);
      for (const project of projectCodes) diagnostics.push(referenceDiagnostic(record.taskId, 'project', project, failure.code, failure.message, failure.details));
    }
    if (projects?.registry.migrationRequired) {
      for (const project of projectCodes) diagnostics.push(referenceDiagnostic(record.taskId, 'project', project, 'task_record_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。'));
    }
    const availableProjects = new Set(projects && !projects.registry.migrationRequired ? Object.keys(projects.projects) : []);
    for (const project of projectCodes) {
      if (projects && !projects.registry.migrationRequired && !availableProjects.has(project)) diagnostics.push(referenceDiagnostic(record.taskId, 'project', project, 'task_record_project_unavailable', `Project 当前不可用：${project}。`, { project }));
    }
    const serviceRegistries = new Map<string, { services: Record<string, unknown> } | null>();
    for (const service of record.scope.services) {
      const reference = serviceKey(service);
      if (!availableProjects.has(service.project)) {
        diagnostics.push(referenceDiagnostic(record.taskId, 'service', reference, 'task_record_service_project_unavailable', `Service 所属 Project 当前不可用：${reference}。`, service));
        continue;
      }
      if (!serviceRegistries.has(service.project)) {
        try { serviceRegistries.set(service.project, runtime.readServiceRegistryRecord(targetRoot, service.project)); }
        catch (error) {
          const failure = errorFields(error);
          serviceRegistries.set(service.project, null);
          diagnostics.push(referenceDiagnostic(record.taskId, 'service', reference, failure.code, failure.message, failure.details));
          continue;
        }
      }
      const registry = serviceRegistries.get(service.project);
      if (registry && !registry.services[service.service]) diagnostics.push(referenceDiagnostic(record.taskId, 'service', reference, 'task_record_service_unavailable', `Service 当前不可用：${reference}。`, service));
    }
    for (const resolution of resolveChangeReferences(targetRoot, record.taskId, record.changes, { taskRecordObserved: true })) {
      if (resolution.availability === 'available') continue;
      const reference = changeKey(resolution.reference);
      diagnostics.push(referenceDiagnostic(record.taskId, 'change', reference, resolution.diagnostic?.code || 'task_change_unavailable', resolution.diagnostic?.message || `OpenSpec Change 当前不可用：${reference}。`, resolution.diagnostic?.details));
    }
    return diagnostics;
  }

  function resolveChangeReferences(targetRoot: string, taskIdValue: string, changes: TaskChangeReference[], options: Record<string, unknown> = {}): ChangeResolution[] {
    return changes.map((change) => {
      try {
        return runtime.resolveTaskScopedChange(targetRoot, taskIdValue, change, options);
      } catch (error) {
        const failure = errorFields(error);
        return {
          schemaVersion: 'buildr.task-scoped-change-reference/v1', taskId: taskIdValue, reference: change, availability: 'unavailable', workingCopy: null, retainedBaseline: null,
          diagnostic: { code: failure.code || 'task_change_unavailable', message: failure.message, ...(failure.details === undefined ? {} : { details: failure.details }) },
        };
      }
    });
  }
  function readCurrent(targetRoot: string, taskIdValue: string): TaskPersistence {
    return readTask(targetRoot, taskIdValue);
  }

  function result(operation: string, status: string, persistence: TaskPersistence, effects: TaskEffect[] = []) {
    const view = readTaskView(persistence.root, persistence.record.taskId);
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordResult, {
      operation,
      status,
      taskId: persistence.record.taskId,
      record: persistence.record,
      recordDigest: persistence.recordDigest,
      changeReferences: resolveChangeReferences(persistence.root, persistence.record.taskId, persistence.record.changes, { taskRecordObserved: true }),
      referenceDiagnostics: inspectReferenceAvailability(persistence.root, persistence.record),
      taskRelations: view.taskRelations,
      retrospectiveDocument: retrospectiveDocument(view.record),
      diagnostic: null,
      effects,
      nextActions: [],
    });
  }

  function queryTasks(targetRoot: string, input: TaskListInputDto = {}) {
    const filters = normalizedQueryFilters(input);
    const persistence = queryTaskViews(targetRoot, filters);
    const tasks = persistence.views.map((view) => storedView(view));
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordList, {
      filters: {
        q: filters.q ?? '', project: filters.project ?? null,
        service: filters.service ? serviceKey(filters.service) : null,
        status: filters.status ?? 'all', hasChildren: filters.hasChildren ?? 'all', retrospectiveState: filters.retrospectiveState ?? 'all',
      },
      filterOptions: persistence.filterOptions ? {
        projects: persistence.filterOptions.projects,
        services: persistence.filterOptions.services.map(serviceKey),
      } : null,
      totalTaskCount: persistence.totalTaskCount,
      matchingTaskCount: persistence.matchingTaskCount,
      pageSize: persistence.pageSize,
      hasMore: persistence.hasMore,
      nextCursor: persistence.nextCursor,
      tasks,
      diagnostics: [],
    });
  }

  function inspectTaskView(targetRoot: string, taskIdValue: unknown) {
    const view = readTaskView(targetRoot, taskId(taskIdValue, 'taskId'));
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordView, { taskId: view.record.taskId, ...storedView(view, inspectReferenceAvailability(view.root, view.record)) });
  }

  function inspectTask(targetRoot: string, taskIdValue: string) {
    const read = () => result('inspect', 'inspected', readCurrent(targetRoot, taskIdValue));
    if (typeof runtime.memoizeWorkspaceOperation !== 'function') return read();
    return runtime.memoizeWorkspaceOperation(targetRoot, `task-record:inspect:${taskIdValue}`, read);
  }
  function inspectTaskRetrospectiveDocument(targetRoot: string, taskIdValue: unknown) {
    const normalizedTaskId = taskId(taskIdValue, 'taskId');
    const task = readTask(targetRoot, normalizedTaskId);
    return {
      schemaVersion: 'buildr.task-retrospective-document/v1',
      operation: 'inspect',
      status: 'inspected',
      ...runtime.readTaskRetrospectiveDocumentPersistence(task),
      effects: [],
      nextActions: [],
    };
  }
  return Object.assign(runtime, {
    assertCanonicalTaskWorkspace,
    readTaskInContext: readIn, readParentTaskContextIn: parentContext,
    readTask, prepareTask, queryTaskViews, readTaskView, readParentTaskContext,
    queryTasks, inspectTask, inspectTaskView, inspectTaskRetrospectiveDocument,
    renderTaskResult: result, resolveTaskChangeReferences: resolveChangeReferences,
  });
}
