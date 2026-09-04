import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeTaskRecord, taskRecordError } from './task-validation.ts';
import { Task } from '../domain/task.ts';
import { TaskChange } from '../domain/task-change.ts';
import { TaskProject } from '../domain/task-project.ts';
import { TaskService } from '../domain/task-service.ts';
import type { SqliteContext } from '../../infrastructure/sqlite/transaction.ts';
import type { TaskRepository } from '../persistence/task-repository.ts';
import type { TaskChangeReference, TaskPersistence, TaskQueryFilters, TaskRecord, TaskServiceReference, TaskView } from './task-dto.ts';
import type { TaskProjectRepository } from '../persistence/task-project-repository.ts';
import type { TaskServiceRepository } from '../persistence/task-service-repository.ts';
import type { TaskChangeRepository } from '../persistence/task-change-repository.ts';
import type { TaskDocumentOwner, TaskRetrospectiveDocument } from '../persistence/task-retrospective-document.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.ts';
import type { TaskListInputDto } from './task-dto.ts';

const QUALIFIED_PATTERN = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

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

function errorFields(error: unknown): { code: string; message: string; details?: unknown; taskRecordBusiness: boolean } {
  if (!(error instanceof Error)) return { code: 'task_record_failed', message: String(error), taskRecordBusiness: false };
  const value = Object.fromEntries(Object.entries(error));
  return {
    code: typeof value.code === 'string' ? value.code : 'task_record_failed',
    message: error.message,
    ...(value.details === undefined ? {} : { details: value.details }),
    taskRecordBusiness: value.taskRecordBusiness === true,
  };
}

function assertObject(input: unknown, label = 'Task Record action input'): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskRecordError('task_record_input_invalid', `${label} 必须是对象。`);
}

function assertFields(input: unknown, fields: ReadonlySet<string>, label = 'Task Record action'): asserts input is Record<string, unknown> {
  assertObject(input, label);
  for (const field of Object.keys(input)) {
    if (!fields.has(field)) throw taskRecordError('task_record_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw taskRecordError('task_record_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  return value.trim();
}

function taskId(value: unknown, field: string): string {
  const normalized = text(value, field);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalized)) throw taskRecordError('task_record_identity_invalid', `${field} 必须是合法 Task ID。`, 400, { field, value });
  return normalized;
}

function qualified(value: unknown, field: string, secondField: 'service'): TaskServiceReference;
function qualified(value: unknown, field: string, secondField: 'change'): TaskChangeReference;
function qualified(value: unknown, field: string, secondField: 'service' | 'change'): TaskServiceReference | TaskChangeReference {
  let project: unknown;
  let second: unknown;
  if (typeof value === 'string') {
    const match = value.match(QUALIFIED_PATTERN);
    if (!match) throw taskRecordError('task_record_reference_invalid', `${field} 必须使用 project/${secondField}。`, 400, { field, value });
    project = match[1];
    second = match[2];
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskRecordError('task_record_reference_invalid', `${field} 必须是限定引用。`, 400, { field });
    const entry = Object.fromEntries(Object.entries(value));
    project = entry.project;
    second = entry[secondField];
  }
  const normalizedProject = text(project, `${field}.project`);
  const normalizedSecond = text(second, `${field}.${secondField}`);
  return secondField === 'service' ? { project: normalizedProject, service: normalizedSecond } : { project: normalizedProject, change: normalizedSecond };
}

function serviceKey(value: TaskServiceReference): string {
  return `${value.project}/${value.service}`;
}

function changeKey(value: TaskChangeReference): string {
  return `${value.project}/${value.change}`;
}

function retrospectiveDocument(record: TaskRecord): { path: string; registered: TaskRecord['retrospective'] } {
  return {
    path: `.buildr/local/task-retrospectives/${record.taskId}.md`,
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

function parentContextShape(parent: TaskRecord, children: TaskRecord[], legacyPlan: unknown, diagnostic: { code: string; message: string } | null) {
  const relevant = (record: TaskRecord) => ({ taskId: record.taskId, title: record.title, intent: record.intent, scope: record.scope, changes: record.changes, parentTaskId: record.parentTaskId, isParent: record.isParent === true, status: record.status, result: record.result });
  return { parent, children, isParent: parent.isParent === true || children.length > 0, legacyPlan, diagnostic, recordDigest: digestRecord(parent), snapshotIdentity: digestRecord({ parent: relevant(parent), children: children.map(relevant) }) };
}
export function registerTaskQueryApplication(runtime: TaskQueryApplicationRuntime) {
  const tasks = runtime.taskRepository;
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

  function taskDirectory(targetRoot: string, taskIdValue: string): string {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    const normalized = taskId(taskIdValue, 'taskId');
    const recordsRoot = path.join(root, '.buildr', 'tasks');
    const directory = path.resolve(recordsRoot, normalized);
    if (path.dirname(directory) !== recordsRoot) throw taskRecordError('task_record_path_escape', 'Task 专业记录路径逃逸。', 400, { taskId: normalized });
    return directory;
  }

  function ensureTaskDirectory(targetRoot: string, taskIdValue: string, io: Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'lstatSync'> = fs): string {
    const directory = taskDirectory(targetRoot, taskIdValue);
    for (const candidate of [path.dirname(directory), directory]) {
      if (!io.existsSync(candidate)) io.mkdirSync(candidate);
      const stat = io.lstatSync(candidate);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw taskRecordError('task_record_directory_invalid', 'Task 专业记录容器必须是普通目录。', 409, { taskId: taskIdValue });
    }
    return directory;
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
      let scopedIds: string[] | undefined;
      if (filters.project) scopedIds = projects.findTaskIds(context, filters.project);
      if (filters.service) {
        const serviceIds = new Set(services.findTaskIds(context, filters.service));
        scopedIds = scopedIds ? scopedIds.filter((id) => serviceIds.has(id)) : [...serviceIds];
      }
      const found = tasks.readMany(context, { q: filters.q, status: filters.status, hasChildren: filters.hasChildren, retrospectiveState: filters.retrospectiveState, ...(scopedIds ? { taskIds: scopedIds } : {}) });
      const ids = found.map((item) => item.taskId);
      const projectValues = projects.readMany(context, ids);
      const serviceValues = services.readMany(context, ids);
      const changeValues = changes.readMany(context, ids);
      const relations = relationMap(context, ids);
      const views = found.map((task) => {
        const record = recordWith(task, projectValues.get(task.taskId) || [], serviceValues.get(task.taskId) || [], changeValues.get(task.taskId) || []);
        return { root, record, recordDigest: digestRecord(record), taskRelations: relations.get(task.taskId) || { parent: null, children: [] } };
      });
      return { root, views, totalTaskCount: tasks.count(context), filterOptions: { projects: projects.listOptions(context), services: services.listOptions(context).map((item) => ({ project: item.project, service: item.service })) } };
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
    assertFields(input, new Set(['q', 'project', 'service', 'status', 'hasChildren', 'retrospectiveState']), 'Task query');
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
    const tasks = persistence.views.map((view) => storedView(view, inspectReferenceAvailability(persistence.root, view.record)));
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRecordList, {
      filters: {
        q: filters.q ?? '', project: filters.project ?? null,
        service: filters.service ? serviceKey(filters.service) : null,
        status: filters.status ?? 'all', hasChildren: filters.hasChildren ?? 'all', retrospectiveState: filters.retrospectiveState ?? 'all',
      },
      filterOptions: {
        projects: persistence.filterOptions.projects,
        services: persistence.filterOptions.services.map(serviceKey),
      },
      totalTaskCount: persistence.totalTaskCount,
      tasks,
      diagnostics: tasks.flatMap((view) => view.referenceDiagnostics),
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
    assertCanonicalTaskWorkspace, taskDirectory, ensureTaskDirectory,
    readTaskInContext: readIn, readParentTaskContextIn: parentContext,
    readTask, prepareTask, queryTaskViews, readTaskView, readParentTaskContext,
    queryTasks, inspectTask, inspectTaskView, inspectTaskRetrospectiveDocument,
    renderTaskResult: result, resolveTaskChangeReferences: resolveChangeReferences,
  });
}
