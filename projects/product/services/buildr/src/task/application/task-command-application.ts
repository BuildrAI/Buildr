import { normalizeTaskRecord, normalizeParentCompletion, taskRecordError } from './task-validation.ts';
import { Task } from '../domain/task.ts';
import { TaskChange } from '../domain/task-change.ts';
import { TaskProject } from '../domain/task-project.ts';
import { TaskService } from '../domain/task-service.ts';
import type { SqliteContext, TransactionContext } from '../../infrastructure/sqlite/transaction.ts';
import type { TaskRepository } from '../persistence/task-repository.ts';
import type { ParentCompletion, TaskChangeReference, TaskPersistence, TaskRecord, TaskRecordStatus, TaskRetrospectiveDocumentState, TaskServiceReference } from './task-dto.ts';
import type { TaskProjectRepository } from '../persistence/task-project-repository.ts';
import type { TaskServiceRepository } from '../persistence/task-service-repository.ts';
import type { TaskChangeRepository } from '../persistence/task-change-repository.ts';
import type { TaskDocumentOwner, TaskRetrospectiveDocument } from '../persistence/task-retrospective-document.ts';
import type {
  TaskAbandonInputDto,
  TaskActivateInputDto,
  TaskCompleteInputDto,
  TaskCreateInputDto,
  TaskUpdateInputDto,
} from './task-dto.ts';

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
type TaskParentContext = { isParent: boolean; snapshotIdentity: string; children: TaskRecord[] };
export type TaskMutationContext = { parentContext(): TaskParentContext };
export type TaskCommandApplicationRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string, options?: { writable?: boolean }): string;
  prepareWorkspaceStructuredStore(targetRoot: string): { root: string; present: boolean; version: number | null };
  runWorkspaceSqliteRead<T>(targetRoot: string, action: (context: SqliteContext) => T): T;
  runWorkspaceTransaction<T>(targetRoot: string, action: (context: TransactionContext) => T): T;
  taskRepository: TaskRepository;
  taskProjectRepository: TaskProjectRepository;
  taskServiceRepository: TaskServiceRepository;
  taskChangeRepository: TaskChangeRepository;
  readProjectRegistryRecord(targetRoot: string): { registry: { migrationRequired: boolean }; projects: Record<string, unknown> };
  readServiceRegistryRecord(targetRoot: string, project: string): { services: Record<string, unknown> };
  resolveTaskScopedChange(targetRoot: string, taskId: string, change: TaskChangeReference, options: Record<string, unknown>): ChangeResolution;
  memoizeWorkspaceOperation?<T>(targetRoot: string, key: string, operation: () => T): T;
  readTask(targetRoot: string, taskId: string): TaskPersistence;
  readTaskRetrospectiveDocumentPersistence(task: TaskDocumentOwner): TaskRetrospectiveDocument;
  assertCanonicalTaskWorkspace(targetRoot: string): string;
  readTaskInContext(context: SqliteContext, root: string, taskId: string): TaskPersistence;
  readParentTaskContextIn(context: SqliteContext, root: string, taskId: string, current?: TaskRecord): TaskParentContext;
  renderTaskResult(operation: string, status: string, persistence: TaskPersistence, effects?: TaskEffect[]): unknown;
};
type TaskEffect = { type: string; taskId: string };
type MutateInput = { expectedRecordDigest?: string };
type NormalizedUpdate = {
  operations: {
    status?: TaskRecordStatus;
    isParent?: true;
    title?: string;
    intent?: string;
    parentTaskId?: string | null;
    addProjects: string[];
    removeProjects: string[];
    addServices: TaskServiceReference[];
    removeServices: TaskServiceReference[];
    addChanges: TaskChangeReference[];
    removeChanges: TaskChangeReference[];
    retrospectiveState?: TaskRetrospectiveDocumentState;
    retrospectiveDocumentDigest?: string;
    clearRetrospective: boolean;
  };
  expectedRecordDigest?: string;
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

function array(value: unknown, field: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  return value;
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

function uniqueInput<T>(values: T[], key: (value: T) => string, field: string): T[] {
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) throw taskRecordError('task_record_reference_duplicate', `${field} 包含重复操作：${identity}。`, 409, { field, identity });
    seen.add(identity);
  }
  return values;
}

function nowIso(): string {
  return new Date().toISOString();
}

function effect(type: string, taskId: string): TaskEffect {
  return { type, taskId };
}

export function registerTaskCommandApplication(runtime: TaskCommandApplicationRuntime) {
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
  function domainTask(record: TaskRecord): Task {
    return new Task({
      taskId: record.taskId, title: record.title, intent: record.intent, status: record.status,
      parentTaskId: record.parentTaskId, isParent: record.isParent === true, result: record.result,
      resultHistory: record.resultHistory || [], retrospective: record.retrospective,
      createdAt: record.createdAt, updatedAt: record.updatedAt,
    });
  }
  function assertParentRelation(context: SqliteContext, taskIdValue: string, parentTaskId: string | null): void {
    if (parentTaskId === null) return;
    if (parentTaskId === taskIdValue) throw taskRecordError('task_record_parent_self_reference', 'Task 不能把自己设为 Parent Task。', 409, { taskId: taskIdValue, parentTaskId });
    const parent = tasks.read(context, parentTaskId);
    if (!parent) throw taskRecordError('task_record_parent_not_found', `Parent Task 不存在：${parentTaskId}。`, 409, { taskId: taskIdValue, parentTaskId });
    if (parent.status !== 'active') throw taskRecordError('task_record_parent_terminal', `Parent Task ${parentTaskId} 已是 ${parent.status}，不能接收新的 Child Task。`, 409, { taskId: taskIdValue, parentTaskId, status: parent.status });
    const visited = new Set<string>();
    let cursor: string | null | undefined = parentTaskId;
    while (cursor) {
      if (cursor === taskIdValue) throw taskRecordError('task_record_parent_cycle', 'Parent Task 关系会形成循环。', 409, { taskId: taskIdValue, parentTaskId });
      if (visited.has(cursor)) throw taskRecordError('task_record_parent_graph_invalid', '既有 Parent Task 关系包含循环，无法安全修改。', 409);
      visited.add(cursor); cursor = tasks.parentId(context, cursor);
    }
  }

  function createTaskPersistence(targetRoot: string, record: TaskRecord): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    return runtime.runWorkspaceTransaction(root, (context) => {
      if (tasks.read(context, record.taskId)) throw taskRecordError('task_record_already_exists', `Task Record 已存在：${record.taskId}。`, 409, { taskId: record.taskId });
      assertParentRelation(context, record.taskId, record.parentTaskId);
      tasks.insert(context, domainTask(record));
      projects.insert(context, record.scope.projects.map((project) => new TaskProject(record.taskId, project)));
      services.insert(context, record.scope.services.map((service) => new TaskService(record.taskId, service.project, service.service)));
      changes.insert(context, record.changes.map((change) => new TaskChange(record.taskId, change.project, change.change)));
      if (record.parentTaskId) tasks.markParent(context, record.parentTaskId);
      return runtime.readTaskInContext(context, root, record.taskId);
    });
  }

  function mutateTaskPersistence(targetRoot: string, taskIdValue: string, mutator: (current: TaskPersistence, context: TaskMutationContext) => unknown): TaskPersistence {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    return runtime.runWorkspaceTransaction(root, (context) => {
      const current = runtime.readTaskInContext(context, root, taskIdValue);
      const nextValue = mutator(current, { parentContext: () => runtime.readParentTaskContextIn(context, root, taskIdValue, current.record) });
      if (!nextValue) return current;
      const next = normalizeTaskRecord(nextValue, { expectedTaskId: taskIdValue });
      if (next.parentTaskId !== current.record.parentTaskId) assertParentRelation(context, taskIdValue, next.parentTaskId);
      tasks.update(context, domainTask(next));
      projects.replace(context, taskIdValue, next.scope.projects.map((project) => new TaskProject(taskIdValue, project)));
      services.replace(context, taskIdValue, next.scope.services.map((service) => new TaskService(taskIdValue, service.project, service.service)));
      changes.replace(context, taskIdValue, next.changes.map((change) => new TaskChange(taskIdValue, change.project, change.change)));
      if (next.parentTaskId) tasks.markParent(context, next.parentTaskId);
      return runtime.readTaskInContext(context, root, taskIdValue);
    });
  }

  function writeTaskPersistence(targetRoot: string, record: TaskRecord): TaskPersistence {
    return mutateTaskPersistence(targetRoot, record.taskId, () => record);
  }
  function assertScopeReferencesAvailable(targetRoot: string, projectCodes: string[], services: TaskServiceReference[]): void {
    const projects = runtime.readProjectRegistryRecord(targetRoot);
    if (projects.registry.migrationRequired) throw taskRecordError('task_record_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。', 409, undefined, '先运行 canonical buildr sync <agent>。');
    const requiredProjects = new Set([...projectCodes, ...services.map((item) => item.project)]);
    for (const projectCode of requiredProjects) {
      if (!projects.projects[projectCode]) throw taskRecordError('task_record_project_not_found', `Project 不存在：${projectCode}。`, 409, { project: projectCode }, '修正 Task scope 或先登记 Project。');
    }
    const serviceRecords = new Map<string, { services: Record<string, unknown> }>();
    for (const service of services) {
      if (!serviceRecords.has(service.project)) serviceRecords.set(service.project, runtime.readServiceRegistryRecord(targetRoot, service.project));
      if (!serviceRecords.get(service.project)?.services[service.service]) {
        throw taskRecordError('task_record_service_not_found', `Service 不存在：${service.project}/${service.service}。`, 409, service, '修正 Task scope 或先登记 Service。');
      }
    }
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

  function assertChangeReferencesAvailable(targetRoot: string, taskIdValue: string, changes: TaskChangeReference[], options: Record<string, unknown> = {}): ChangeResolution[] {
    const resolutions = resolveChangeReferences(targetRoot, taskIdValue, changes, options);
    const unavailable = resolutions.find((item) => item.availability !== 'available');
    if (unavailable) throw taskRecordError('task_record_change_not_found', `OpenSpec Change 不存在或当前不可解析：${unavailable.reference.project}/${unavailable.reference.change}。`, 409, unavailable, '修正Change引用，或先在当前Workspace/matching Worktree Project中创建对应Change。');
    return resolutions;
  }
  function assertExpectedDigest(current: TaskPersistence, expectedRecordDigest: unknown): void {
    if (typeof expectedRecordDigest !== 'string' || !expectedRecordDigest) throw taskRecordError('task_record_digest_required', '当前操作必须提供有效 expectedRecordDigest。', 409, { field: 'expectedRecordDigest' });
    if (expectedRecordDigest !== current.recordDigest) {
      throw taskRecordError('task_record_conflict', 'Task Record 已被其他操作修改，请刷新后重新判断。', 409, { currentRecordDigest: current.recordDigest }, '刷新 Task 详情并基于最新内容重新提交。');
    }
  }
  function createTask(targetRoot: string, input: TaskCreateInputDto) {
    assertFields(input, new Set(['taskId', 'title', 'intent', 'projects', 'services', 'changes', 'parentTaskId', 'isParent', 'status']), 'Task create');
    const taskIdValue = taskId(input.taskId, 'taskId');
    const requestedStatus = input.status ?? 'active';
    if (requestedStatus !== 'todo' && requestedStatus !== 'active') throw taskRecordError('task_record_status_invalid', 'Task create status 只支持 todo 或 active。', 400, { field: 'status', value: requestedStatus });
    const status: 'todo' | 'active' = requestedStatus;
    const timestamp = nowIso();
    const record = normalizeTaskRecord({
      schemaVersion: 'buildr.task-record/v3',
      taskId: taskIdValue,
      title: text(input.title, 'title'),
      intent: text(input.intent, 'intent'),
      scope: {
        projects: array(input.projects, 'projects'),
        services: array(input.services, 'services').map((item, index) => qualified(item, `services[${index}]`, 'service')),
      },
      changes: array(input.changes, 'changes').map((item, index) => qualified(item, `changes[${index}]`, 'change')),
      parentTaskId: input.parentTaskId === undefined || input.parentTaskId === null ? null : taskId(input.parentTaskId, 'parentTaskId'),
      ...(input.isParent === undefined ? {} : { isParent: input.isParent }),
      retrospective: null,
      status, result: null, createdAt: timestamp, updatedAt: timestamp,
    }, { expectedTaskId: taskIdValue });
    const root = assertCanonicalTaskWorkspace(targetRoot);
    assertScopeReferencesAvailable(root, [...record.scope.projects, ...record.changes.map((item) => item.project)], record.scope.services);
    assertChangeReferencesAvailable(root, taskIdValue, record.changes, { allowMissingTask: true });
    try {
      const written = createTaskPersistence(root, record);
      return runtime.renderTaskResult('create', 'created', written, [effect('created', written.record.taskId)]);
    } catch (error) {
      const failure = errorFields(error);
      if (failure.taskRecordBusiness) throw error;
      const raw = error && typeof error === 'object' ? Object.fromEntries(Object.entries(error)) : {};
      if (raw.structuredStoreBusiness === true) {
        const code = raw.code === 'workspace_store_workspace_not_canonical' ? 'task_record_workspace_not_canonical' : raw.code === 'workspace_store_workspace_invalid' ? 'task_record_workspace_invalid' : String(raw.code || 'workspace_store_failed');
        throw taskRecordError(code, failure.message, typeof raw.status === 'number' ? raw.status : 500, raw.details, typeof raw.nextAction === 'string' ? raw.nextAction : undefined);
      }
      throw taskRecordError('task_record_database_failed', `Task Record 创建失败：${failure.message}`, 500, { taskId: taskIdValue }, '保留数据库现场并运行 Buildr Doctor 后重试。');
    }
  }

  function normalizedUpdate(input: TaskUpdateInputDto): NormalizedUpdate {
    assertFields(input, new Set(['expectedRecordDigest', 'status', 'reason', 'summary', 'parentCompletion', 'title', 'intent', 'parentTaskId', 'isParent', 'addProjects', 'removeProjects', 'addServices', 'removeServices', 'addChanges', 'removeChanges', 'retrospectiveState', 'retrospectiveDocumentDigest', 'clearRetrospective']), 'Task update');
    if (input.isParent !== undefined && input.isParent !== true) throw taskRecordError('task_record_parent_role_permanent', '父任务身份不能清除。');
    const requestedStatus = input.status;
    if (requestedStatus !== undefined && requestedStatus !== 'todo' && requestedStatus !== 'active' && requestedStatus !== 'completed' && requestedStatus !== 'abandoned') throw taskRecordError('task_record_status_invalid', 'status 只支持 todo、active、completed、abandoned。');
    const normalizedStatus: TaskRecordStatus | undefined = requestedStatus;
    const requestedRetrospectiveState = input.retrospectiveState;
    if (requestedRetrospectiveState !== undefined && requestedRetrospectiveState !== 'pending-decision' && requestedRetrospectiveState !== 'decided') throw taskRecordError('task_record_retrospective_state_invalid', 'retrospectiveState只支持pending-decision或decided。', 400);
    const normalizedRetrospectiveState: TaskRetrospectiveDocumentState | undefined = requestedRetrospectiveState;
    for (const field of ['summary', 'parentCompletion']) if (input[field] !== undefined && input.status !== 'completed') throw taskRecordError('task_record_field_forbidden', `${field} 只用于明确设置 completed。`);
    const operations: NormalizedUpdate['operations'] = {
      ...(normalizedStatus === undefined ? {} : { status: normalizedStatus }),
      ...(input.isParent === true ? { isParent: true } : {}),
      ...(input.title === undefined ? {} : { title: text(input.title, 'title') }),
      ...(input.intent === undefined ? {} : { intent: text(input.intent, 'intent') }),
      ...(input.parentTaskId === undefined ? {} : { parentTaskId: input.parentTaskId === null ? null : taskId(input.parentTaskId, 'parentTaskId') }),
      addProjects: uniqueInput(array(input.addProjects, 'addProjects').map((item) => text(item, 'addProjects')), (item) => item, 'addProjects'),
      removeProjects: uniqueInput(array(input.removeProjects, 'removeProjects').map((item) => text(item, 'removeProjects')), (item) => item, 'removeProjects'),
      addServices: uniqueInput(array(input.addServices, 'addServices').map((item, index) => qualified(item, `addServices[${index}]`, 'service')), serviceKey, 'addServices'),
      removeServices: uniqueInput(array(input.removeServices, 'removeServices').map((item, index) => qualified(item, `removeServices[${index}]`, 'service')), serviceKey, 'removeServices'),
      addChanges: uniqueInput(array(input.addChanges, 'addChanges').map((item, index) => qualified(item, `addChanges[${index}]`, 'change')), changeKey, 'addChanges'),
      removeChanges: uniqueInput(array(input.removeChanges, 'removeChanges').map((item, index) => qualified(item, `removeChanges[${index}]`, 'change')), changeKey, 'removeChanges'),
      ...(normalizedRetrospectiveState === undefined ? {} : { retrospectiveState: normalizedRetrospectiveState }),
      ...(input.retrospectiveDocumentDigest === undefined ? {} : { retrospectiveDocumentDigest: text(input.retrospectiveDocumentDigest, 'retrospectiveDocumentDigest') }),
      clearRetrospective: input.clearRetrospective === true,
    };
    const collectionMutation = operations.addProjects.length > 0 || operations.removeProjects.length > 0 || operations.addServices.length > 0 || operations.removeServices.length > 0 || operations.addChanges.length > 0 || operations.removeChanges.length > 0;
    const hasMutation = operations.status !== undefined || operations.isParent === true || operations.title !== undefined || operations.intent !== undefined || operations.parentTaskId !== undefined
      || collectionMutation
      || operations.retrospectiveState !== undefined || operations.clearRetrospective;
    if (!hasMutation) throw taskRecordError('task_record_update_empty', 'Task update 至少需要一个明确 mutation。', 400, undefined, '提供 title/intent setter 或 scope/change add/remove 操作。');
    assertNoCollectionConflict(operations.addProjects, operations.removeProjects, (item) => item);
    assertNoCollectionConflict(operations.addServices, operations.removeServices, serviceKey);
    assertNoCollectionConflict(operations.addChanges, operations.removeChanges, changeKey);
    if (operations.clearRetrospective && operations.retrospectiveState !== undefined) throw taskRecordError('task_record_update_conflict', '不能同时清除和设置任务复盘文档。', 400);
    if (operations.retrospectiveState !== undefined && operations.retrospectiveDocumentDigest === undefined) throw taskRecordError('task_record_retrospective_digest_required', '设置任务复盘状态必须提供已观察文档摘要。', 400);
    if (operations.retrospectiveState === undefined && operations.retrospectiveDocumentDigest !== undefined) throw taskRecordError('task_record_retrospective_state_required', '提供任务复盘文档摘要时必须同时设置状态。', 400);
    const retrospectiveMutation = operations.retrospectiveState !== undefined || operations.clearRetrospective;
    const ordinaryMutation = operations.status !== undefined || operations.isParent === true || operations.title !== undefined || operations.intent !== undefined || operations.parentTaskId !== undefined || collectionMutation;
    if (retrospectiveMutation && ordinaryMutation) throw taskRecordError('task_record_update_conflict', '任务复盘文档状态必须单独更新。', 400);
    return { operations, expectedRecordDigest: input.expectedRecordDigest };
  }

  function assertNoCollectionConflict<T>(additions: T[], removals: T[], key: (value: T) => string): void {
    const removed = new Set(removals.map(key));
    const conflict = additions.map(key).find((item) => removed.has(item));
    if (conflict) throw taskRecordError('task_record_update_conflict', `同一引用不能同时新增和移除：${conflict}。`, 400, { identity: conflict });
  }

  function applyCollection<T>(current: T[], additions: T[], removals: T[], key: (value: T) => string, label: string): T[] {
    const values = [...current];
    const index = new Map(values.map((item) => [key(item), item]));
    for (const item of additions) {
      const identity = key(item);
      if (index.has(identity)) throw taskRecordError('task_record_reference_duplicate', `${label} 已包含：${identity}。`, 409, { identity }, '移除重复 add 操作或先 inspect 当前记录。');
      index.set(identity, item); values.push(item);
    }
    for (const item of removals) {
      const identity = key(item);
      if (!index.has(identity)) throw taskRecordError('task_record_reference_missing', `${label} 不包含：${identity}。`, 409, { identity }, '先 inspect 当前记录，再提交存在的 remove 操作。');
      index.delete(identity);
      const at = values.findIndex((candidate) => key(candidate) === identity);
      values.splice(at, 1);
    }
    return values;
  }

  function mutate(targetRoot: string, taskIdValue: string, operation: string, input: MutateInput, build: (record: TaskRecord, context: TaskMutationContext) => unknown, additions: { projects?: string[]; services?: TaskServiceReference[]; changes?: TaskChangeReference[] } = {}, allowedStatuses: TaskRecordStatus[] = ['todo', 'active']) {
    const root = assertCanonicalTaskWorkspace(targetRoot);
    try {
      let changed = false;
      const written = mutateTaskPersistence(root, taskIdValue, (current, context) => {
        assertExpectedDigest(current, input.expectedRecordDigest);
        if (!allowedStatuses.includes(current.record.status)) {
          const terminal = ['completed', 'abandoned'].includes(current.record.status);
          throw taskRecordError(terminal ? 'task_record_terminal' : 'task_record_status_transition_invalid', `Task ${taskIdValue} 当前为 ${current.record.status}，不能执行 ${operation}。`, 409, { status: current.record.status, operation }, `运行 buildr task inspect ${taskIdValue} 查看当前状态。`);
        }
        const candidate = normalizeTaskRecord(build(current.record, context), { expectedTaskId: taskIdValue });
        const addedChanges = additions.changes || [];
        assertScopeReferencesAvailable(root, [...(additions.projects || []), ...addedChanges.map((item) => item.project)], additions.services || []);
        assertChangeReferencesAvailable(root, taskIdValue, addedChanges);
        const same = JSON.stringify({ ...candidate, updatedAt: current.record.updatedAt }) === JSON.stringify(current.record);
        if (same) return null;
        changed = true;
        return { ...candidate, updatedAt: nowIso() };
      });
      return runtime.renderTaskResult(operation, operation === 'update' ? 'updated' : operation === 'activate' ? 'activated' : operation === 'complete' ? 'completed' : 'abandoned', written, changed ? [effect('updated', taskIdValue)] : []);
    } catch (error) {
      const failure = errorFields(error);
      if (failure.taskRecordBusiness) throw error;
      const raw = error && typeof error === 'object' ? Object.fromEntries(Object.entries(error)) : {};
      if (raw.structuredStoreBusiness === true) {
        const code = raw.code === 'workspace_store_workspace_not_canonical' ? 'task_record_workspace_not_canonical' : raw.code === 'workspace_store_workspace_invalid' ? 'task_record_workspace_invalid' : String(raw.code || 'workspace_store_failed');
        throw taskRecordError(code, failure.message, typeof raw.status === 'number' ? raw.status : 500, raw.details, typeof raw.nextAction === 'string' ? raw.nextAction : undefined);
      }
      throw taskRecordError('task_record_database_failed', `Task Record ${operation} 失败：${failure.message}`, 500, { taskId: taskIdValue }, '保留数据库现场并运行 Buildr Doctor 后重试。');
    }
  }

  function updateTask(targetRoot: string, taskIdValue: string, input: TaskUpdateInputDto) {
    const { operations, expectedRecordDigest } = normalizedUpdate(input);
    const retrospectiveOnly = operations.retrospectiveState !== undefined || operations.clearRetrospective;
    const retrospectiveDocumentRead = operations.retrospectiveState === undefined
      ? null
      : runtime.readTaskRetrospectiveDocumentPersistence(runtime.readTask(targetRoot, taskIdValue));
    return mutate(targetRoot, taskIdValue, 'update', { expectedRecordDigest }, (current, transaction) => {
      let nextRetrospective = current.retrospective;
      if (retrospectiveOnly) {
        if (!['completed', 'abandoned'].includes(current.status)) throw taskRecordError('task_record_retrospective_task_not_terminal', '只有已完成或已放弃Task可以维护复盘文档。', 409, { status: current.status });
        if (!expectedRecordDigest) throw taskRecordError('task_record_digest_required', '任务复盘文档状态更新必须提供已观察任务版本。', 409);
        if (operations.clearRetrospective) nextRetrospective = null;
        else {
          if (operations.retrospectiveState === undefined) throw taskRecordError('task_record_retrospective_state_required', '登记复盘文档必须提供状态。', 400);
          const document = retrospectiveDocumentRead;
          if (!document || !document.present || !document.actualDigest) throw taskRecordError('task_record_retrospective_document_missing', '固定位置没有可登记的任务复盘文档。', 409, { taskId: taskIdValue, path: document?.path ?? null });
          if (document.actualDigest !== operations.retrospectiveDocumentDigest) throw taskRecordError('task_record_retrospective_document_conflict', '任务复盘文档内容已变化，请重新读取后提交。', 409, { actualDocumentDigest: document.actualDigest });
          if (operations.retrospectiveState === 'decided' && current.retrospective?.documentDigest !== document.actualDigest) {
            throw taskRecordError('task_record_retrospective_document_not_registered', '只能对当前已登记的任务复盘文档版本作出决定。', 409, { registeredDocumentDigest: current.retrospective?.documentDigest ?? null, actualDocumentDigest: document.actualDigest });
          }
          nextRetrospective = { state: operations.retrospectiveState, documentDigest: document.actualDigest };
        }
      }
      let next: TaskRecord = {
        ...current,
        ...(operations.isParent === true ? { isParent: true } : {}),
        ...(operations.title === undefined ? {} : { title: operations.title }),
        ...(operations.intent === undefined ? {} : { intent: operations.intent }),
        ...(operations.parentTaskId === undefined ? {} : { parentTaskId: operations.parentTaskId }),
        scope: {
          projects: applyCollection(current.scope.projects, operations.addProjects, operations.removeProjects, (item) => item, 'Project scope'),
          services: applyCollection(current.scope.services, operations.addServices, operations.removeServices, serviceKey, 'Service scope'),
        },
        changes: applyCollection(current.changes, operations.addChanges, operations.removeChanges, changeKey, 'Change references'),
        retrospective: nextRetrospective,
      };
      const metadataChanged = JSON.stringify(next) !== JSON.stringify(current);
      const terminal = ['completed', 'abandoned'].includes(current.status);
      const changesState = operations.status !== undefined && (operations.status !== current.status || input.summary !== undefined || input.parentCompletion !== undefined || (operations.status === 'abandoned' && input.reason !== undefined));
      if (changesState || (terminal && metadataChanged && !retrospectiveOnly)) {
        if (!expectedRecordDigest) throw taskRecordError('task_record_digest_required', '状态或终态事实更正必须提供已观察任务版本。', 409);
      }
      if (changesState) {
        const nextStatus = operations.status;
        if (nextStatus === undefined) throw taskRecordError('task_record_status_invalid', '状态变化缺少目标状态。', 500);
        if (nextStatus === 'completed') {
          if (metadataChanged) throw taskRecordError('task_record_completion_context_changed', '请先更新目标、范围或关系，再根据当前事实确认完成。', 409);
          next = completedRecord(current, transaction, input);
        } else if (nextStatus === 'abandoned') next = { ...next, status: 'abandoned', result: { summary: text(input.reason, 'reason') } };
        else next = { ...next, status: nextStatus, result: null, retrospective: null };
      }
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      if (current.status === 'completed' && next.status === 'completed' && (next.intent !== current.intent || JSON.stringify(next.scope) !== JSON.stringify(current.scope) || JSON.stringify(next.changes) !== JSON.stringify(current.changes)) && (next.isParent || transaction.parentContext().isParent)) throw taskRecordError('task_record_completion_context_changed', '修改已完成父任务的目标或范围时，请显式更正为进行中，再重新验收。', 409);
      if (terminal && !retrospectiveOnly) {
        const reason = text(input.reason, 'reason');
        if (!current.result || (current.status !== 'completed' && current.status !== 'abandoned')) throw taskRecordError('task_record_result_invalid', '终态Task缺少结果，不能更正。', 500);
        next.resultHistory = [...(current.resultHistory || []), { status: current.status, title: current.title, intent: current.intent, scope: current.scope, changes: current.changes, parentTaskId: current.parentTaskId, ...(current.isParent ? { isParent: true as const } : {}), result: current.result, recordUpdatedAt: current.updatedAt, correctedAt: nowIso(), reason }];
      }
      return next;
    }, { projects: operations.addProjects, services: operations.addServices, changes: operations.addChanges }, ['todo', 'active', 'completed', 'abandoned']);
  }

  function activateTask(targetRoot: string, taskIdValue: string, input: TaskActivateInputDto) {
    assertFields(input, new Set(['expectedRecordDigest']), 'Task activate');
    return mutate(targetRoot, taskIdValue, 'activate', { expectedRecordDigest: input.expectedRecordDigest }, (current) => ({ ...current, status: 'active' }), {}, ['todo']);
  }

  function completeTask(targetRoot: string, taskIdValue: string, input: TaskCompleteInputDto) {
    assertFields(input, new Set(['expectedRecordDigest', 'summary', 'parentCompletion']), 'Task complete');
    text(input.summary, 'summary');
    return mutate(targetRoot, taskIdValue, 'complete', { expectedRecordDigest: input.expectedRecordDigest }, (current, transaction) => completedRecord(current, transaction, input));
  }

  function completedRecord(current: TaskRecord, transaction: TaskMutationContext, input: TaskCompleteInputDto | TaskUpdateInputDto): TaskRecord {
    const summary = text(input.summary, 'summary');
    const context = transaction.parentContext();
    let parentCompletion: ParentCompletion | undefined;
    if (context.isParent) {
      const evidence = normalizeParentCompletion(input.parentCompletion);
      if (!input.expectedRecordDigest) throw taskRecordError('task_record_digest_required', '完成父任务必须提供已观察任务版本。', 409);
      if (evidence.expectedSnapshot !== context.snapshotIdentity) throw taskRecordError('parent_completion_conflict', '父任务或子任务的目标、关系、结果已变化，请重新核对并确认。', 409, { currentSnapshot: context.snapshotIdentity });
      const openChildren = context.children.filter((child) => ['todo', 'active'].includes(child.status));
      if (openChildren.length) throw taskRecordError('parent_completion_children_open', '仍有未结束子任务，不能完成父任务。', 409, { taskIds: openChildren.map((child) => child.taskId) });
      if (JSON.stringify(evidence.acceptance.children.map((child) => child.taskId)) !== JSON.stringify(context.children.map((child) => child.taskId))) throw taskRecordError('parent_completion_children_mismatch', '验收处置必须精确覆盖当前直接子任务。', 409);
      parentCompletion = { ...evidence, recordedAt: nowIso() };
    } else if (input.parentCompletion !== undefined) throw taskRecordError('parent_completion_not_parent', '普通任务不能提交父任务完成依据。', 409);
    return { ...current, ...(context.isParent ? { isParent: true } : {}), status: 'completed', result: { summary, ...(parentCompletion ? { parentCompletion } : {}) } };
  }

  function abandonTask(targetRoot: string, taskIdValue: string, input: TaskAbandonInputDto) {
    assertFields(input, new Set(['expectedRecordDigest', 'reason']), 'Task abandon');
    const summary = text(input.reason, 'reason');
    return mutate(targetRoot, taskIdValue, 'abandon', { expectedRecordDigest: input.expectedRecordDigest }, (current) => ({ ...current, status: 'abandoned', result: { summary } }));
  }
  return Object.assign(runtime, {
    createTaskPersistence, mutateTaskPersistence, writeTaskPersistence,
    createTask, updateTask, activateTask, completeTask, abandonTask,
  });
}
