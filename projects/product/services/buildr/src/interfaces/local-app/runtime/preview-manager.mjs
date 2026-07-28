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

function taskEnvironmentOwner(worktree) {
  try {
    const common = readGit(worktree, ['rev-parse', '--git-common-dir']);
    const directory = path.join(path.resolve(worktree, common), 'buildr', 'task-environments');
    if (!fs.existsSync(directory)) return null;
    for (const entry of fs.readdirSync(directory).filter((value) => value.endsWith('.json'))) {
      const receipt = readJson(path.join(directory, entry));
      if (receipt?.schemaVersion === 'buildr.task-environment-receipt/v1' && path.resolve(receipt.environmentRoot) === worktree) return receipt;
    }
  } catch { /* legacy worktree */ }
  return null;
}

export function previewOwnerForWorktree(name, targetRoot, productCheckout = null) {
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
  const environment = taskEnvironmentOwner(worktree);
  return {
    schemaVersion: PREVIEW_SCHEMA, instance: assertPreviewName(name), worktree, repository, branch, head, dirty,
    taskId: environment?.taskId || null,
    owner: environment?.agent || null,
    environmentRoot: environment?.environmentRoot || worktree,
    receiptIdentity: environment?.planDigest || null,
    productCheckout: productCheckout ? path.resolve(productCheckout) : null,
    repositorySet: environment?.repositories?.map((item) => ({ selector: item.selector, checkoutPath: item.checkoutPath, branch: item.branch, head: item.head })) || [{ selector: 'workspace', checkoutPath: worktree, branch, head }],
    identityMode: environment ? 'task-environment' : 'legacy-worktree',
  };
}

function samePreviewOwner(left, right) {
  return Boolean(left && right
    && path.resolve(left.environmentRoot || left.worktree) === path.resolve(right.environmentRoot || right.worktree)
    && (left.taskId || null) === (right.taskId || null)
    && (left.owner || null) === (right.owner || null)
    && (left.receiptIdentity || null) === (right.receiptIdentity || null));
}

export function assertPreviewStopOwner(owner, caller) {
  if (owner.identityMode !== 'task-environment') return;
  if (!caller
    || caller.taskId !== owner.taskId
    || caller.owner !== owner.owner
    || path.resolve(caller.environmentRoot) !== path.resolve(owner.environmentRoot)
    || caller.receiptIdentity !== owner.receiptIdentity) {
    const error = new Error(`预览实例 ${owner.instance} 的 task environment owner 或 receipt 不匹配。`);
    error.code = 'preview_stop_owner_mismatch';
    error.details = { instance: owner.instance, expected: { taskId: owner.taskId, owner: owner.owner, environmentRoot: owner.environmentRoot, receiptIdentity: owner.receiptIdentity } };
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

export async function startPreview(runtime, name, args, { cliPath = process.argv[1], dataRoot = localAppDataRoot() } = {}) {
  const instance = assertPreviewName(name);
  runtime.assertNoUnknownOptions(args, new Set(['--target', '--port', '--no-open', '--json']), new Set(['--no-open', '--json']));
  const targetRoot = path.resolve(runtime.optionValue(args, '--target', process.cwd()));
  runtime.assertInitializedBuildrWorkspace(targetRoot);
  const rawPort = runtime.optionValue(args, '--port', '0');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
  const owner = previewOwnerForWorktree(instance, targetRoot, path.resolve(path.dirname(cliPath), '..'));
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
    const result = { schemaVersion: PREVIEW_SCHEMA, status: 'reused', owner: existingOwner, url: healthy.url, pid: healthy.pid };
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
  const child = spawn(process.execPath, [cliPath, 'app', '--target', targetRoot, '--port', String(port), '--no-open'], {
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
  const result = { schemaVersion: PREVIEW_SCHEMA, status: 'started', owner: managedOwner, url: started.url, pid: started.pid };
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

export async function stopPreview(name, { dataRoot = localAppDataRoot(), caller = null } = {}) {
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
  clearOwner(instance, dataRoot);
  return { schemaVersion: PREVIEW_SCHEMA, status: healthy ? 'stopped' : 'stale_cleaned', instance, owner };
}
