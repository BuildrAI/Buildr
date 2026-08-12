export const TASK_RETROSPECTIVE_RESULT_SCHEMA = 'buildr.task-retrospective-result/v1';
export const TASK_RETROSPECTIVE_FOCUS = 'agent-execution-efficiency';
export const TASK_RETROSPECTIVE_DISPOSITION_STATUSES = Object.freeze(['pending', 'handled', 'no-action']);

export function taskRetrospectiveError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  error.nextAction = nextAction;
  error.taskRetrospectiveBusiness = true;
  return error;
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskRetrospectiveError('task_retrospective_result_invalid', 'Task Retrospective Result 必须是对象。');
  }
  return value;
}

function nonEmptyText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskRetrospectiveError('task_retrospective_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

export function normalizeTaskRetrospectiveResult(value, { expectedTaskId = null } = {}) {
  const result = object(value);
  const allowed = new Set(['schemaVersion', 'taskId', 'focus', 'reportMarkdown', 'completedAt']);
  for (const field of Object.keys(result)) {
    if (!allowed.has(field)) throw taskRetrospectiveError('task_retrospective_field_forbidden', `Task Retrospective Result 不支持字段：${field}。`, 400, { field });
  }
  if (result.schemaVersion !== TASK_RETROSPECTIVE_RESULT_SCHEMA) {
    throw taskRetrospectiveError('task_retrospective_schema_unsupported', `schemaVersion 必须是 ${TASK_RETROSPECTIVE_RESULT_SCHEMA}。`, 409, { actual: result.schemaVersion });
  }
  const taskId = nonEmptyText(result.taskId, 'taskId');
  if (expectedTaskId && taskId !== expectedTaskId) {
    throw taskRetrospectiveError('task_retrospective_task_identity_mismatch', `Task Retrospective Result taskId 与目标不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  }
  if (result.focus !== TASK_RETROSPECTIVE_FOCUS) {
    throw taskRetrospectiveError('task_retrospective_focus_invalid', `focus 必须是 ${TASK_RETROSPECTIVE_FOCUS}。`, 400, { actual: result.focus });
  }
  if (typeof result.completedAt !== 'string' || Number.isNaN(Date.parse(result.completedAt))) {
    throw taskRetrospectiveError('task_retrospective_timestamp_invalid', 'completedAt 必须是 ISO 时间。', 400, { field: 'completedAt' });
  }
  return {
    schemaVersion: TASK_RETROSPECTIVE_RESULT_SCHEMA,
    taskId,
    focus: TASK_RETROSPECTIVE_FOCUS,
    reportMarkdown: nonEmptyText(result.reportMarkdown, 'reportMarkdown'),
    completedAt: result.completedAt,
  };
}

export function normalizeTaskRetrospectiveDisposition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskRetrospectiveError('task_retrospective_disposition_invalid', 'Task Retrospective disposition 必须是对象。');
  }
  const allowed = new Set(['status', 'note', 'disposedAt']);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw taskRetrospectiveError('task_retrospective_field_forbidden', `Task Retrospective disposition 不支持字段：${field}。`, 400, { field });
  }
  if (!TASK_RETROSPECTIVE_DISPOSITION_STATUSES.includes(value.status)) {
    throw taskRetrospectiveError('task_retrospective_disposition_status_invalid', '复盘处置状态只支持 pending、handled 或 no-action。', 400, { field: 'status', value: value.status });
  }
  if (value.status === 'pending') {
    if (value.note !== null && value.note !== undefined) throw taskRetrospectiveError('task_retrospective_disposition_pending_note_forbidden', 'pending 处置状态不能保留说明。', 400, { field: 'note' });
    if (value.disposedAt !== null && value.disposedAt !== undefined) throw taskRetrospectiveError('task_retrospective_disposition_pending_time_forbidden', 'pending 处置状态不能保留处置时间。', 400, { field: 'disposedAt' });
    return { status: 'pending', note: null, disposedAt: null };
  }
  const note = nonEmptyText(value.note, 'note');
  if (typeof value.disposedAt !== 'string' || Number.isNaN(Date.parse(value.disposedAt))) {
    throw taskRetrospectiveError('task_retrospective_disposition_timestamp_invalid', 'disposedAt 必须是 ISO 时间。', 400, { field: 'disposedAt' });
  }
  return { status: value.status, note, disposedAt: value.disposedAt };
}
