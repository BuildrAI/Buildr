export const TASK_REVIEW_RESULT_SCHEMA = 'buildr.task-review-result/v1';
export const TASK_REVIEW_TYPES = Object.freeze(['planning', 'completion']);
export const TASK_REVIEW_METHODS = Object.freeze(['self', 'independent-agent', 'human']);
export const TASK_REVIEW_OUTCOMES = Object.freeze(['ready', 'changes-required']);

const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/;

export function taskReviewError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskReviewBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskReviewError('task_review_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw taskReviewError('task_review_field_forbidden', `Task Review Result 不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskReviewError('task_review_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function portableText(value, field) {
  const normalized = text(value, field);
  if (ABSOLUTE_PATH.test(normalized)) {
    throw taskReviewError('task_review_reference_not_portable', `${field} 不能使用本机绝对路径。`, 400, { field });
  }
  return normalized;
}

function stringList(value, field, { minimum = 0, portable = false } = {}) {
  if (!Array.isArray(value)) throw taskReviewError('task_review_field_invalid', `${field} 必须是数组。`, 400, { field });
  if (value.length < minimum) throw taskReviewError('task_review_field_invalid', `${field} 至少需要 ${minimum} 项。`, 400, { field });
  return value.map((item, index) => (portable ? portableText(item, `${field}[${index}]`) : text(item, `${field}[${index}]`)));
}

function uncoveredList(value) {
  if (!Array.isArray(value)) throw taskReviewError('task_review_field_invalid', 'uncovered 必须是数组。', 400, { field: 'uncovered' });
  return value.map((item, index) => {
    const entry = object(item, `uncovered[${index}]`);
    closed(entry, new Set(['subject', 'reason']), `uncovered[${index}]`);
    return {
      subject: portableText(entry.subject, `uncovered[${index}].subject`),
      reason: text(entry.reason, `uncovered[${index}].reason`),
    };
  });
}

function timestamp(value) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw taskReviewError('task_review_timestamp_invalid', 'completedAt 必须是 ISO 时间。', 400, { field: 'completedAt' });
  }
  return value;
}

export function assertTaskReviewType(value, field = 'reviewType') {
  if (!TASK_REVIEW_TYPES.includes(value)) {
    throw taskReviewError('task_review_type_invalid', `${field} 必须是 planning 或 completion。`, 400, { field, value });
  }
  return value;
}

export function normalizeTaskReviewResult(value, { expectedTaskId = null, expectedReviewType = null } = {}) {
  const result = object(value, 'Task Review Result');
  closed(result, new Set(['schemaVersion', 'taskId', 'reviewType', 'targetIdentity', 'method', 'reviewed', 'uncovered', 'findings', 'conclusion', 'completedAt']), '');
  if (result.schemaVersion !== TASK_REVIEW_RESULT_SCHEMA) {
    throw taskReviewError('task_review_schema_unsupported', `Task Review Result schemaVersion 必须是 ${TASK_REVIEW_RESULT_SCHEMA}。`, 409, { field: 'schemaVersion', actual: result.schemaVersion });
  }
  const taskId = text(result.taskId, 'taskId');
  if (expectedTaskId && taskId !== expectedTaskId) {
    throw taskReviewError('task_review_task_identity_mismatch', `Task Review Result taskId 与目录不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  }
  const reviewType = assertTaskReviewType(result.reviewType);
  if (expectedReviewType && reviewType !== expectedReviewType) {
    throw taskReviewError('task_review_type_identity_mismatch', `Task Review Result reviewType 与槽位不一致：${expectedReviewType} != ${reviewType}。`, 409, { expectedReviewType, reviewType });
  }
  if (!TASK_REVIEW_METHODS.includes(result.method)) {
    throw taskReviewError('task_review_method_invalid', `method 不受支持：${result.method || '<missing>'}。`, 400, { field: 'method', value: result.method });
  }
  const conclusion = object(result.conclusion, 'conclusion');
  closed(conclusion, new Set(['outcome', 'summary']), 'conclusion');
  if (!TASK_REVIEW_OUTCOMES.includes(conclusion.outcome)) {
    throw taskReviewError('task_review_outcome_invalid', `conclusion.outcome 不受支持：${conclusion.outcome || '<missing>'}。`, 400, { field: 'conclusion.outcome', value: conclusion.outcome });
  }
  return {
    schemaVersion: TASK_REVIEW_RESULT_SCHEMA,
    taskId,
    reviewType,
    targetIdentity: portableText(result.targetIdentity, 'targetIdentity'),
    method: result.method,
    reviewed: stringList(result.reviewed, 'reviewed', { minimum: 1, portable: true }),
    uncovered: uncoveredList(result.uncovered),
    findings: stringList(result.findings, 'findings'),
    conclusion: { outcome: conclusion.outcome, summary: text(conclusion.summary, 'conclusion.summary') },
    completedAt: timestamp(result.completedAt),
  };
}
