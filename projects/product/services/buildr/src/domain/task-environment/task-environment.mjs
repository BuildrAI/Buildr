import path from 'node:path';

import { isTaskRecordId } from '../task-record/task-record.mjs';

export const TASK_ENVIRONMENT_RECEIPT_SCHEMA = 'buildr.task-environment-receipt/v2';
export const TASK_ENVIRONMENT_RESULT_SCHEMA = 'buildr.task-environment-result/v1';
export const TASK_ENVIRONMENT_STATUSES = Object.freeze(['ready', 'blocked', 'cleaned']);
export const TASK_ENVIRONMENT_RESOURCE_PROVIDERS = Object.freeze(['local-app-preview']);

const SCOPE_KINDS = new Set(['workspace', 'project', 'service']);
const PROBE_STATUSES = new Set(['ready', 'blocked', 'not-applicable']);
const RESOURCE_STATUSES = new Set(['running', 'stale', 'released']);
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

function normalizeScope(value, index, workspaceRoot) {
  const field = `scopes[${index}]`;
  const scope = object(value, field);
  closed(scope, new Set(['selector', 'kind', 'project', 'service', 'sourcePath', 'executionRoot', 'validationRoot', 'shared', 'provider', 'runtime', 'cli', 'dependencies', 'projection']), field);
  if (!SCOPE_KINDS.has(scope.kind)) throw taskEnvironmentError('task_environment_scope_invalid', `${field}.kind 不受支持：${scope.kind}。`, 400, { field: `${field}.kind` });
  if (typeof scope.shared !== 'boolean') throw taskEnvironmentError('task_environment_field_invalid', `${field}.shared 必须是 boolean。`, 400, { field: `${field}.shared` });
  const sourcePath = text(scope.sourcePath, `${field}.sourcePath`).replaceAll('\\', '/');
  if (path.posix.isAbsolute(sourcePath) || path.posix.normalize(sourcePath) !== sourcePath || sourcePath.startsWith('../')) throw taskEnvironmentError('task_environment_path_invalid', `${field}.sourcePath 必须是 Workspace 相对路径。`, 400, { field: `${field}.sourcePath` });
  const executionRoot = absolute(scope.executionRoot, `${field}.executionRoot`);
  const validationRoot = absolute(scope.validationRoot, `${field}.validationRoot`);
  if (!scope.shared && !inside(validationRoot, executionRoot) && !inside(executionRoot, validationRoot)) {
    throw taskEnvironmentError('task_environment_scope_invalid', `${field} 的 executionRoot 与 validationRoot 不属于同一任务根。`, 400, { field });
  }
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
    dependencies: normalizeProbe(scope.dependencies, `${field}.dependencies`),
    projection: normalizeProbe(scope.projection, `${field}.projection`),
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
  closed(receipt, new Set(['schemaVersion', 'taskId', 'workspace', 'controller', 'status', 'scopes', 'resources', 'latest', 'createdAt', 'updatedAt']), '');
  if (receipt.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA) throw taskEnvironmentError('task_environment_schema_unsupported', `Environment Receipt schemaVersion 必须是 ${TASK_ENVIRONMENT_RECEIPT_SCHEMA}。`, 409, { actual: receipt.schemaVersion });
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
  const scopes = receipt.scopes.map((scope, index) => normalizeScope(scope, index, workspaceRoot));
  const scopeIds = new Set();
  for (const scope of scopes) {
    if (scopeIds.has(scope.selector)) throw taskEnvironmentError('task_environment_scope_duplicate', `Environment scope 重复：${scope.selector}。`, 409, { selector: scope.selector });
    scopeIds.add(scope.selector);
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
    schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
    taskId,
    workspace: { id: identity(workspace.id, 'workspace.id'), root: workspaceRoot },
    controller: { sourceRoot: absolute(controller.sourceRoot, 'controller.sourceRoot'), cliSource: absolute(controller.cliSource, 'controller.cliSource'), identity: text(controller.identity, 'controller.identity'), adapter: identity(controller.adapter, 'controller.adapter') },
    status: receipt.status,
    scopes,
    resources,
    latest: normalizeLatest(receipt.latest),
    createdAt,
    updatedAt,
  };
}

export function taskEnvironmentReadModel(receipt) {
  const normalized = normalizeTaskEnvironmentReceipt(receipt, { expectedTaskId: receipt?.taskId, expectedWorkspaceRoot: receipt?.workspace?.root });
  return {
    taskId: normalized.taskId,
    workspace: normalized.workspace,
    controller: { sourceRoot: normalized.controller.sourceRoot, identity: normalized.controller.identity, adapter: normalized.controller.adapter },
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
      dependencies: scope.dependencies,
      projection: scope.projection,
    })),
    resources: normalized.resources.map(({ handle: _handle, ...resource }) => resource),
    latest: normalized.latest,
    updatedAt: normalized.updatedAt,
  };
}
