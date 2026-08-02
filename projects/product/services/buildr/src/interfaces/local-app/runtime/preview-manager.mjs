import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

import { localAppDataRoot } from '../../../infrastructure/filesystem/workspace-registry-repository.mjs';
import { healthyLocalAppInstance, openDefaultBrowser } from './instance-manager.mjs';

const PREVIEW_SCHEMA = 'buildr.local-app-preview/v1';
const PREVIEW_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function assertPreviewName(value) {
  const name = String(value || '');
  if (!PREVIEW_NAME.test(name) || name === '.' || name === '..') {
    const error = new Error('预览实例名只能包含字母、数字、点、下划线和连字符，且必须以字母或数字开始。');
    error.code = 'preview_name_invalid';
    throw error;
  }
  return name;
}

export function previewDataRoot(name, dataRoot = localAppDataRoot()) {
  return path.join(path.resolve(dataRoot), 'previews', assertPreviewName(name));
}

function previewOwnerPath(name, dataRoot) {
  return path.join(previewDataRoot(name, dataRoot), 'preview.json');
}

function previewInstancePath(name, dataRoot) {
  return path.join(previewDataRoot(name, dataRoot), 'instance.json');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function readGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function previewOwnerForWorktree(name, targetRoot, productCheckout = null, taskEnvironment = null) {
  const worktree = path.resolve(targetRoot);
  let repository;
  let branch;
  let head;
  let dirty;
  try {
    repository = path.resolve(readGit(worktree, ['rev-parse', '--show-toplevel']));
    branch = readGit(worktree, ['branch', '--show-current']) || 'HEAD';
    head = readGit(worktree, ['rev-parse', 'HEAD']);
    dirty = Boolean(readGit(worktree, ['status', '--porcelain']));
  } catch {
    const error = new Error('task preview 只能从可识别 Git checkout 的 Buildr worktree 启动。');
    error.code = 'preview_worktree_git_required';
    throw error;
  }
  return {
    schemaVersion: PREVIEW_SCHEMA, instance: assertPreviewName(name), worktree, repository, branch, head, dirty,
    taskId: taskEnvironment?.taskId || null,
    workspaceRoot: taskEnvironment?.workspaceRoot || null,
    environmentRoot: taskEnvironment?.environmentRoot || worktree,
    controllerIdentity: taskEnvironment?.controllerIdentity || null,
    resourceId: taskEnvironment?.resourceId || null,
    scope: taskEnvironment?.scope || null,
    productCheckout: productCheckout ? path.resolve(productCheckout) : null,
    repositorySet: taskEnvironment?.repositorySet || [{ selector: 'workspace', checkoutPath: worktree, branch, head }],
    identityMode: taskEnvironment ? 'task-environment-v2' : 'standalone-checkout',
  };
}

function samePreviewOwner(left, right) {
  return Boolean(left && right
    && path.resolve(left.environmentRoot || left.worktree) === path.resolve(right.environmentRoot || right.worktree)
    && (left.taskId || null) === (right.taskId || null)
    && (left.workspaceRoot || null) === (right.workspaceRoot || null)
    && (left.controllerIdentity || null) === (right.controllerIdentity || null)
    && (left.resourceId || null) === (right.resourceId || null));
}

export function assertPreviewStopOwner(owner, caller) {
  if (owner.identityMode !== 'task-environment-v2') return;
  if (!caller
    || caller.taskId !== owner.taskId
    || typeof caller.workspaceRoot !== 'string'
    || typeof caller.environmentRoot !== 'string'
    || path.resolve(caller.workspaceRoot) !== path.resolve(owner.workspaceRoot)
    || path.resolve(caller.environmentRoot) !== path.resolve(owner.environmentRoot)
    || caller.controllerIdentity !== owner.controllerIdentity
    || caller.resourceId !== owner.resourceId) {
    const error = new Error(`预览实例 ${owner.instance} 的 task environment owner 或 receipt 不匹配。`);
    error.code = 'preview_stop_owner_mismatch';
    error.details = { instance: owner.instance, expected: { taskId: owner.taskId, workspaceRoot: owner.workspaceRoot, environmentRoot: owner.environmentRoot, controllerIdentity: owner.controllerIdentity, resourceId: owner.resourceId } };
    throw error;
  }
}

export function readPreviewOwner(name, dataRoot) {
  const value = readJson(previewOwnerPath(name, dataRoot));
  if (!value || value.schemaVersion !== PREVIEW_SCHEMA || value.instance !== name || typeof value.worktree !== 'string') return null;
  return value;
}

function readPreviewInstance(name, dataRoot) {
  const value = readJson(previewInstancePath(name, dataRoot));
  if (!value || value.schemaVersion !== 'buildr.local-app-instance/v1' || typeof value.url !== 'string' || typeof value.secret !== 'string' || !Number.isInteger(value.pid)) return null;
  return value;
}

function writeOwner(runtime, owner, dataRoot) {
  const file = previewOwnerPath(owner.instance, dataRoot);
  runtime.atomicWriteJson(file, owner);
  return file;
}

function clearOwner(name, dataRoot) {
  fs.rmSync(previewOwnerPath(name, dataRoot), { force: true });
}

async function waitForPreview(name, dataRoot, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    const instance = readPreviewInstance(name, dataRoot);
    const healthy = await healthyLocalAppInstance(instance);
    if (healthy) return healthy;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

function requestInstanceShutdown(instance) {
  const url = new URL('/api/v1/app/quit-instance', instance.url);
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST', headers: { 'x-buildr-instance': instance.secret },
    }, (response) => {
      response.resume();
      response.on('end', () => response.statusCode === 202 ? resolve() : reject(new Error(`preview 停止请求失败：HTTP ${response.statusCode}`)));
    });
    request.once('error', reject);
    request.end();
  });
}

export function readPreviewIdentityFromEnvironment(env = process.env) {
  const raw = env.BUILDR_LOCAL_APP_PREVIEW;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value?.schemaVersion === PREVIEW_SCHEMA && typeof value.instance === 'string' && typeof value.worktree === 'string' ? value : null;
  } catch { return null; }
}

function taskPreviewCaller(owner) {
  return {
    taskId: owner.taskId,
    workspaceRoot: owner.workspaceRoot,
    environmentRoot: owner.environmentRoot,
    controllerIdentity: owner.controllerIdentity,
    resourceId: owner.resourceId,
  };
}

function taskPreviewResource(owner, instance) {
  const url = new URL(instance.url);
  return {
    id: owner.resourceId,
    kind: 'preview',
    scope: owner.scope,
    provider: 'local-app-preview',
    identity: {
      productCheckout: owner.productCheckout,
      url: instance.url,
      port: Number(url.port),
      pid: instance.pid,
      providerIdentity: `${owner.instance}:${instance.pid}:${owner.head}`,
    },
    handle: { instance: owner.instance },
    probe: { status: 'ready', identity: `${owner.instance}:${instance.pid}:${owner.head}`, observedAt: new Date().toISOString(), diagnostic: null },
  };
}

export async function startPreview(runtime, name, args, { cliPath = process.argv[1], dataRoot = localAppDataRoot() } = {}) {
  const instance = assertPreviewName(name);
  runtime.assertNoUnknownOptions(args, new Set(['--target', '--task', '--port', '--no-open', '--json']), new Set(['--no-open', '--json']));
  const requestedRoot = path.resolve(runtime.optionValue(args, '--target', process.cwd()));
  const taskId = runtime.optionValue(args, '--task', null);
  let targetRoot = requestedRoot;
  let taskEnvironment = null;
  let appInvocation = { command: process.execPath, argsPrefix: [cliPath], sourceRoot: path.resolve(path.dirname(cliPath), '..') };
  if (taskId) {
    const workspaceRoot = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(requestedRoot));
    const execution = runtime.resolveTaskEnvironmentExecution(workspaceRoot, taskId);
    if (!execution.ready) {
      const error = new Error(execution.blocked?.message || `Task Environment 未 ready：${taskId}。`);
      error.code = execution.blocked?.code || 'preview_environment_not_ready';
      throw error;
    }
    const workspaceScope = execution.scopes.find((scope) => scope.selector === 'workspace');
    if (!workspaceScope) { const error = new Error('Task Environment 缺少 workspace scope。'); error.code = 'preview_environment_scope_missing'; throw error; }
    targetRoot = execution.validationRoot;
    runtime.assertTaskEnvironmentController(workspaceRoot, taskId);
    appInvocation = execution.cliInvocation;
    taskEnvironment = {
      taskId,
      workspaceRoot,
      environmentRoot: execution.validationRoot,
      controllerIdentity: execution.controller.identity,
      resourceId: `preview:${instance}`,
      scope: workspaceScope.selector,
      repositorySet: execution.scopes.map((scope) => ({ selector: scope.selector, checkoutPath: scope.executionRoot, shared: scope.shared })),
    };
  } else runtime.assertInitializedBuildrWorkspace(targetRoot);
  const rawPort = runtime.optionValue(args, '--port', '0');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
  const owner = previewOwnerForWorktree(instance, targetRoot, appInvocation.sourceRoot, taskEnvironment);
  const existingOwner = readPreviewOwner(instance, dataRoot);
  const existingInstance = readPreviewInstance(instance, dataRoot);
  const healthy = await healthyLocalAppInstance(existingInstance);
  if (healthy && !samePreviewOwner(existingOwner, owner)) {
    const error = new Error(`预览实例 ${instance} 正由 ${existingOwner.worktree} 使用；请改用其他实例名，或由该任务先停止它。`);
    error.code = 'preview_owner_conflict';
    error.details = { instance, owner: existingOwner };
    throw error;
  }
  if (healthy) {
    let environmentResource = null;
    if (taskId) {
      environmentResource = runtime.inspectTaskEnvironment(requestedRoot, taskId).environment?.resources.find((resource) => resource.id === owner.resourceId && resource.status === 'running') || null;
      if (!environmentResource) { const error = new Error(`健康 preview ${instance} 没有 matching Environment resource；拒绝猜测或补领 ownership。`); error.code = 'preview_environment_resource_missing'; throw error; }
    }
    const result = { schemaVersion: PREVIEW_SCHEMA, status: 'reused', owner: existingOwner, url: healthy.url, pid: healthy.pid, environmentResource };
    if (!args.includes('--no-open')) openDefaultBrowser(healthy.url);
    return result;
  }
  if (existingOwner && !samePreviewOwner(existingOwner, owner) && existingInstance) {
    const error = new Error(`预览实例 ${instance} 留有其他 worktree 的陈旧记录；请由原任务执行 preview stop 后再复用。`);
    error.code = 'preview_owner_stale_conflict';
    error.details = { instance, owner: existingOwner };
    throw error;
  }
  const root = previewDataRoot(instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  writeOwner(runtime, owner, dataRoot);
  const child = spawn(appInvocation.command, [...appInvocation.argsPrefix, 'app', '--target', targetRoot, '--port', String(port), '--no-open'], {
    cwd: targetRoot,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BUILDR_APP_DATA_DIR: root, BUILDR_LOCAL_APP_PREVIEW: JSON.stringify(owner) },
  });
  child.unref();
  const started = await waitForPreview(instance, dataRoot);
  if (!started) {
    const error = new Error(`预览实例 ${instance} 未在预期时间内就绪。`);
    error.code = 'preview_start_timeout';
    throw error;
  }
  const managedOwner = { ...owner, managedProcess: { pid: started.pid, url: started.url, state: 'healthy' } };
  writeOwner(runtime, managedOwner, dataRoot);
  let environmentResource = null;
  if (taskId) {
    try {
      environmentResource = runtime.registerTaskEnvironmentResource(requestedRoot, taskId, taskPreviewResource(managedOwner, started)).resource;
    } catch (error) {
      let cleanupError = null;
      try { await stopPreview(instance, { dataRoot, caller: taskPreviewCaller(managedOwner) }); } catch (stopError) { cleanupError = stopError; }
      const blocked = new Error(cleanupError ? `Preview Environment 登记失败，且实例回收失败：${error.message}; ${cleanupError.message}` : `Preview Environment 登记失败，实例已回收：${error.message}`);
      blocked.code = cleanupError ? 'preview_environment_register_cleanup_failed' : 'preview_environment_register_failed';
      blocked.details = { taskId, instance, registration: error.code || error.message, cleanup: cleanupError ? cleanupError.code || cleanupError.message : 'confirmed' };
      throw blocked;
    }
  }
  const result = { schemaVersion: PREVIEW_SCHEMA, status: 'started', owner: managedOwner, url: started.url, pid: started.pid, environmentResource };
  if (!args.includes('--no-open')) openDefaultBrowser(started.url);
  return result;
}

export async function listPreviews({ dataRoot = localAppDataRoot() } = {}) {
  const root = path.join(path.resolve(dataRoot), 'previews');
  if (!fs.existsSync(root)) return { schemaVersion: PREVIEW_SCHEMA, previews: [] };
  const previews = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !PREVIEW_NAME.test(entry.name)) continue;
    const owner = readPreviewOwner(entry.name, dataRoot);
    if (!owner) continue;
    const instance = readPreviewInstance(entry.name, dataRoot);
    const healthy = await healthyLocalAppInstance(instance);
    previews.push({ instance: entry.name, owner, url: instance?.url || null, pid: instance?.pid || null, status: healthy ? 'healthy' : instance ? 'stale' : 'stopped' });
  }
  return { schemaVersion: PREVIEW_SCHEMA, previews };
}

export async function stopPreview(name, { dataRoot = localAppDataRoot(), caller = null, retainOwner = false } = {}) {
  const instance = assertPreviewName(name);
  const owner = readPreviewOwner(instance, dataRoot);
  if (!owner) {
    const error = new Error(`预览实例不存在：${instance}`);
    error.code = 'preview_not_found';
    throw error;
  }
  assertPreviewStopOwner(owner, caller);
  const state = readPreviewInstance(instance, dataRoot);
  const healthy = await healthyLocalAppInstance(state);
  if (healthy) {
    await requestInstanceShutdown(healthy);
    for (let index = 0; index < 40; index += 1) {
      if (!await healthyLocalAppInstance(readPreviewInstance(instance, dataRoot))) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (await healthyLocalAppInstance(readPreviewInstance(instance, dataRoot))) {
      const error = new Error(`预览实例 ${instance} 停止后仍保持健康。`);
      error.code = 'preview_stop_unconfirmed';
      throw error;
    }
  }
  if (!retainOwner) clearOwner(instance, dataRoot);
  return { schemaVersion: PREVIEW_SCHEMA, status: healthy ? 'stopped' : 'stale_cleaned', instance, owner };
}

function previewOwnerResourceMatch(resource, owner) {
  if (!owner || owner.identityMode !== 'task-environment-v2') return false;
  const pid = owner.managedProcess?.pid;
  const url = owner.managedProcess?.url;
  const expectedProviderIdentity = `${owner.instance}:${pid}:${owner.head}`;
  return resource.provider === 'local-app-preview'
    && resource.handle.instance === owner.instance
    && resource.id === owner.resourceId
    && resource.identity.pid === pid
    && resource.identity.url === url
    && resource.identity.providerIdentity === expectedProviderIdentity;
}

function previewResourceMatch(resource, owner, instance) {
  return Boolean(instance && previewOwnerResourceMatch(resource, owner) && resource.identity.pid === instance.pid && resource.identity.url === instance.url);
}

export function probePreviewResource(resource, { dataRoot = localAppDataRoot() } = {}) {
  const observedAt = new Date().toISOString();
  const owner = readPreviewOwner(resource.handle.instance, dataRoot);
  const instance = readPreviewInstance(resource.handle.instance, dataRoot);
  if (!previewResourceMatch(resource, owner, instance)) return { status: 'blocked', identity: resource.identity.providerIdentity, observedAt, diagnostic: 'Preview metadata 与 Environment resource identity 不匹配或已缺失。' };
  try { process.kill(instance.pid, 0); } catch { return { status: 'blocked', identity: resource.identity.providerIdentity, observedAt, diagnostic: 'Preview 进程当前不存在。' }; }
  return { status: 'ready', identity: resource.identity.providerIdentity, observedAt, diagnostic: null };
}

export async function cleanupPreviewResource(resource, context, { dataRoot = localAppDataRoot() } = {}) {
  const owner = readPreviewOwner(resource.handle.instance, dataRoot);
  if (!previewOwnerResourceMatch(resource, owner)) {
    const error = new Error(`Preview resource identity 不匹配：${resource.id}。`);
    error.code = 'preview_environment_resource_mismatch';
    throw error;
  }
  assertPreviewStopOwner(owner, {
    taskId: context.taskId,
    workspaceRoot: context.workspaceRoot,
    environmentRoot: context.environmentRoot,
    controllerIdentity: context.controllerIdentity,
    resourceId: resource.id,
  });
  const stopped = await stopPreview(resource.handle.instance, { dataRoot, caller: taskPreviewCaller(owner) });
  return { provider: 'local-app-preview', stopped, probe: { status: 'blocked', identity: resource.identity.providerIdentity, observedAt: new Date().toISOString(), diagnostic: 'Preview 已停止并释放。' } };
}

export function registerLocalAppPreviewResourceProvider(runtime) {
  runtime.probeTaskEnvironmentResource = (resource) => {
    if (resource.provider !== 'local-app-preview') { const error = new Error(`未知 Task Environment resource provider：${resource.provider}。`); error.code = 'task_environment_resource_provider_unknown'; throw error; }
    return probePreviewResource(resource);
  };
  runtime.cleanupTaskEnvironmentResource = async (resource, context) => {
    if (resource.provider !== 'local-app-preview') { const error = new Error(`未知 Task Environment resource provider：${resource.provider}。`); error.code = 'task_environment_resource_provider_unknown'; throw error; }
    return cleanupPreviewResource(resource, context);
  };
  return runtime;
}
