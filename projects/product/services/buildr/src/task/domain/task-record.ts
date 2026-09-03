export const TASK_RECORD_SCHEMA = 'buildr.task-record/v3';
export const TASK_RECORD_STATUSES = Object.freeze(['todo', 'active', 'completed', 'abandoned']);
export const TASK_RETROSPECTIVE_DOCUMENT_STATES = Object.freeze(['pending-decision', 'decided']);

export type TaskRecordStatus = 'todo' | 'active' | 'completed' | 'abandoned';
export type TaskRetrospectiveDocumentState = 'pending-decision' | 'decided';
export type TaskRetrospectiveReference = { state: TaskRetrospectiveDocumentState; documentDigest: string };
export type TaskServiceReference = { project: string; service: string };
export type TaskChangeReference = { project: string; change: string };
export type ParentCompletion = {
  expectedSnapshot: string;
  acceptance: { summary: string; children: Array<{ taskId: string; summary: string }> };
  authorization: { source: string; statement: string };
  recordedAt?: string;
};
export type TaskRecordResult = null | { summary: string; parentCompletion?: ParentCompletion };
export type TaskRecordHistory = {
  status: 'completed' | 'abandoned';
  title: string;
  intent: string;
  parentTaskId: string | null;
  scope?: { projects: string[]; services: TaskServiceReference[] };
  changes?: TaskChangeReference[];
  isParent?: true;
  result: Exclude<TaskRecordResult, null>;
  recordUpdatedAt: string;
  correctedAt: string;
  reason: string;
};
export type TaskRecord = {
  schemaVersion: typeof TASK_RECORD_SCHEMA;
  taskId: string;
  title: string;
  intent: string;
  scope: { projects: string[]; services: TaskServiceReference[] };
  changes: TaskChangeReference[];
  parentTaskId: string | null;
  isParent?: true;
  retrospective: TaskRetrospectiveReference | null;
  status: TaskRecordStatus;
  result: TaskRecordResult;
  resultHistory?: TaskRecordHistory[];
  createdAt: string;
  updatedAt: string;
};
export type TaskRecordBusinessError = Error & {
  code: string;
  status: number;
  details?: unknown;
  nextAction?: string;
  taskRecordBusiness: true;
};

export const TASK_RECORD_ID_SOURCE = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

const TASK_ID_PATTERN = new RegExp(`^${TASK_RECORD_ID_SOURCE}$`);
const SCOPE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_PATTERN = /^sha256-[0-9a-f]{64}$/u;

export function taskRecordError(code: string, message: string, status = 400, details?: unknown, nextAction?: string): TaskRecordBusinessError {
  const taskRecordBusiness: true = true;
  return Object.assign(new Error(message), {
    code,
    status,
    ...(details === undefined ? {} : { details }),
    ...(nextAction === undefined ? {} : { nextAction }),
    taskRecordBusiness,
  });
}

export function isTaskRecordId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}

export function taskRecordEffectiveProjectCodes(record: Pick<TaskRecord, 'scope' | 'changes'> | null | undefined): string[] {
  return [...new Set([
    ...(record?.scope?.projects || []),
    ...(record?.scope?.services || []).map((item) => item.project),
    ...(record?.changes || []).map((item) => item.project),
  ])].sort((left, right) => left.localeCompare(right));
}

export function isWorkspaceOnlyTaskRecord(record: Pick<TaskRecord, 'scope' | 'changes'> | null | undefined): boolean {
  return taskRecordEffectiveProjectCodes(record).length === 0;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskRecordError('task_record_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return Object.fromEntries(Object.entries(value));
}

function closed(value: Record<string, unknown>, fields: ReadonlySet<string>, field: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw taskRecordError('task_record_field_forbidden', `Task Record 不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function nonEmptyText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskRecordError('task_record_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function identity(value: unknown, field: string): string {
  const normalized = nonEmptyText(value, field);
  if (!SCOPE_ID_PATTERN.test(normalized)) {
    throw taskRecordError('task_record_identity_invalid', `${field} 不是合法 identity。`, 400, { field, value });
  }
  return normalized;
}

function unique<T>(values: T[], key: (value: T) => string, field: string): T[] {
  const seen = new Set<string>();
  for (const value of values) {
    const identityKey = key(value);
    if (seen.has(identityKey)) {
      throw taskRecordError('task_record_reference_duplicate', `${field} 包含重复引用：${identityKey}。`, 409, { field, identity: identityKey });
    }
    seen.add(identityKey);
  }
  return values;
}

function stringIdentities(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  return unique(value.map((item, index) => identity(item, `${field}[${index}]`)), (item) => item, field)
    .sort((a, b) => a.localeCompare(b));
}

function qualifiedIdentities(value: unknown, field: string, secondField: 'service' | 'change'): Array<{ project: string; identity: string }> {
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  const entries = value.map((item, index) => {
    const entry = object(item, `${field}[${index}]`);
    closed(entry, new Set(['project', secondField]), `${field}[${index}]`);
    return { project: identity(entry.project, `${field}[${index}].project`), identity: identity(entry[secondField], `${field}[${index}].${secondField}`) };
  });
  return unique(entries, (item) => `${item.project}/${item.identity}`, field)
    .sort((a, b) => `${a.project}/${a.identity}`.localeCompare(`${b.project}/${b.identity}`));
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw taskRecordError('task_record_timestamp_invalid', `${field} 必须是 ISO 时间。`, 400, { field });
  }
  return value;
}

function optionalTaskId(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const normalized = nonEmptyText(value, field);
  if (!isTaskRecordId(normalized)) {
    throw taskRecordError('task_record_identity_invalid', `${field} 必须是合法 Task ID。`, 400, { field, value });
  }
  return normalized;
}

function taskIds(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  const identities = value.map((item, index) => {
    const parsed = optionalTaskId(item, `${field}[${index}]`);
    if (parsed === null) throw taskRecordError('task_record_identity_invalid', `${field}[${index}]必须是合法Task ID。`, 400);
    return parsed;
  });
  return unique(identities, (item) => item, field)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeResult(status: TaskRecordStatus, value: unknown): TaskRecordResult {
  if (['todo', 'active'].includes(status)) {
    if (value !== null) throw taskRecordError('task_record_result_invalid', `${status} Task 的 result 必须为 null。`, 400, { field: 'result' });
    return null;
  }
  const result = object(value, 'result');
  if (status === 'completed') {
    closed(result, new Set(['summary', 'parentCompletion']), 'result');
    return { summary: nonEmptyText(result.summary, 'result.summary'),
      ...(result.parentCompletion === undefined ? {} : { parentCompletion: normalizeParentCompletion(result.parentCompletion, { saved: true }) }) };
  }
  closed(result, new Set(['summary']), 'result');
  return { summary: nonEmptyText(result.summary, 'result.summary') };
}

function normalizeRetrospective(status: TaskRecordStatus, value: unknown): TaskRetrospectiveReference | null {
  if (value === null || value === undefined) return null;
  if (!['completed', 'abandoned'].includes(status)) {
    throw taskRecordError('task_record_retrospective_task_not_terminal', '只有已完成或已放弃Task可以登记复盘文档。', 409, { status });
  }
  const retrospective = object(value, 'retrospective');
  closed(retrospective, new Set(['state', 'documentDigest']), 'retrospective');
  if (retrospective.state !== 'pending-decision' && retrospective.state !== 'decided') {
    throw taskRecordError('task_record_retrospective_state_invalid', 'retrospective.state只支持pending-decision或decided。', 400, { field: 'retrospective.state', value: retrospective.state });
  }
  if (typeof retrospective.documentDigest !== 'string' || !SHA256_PATTERN.test(retrospective.documentDigest)) {
    throw taskRecordError('task_record_retrospective_digest_invalid', 'retrospective.documentDigest必须是SHA-256摘要。', 400, { field: 'retrospective.documentDigest' });
  }
  return { state: retrospective.state, documentDigest: retrospective.documentDigest };
}

export function normalizeParentCompletion(value: unknown, { saved = false }: { saved?: boolean } = {}): ParentCompletion {
  if (!value) throw taskRecordError('parent_completion_authorization_required', '完成父任务必须提供明确用户授权和总体验收依据。', 409);
  const input = object(value, 'parentCompletion');
  closed(input, new Set(['expectedSnapshot', 'acceptance', 'authorization', ...(saved ? ['recordedAt'] : [])]), 'parentCompletion');
  const acceptance = object(input.acceptance, 'parentCompletion.acceptance');
  closed(acceptance, new Set(['summary', 'children']), 'parentCompletion.acceptance');
  if (!Array.isArray(acceptance.children)) throw taskRecordError('parent_completion_children_required', '总体验收必须逐项说明直接子任务的处置。', 400);
  const children = unique(acceptance.children.map((entry) => {
    const child = object(entry, 'parentCompletion.acceptance.children');
    closed(child, new Set(['taskId', 'summary']), 'parentCompletion.acceptance.children');
    const taskId = optionalTaskId(child.taskId, 'parentCompletion.acceptance.children.taskId');
    if (!taskId) throw taskRecordError('parent_completion_child_invalid', '验收处置必须指定子任务。');
    return { taskId, summary: nonEmptyText(child.summary, 'parentCompletion.acceptance.children.summary') };
  }), (child) => child.taskId, 'parentCompletion.acceptance.children').sort((a, b) => a.taskId.localeCompare(b.taskId));
  const authorization = object(input.authorization, 'parentCompletion.authorization');
  closed(authorization, new Set(['source', 'statement']), 'parentCompletion.authorization');
  return {
    expectedSnapshot: nonEmptyText(input.expectedSnapshot, 'parentCompletion.expectedSnapshot'),
    acceptance: { summary: nonEmptyText(acceptance.summary, 'parentCompletion.acceptance.summary'), children },
    authorization: { source: nonEmptyText(authorization.source, 'parentCompletion.authorization.source'), statement: nonEmptyText(authorization.statement, 'parentCompletion.authorization.statement') },
    ...(saved ? { recordedAt: timestamp(input.recordedAt, 'parentCompletion.recordedAt') } : {}),
  };
}

function normalizeResultHistory(value: unknown = []): TaskRecordHistory[] {
  if (!Array.isArray(value)) throw taskRecordError('task_record_history_invalid', 'resultHistory 必须是数组。');
  return value.map((entry) => {
    const item = object(entry, 'resultHistory');
    closed(item, new Set(['status', 'title', 'intent', 'parentTaskId', 'scope', 'changes', 'isParent', 'result', 'recordUpdatedAt', 'correctedAt', 'reason']), 'resultHistory');
    if (item.status !== 'completed' && item.status !== 'abandoned') throw taskRecordError('task_record_history_invalid', '结果历史只保存被更正的终态。');
    const result = normalizeResult(item.status, item.result);
    if (result === null) throw taskRecordError('task_record_history_invalid', '结果历史必须保存终态结果。');
    const scope = item.scope === undefined ? undefined : object(item.scope, 'resultHistory.scope');
    if (scope) closed(scope, new Set(['projects', 'services']), 'resultHistory.scope');
    return { status: item.status, title: nonEmptyText(item.title, 'resultHistory.title'), intent: nonEmptyText(item.intent, 'resultHistory.intent'),
      parentTaskId: optionalTaskId(item.parentTaskId, 'resultHistory.parentTaskId'), result,
      ...(scope ? { scope: { projects: stringIdentities(scope.projects, 'resultHistory.scope.projects'), services: qualifiedIdentities(scope.services, 'resultHistory.scope.services', 'service').map((value) => ({ project: value.project, service: value.identity })) } } : {}),
      ...(item.changes === undefined ? {} : { changes: qualifiedIdentities(item.changes, 'resultHistory.changes', 'change').map((value) => ({ project: value.project, change: value.identity })) }),
      ...(item.isParent === true ? { isParent: true } : {}),
      recordUpdatedAt: timestamp(item.recordUpdatedAt, 'resultHistory.recordUpdatedAt'), correctedAt: timestamp(item.correctedAt, 'resultHistory.correctedAt'), reason: nonEmptyText(item.reason, 'resultHistory.reason') };
  });
}

export function normalizeTaskRecord(value: unknown, { expectedTaskId = null }: { expectedTaskId?: string | null } = {}): TaskRecord {
  const record = object(value, 'Task Record');
  closed(record, new Set(['schemaVersion', 'taskId', 'title', 'intent', 'scope', 'changes', 'parentTaskId', 'isParent', 'retrospective', 'status', 'result', 'resultHistory', 'createdAt', 'updatedAt']), '');
  if (record.isParent !== undefined && typeof record.isParent !== 'boolean') throw taskRecordError('task_record_field_invalid', 'isParent 必须是 boolean。');
  if (record.schemaVersion !== TASK_RECORD_SCHEMA) {
    throw taskRecordError('task_record_schema_unsupported', `Task Record schemaVersion 必须是 ${TASK_RECORD_SCHEMA}。`, 409, { field: 'schemaVersion', actual: record.schemaVersion });
  }
  const taskId = nonEmptyText(record.taskId, 'taskId');
  if (!isTaskRecordId(taskId)) {
    throw taskRecordError('task_record_identity_invalid', 'Task ID 只能使用小写字母、数字、点、下划线或连字符，且不能包含路径分隔符。', 400, { field: 'taskId', value: taskId });
  }
  if (expectedTaskId && taskId !== expectedTaskId) {
    throw taskRecordError('task_record_identity_mismatch', `Task 目录 identity 与记录不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  }
  const scope = object(record.scope, 'scope');
  closed(scope, new Set(['projects', 'services']), 'scope');
  if (record.status !== 'todo' && record.status !== 'active' && record.status !== 'completed' && record.status !== 'abandoned') {
    throw taskRecordError('task_record_status_invalid', `Task status 不受支持：${record.status}。`, 400, { field: 'status' });
  }
  const createdAt = timestamp(record.createdAt, 'createdAt');
  const updatedAt = timestamp(record.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw taskRecordError('task_record_timestamp_invalid', 'updatedAt 不能早于 createdAt。', 400, { field: 'updatedAt' });
  }
  const changes = qualifiedIdentities(record.changes, 'changes', 'change').map((item) => ({ project: item.project, change: item.identity }));
  if (record.status === 'todo' && changes.length) {
    throw taskRecordError('task_record_todo_change_forbidden', 'todo Task 不能关联 OpenSpec Change；请先激活 Task。', 409, { field: 'changes' });
  }
  const resultHistory = normalizeResultHistory(record.resultHistory);
  return {
    schemaVersion: TASK_RECORD_SCHEMA,
    taskId,
    title: nonEmptyText(record.title, 'title'),
    intent: nonEmptyText(record.intent, 'intent'),
    scope: {
      projects: stringIdentities(scope.projects, 'scope.projects'),
      services: qualifiedIdentities(scope.services, 'scope.services', 'service').map((item) => ({ project: item.project, service: item.identity })),
    },
    changes,
    parentTaskId: optionalTaskId(record.parentTaskId, 'parentTaskId'),
    ...(record.isParent === true ? { isParent: true } : {}),
    retrospective: normalizeRetrospective(record.status, record.retrospective),
    status: record.status,
    result: normalizeResult(record.status, record.result),
    ...(resultHistory.length ? { resultHistory } : {}),
    createdAt,
    updatedAt,
  };
}
