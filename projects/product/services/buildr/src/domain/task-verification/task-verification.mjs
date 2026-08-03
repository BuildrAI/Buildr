export const TASK_VERIFICATION_RESULT_SCHEMA = 'buildr.task-verification-result/v1';
export const TASK_VERIFICATION_CAPABILITY_OUTCOMES = Object.freeze(['passed', 'failed']);
export const TASK_VERIFICATION_CONCLUSION_OUTCOMES = Object.freeze(['passed', 'not-passed']);

const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/;
const DIGEST = /^sha256-[a-f0-9]{64}$/;

export function taskVerificationError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskVerificationBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskVerificationError('task_verification_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      const name = field ? `${field}.${key}` : key;
      throw taskVerificationError('task_verification_field_forbidden', `Task Verification Result 不支持字段：${name}。`, 400, { field: name });
    }
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw taskVerificationError('task_verification_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  }
  return value.trim();
}

function portableText(value, field) {
  const normalized = text(value, field);
  if (ABSOLUTE_PATH.test(normalized)) {
    throw taskVerificationError('task_verification_reference_not_portable', `${field} 不能使用本机绝对路径。`, 400, { field });
  }
  return normalized;
}

function relativePath(value, field) {
  const normalized = portableText(value, field).replaceAll('\\', '/');
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.endsWith('/..')) {
    throw taskVerificationError('task_verification_reference_not_portable', `${field} 必须是 Workspace 内相对路径。`, 400, { field });
  }
  return normalized.replace(/^\.\//, '');
}

function stringList(value, field, { minimum = 0 } = {}) {
  if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', `${field} 必须是数组。`, 400, { field });
  if (value.length < minimum) throw taskVerificationError('task_verification_field_invalid', `${field} 至少需要 ${minimum} 项。`, 400, { field });
  return value.map((item, index) => portableText(item, `${field}[${index}]`));
}

function timestamp(value) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw taskVerificationError('task_verification_timestamp_invalid', 'completedAt 必须是 ISO 时间。', 400, { field: 'completedAt' });
  }
  return value;
}

function normalizeTarget(value) {
  const target = object(value, 'target');
  closed(target, new Set(['identity', 'summary']), 'target');
  return {
    identity: portableText(target.identity, 'target.identity'),
    summary: portableText(target.summary, 'target.summary'),
  };
}

function normalizeDeclarations(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw taskVerificationError('task_verification_field_invalid', 'declarations 必须是非空数组。', 400, { field: 'declarations' });
  }
  const seen = new Set();
  return value.map((item, index) => {
    const field = `declarations[${index}]`;
    const declaration = object(item, field);
    closed(declaration, new Set(['project', 'path', 'identity']), field);
    const project = portableText(declaration.project, `${field}.project`);
    if (seen.has(project)) throw taskVerificationError('task_verification_declaration_duplicate', `declarations 中 Project 重复：${project}。`, 400, { field: `${field}.project`, project });
    seen.add(project);
    const identity = text(declaration.identity, `${field}.identity`);
    if (identity !== 'absent' && !DIGEST.test(identity)) {
      throw taskVerificationError('task_verification_declaration_identity_invalid', `${field}.identity 必须是 absent 或 sha256 digest。`, 400, { field: `${field}.identity` });
    }
    return { project, path: relativePath(declaration.path, `${field}.path`), identity };
  });
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'capabilities 必须是数组。', 400, { field: 'capabilities' });
  const seen = new Set();
  return value.map((item, index) => {
    const field = `capabilities[${index}]`;
    const entry = object(item, field);
    closed(entry, new Set(['project', 'capability', 'outcome', 'facts']), field);
    const project = portableText(entry.project, `${field}.project`);
    const capability = portableText(entry.capability, `${field}.capability`);
    const key = `${project}/${capability}`;
    if (seen.has(key)) throw taskVerificationError('task_verification_capability_duplicate', `capabilities 中能力重复：${key}。`, 400, { field, capability: key });
    seen.add(key);
    if (!TASK_VERIFICATION_CAPABILITY_OUTCOMES.includes(entry.outcome)) {
      throw taskVerificationError('task_verification_capability_outcome_invalid', `${field}.outcome 必须是 passed 或 failed。`, 400, { field: `${field}.outcome`, value: entry.outcome });
    }
    return { project, capability, outcome: entry.outcome, facts: stringList(entry.facts, `${field}.facts`, { minimum: 1 }) };
  });
}

function normalizeCoverageGaps(value) {
  if (!Array.isArray(value)) throw taskVerificationError('task_verification_field_invalid', 'coverageGaps 必须是数组。', 400, { field: 'coverageGaps' });
  return value.map((item, index) => {
    const field = `coverageGaps[${index}]`;
    const gap = object(item, field);
    closed(gap, new Set(['scope', 'summary']), field);
    return { scope: portableText(gap.scope, `${field}.scope`), summary: portableText(gap.summary, `${field}.summary`) };
  });
}

function normalizeConclusion(value) {
  const conclusion = object(value, 'conclusion');
  closed(conclusion, new Set(['outcome', 'summary']), 'conclusion');
  if (!TASK_VERIFICATION_CONCLUSION_OUTCOMES.includes(conclusion.outcome)) {
    throw taskVerificationError('task_verification_conclusion_invalid', 'conclusion.outcome 必须是 passed 或 not-passed。', 400, { field: 'conclusion.outcome', value: conclusion.outcome });
  }
  return { outcome: conclusion.outcome, summary: portableText(conclusion.summary, 'conclusion.summary') };
}

export function normalizeTaskVerificationResult(value, { expectedTaskId = null } = {}) {
  const result = object(value, 'Task Verification Result');
  closed(result, new Set(['schemaVersion', 'taskId', 'target', 'declarations', 'capabilities', 'coverageGaps', 'conclusion', 'completedAt']), '');
  if (result.schemaVersion !== TASK_VERIFICATION_RESULT_SCHEMA) {
    throw taskVerificationError('task_verification_schema_unsupported', `Task Verification Result schemaVersion 必须是 ${TASK_VERIFICATION_RESULT_SCHEMA}。`, 409, { field: 'schemaVersion', actual: result.schemaVersion });
  }
  const taskId = text(result.taskId, 'taskId');
  if (expectedTaskId && taskId !== expectedTaskId) {
    throw taskVerificationError('task_verification_task_identity_mismatch', `Task Verification Result taskId 与目录不一致：${expectedTaskId} != ${taskId}。`, 409, { expectedTaskId, taskId });
  }
  const declarations = normalizeDeclarations(result.declarations);
  const capabilities = normalizeCapabilities(result.capabilities);
  const coverageGaps = normalizeCoverageGaps(result.coverageGaps);
  if (capabilities.length === 0 && coverageGaps.length === 0) {
    throw taskVerificationError('task_verification_result_empty', 'Result 必须至少包含一项实际 capability 或 coverage gap。', 400, { field: 'capabilities' });
  }
  const conclusion = normalizeConclusion(result.conclusion);
  if (conclusion.outcome === 'passed' && (coverageGaps.length > 0 || capabilities.some((item) => item.outcome === 'failed'))) {
    throw taskVerificationError('task_verification_conclusion_inconsistent', '存在 failed capability 或 coverage gap 时 conclusion 不能是 passed。', 400, { field: 'conclusion.outcome' });
  }
  return {
    schemaVersion: TASK_VERIFICATION_RESULT_SCHEMA,
    taskId,
    target: normalizeTarget(result.target),
    declarations,
    capabilities,
    coverageGaps,
    conclusion,
    completedAt: timestamp(result.completedAt),
  };
}
