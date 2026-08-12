import crypto from 'node:crypto';
import path from 'node:path';

export const TASK_ENVIRONMENT_PLAN_SCHEMA = 'buildr.task-environment-plan/v2';
export const LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA = 'buildr.task-environment-plan/v1';
export const TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA = 'buildr.task-environment-plan-request/v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SELECTOR = /^service:[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXECUTABLE_KINDS = new Set(['workspace-foundation', 'project', 'service', 'absolute']);
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
  if (input.kind === 'service' || input.kind === 'project') return { kind: input.kind, name: null, path: relative(input.path, `${field}.path`) };
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

export function normalizePreparationStepDefinition(value, serviceField, index) {
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

const normalizeStep = normalizePreparationStepDefinition;

export function taskEnvironmentPlanDigest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function normalizeLegacyTaskEnvironmentPlan(value, { serviceSelectors = [] } = {}) {
  const plan = object(value, 'Environment Plan');
  closed(plan, new Set(['schemaVersion', 'identity', 'notApplicableReason', 'services']), 'Environment Plan');
  if (plan.schemaVersion !== LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA) throw taskEnvironmentError('task_environment_plan_schema_unsupported', `Legacy Environment Plan schemaVersion 必须是 ${LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA}。`, 409, { actual: plan.schemaVersion });
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
  const payload = { schemaVersion: LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA, notApplicableReason, services };
  const identity = taskEnvironmentPlanDigest(payload);
  if (plan.identity !== undefined && plan.identity !== identity) throw taskEnvironmentError('task_environment_plan_identity_mismatch', 'Environment Plan identity 与内容不匹配。', 409, { expected: identity, actual: plan.identity });
  return { ...payload, identity };
}

function normalizeRecipeSnapshot(value, field, selector) {
  const recipe = object(value, field);
  closed(recipe, new Set(['id', 'identity', 'title', 'required', 'steps']), field);
  if (typeof recipe.required !== 'boolean') throw taskEnvironmentError('task_environment_plan_invalid', `${field}.required 必须是 boolean。`, 409, { field: `${field}.required` });
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.steps 必须是非空数组。`, 409, { field: `${field}.steps` });
  const steps = recipe.steps.map((step, index) => normalizePreparationStepDefinition(step, field, index));
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw taskEnvironmentError('task_environment_plan_duplicate', `${field}.steps id 不能重复。`, 409, { selector });
  const payload = {
    id: identifier(recipe.id, `${field}.id`),
    title: recipe.title === null || recipe.title === undefined ? null : text(recipe.title, `${field}.title`),
    required: recipe.required,
    steps,
  };
  const selectorMatch = /^(project|service):([^/]+)(?:\/(.+))?$/.exec(selector);
  const project = selectorMatch?.[2];
  const scope = selectorMatch?.[1] === 'project' ? { kind: 'project', service: null } : { kind: 'service', service: selectorMatch?.[3] };
  const derived = taskEnvironmentPlanDigest({ project, id: payload.id, title: payload.title, scope, required: payload.required, steps: payload.steps });
  if (recipe.identity !== derived) throw taskEnvironmentError('task_environment_recipe_identity_mismatch', `${field}.identity 与Recipe快照不匹配。`, 409, { expected: derived, actual: recipe.identity });
  return { ...payload, identity: derived };
}

function normalizePlanScope(value, field, scopeSelectors) {
  const scope = object(value, field);
  closed(scope, new Set(['selector', 'disposition', 'reason', 'recipes']), field);
  const selector = text(scope.selector, `${field}.selector`);
  if (!scopeSelectors.has(selector)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', `Plan scope不属于Task：${selector}。`, 409, { selector });
  if (!['required', 'not-applicable'].includes(scope.disposition)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.disposition 不受支持。`, 409, { field: `${field}.disposition` });
  const reason = text(scope.reason, `${field}.reason`);
  if (!Array.isArray(scope.recipes)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.recipes 必须是数组。`, 409, { field: `${field}.recipes` });
  const recipes = scope.recipes.map((recipe, index) => normalizeRecipeSnapshot(recipe, `${field}.recipes[${index}]`, selector));
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) throw taskEnvironmentError('task_environment_plan_duplicate', `${field}.recipes id 不能重复。`, 409, { selector });
  if (scope.disposition === 'required' && (!recipes.length || !recipes.some((recipe) => recipe.required))) throw taskEnvironmentError('task_environment_plan_invalid', `${field} required scope必须至少选择一个required Recipe。`, 409, { selector });
  if (scope.disposition === 'not-applicable' && recipes.length) throw taskEnvironmentError('task_environment_plan_invalid', `${field} not-applicable scope不能包含Recipe。`, 409, { selector });
  return { selector, disposition: scope.disposition, reason, recipes };
}

export function normalizeTaskEnvironmentPlanV2(value, { scopeSelectors = [] } = {}) {
  const plan = object(value, 'Environment Plan');
  closed(plan, new Set(['schemaVersion', 'identity', 'notApplicableReason', 'projects']), 'Environment Plan');
  if (plan.schemaVersion !== TASK_ENVIRONMENT_PLAN_SCHEMA) throw taskEnvironmentError('task_environment_plan_schema_unsupported', `Environment Plan schemaVersion 必须是 ${TASK_ENVIRONMENT_PLAN_SCHEMA}。`, 409, { actual: plan.schemaVersion });
  if (!Array.isArray(plan.projects)) throw taskEnvironmentError('task_environment_plan_invalid', 'Environment Plan.projects 必须是数组。', 409, { field: 'projects' });
  const expected = new Set(scopeSelectors);
  const notApplicableReason = plan.notApplicableReason === undefined || plan.notApplicableReason === null ? null : text(plan.notApplicableReason, 'notApplicableReason');
  if (expected.size === 0 && (plan.projects.length !== 0 || !notApplicableReason)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', '没有Project/Service scope的Task必须显式声明notApplicableReason。', 409);
  if (expected.size > 0 && (plan.projects.length === 0 || notApplicableReason)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', '有Project/Service scope的Task不能使用顶层notApplicableReason。', 409);
  const projects = plan.projects.map((value, projectIndex) => {
    const field = `projects[${projectIndex}]`;
    const project = object(value, field);
    closed(project, new Set(['project', 'source', 'scopes']), field);
    const projectCode = identifier(project.project, `${field}.project`);
    const source = object(project.source, `${field}.source`);
    closed(source, new Set(['kind', 'path', 'identity']), `${field}.source`);
    if (!['project-declaration', 'task-inline'].includes(source.kind)) throw taskEnvironmentError('task_environment_plan_source_invalid', `${field}.source.kind 不受支持。`, 409, { field: `${field}.source.kind` });
    const normalizedSource = source.kind === 'project-declaration'
      ? { kind: source.kind, path: relative(source.path, `${field}.source.path`), identity: text(source.identity, `${field}.source.identity`) }
      : { kind: source.kind, path: null, identity: null };
    if (source.kind === 'task-inline' && (source.path !== null && source.path !== undefined || source.identity !== null && source.identity !== undefined)) throw taskEnvironmentError('task_environment_plan_field_forbidden', `${field}.source task-inline不支持path/identity。`, 409, { field: `${field}.source` });
    if (!Array.isArray(project.scopes) || project.scopes.length === 0) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.scopes 必须是非空数组。`, 409, { field: `${field}.scopes` });
    const scopes = project.scopes.map((scope, index) => normalizePlanScope(scope, `${field}.scopes[${index}]`, expected));
    return { project: projectCode, source: normalizedSource, scopes };
  });
  if (new Set(projects.map((project) => project.project)).size !== projects.length) throw taskEnvironmentError('task_environment_plan_duplicate', 'Environment Plan Project不能重复。', 409);
  const actual = projects.flatMap((project) => project.scopes.map((scope) => scope.selector));
  if (new Set(actual).size !== actual.length || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw taskEnvironmentError('task_environment_plan_scope_incomplete', 'Environment Plan必须恰好覆盖Task Project/Service scope。', 409, { expected: [...expected].sort(), actual: [...actual].sort() });
  for (const project of projects) for (const scope of project.scopes) {
    const owned = scope.selector === `project:${project.project}` || scope.selector.startsWith(`service:${project.project}/`);
    if (!owned) throw taskEnvironmentError('task_environment_plan_scope_incomplete', `Scope不属于Plan Project：${scope.selector}。`, 409, { project: project.project, selector: scope.selector });
  }
  const payload = { schemaVersion: TASK_ENVIRONMENT_PLAN_SCHEMA, ...(notApplicableReason ? { notApplicableReason } : {}), projects };
  const derived = taskEnvironmentPlanDigest(payload);
  if (plan.identity !== derived) throw taskEnvironmentError('task_environment_plan_identity_mismatch', 'Environment Plan identity 与内容不匹配。', 409, { expected: derived, actual: plan.identity });
  return { ...payload, identity: derived };
}

function normalizeRequestScope(value, field, expected) {
  const scope = object(value, field);
  closed(scope, new Set(['selector', 'disposition', 'reason', 'recipeIds', 'recipes']), field);
  const selector = text(scope.selector, `${field}.selector`);
  if (!expected.has(selector)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', `Plan Request scope不属于Task：${selector}。`, 409, { selector });
  if (!['required', 'not-applicable'].includes(scope.disposition)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.disposition 不受支持。`, 409);
  const reason = text(scope.reason, `${field}.reason`);
  if (scope.recipeIds !== undefined && !Array.isArray(scope.recipeIds)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.recipeIds 必须是数组。`, 409);
  const recipeIds = scope.recipeIds === undefined ? null : scope.recipeIds.map((id, index) => identifier(id, `${field}.recipeIds[${index}]`));
  const recipes = scope.recipes === undefined ? null : scope.recipes;
  if (recipes !== null && !Array.isArray(recipes)) throw taskEnvironmentError('task_environment_plan_invalid', `${field}.recipes 必须是数组。`, 409);
  if (scope.disposition === 'not-applicable' && ((recipeIds?.length || 0) || (recipes?.length || 0))) throw taskEnvironmentError('task_environment_plan_invalid', `${field} not-applicable不能选择Recipe。`, 409);
  if (scope.disposition === 'required' && !((recipeIds?.length || 0) || (recipes?.length || 0))) throw taskEnvironmentError('task_environment_plan_invalid', `${field} required必须选择Recipe。`, 409);
  return { selector, disposition: scope.disposition, reason, recipeIds, recipes };
}

export function normalizeTaskEnvironmentPlanRequest(value, { scopeSelectors = [] } = {}) {
  const request = object(value, 'Environment Plan Request');
  closed(request, new Set(['schemaVersion', 'notApplicableReason', 'projects']), 'Environment Plan Request');
  if (request.schemaVersion !== TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA) throw taskEnvironmentError('task_environment_plan_schema_unsupported', `Plan Request schemaVersion 必须是 ${TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA}。`, 409, { actual: request.schemaVersion });
  if (!Array.isArray(request.projects)) throw taskEnvironmentError('task_environment_plan_invalid', 'Plan Request.projects 必须是数组。', 409);
  const expected = new Set(scopeSelectors);
  const notApplicableReason = request.notApplicableReason === undefined || request.notApplicableReason === null ? null : text(request.notApplicableReason, 'notApplicableReason');
  if (expected.size === 0 && (request.projects.length !== 0 || !notApplicableReason)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', '没有Project/Service scope的Task必须显式声明notApplicableReason。', 409);
  if (expected.size > 0 && (request.projects.length === 0 || notApplicableReason)) throw taskEnvironmentError('task_environment_plan_scope_incomplete', '有Project/Service scope的Task不能使用顶层notApplicableReason。', 409);
  const projects = request.projects.map((value, index) => {
    const field = `projects[${index}]`;
    const project = object(value, field);
    closed(project, new Set(['project', 'source', 'scopes']), field);
    const source = object(project.source, `${field}.source`);
    closed(source, new Set(['kind', 'identity']), `${field}.source`);
    if (!['project-declaration', 'task-inline'].includes(source.kind)) throw taskEnvironmentError('task_environment_plan_source_invalid', `${field}.source.kind 不受支持。`, 409);
    if (source.kind === 'task-inline' && source.identity !== undefined && source.identity !== null) throw taskEnvironmentError('task_environment_plan_field_forbidden', `${field}.source.identity 只适用于project-declaration。`, 409, { field: `${field}.source.identity` });
    const scopes = Array.isArray(project.scopes) ? project.scopes.map((scope, scopeIndex) => normalizeRequestScope(scope, `${field}.scopes[${scopeIndex}]`, expected)) : [];
    for (const scope of scopes) {
      if (source.kind === 'project-declaration' && scope.recipes !== null) throw taskEnvironmentError('task_environment_plan_field_forbidden', 'project-declaration来源只接受recipeIds。', 409, { selector: scope.selector });
      if (source.kind === 'task-inline' && scope.recipeIds !== null) throw taskEnvironmentError('task_environment_plan_field_forbidden', 'task-inline来源只接受recipes。', 409, { selector: scope.selector });
    }
    return { project: identifier(project.project, `${field}.project`), source: { kind: source.kind, identity: source.identity === undefined || source.identity === null ? null : text(source.identity, `${field}.source.identity`) }, scopes };
  });
  const actual = projects.flatMap((project) => project.scopes.map((scope) => scope.selector));
  if (new Set(projects.map((project) => project.project)).size !== projects.length || new Set(actual).size !== actual.length || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw taskEnvironmentError('task_environment_plan_scope_incomplete', 'Plan Request必须恰好覆盖Task Project/Service scope。', 409, { expected: [...expected].sort(), actual: [...actual].sort() });
  return { schemaVersion: TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA, ...(notApplicableReason ? { notApplicableReason } : {}), projects };
}

export function normalizeTaskEnvironmentPlan(value, options = {}) {
  if (value?.schemaVersion === LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA) return normalizeLegacyTaskEnvironmentPlan(value, options);
  return normalizeTaskEnvironmentPlanV2(value, options);
}
