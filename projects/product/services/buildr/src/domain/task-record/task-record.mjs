export const TASK_RECORD_SCHEMA = 'buildr.task-record/v1';
export const TASK_RECORD_STATUSES = Object.freeze(['active', 'completed', 'abandoned']);

const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const SCOPE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function taskRecordError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskRecordBusiness = true;
  return error;
}

export function isTaskRecordId(value) {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskRecordError('task_record_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw taskRecordError('task_record_field_forbidden', `Task Record 不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function nonEmptyText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskRecordError('task_record_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function identity(value, field) {
  const normalized = nonEmptyText(value, field);
  if (!SCOPE_ID_PATTERN.test(normalized)) {
    throw taskRecordError('task_record_identity_invalid', `${field} 不是合法 identity。`, 400, { field, value });
  }
  return normalized;
}

function unique(values, key, field) {
  const seen = new Set();
  for (const value of values) {
    const identityKey = key(value);
    if (seen.has(identityKey)) {
      throw taskRecordError('task_record_reference_duplicate', `${field} 包含重复引用：${identityKey}。`, 409, { field, identity: identityKey });
    }
    seen.add(identityKey);
  }
  return values;
}

function stringIdentities(value, field) {
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  return unique(value.map((item, index) => identity(item, `${field}[${index}]`)), (item) => item, field)
    .sort((a, b) => a.localeCompare(b));
}

function qualifiedIdentities(value, field, secondField) {
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  const entries = value.map((item, index) => {
    const entry = object(item, `${field}[${index}]`);
    closed(entry, new Set(['project', secondField]), `${field}[${index}]`);
    return {
      project: identity(entry.project, `${field}[${index}].project`),
      [secondField]: identity(entry[secondField], `${field}[${index}].${secondField}`),
    };
  });
  return unique(entries, (item) => `${item.project}/${item[secondField]}`, field)
    .sort((a, b) => `${a.project}/${a[secondField]}`.localeCompare(`${b.project}/${b[secondField]}`));
}

function timestamp(value, field) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw taskRecordError('task_record_timestamp_invalid', `${field} 必须是 ISO 时间。`, 400, { field });
  }
  return value;
}

function optionalTaskId(value, field) {
  if (value === null || value === undefined) return null;
  const normalized = nonEmptyText(value, field);
  if (!isTaskRecordId(normalized)) {
    throw taskRecordError('task_record_identity_invalid', `${field} 必须是合法 Task ID。`, 400, { field, value });
  }
  return normalized;
}

function taskIds(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw taskRecordError('task_record_field_invalid', `${field} 必须是数组。`, 400, { field });
  return unique(value.map((item, index) => optionalTaskId(item, `${field}[${index}]`)), (item) => item, field)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeResult(status, value) {
  if (status === 'active') {
    if (value !== null) throw taskRecordError('task_record_result_invalid', 'active Task 的 result 必须为 null。', 400, { field: 'result' });
    return null;
  }
  const result = object(value, 'result');
  if (status === 'completed') {
    closed(result, new Set(['summary', 'noChange']), 'result');
    if (typeof result.noChange !== 'boolean') throw taskRecordError('task_record_result_invalid', 'completed Task 的 result.noChange 必须是 boolean。', 400, { field: 'result.noChange' });
    return { summary: nonEmptyText(result.summary, 'result.summary'), noChange: result.noChange };
  }
  closed(result, new Set(['summary']), 'result');
  return { summary: nonEmptyText(result.summary, 'result.summary') };
}

export function normalizeTaskRecord(value, { expectedTaskId = null } = {}) {
  const record = object(value, 'Task Record');
  closed(record, new Set(['schemaVersion', 'taskId', 'title', 'intent', 'scope', 'changes', 'parentTaskId', 'childTaskIds', 'status', 'result', 'createdAt', 'updatedAt']), '');
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
  if (!TASK_RECORD_STATUSES.includes(record.status)) {
    throw taskRecordError('task_record_status_invalid', `Task status 不受支持：${record.status}。`, 400, { field: 'status' });
  }
  const createdAt = timestamp(record.createdAt, 'createdAt');
  const updatedAt = timestamp(record.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw taskRecordError('task_record_timestamp_invalid', 'updatedAt 不能早于 createdAt。', 400, { field: 'updatedAt' });
  }
  return {
    schemaVersion: TASK_RECORD_SCHEMA,
    taskId,
    title: nonEmptyText(record.title, 'title'),
    intent: nonEmptyText(record.intent, 'intent'),
    scope: {
      projects: stringIdentities(scope.projects, 'scope.projects'),
      services: qualifiedIdentities(scope.services, 'scope.services', 'service'),
    },
    changes: qualifiedIdentities(record.changes, 'changes', 'change'),
    parentTaskId: optionalTaskId(record.parentTaskId, 'parentTaskId'),
    childTaskIds: taskIds(record.childTaskIds, 'childTaskIds'),
    status: record.status,
    result: normalizeResult(record.status, record.result),
    createdAt,
    updatedAt,
  };
}
