import crypto from 'node:crypto';
import path from 'node:path';

export const TASK_ENVIRONMENT_PLAN_SCHEMA = 'buildr.task-environment-plan/v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SELECTOR = /^service:[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXECUTABLE_KINDS = new Set(['workspace-foundation', 'service', 'absolute']);
const OUTPUT_KINDS = new Set(['file', 'directory', 'executable']);

function taskEnvironmentError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  error.nextAction = nextAction;
  error.taskEnvironmentBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 必须是对象。`, 409, { field });
  return value;
}

function closed(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw taskEnvironmentError('task_environment_plan_field_forbidden', `Environment Plan 不支持字段：${field}.${key}。`, 409, { field: `${field}.${key}` });
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 必须是非空字符串。`, 409, { field });
  return value.trim();
}

function identifier(value, field) {
  const normalized = text(value, field);
  if (!IDENTIFIER.test(normalized)) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 不是合法 identity。`, 409, { field, value });
  return normalized;
}

function relative(value, field, { dot = false } = {}) {
  const normalized = text(value, field).replaceAll('\\', '/');
  if (dot && normalized === '.') return normalized;
  if (path.posix.isAbsolute(normalized) || path.posix.normalize(normalized) !== normalized || normalized === '.' || normalized.startsWith('../')) {
    throw taskEnvironmentError('task_environment_plan_path_invalid', `${field} 必须是规范化 Service 相对路径。`, 409, { field, value });
  }
  return normalized;
}

function executable(value, field) {
  const input = object(value, field);
  closed(input, new Set(['kind', 'name', 'path']), field);
  if (!EXECUTABLE_KINDS.has(input.kind)) throw taskEnvironmentError('task_environment_plan_executable_invalid', `${field}.kind 不受支持：${input.kind}。`, 409, { field: `${field}.kind` });
  if (input.kind === 'workspace-foundation') {
    if (input.path !== undefined && input.path !== null) throw taskEnvironmentError('task_environment_plan_field_forbidden', `${field}.path 不适用于 workspace-foundation。`, 409, { field: `${field}.path` });
    return { kind: input.kind, name: identifier(input.name, `${field}.name`), path: null };
  }
  if (input.name !== undefined && input.name !== null) throw taskEnvironmentError('task_environment_plan_field_forbidden', `${field}.name 只适用于 workspace-foundation。`, 409, { field: `${field}.name` });
  if (input.kind === 'service') return { kind: input.kind, name: null, path: relative(input.path, `${field}.path`) };
  const absolute = text(input.path, `${field}.path`);
  if (!path.isAbsolute(absolute) || path.normalize(absolute) !== absolute) throw taskEnvironmentError('task_environment_plan_path_invalid', `${field}.path 必须是规范化绝对路径。`, 409, { field: `${field}.path`, value: input.path });
  return { kind: input.kind, name: null, path: absolute };
}

function uniquePaths(values, field, options = {}) {
  if (!Array.isArray(values)) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 必须是数组。`, 409, { field });
  const normalized = values.map((value, index) => relative(value, `${field}[${index}]`, options));
  if (new Set(normalized).size !== normalized.length) throw taskEnvironmentError('task_environment_plan_duplicate', `${field} 不能包含重复路径。`, 409, { field });
  return normalized;
}

function normalizeStep(value, serviceField, index) {
  const field = `${serviceField}.steps[${index}]`;
  const step = object(value, field);
  closed(step, new Set(['id', 'cwd', 'executable', 'args', 'inputs', 'outputs', 'required', 'timeoutMs']), field);
  if (typeof step.required !== 'boolean') throw taskEnvironmentError('task_environment_plan_invalid', `${field}.required 必须是 boolean。`, 409, { field: `${field}.required` });
  if (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1000 || step.timeoutMs > 1_800_000) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.timeoutMs 必须是 1000..1800000 的整数。`, 409, { field: `${field}.timeoutMs` });
  if (!Array.isArray(step.args) || step.args.some((argument) => typeof argument !== 'string')) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.args 必须是字符串数组。`, 409, { field: `${field}.args` });
  if (!Array.isArray(step.outputs) || step.outputs.length === 0) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.outputs 至少需要一个本地输出。`, 409, { field: `${field}.outputs` });
  const outputs = step.outputs.map((value, outputIndex) => {
    const outputField = `${field}.outputs[${outputIndex}]`;
    const output = object(value, outputField);
    closed(output, new Set(['path', 'kind']), outputField);
    if (!OUTPUT_KINDS.has(output.kind)) throw taskEnvironmentError('task_environment_plan_invalid', `${outputField}.kind 不受支持：${output.kind}。`, 409, { field: `${outputField}.kind` });
    return { path: relative(output.path, `${outputField}.path`), kind: output.kind };
  });
  if (new Set(outputs.map((output) => output.path)).size !== outputs.length) throw taskEnvironmentError('task_environment_plan_duplicate', `${field}.outputs 不能包含重复路径。`, 409, { field: `${field}.outputs` });
  return {
    id: identifier(step.id, `${field}.id`),
    cwd: relative(step.cwd, `${field}.cwd`, { dot: true }),
    executable: executable(step.executable, `${field}.executable`),
    args: [...step.args],
    inputs: uniquePaths(step.inputs, `${field}.inputs`),
    outputs,
    required: step.required,
    timeoutMs: step.timeoutMs,
  };
}

export function taskEnvironmentPlanDigest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function normalizeTaskEnvironmentPlan(value, { serviceSelectors = [] } = {}) {
  const plan = object(value, 'Environment Plan');
  closed(plan, new Set(['schemaVersion', 'identity', 'notApplicableReason', 'services']), 'Environment Plan');
  if (plan.schemaVersion !== TASK_ENVIRONMENT_PLAN_SCHEMA) throw taskEnvironmentError('task_environment_plan_schema_unsupported', `Environment Plan schemaVersion 必须是 ${TASK_ENVIRONMENT_PLAN_SCHEMA}。`, 409, { actual: plan.schemaVersion });
  if (!Array.isArray(plan.services)) throw taskEnvironmentError('task_environment_plan_invalid', 'Environment Plan.services 必须是数组。', 409, { field: 'services' });
  const expected = [...new Set(serviceSelectors)].sort();
  for (const selector of expected) if (!SELECTOR.test(selector)) throw taskEnvironmentError('task_environment_plan_scope_invalid', `Task Service selector 不合法：${selector}。`, 409, { selector });
  const services = plan.services.map((value, index) => {
    const field = `services[${index}]`;
    const service = object(value, field);
    closed(service, new Set(['selector', 'disposition', 'reason', 'steps']), field);
    const selector = text(service.selector, `${field}.selector`);
    if (!SELECTOR.test(selector)) throw taskEnvironmentError('task_environment_plan_scope_invalid', `${field}.selector 不合法。`, 409, { selector });
    if (!['required', 'not-applicable'].includes(service.disposition)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.disposition 不受支持。`, 409, { field: `${field}.disposition` });
    if (!Array.isArray(service.steps)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.steps 必须是数组。`, 409, { field: `${field}.steps` });
    const steps = service.steps.map((step, stepIndex) => normalizeStep(step, field, stepIndex));
    if (new Set(steps.map((step) => step.id)).size !== steps.length) throw taskEnvironmentError('task_environment_plan_duplicate', `${field}.steps id 不能重复。`, 409, { selector });
    const reason = service.reason === null || service.reason === undefined ? null : text(service.reason, `${field}.reason`);
    if (service.disposition === 'not-applicable' && (!reason || steps.length)) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 的 not-applicable 必须包含reason且不能包含steps。`, 409, { selector });
    if (service.disposition === 'required' && (reason || !steps.some((step) => step.required))) throw taskEnvironmentError('task_environment_plan_invalid', `${field} 的 required 必须至少包含一个required step且不能包含reason。`, 409, { selector });
    return { selector, disposition: service.disposition, reason, steps };
  });
  const actual = services.map((service) => service.selector).sort();
  if (new Set(actual).size !== actual.length) throw taskEnvironmentError('task_environment_plan_duplicate', 'Environment Plan Service selector 不能重复。', 409);
  const notApplicableReason = plan.notApplicableReason === null || plan.notApplicableReason === undefined ? null : text(plan.notApplicableReason, 'notApplicableReason');
  if (expected.length === 0) {
    if (services.length || !notApplicableReason) throw taskEnvironmentError('task_environment_plan_scope_incomplete', '没有Service scope的Task必须用notApplicableReason显式声明无需技术准备。', 409, { expected, actual });
  } else if (notApplicableReason || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw taskEnvironmentError('task_environment_plan_scope_incomplete', 'Environment Plan必须恰好覆盖Task Record中的全部Service scope。', 409, { expected, actual });
  }
  const payload = { schemaVersion: TASK_ENVIRONMENT_PLAN_SCHEMA, notApplicableReason, services };
  const identity = taskEnvironmentPlanDigest(payload);
  if (plan.identity !== undefined && plan.identity !== identity) throw taskEnvironmentError('task_environment_plan_identity_mismatch', 'Environment Plan identity 与内容不匹配。', 409, { expected: identity, actual: plan.identity });
  return { ...payload, identity };
}
