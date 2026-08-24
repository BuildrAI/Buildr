import path from 'node:path';

import { isTaskRecordId } from './task-record.mjs';
import {
  LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA,
  LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA_V2,
  normalizeTaskEnvironmentPlan,
  TASK_ENVIRONMENT_PLAN_SCHEMA,
} from './task-environment-plan.mjs';

export const TASK_ENVIRONMENT_RECEIPT_SCHEMA = 'buildr.task-environment-receipt/v6';
export const LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V5 = 'buildr.task-environment-receipt/v5';
export const LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V4 = 'buildr.task-environment-receipt/v4';
export const LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V3 = 'buildr.task-environment-receipt/v3';
export const LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA = 'buildr.task-environment-receipt/v2';
export const TASK_ENVIRONMENT_RESULT_SCHEMA = 'buildr.task-environment-result/v4';
export const TASK_ENVIRONMENT_PLAN_RESULT_SCHEMA = 'buildr.task-environment-plan-result/v2';
export const TASK_ENVIRONMENT_STATUSES = Object.freeze(['ready', 'blocked', 'cleaned']);
export const TASK_ENVIRONMENT_RESOURCE_PROVIDERS = Object.freeze(['local-app-preview']);

const SCOPE_KINDS = new Set(['workspace', 'project', 'service']);
const PROBE_STATUSES = new Set(['ready', 'blocked', 'not-applicable']);
const RESOURCE_STATUSES = new Set(['running', 'stale', 'released']);
const DEPENDENCY_ROOT_STATUSES = new Set(['ready', 'missing', 'drifted', 'failed', 'blocked', 'not-applicable']);
const PREPARATION_STEP_STATUSES = new Set(['ready', 'missing', 'drifted', 'failed', 'blocked']);
const PREPARATION_OUTPUT_STATUSES = new Set(['ready', 'missing', 'blocked']);
const TEXT_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/;

export function taskEnvironmentError(code, message, status = 400, details = undefined, nextAction = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  if (nextAction !== undefined) error.nextAction = nextAction;
  error.taskEnvironmentBusiness = true;
  return error;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw taskEnvironmentError('task_environment_field_invalid', `${field} 必须是对象。`, 400, { field });
  }
  return value;
}

function closed(value, fields, field) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw taskEnvironmentError('task_environment_field_forbidden', `Environment Receipt 不支持字段：${field ? `${field}.` : ''}${key}。`, 400, { field: field ? `${field}.${key}` : key });
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw taskEnvironmentError('task_environment_field_invalid', `${field} 必须是非空字符串。`, 400, { field });
  return value.trim();
}

function identity(value, field) {
  const normalized = text(value, field);
  if (!TEXT_IDENTITY.test(normalized)) throw taskEnvironmentError('task_environment_identity_invalid', `${field} 不是合法 identity。`, 400, { field, value });
  return normalized;
}

function absolute(value, field) {
  const normalized = text(value, field);
  if (!path.isAbsolute(normalized) || path.normalize(normalized) !== normalized) throw taskEnvironmentError('task_environment_path_invalid', `${field} 必须是规范化绝对路径。`, 400, { field, value });
  return normalized;
}

function timestamp(value, field) {
  const normalized = text(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw taskEnvironmentError('task_environment_timestamp_invalid', `${field} 必须是 ISO 时间。`, 400, { field });
  return normalized;
}

function nullableText(value, field) {
  return value === null || value === undefined ? null : text(value, field);
}

function normalizeProbe(value, field) {
  const probe = object(value, field);
  closed(probe, new Set(['status', 'identity', 'observedAt', 'diagnostic']), field);
  if (!PROBE_STATUSES.has(probe.status)) throw taskEnvironmentError('task_environment_probe_invalid', `${field}.status 不受支持：${probe.status}。`, 400, { field: `${field}.status` });
  return {
    status: probe.status,
    identity: probe.identity === null || probe.identity === undefined ? null : text(probe.identity, `${field}.identity`),
    observedAt: timestamp(probe.observedAt, `${field}.observedAt`),
    diagnostic: nullableText(probe.diagnostic, `${field}.diagnostic`),
  };
}

function normalizeProvider(value, field) {
  if (value === null) return null;
  const provider = object(value, field);
  closed(provider, new Set(['capability', 'selector', 'evidence']), field);
  return {
    capability: identity(provider.capability, `${field}.capability`),
    selector: identity(provider.selector, `${field}.selector`),
    evidence: absolute(provider.evidence, `${field}.evidence`),
  };
}

function normalizeRuntimeInvocation(value) {
  if (value === null || value === undefined) return null;
  const field = 'runtimeInvocation';
  const invocation = object(value, field);
  closed(invocation, new Set(['kind', 'executable', 'version', 'identity', 'searchPrefix', 'source']), field);
  if (!['node', 'other'].includes(invocation.kind)) throw taskEnvironmentError('task_environment_runtime_invocation_invalid', `${field}.kind 不受支持。`, 400, { field: `${field}.kind` });
  return {
    kind: invocation.kind,
    executable: absolute(invocation.executable, `${field}.executable`),
    version: text(invocation.version, `${field}.version`),
    identity: text(invocation.identity, `${field}.identity`),
    searchPrefix: absolute(invocation.searchPrefix, `${field}.searchPrefix`),
    source: identity(invocation.source, `${field}.source`),
  };
}

function normalizeScope(value, index, workspaceRoot, schemaVersion) {
  const field = `scopes[${index}]`;
  const scope = object(value, field);
  closed(scope, new Set(['selector', 'kind', 'project', 'service', 'sourcePath', 'executionRoot', 'validationRoot', 'shared', 'provider', 'runtime', 'cli', 'dependencies', 'preparation', 'projection']), field);
  if (!SCOPE_KINDS.has(scope.kind)) throw taskEnvironmentError('task_environment_scope_invalid', `${field}.kind 不受支持：${scope.kind}。`, 400, { field: `${field}.kind` });
  if (typeof scope.shared !== 'boolean') throw taskEnvironmentError('task_environment_field_invalid', `${field}.shared 必须是 boolean。`, 400, { field: `${field}.shared` });
  const sourcePath = text(scope.sourcePath, `${field}.sourcePath`).replaceAll('\\', '/');
  if (path.posix.isAbsolute(sourcePath) || path.posix.normalize(sourcePath) !== sourcePath || sourcePath.startsWith('../')) throw taskEnvironmentError('task_environment_path_invalid', `${field}.sourcePath 必须是 Workspace 相对路径。`, 400, { field: `${field}.sourcePath` });
  const executionRoot = absolute(scope.executionRoot, `${field}.executionRoot`);
  const validationRoot = absolute(scope.validationRoot, `${field}.validationRoot`);
  if (!scope.shared && !inside(validationRoot, executionRoot) && !inside(executionRoot, validationRoot)) {
    throw taskEnvironmentError('task_environment_scope_invalid', `${field} 的 executionRoot 与 validationRoot 不属于同一任务根。`, 400, { field });
  }
  const preparationReceipt = [TASK_ENVIRONMENT_RECEIPT_SCHEMA, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V5, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V4].includes(schemaVersion);
  if (preparationReceipt && !scope.preparation) throw taskEnvironmentError('task_environment_field_invalid', `${field}.preparation 必须存在。`, 400, { field: `${field}.preparation` });
  if (!preparationReceipt && !scope.dependencies) throw taskEnvironmentError('task_environment_field_invalid', `${field}.dependencies 必须存在。`, 400, { field: `${field}.dependencies` });
  if (preparationReceipt && scope.dependencies !== undefined) throw taskEnvironmentError('task_environment_field_forbidden', `Environment Receipt preparation schema不支持字段：${field}.dependencies。`, 400, { field: `${field}.dependencies` });
  if (!preparationReceipt && scope.preparation !== undefined) throw taskEnvironmentError('task_environment_field_forbidden', `Legacy Environment Receipt 不支持字段：${field}.preparation。`, 400, { field: `${field}.preparation` });
  return {
    selector: identity(scope.selector, `${field}.selector`),
    kind: scope.kind,
    project: scope.project === null || scope.project === undefined ? null : identity(scope.project, `${field}.project`),
    service: scope.service === null || scope.service === undefined ? null : identity(scope.service, `${field}.service`),
    sourcePath,
    executionRoot,
    validationRoot,
    shared: scope.shared,
    provider: normalizeProvider(scope.provider, `${field}.provider`),
    runtime: normalizeProbe(scope.runtime, `${field}.runtime`),
    cli: normalizeProbe(scope.cli, `${field}.cli`),
    ...(preparationReceipt ? { preparation: normalizeProbe(scope.preparation, `${field}.preparation`) } : { dependencies: normalizeProbe(scope.dependencies, `${field}.dependencies`) }),
    projection: normalizeProbe(scope.projection, `${field}.projection`),
  };
}

function normalizePreparationService(value, index, scopes, stepIds) {
  const field = `preparationServices[${index}]`;
  const service = object(value, field);
  closed(service, new Set(['selector', 'disposition', 'status', 'stepIds', 'observedAt', 'diagnostic']), field);
  const selector = identity(service.selector, `${field}.selector`);
  if (!scopes.has(selector)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', `Preparation Service scope 不属于当前Environment：${selector}。`, 409, { selector });
  if (!['required', 'not-applicable'].includes(service.disposition)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field}.disposition 不受支持。`, 400, { field: `${field}.disposition` });
  if (!['ready', 'blocked', 'not-applicable'].includes(service.status)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field}.status 不受支持。`, 400, { field: `${field}.status` });
  if (!Array.isArray(service.stepIds)) throw taskEnvironmentError('task_environment_field_invalid', `${field}.stepIds 必须是数组。`, 400, { field: `${field}.stepIds` });
  const normalizedStepIds = service.stepIds.map((stepId, stepIndex) => identity(stepId, `${field}.stepIds[${stepIndex}]`));
  for (const stepId of normalizedStepIds) if (!stepIds.has(stepId)) throw taskEnvironmentError('task_environment_preparation_step_unknown', `Preparation Service引用未知Step：${stepId}。`, 409, { selector, stepId });
  return { selector, disposition: service.disposition, status: service.status, stepIds: normalizedStepIds, observedAt: timestamp(service.observedAt, `${field}.observedAt`), diagnostic: nullableText(service.diagnostic, `${field}.diagnostic`) };
}

function normalizePreparationDeclaration(value, index) {
  const field = `preparationDeclarations[${index}]`;
  const declaration = object(value, field);
  closed(declaration, new Set(['project', 'source', 'path', 'identity', 'preparedIdentity', 'status', 'observedAt', 'diagnostic']), field);
  if (!['project-declaration', 'task-inline'].includes(declaration.source)) throw taskEnvironmentError('task_environment_preparation_source_invalid', `${field}.source 不受支持。`, 400, { field: `${field}.source` });
  if (!['ready', 'missing', 'drifted', 'blocked'].includes(declaration.status)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field}.status 不受支持。`, 400, { field: `${field}.status` });
  if (declaration.source === 'project-declaration' && !declaration.path) throw taskEnvironmentError('task_environment_field_invalid', `${field}.path 必须存在。`, 400, { field: `${field}.path` });
  if (declaration.source === 'task-inline' && (declaration.path !== null || declaration.identity !== null || declaration.preparedIdentity !== null)) throw taskEnvironmentError('task_environment_field_invalid', `${field} task-inline不得声明path/identity。`, 400, { field });
  return {
    project: identity(declaration.project, `${field}.project`),
    source: declaration.source,
    path: declaration.path === null ? null : absolute(declaration.path, `${field}.path`),
    identity: nullableText(declaration.identity, `${field}.identity`),
    preparedIdentity: nullableText(declaration.preparedIdentity, `${field}.preparedIdentity`),
    status: declaration.status,
    observedAt: timestamp(declaration.observedAt, `${field}.observedAt`),
    diagnostic: nullableText(declaration.diagnostic, `${field}.diagnostic`),
  };
}

function normalizePreparationScope(value, index, scopes, recipeIds) {
  const field = `preparationScopes[${index}]`;
  const item = object(value, field);
  closed(item, new Set(['selector', 'disposition', 'status', 'recipeIds', 'observedAt', 'diagnostic']), field);
  const selector = identity(item.selector, `${field}.selector`);
  if (!scopes.has(selector)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', `Preparation scope不属于Environment：${selector}。`, 409, { selector });
  if (!['required', 'not-applicable'].includes(item.disposition) || !['ready', 'blocked', 'not-applicable'].includes(item.status)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field} disposition/status不受支持。`, 400, { field });
  if (!Array.isArray(item.recipeIds)) throw taskEnvironmentError('task_environment_field_invalid', `${field}.recipeIds 必须是数组。`, 400, { field: `${field}.recipeIds` });
  const normalizedIds = item.recipeIds.map((value, recipeIndex) => identity(value, `${field}.recipeIds[${recipeIndex}]`));
  for (const recipeId of normalizedIds) if (!recipeIds.has(recipeId)) throw taskEnvironmentError('task_environment_preparation_recipe_unknown', `Preparation scope引用未知Recipe：${recipeId}。`, 409, { selector, recipeId });
  return { selector, disposition: item.disposition, status: item.status, recipeIds: normalizedIds, observedAt: timestamp(item.observedAt, `${field}.observedAt`), diagnostic: nullableText(item.diagnostic, `${field}.diagnostic`) };
}

function normalizePreparationRecipe(value, index, scopes, stepIds) {
  const field = `preparationRecipes[${index}]`;
  const recipe = object(value, field);
  closed(recipe, new Set(['id', 'project', 'scope', 'recipe', 'source', 'required', 'identity', 'preparedIdentity', 'status', 'stepIds', 'observedAt', 'diagnostic']), field);
  const scope = identity(recipe.scope, `${field}.scope`);
  if (!scopes.has(scope)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', `Preparation Recipe scope不属于Environment：${scope}。`, 409, { scope });
  if (!['project-declaration', 'task-inline'].includes(recipe.source) || !['ready', 'blocked'].includes(recipe.status)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field} source/status不受支持。`, 400, { field });
  if (typeof recipe.required !== 'boolean' || !Array.isArray(recipe.stepIds)) throw taskEnvironmentError('task_environment_field_invalid', `${field}.required/stepIds无效。`, 400, { field });
  const normalizedStepIds = recipe.stepIds.map((value, stepIndex) => identity(value, `${field}.stepIds[${stepIndex}]`));
  for (const stepId of normalizedStepIds) if (!stepIds.has(stepId)) throw taskEnvironmentError('task_environment_preparation_step_unknown', `Preparation Recipe引用未知Step：${stepId}。`, 409, { stepId });
  return { id: identity(recipe.id, `${field}.id`), project: identity(recipe.project, `${field}.project`), scope, recipe: identity(recipe.recipe, `${field}.recipe`), source: recipe.source, required: recipe.required, identity: nullableText(recipe.identity, `${field}.identity`), preparedIdentity: text(recipe.preparedIdentity, `${field}.preparedIdentity`), status: recipe.status, stepIds: normalizedStepIds, observedAt: timestamp(recipe.observedAt, `${field}.observedAt`), diagnostic: nullableText(recipe.diagnostic, `${field}.diagnostic`) };
}

function normalizePreparationStep(value, index, scopes, { v5 = false } = {}) {
  const field = `preparationSteps[${index}]`;
  const step = object(value, field);
  closed(step, new Set(['id', 'scope', 'recipe', 'required', 'executed', 'cwd', 'executable', 'executableIdentity', 'preparedExecutableIdentity', 'inputs', 'outputs', 'status', 'observedAt', 'diagnostic']), field);
  const scope = identity(step.scope, `${field}.scope`);
  if (!scopes.has(scope)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', `Preparation Step scope 不属于当前Environment：${scope}。`, 409, { scope });
  if (typeof step.required !== 'boolean') throw taskEnvironmentError('task_environment_field_invalid', `${field}.required 必须是boolean。`, 400, { field: `${field}.required` });
  if (v5 && (typeof step.executed !== 'boolean' || !step.recipe)) throw taskEnvironmentError('task_environment_field_invalid', `${field}.recipe/executed 必须存在。`, 400, { field });
  if (!PREPARATION_STEP_STATUSES.has(step.status)) throw taskEnvironmentError('task_environment_preparation_status_invalid', `${field}.status 不受支持：${step.status}。`, 400, { field: `${field}.status` });
  if (!Array.isArray(step.inputs) || !Array.isArray(step.outputs)) throw taskEnvironmentError('task_environment_field_invalid', `${field}.inputs/outputs 必须是数组。`, 400, { field });
  const inputs = step.inputs.map((input, inputIndex) => {
    const inputField = `${field}.inputs[${inputIndex}]`;
    const item = object(input, inputField);
    closed(item, new Set(['path', 'identity', 'preparedIdentity']), inputField);
    return { path: absolute(item.path, `${inputField}.path`), identity: nullableText(item.identity, `${inputField}.identity`), preparedIdentity: nullableText(item.preparedIdentity, `${inputField}.preparedIdentity`) };
  });
  const outputs = step.outputs.map((output, outputIndex) => {
    const outputField = `${field}.outputs[${outputIndex}]`;
    const item = object(output, outputField);
    closed(item, new Set(['path', 'kind', 'status', 'diagnostic']), outputField);
    if (!['file', 'directory', 'executable'].includes(item.kind)) throw taskEnvironmentError('task_environment_preparation_output_invalid', `${outputField}.kind 不受支持。`, 400, { field: `${outputField}.kind` });
    if (!PREPARATION_OUTPUT_STATUSES.has(item.status)) throw taskEnvironmentError('task_environment_preparation_output_invalid', `${outputField}.status 不受支持。`, 400, { field: `${outputField}.status` });
    return { path: absolute(item.path, `${outputField}.path`), kind: item.kind, status: item.status, diagnostic: nullableText(item.diagnostic, `${outputField}.diagnostic`) };
  });
  return {
    id: identity(step.id, `${field}.id`),
    scope,
    ...(v5 ? { recipe: identity(step.recipe, `${field}.recipe`), executed: step.executed } : {}),
    required: step.required,
    cwd: absolute(step.cwd, `${field}.cwd`),
    executable: absolute(step.executable, `${field}.executable`),
    executableIdentity: nullableText(step.executableIdentity, `${field}.executableIdentity`),
    preparedExecutableIdentity: nullableText(step.preparedExecutableIdentity, `${field}.preparedExecutableIdentity`),
    inputs,
    outputs,
    status: step.status,
    observedAt: timestamp(step.observedAt, `${field}.observedAt`),
    diagnostic: nullableText(step.diagnostic, `${field}.diagnostic`),
  };
}

function normalizeResource(value, index, scopes) {
  const field = `resources[${index}]`;
  const resource = object(value, field);
  closed(resource, new Set(['id', 'kind', 'scope', 'provider', 'identity', 'handle', 'status', 'probe', 'registeredAt', 'updatedAt']), field);
  const provider = identity(resource.provider, `${field}.provider`);
  if (!TASK_ENVIRONMENT_RESOURCE_PROVIDERS.includes(provider)) throw taskEnvironmentError('task_environment_resource_provider_unknown', `资源 provider 未登记：${provider}。`, 409, { provider });
  const scope = identity(resource.scope, `${field}.scope`);
  if (!scopes.has(scope)) throw taskEnvironmentError('task_environment_resource_scope_invalid', `资源 scope 不属于当前 Environment：${scope}。`, 409, { scope });
  const handle = object(resource.handle, `${field}.handle`);
  closed(handle, new Set(['instance']), `${field}.handle`);
  const runtimeIdentity = object(resource.identity, `${field}.identity`);
  closed(runtimeIdentity, new Set(['productCheckout', 'url', 'port', 'pid', 'providerIdentity']), `${field}.identity`);
  let parsedUrl;
  try { parsedUrl = new URL(text(runtimeIdentity.url, `${field}.identity.url`)); } catch { throw taskEnvironmentError('task_environment_resource_identity_invalid', `${field}.identity.url 必须是合法 URL。`, 400, { field: `${field}.identity.url` }); }
  if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw taskEnvironmentError('task_environment_resource_identity_invalid', `${field}.identity.url 必须是本机 HTTP 地址。`, 400, { field: `${field}.identity.url` });
  if (!Number.isInteger(runtimeIdentity.port) || runtimeIdentity.port < 1 || runtimeIdentity.port > 65535) throw taskEnvironmentError('task_environment_resource_identity_invalid', `${field}.identity.port 必须是有效端口。`, 400, { field: `${field}.identity.port` });
  if (!Number.isInteger(runtimeIdentity.pid) || runtimeIdentity.pid < 1) throw taskEnvironmentError('task_environment_resource_identity_invalid', `${field}.identity.pid 必须是有效进程 ID。`, 400, { field: `${field}.identity.pid` });
  if (!RESOURCE_STATUSES.has(resource.status)) throw taskEnvironmentError('task_environment_resource_status_invalid', `资源状态不受支持：${resource.status}。`, 400, { field: `${field}.status` });
  return {
    id: identity(resource.id, `${field}.id`),
    kind: identity(resource.kind, `${field}.kind`),
    scope,
    provider,
    identity: { productCheckout: absolute(runtimeIdentity.productCheckout, `${field}.identity.productCheckout`), url: parsedUrl.toString().replace(/\/$/, ''), port: runtimeIdentity.port, pid: runtimeIdentity.pid, providerIdentity: text(runtimeIdentity.providerIdentity, `${field}.identity.providerIdentity`) },
    handle: { instance: identity(handle.instance, `${field}.handle.instance`) },
    status: resource.status,
    probe: normalizeProbe(resource.probe, `${field}.probe`),
    registeredAt: timestamp(resource.registeredAt, `${field}.registeredAt`),
    updatedAt: timestamp(resource.updatedAt, `${field}.updatedAt`),
  };
}

function normalizeDependencyRoot(value, index, scopes) {
  const field = `dependencyRoots[${index}]`;
  const dependency = object(value, field);
  closed(dependency, new Set([
    'id', 'scope', 'project', 'service', 'requiredBy', 'root', 'manager', 'manifest', 'lockfile',
    'manifestIdentity', 'lockfileIdentity', 'preparedManifestIdentity', 'preparedLockfileIdentity',
    'required', 'status', 'observedAt', 'diagnostic',
  ]), field);
  const scope = identity(dependency.scope, `${field}.scope`);
  if (!scopes.has(scope)) throw taskEnvironmentError('task_environment_dependency_scope_invalid', `依赖根 scope 不属于当前 Environment：${scope}。`, 409, { scope });
  if (!Array.isArray(dependency.requiredBy) || dependency.requiredBy.length === 0) throw taskEnvironmentError('task_environment_dependency_required_by_invalid', `${field}.requiredBy 必须是非空数组。`, 400, { field: `${field}.requiredBy` });
  const requiredBy = dependency.requiredBy.map((selector, requiredByIndex) => identity(selector, `${field}.requiredBy[${requiredByIndex}]`));
  for (const selector of requiredBy) if (!scopes.has(selector)) throw taskEnvironmentError('task_environment_dependency_scope_invalid', `依赖根 requiredBy scope 不属于当前 Environment：${selector}。`, 409, { scope: selector });
  if (dependency.manager !== 'npm') throw taskEnvironmentError('task_environment_dependency_manager_unsupported', `依赖根 package manager 不受支持：${dependency.manager}。`, 409, { manager: dependency.manager });
  if (typeof dependency.required !== 'boolean') throw taskEnvironmentError('task_environment_field_invalid', `${field}.required 必须是 boolean。`, 400, { field: `${field}.required` });
  if (!DEPENDENCY_ROOT_STATUSES.has(dependency.status)) throw taskEnvironmentError('task_environment_dependency_status_invalid', `${field}.status 不受支持：${dependency.status}。`, 400, { field: `${field}.status` });
  const root = absolute(dependency.root, `${field}.root`);
  const manifest = absolute(dependency.manifest, `${field}.manifest`);
  const lockfile = absolute(dependency.lockfile, `${field}.lockfile`);
  if (!inside(root, manifest) || !inside(root, lockfile)) throw taskEnvironmentError('task_environment_dependency_path_invalid', `${field} 的 manifest/lockfile 必须位于 dependency root 内。`, 400, { field });
  return {
    id: identity(dependency.id, `${field}.id`),
    scope,
    project: identity(dependency.project, `${field}.project`),
    service: identity(dependency.service, `${field}.service`),
    requiredBy: [...new Set(requiredBy)],
    root,
    manager: dependency.manager,
    manifest,
    lockfile,
    manifestIdentity: nullableText(dependency.manifestIdentity, `${field}.manifestIdentity`),
    lockfileIdentity: nullableText(dependency.lockfileIdentity, `${field}.lockfileIdentity`),
    preparedManifestIdentity: nullableText(dependency.preparedManifestIdentity, `${field}.preparedManifestIdentity`),
    preparedLockfileIdentity: nullableText(dependency.preparedLockfileIdentity, `${field}.preparedLockfileIdentity`),
    required: dependency.required,
    status: dependency.status,
    observedAt: timestamp(dependency.observedAt, `${field}.observedAt`),
    diagnostic: nullableText(dependency.diagnostic, `${field}.diagnostic`),
  };
}

function normalizeLatest(value) {
  const latest = object(value, 'latest');
  closed(latest, new Set(['ready', 'cleanup']), 'latest');
  const ready = object(latest.ready, 'latest.ready');
  closed(ready, new Set(['status', 'observedAt', 'diagnostic']), 'latest.ready');
  if (!['ready', 'blocked'].includes(ready.status)) throw taskEnvironmentError('task_environment_status_invalid', `latest.ready.status 不受支持：${ready.status}。`, 400, { field: 'latest.ready.status' });
  let cleanup = null;
  if (latest.cleanup !== null && latest.cleanup !== undefined) {
    const input = object(latest.cleanup, 'latest.cleanup');
    closed(input, new Set(['status', 'completedAt', 'summary']), 'latest.cleanup');
    if (!['cleaned', 'blocked'].includes(input.status)) throw taskEnvironmentError('task_environment_cleanup_invalid', `latest.cleanup.status 不受支持：${input.status}。`, 400, { field: 'latest.cleanup.status' });
    cleanup = { status: input.status, completedAt: timestamp(input.completedAt, 'latest.cleanup.completedAt'), summary: text(input.summary, 'latest.cleanup.summary') };
  }
  return { ready: { status: ready.status, observedAt: timestamp(ready.observedAt, 'latest.ready.observedAt'), diagnostic: nullableText(ready.diagnostic, 'latest.ready.diagnostic') }, cleanup };
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function normalizeTaskEnvironmentReceipt(value, { expectedTaskId = null, expectedWorkspaceRoot = null } = {}) {
  const receipt = object(value, 'Environment Receipt');
  const supportedSchemas = new Set([LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V3, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V4, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V5, TASK_ENVIRONMENT_RECEIPT_SCHEMA]);
  if (!supportedSchemas.has(receipt.schemaVersion)) throw taskEnvironmentError('task_environment_schema_unsupported', 'Environment Receipt schemaVersion 必须是受支持的v2、v3、v4、v5或v6。', 409, { actual: receipt.schemaVersion });
  const v6 = receipt.schemaVersion === TASK_ENVIRONMENT_RECEIPT_SCHEMA;
  const v5 = receipt.schemaVersion === LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V5;
  const v4 = receipt.schemaVersion === LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V4;
  const v3 = receipt.schemaVersion === LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V3;
  closed(receipt, new Set(['schemaVersion', 'taskId', 'workspace', 'controller', 'runtimeInvocation', 'status', 'scopes', 'dependencyRoots', 'preparationPlan', 'preparationServices', 'preparationDeclarations', 'preparationScopes', 'preparationRecipes', 'preparationSteps', 'resources', 'latest', 'createdAt', 'updatedAt']), '');
  if (v3 && !Array.isArray(receipt.dependencyRoots)) throw taskEnvironmentError('task_environment_field_invalid', 'dependencyRoots 必须是数组。', 400, { field: 'dependencyRoots' });
  if (!v3 && receipt.dependencyRoots !== undefined) throw taskEnvironmentError('task_environment_field_forbidden', '只有Environment Receipt v3支持dependencyRoots。', 400, { field: 'dependencyRoots' });
  if (v4 && (!Array.isArray(receipt.preparationServices) || !Array.isArray(receipt.preparationSteps))) throw taskEnvironmentError('task_environment_field_invalid', 'v4 preparationServices/preparationSteps 必须是数组。', 400, { field: 'preparationServices' });
  if ((v5 || v6) && (!Array.isArray(receipt.preparationDeclarations) || !Array.isArray(receipt.preparationScopes) || !Array.isArray(receipt.preparationRecipes) || !Array.isArray(receipt.preparationSteps))) throw taskEnvironmentError('task_environment_field_invalid', `${v6 ? 'v6' : 'v5'} Preparation分层字段必须是数组。`, 400);
  if ((v5 || v6) && receipt.preparationServices !== undefined) throw taskEnvironmentError('task_environment_field_forbidden', `${v6 ? 'v6' : 'v5'}不支持preparationServices。`, 400);
  if (!v4 && !v5 && !v6 && ['preparationPlan', 'preparationServices', 'preparationDeclarations', 'preparationScopes', 'preparationRecipes', 'preparationSteps'].some((field) => receipt[field] !== undefined)) throw taskEnvironmentError('task_environment_field_forbidden', 'Legacy Environment Receipt不支持Preparation Plan字段。', 400);
  if (v4 && ['preparationDeclarations', 'preparationScopes', 'preparationRecipes'].some((field) => receipt[field] !== undefined)) throw taskEnvironmentError('task_environment_field_forbidden', 'Receipt v4不支持Declaration/Scope/Recipe字段。', 400);
  if (v6 && receipt.runtimeInvocation === undefined) throw taskEnvironmentError('task_environment_field_invalid', 'v6 runtimeInvocation 必须存在。', 400, { field: 'runtimeInvocation' });
  if (!v6 && receipt.runtimeInvocation !== undefined) throw taskEnvironmentError('task_environment_field_forbidden', 'Legacy Environment Receipt不支持runtimeInvocation。', 400, { field: 'runtimeInvocation' });
  const taskId = text(receipt.taskId, 'taskId');
  if (!isTaskRecordId(taskId)) throw taskEnvironmentError('task_environment_identity_invalid', `Task ID 不合法：${taskId}。`, 400, { taskId });
  if (expectedTaskId && taskId !== expectedTaskId) throw taskEnvironmentError('task_environment_identity_mismatch', `Environment Receipt Task identity 不匹配：${expectedTaskId} != ${taskId}。`, 409);
  const workspace = object(receipt.workspace, 'workspace');
  closed(workspace, new Set(['id', 'root']), 'workspace');
  const workspaceRoot = absolute(workspace.root, 'workspace.root');
  if (expectedWorkspaceRoot && path.resolve(expectedWorkspaceRoot) !== workspaceRoot) throw taskEnvironmentError('task_environment_workspace_mismatch', 'Environment Receipt 不属于当前 canonical Workspace。', 409, { expected: path.resolve(expectedWorkspaceRoot), actual: workspaceRoot });
  const controller = object(receipt.controller, 'controller');
  closed(controller, new Set(['sourceRoot', 'cliSource', 'identity', 'adapter']), 'controller');
  if (!TASK_ENVIRONMENT_STATUSES.includes(receipt.status)) throw taskEnvironmentError('task_environment_status_invalid', `Environment status 不受支持：${receipt.status}。`, 400, { field: 'status' });
  if (!Array.isArray(receipt.scopes) || receipt.scopes.length === 0) throw taskEnvironmentError('task_environment_scope_invalid', 'Environment Receipt 至少需要一个工作范围。', 400, { field: 'scopes' });
  const scopes = receipt.scopes.map((scope, index) => normalizeScope(scope, index, workspaceRoot, receipt.schemaVersion));
  const scopeIds = new Set();
  for (const scope of scopes) {
    if (scopeIds.has(scope.selector)) throw taskEnvironmentError('task_environment_scope_duplicate', `Environment scope 重复：${scope.selector}。`, 409, { selector: scope.selector });
    scopeIds.add(scope.selector);
  }
  const dependencyRoots = v3 ? receipt.dependencyRoots.map((dependency, index) => normalizeDependencyRoot(dependency, index, scopeIds)) : [];
  const dependencyIds = new Set();
  for (const dependency of dependencyRoots) {
    if (dependencyIds.has(dependency.id)) throw taskEnvironmentError('task_environment_dependency_duplicate', `Environment dependency root 重复：${dependency.id}。`, 409, { id: dependency.id });
    dependencyIds.add(dependency.id);
  }
  const serviceSelectors = scopes.filter((scope) => scope.kind === 'service').map((scope) => scope.selector);
  const scopeSelectors = scopes.filter((scope) => scope.kind === 'project' || scope.kind === 'service').map((scope) => scope.selector);
  const preparationPlan = (v4 || v5 || v6) && receipt.preparationPlan ? normalizeTaskEnvironmentPlan(receipt.preparationPlan, (v5 || v6) ? { scopeSelectors } : { serviceSelectors }) : null;
  const expectedPlanSchema = v6 ? TASK_ENVIRONMENT_PLAN_SCHEMA : v5 ? LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA_V2 : v4 ? LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA : null;
  if (preparationPlan && preparationPlan.schemaVersion !== expectedPlanSchema) throw taskEnvironmentError('task_environment_plan_schema_mismatch', `Environment Receipt ${receipt.schemaVersion} 必须引用 ${expectedPlanSchema}。`, 409, { receiptSchema: receipt.schemaVersion, expectedPlanSchema, actualPlanSchema: preparationPlan.schemaVersion });
  const preparationScopeIds = new Set([...scopeIds, ...(preparationPlan?.capabilityPreparation || []).map((item) => item.selector)]);
  const preparationSteps = (v4 || v5 || v6) ? receipt.preparationSteps.map((step, index) => normalizePreparationStep(step, index, preparationScopeIds, { v5: v5 || v6 })) : [];
  const preparationStepIds = new Set();
  for (const step of preparationSteps) {
    if (preparationStepIds.has(step.id)) throw taskEnvironmentError('task_environment_preparation_step_duplicate', `Preparation Step重复：${step.id}。`, 409, { id: step.id });
    preparationStepIds.add(step.id);
  }
  const preparationServices = v4 ? receipt.preparationServices.map((service, index) => normalizePreparationService(service, index, scopeIds, preparationStepIds)) : [];
  if (v4 && preparationPlan) {
    const plannedServices = preparationPlan.services.map((service) => service.selector).sort();
    const observedServices = preparationServices.map((service) => service.selector).sort();
    if (JSON.stringify(plannedServices) !== JSON.stringify(observedServices)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', 'preparationServices与current Plan不一致。', 409, { plannedServices, observedServices });
  }
  const preparationDeclarations = (v5 || v6) ? receipt.preparationDeclarations.map(normalizePreparationDeclaration) : [];
  const preparationRecipes = (v5 || v6) ? receipt.preparationRecipes.map((recipe, index) => normalizePreparationRecipe(recipe, index, preparationScopeIds, preparationStepIds)) : [];
  const preparationRecipeIds = new Set();
  for (const recipe of preparationRecipes) {
    if (preparationRecipeIds.has(recipe.id)) throw taskEnvironmentError('task_environment_preparation_recipe_duplicate', `Preparation Recipe重复：${recipe.id}。`, 409, { id: recipe.id });
    preparationRecipeIds.add(recipe.id);
  }
  const preparationScopes = (v5 || v6) ? receipt.preparationScopes.map((scope, index) => normalizePreparationScope(scope, index, preparationScopeIds, preparationRecipeIds)) : [];
  if ((v5 || v6) && preparationPlan) {
    const plannedScopes = [...new Set([
      ...preparationPlan.projects.flatMap((project) => project.scopes.map((scope) => scope.selector)),
      ...(preparationPlan.capabilityPreparation || []).map((item) => item.selector),
    ])].sort();
    const observedScopes = preparationScopes.map((scope) => scope.selector).sort();
    if (JSON.stringify(plannedScopes) !== JSON.stringify(observedScopes)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', 'preparationScopes与current Plan不一致。', 409, { plannedScopes, observedScopes });
    const plannedProjects = preparationPlan.projects.map((project) => project.project).sort();
    const observedProjects = preparationDeclarations.map((declaration) => declaration.project).sort();
    if (JSON.stringify(plannedProjects) !== JSON.stringify(observedProjects)) throw taskEnvironmentError('task_environment_preparation_scope_invalid', 'preparationDeclarations与current Plan不一致。', 409, { plannedProjects, observedProjects });
  }
  if (!Array.isArray(receipt.resources)) throw taskEnvironmentError('task_environment_field_invalid', 'resources 必须是数组。', 400, { field: 'resources' });
  const resources = receipt.resources.map((resource, index) => normalizeResource(resource, index, scopeIds));
  const resourceIds = new Set();
  for (const resource of resources) {
    if (resourceIds.has(resource.id)) throw taskEnvironmentError('task_environment_resource_duplicate', `Environment resource 重复：${resource.id}。`, 409, { id: resource.id });
    resourceIds.add(resource.id);
  }
  const createdAt = timestamp(receipt.createdAt, 'createdAt');
  const updatedAt = timestamp(receipt.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw taskEnvironmentError('task_environment_timestamp_invalid', 'updatedAt 不能早于 createdAt。', 400, { field: 'updatedAt' });
  return {
    schemaVersion: receipt.schemaVersion,
    taskId,
    workspace: { id: identity(workspace.id, 'workspace.id'), root: workspaceRoot },
    controller: { sourceRoot: absolute(controller.sourceRoot, 'controller.sourceRoot'), cliSource: absolute(controller.cliSource, 'controller.cliSource'), identity: text(controller.identity, 'controller.identity'), adapter: identity(controller.adapter, 'controller.adapter') },
    ...(v6 ? { runtimeInvocation: normalizeRuntimeInvocation(receipt.runtimeInvocation) } : {}),
    status: receipt.status,
    scopes,
    ...(v3 ? { dependencyRoots } : {}),
    ...(v4 ? { preparationPlan, preparationServices, preparationSteps } : {}),
    ...((v5 || v6) ? { preparationPlan, preparationDeclarations, preparationScopes, preparationRecipes, preparationSteps } : {}),
    resources,
    latest: normalizeLatest(receipt.latest),
    createdAt,
    updatedAt,
  };
}

export function taskEnvironmentReadModel(receipt) {
  const normalized = normalizeTaskEnvironmentReceipt(receipt, { expectedTaskId: receipt?.taskId, expectedWorkspaceRoot: receipt?.workspace?.root });
  return {
    schemaVersion: normalized.schemaVersion,
    taskId: normalized.taskId,
    workspace: normalized.workspace,
    controller: { sourceRoot: normalized.controller.sourceRoot, identity: normalized.controller.identity, adapter: normalized.controller.adapter },
    ...(normalized.runtimeInvocation ? { runtimeInvocation: normalized.runtimeInvocation } : {}),
    status: normalized.status,
    scopes: normalized.scopes.map((scope) => ({
      selector: scope.selector,
      kind: scope.kind,
      project: scope.project,
      service: scope.service,
      sourcePath: scope.sourcePath,
      executionRoot: scope.executionRoot,
      validationRoot: scope.validationRoot,
      shared: scope.shared,
      provider: scope.provider,
      runtime: scope.runtime,
      cli: scope.cli,
      ...(scope.preparation ? { preparation: scope.preparation } : { dependencies: scope.dependencies }),
      projection: scope.projection,
    })),
    ...([TASK_ENVIRONMENT_RECEIPT_SCHEMA, LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA_V5].includes(normalized.schemaVersion)
      ? { preparationPlan: normalized.preparationPlan, preparationDeclarations: normalized.preparationDeclarations, preparationScopes: normalized.preparationScopes, preparationRecipes: normalized.preparationRecipes, preparationSteps: normalized.preparationSteps }
      : normalized.preparationPlan !== undefined
        ? { preparationPlan: normalized.preparationPlan, preparationServices: normalized.preparationServices, preparationSteps: normalized.preparationSteps }
        : { dependencyRoots: normalized.dependencyRoots || [] }),
    legacy: normalized.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA,
    resources: normalized.resources.map(({ handle: _handle, ...resource }) => resource),
    latest: normalized.latest,
    updatedAt: normalized.updatedAt,
  };
}
