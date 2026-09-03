import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

import { buildrWebDataRoot } from '../../workspace/module.ts';
import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';
import { INSTANCE_SCHEMA, healthyBuildrWebInstance, openDefaultBrowser } from '../infrastructure/instance-runtime.ts';

const PREVIEW_SCHEMA = 'buildr.local-app-preview/v1';
const PREVIEW_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type PreviewRepository = { selector: string; checkoutPath: string; branch: string | null; head: string | null };

export type TaskPreviewWorktree = {
  taskId: string;
  workspaceRoot: string;
  worktree: string;
  evidencePath: string;
  planDigest: string;
  repositorySet: PreviewRepository[];
};

export type PreviewOwner = {
  schemaVersion: typeof PREVIEW_SCHEMA;
  instance: string;
  worktree: string;
  repository: string;
  branch: string;
  head: string;
  dirty: boolean;
  taskId: string | null;
  workspaceRoot: string | null;
  worktreeEvidencePath: string | null;
  worktreePlanDigest: string | null;
  productCheckout: string | null;
  repositorySet: PreviewRepository[];
  identityMode: 'task-worktree-v1' | 'standalone-checkout';
  managedProcess?: { pid: number; url?: string; state: 'healthy' | 'cleanup-failed' };
};

export type PreviewCaller = {
  taskId: string;
  workspaceRoot: string;
  worktree: string;
  worktreeEvidencePath: string;
  worktreePlanDigest: string;
};

type PreviewInstance = { schemaVersion: string; url: string; secret: string; pid: number; [key: string]: unknown };
type WorktreeInspection = {
  status: string;
  repositories: Array<{ selector: string; checkoutPath?: string; branch: string | null; head: string | null; state: string }>;
  diagnostic: { code: string; message: string } | null;
};
type WorktreeEvidence = { file: string; evidence: { planDigest: string } };
type ProductInvocation = { command: string; argsPrefix: string[]; sourceRoot: string };

export type PreviewRuntime = {
  assertNoUnknownOptions(args: string[], known: Set<string>, flags: Set<string>): void;
  optionValue(args: string[], name: string, fallback: string | null): string | null;
  currentProductInvocation(input: { cliPath: string }): Omit<ProductInvocation, 'sourceRoot'>;
  productRoot(): string;
  assertCanonicalTaskWorkspace(root: string): string;
  inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): WorktreeInspection;
  readGitWorktreeEvidence(workspaceRoot: string, taskId: string): WorktreeEvidence;
  assertInitializedBuildrWorkspace(root: string): string;
  atomicWriteJson(file: string, value: unknown): void;
  removePath(file: string): void;
};

type PreviewStartOptions = { cliPath?: string; dataRoot?: string; startupTimeoutMs?: number };
type PreviewStopOptions = { dataRoot?: string; caller?: PreviewCaller | null; retainOwner?: boolean };
type PreviewStartup = { spawnError: Error | null; processError: Error | null; phase: string; elapsedMs: number };
type PreviewResult = { schemaVersion: typeof PREVIEW_SCHEMA; status: 'started' | 'reused'; owner: PreviewOwner; url: string; pid: number };
type PreviewListItem = { instance: string; owner: PreviewOwner; url: string | null; pid: number | null; status: 'healthy' | 'stale' | 'stopped' };

const healthyInstance: (instance: PreviewInstance | null) => Promise<PreviewInstance | null> = healthyBuildrWebInstance;
const openBrowser: (url: string) => void = openDefaultBrowser;

function codedError(message: string, code: string, details?: unknown): Error & { code: string; details?: unknown } {
  const error = Object.assign(new Error(message), { code });
  if (details !== undefined) Object.assign(error, { details });
  return error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseRepositorySet(value: unknown): PreviewRepository[] | null {
  if (!Array.isArray(value)) return null;
  const repositories: PreviewRepository[] = [];
  for (const entry of value) {
    const item = record(entry);
    if (!item || typeof item.selector !== 'string' || typeof item.checkoutPath !== 'string') return null;
    const branch = item.branch === null || typeof item.branch === 'string' ? item.branch : null;
    const head = item.head === null || typeof item.head === 'string' ? item.head : null;
    repositories.push({ selector: item.selector, checkoutPath: item.checkoutPath, branch, head });
  }
  return repositories;
}

function parseManagedProcess(value: unknown): PreviewOwner['managedProcess'] {
  const item = record(value);
  if (!item || !Number.isInteger(item.pid) || (item.state !== 'healthy' && item.state !== 'cleanup-failed')) return undefined;
  return { pid: Number(item.pid), url: optionalString(item.url) || undefined, state: item.state };
}

function parsePreviewOwner(value: unknown, expectedName?: string): PreviewOwner | null {
  const item = record(value);
  if (!item
    || item.schemaVersion !== PREVIEW_SCHEMA
    || typeof item.instance !== 'string'
    || (expectedName !== undefined && item.instance !== expectedName)
    || typeof item.worktree !== 'string'
    || typeof item.repository !== 'string'
    || typeof item.branch !== 'string'
    || typeof item.head !== 'string'
    || typeof item.dirty !== 'boolean'
    || (item.identityMode !== 'task-worktree-v1' && item.identityMode !== 'standalone-checkout')) return null;
  const repositorySet = parseRepositorySet(item.repositorySet);
  if (!repositorySet) return null;
  const taskId = optionalString(item.taskId);
  const workspaceRoot = optionalString(item.workspaceRoot);
  const worktreeEvidencePath = optionalString(item.worktreeEvidencePath);
  const worktreePlanDigest = optionalString(item.worktreePlanDigest);
  if (item.identityMode === 'task-worktree-v1' && (!taskId || !workspaceRoot || !worktreeEvidencePath || !worktreePlanDigest)) return null;
  return {
    schemaVersion: PREVIEW_SCHEMA,
    instance: item.instance,
    worktree: item.worktree,
    repository: item.repository,
    branch: item.branch,
    head: item.head,
    dirty: item.dirty,
    taskId,
    workspaceRoot,
    worktreeEvidencePath,
    worktreePlanDigest,
    productCheckout: optionalString(item.productCheckout),
    repositorySet,
    identityMode: item.identityMode,
    managedProcess: parseManagedProcess(item.managedProcess),
  };
}

function parsePreviewInstance(value: unknown): PreviewInstance | null {
  const item = record(value);
  if (!item
    || (item.schemaVersion !== INSTANCE_SCHEMA && item.schemaVersion !== 'buildr.local-app-instance/v1')
    || typeof item.url !== 'string'
    || typeof item.secret !== 'string'
    || !Number.isInteger(item.pid)) return null;
  return { ...item, schemaVersion: String(item.schemaVersion), url: item.url, secret: item.secret, pid: Number(item.pid) };
}

export function assertPreviewName(value: unknown): string {
  const name = String(value || '');
  if (!PREVIEW_NAME.test(name) || name === '.' || name === '..') {
    throw codedError('预览实例名只能包含字母、数字、点、下划线和连字符，且必须以字母或数字开始。', 'preview_name_invalid');
  }
  return name;
}

export function previewDataRoot(name: string, dataRoot: string = buildrWebDataRoot()): string {
  return path.join(path.resolve(dataRoot), 'previews', assertPreviewName(name));
}

function previewOwnerPath(name: string, dataRoot?: string): string {
  return path.join(previewDataRoot(name, dataRoot), 'preview.json');
}

function previewInstancePath(name: string, dataRoot?: string): string {
  return path.join(previewDataRoot(name, dataRoot), 'instance.json');
}

function readJson(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function readGit(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function previewOwnerForWorktree(name: string, targetRoot: string, productCheckout: string | null = null, taskWorktree: TaskPreviewWorktree | null = null): PreviewOwner {
  const worktree = path.resolve(targetRoot);
  let repository: string;
  let branch: string;
  let head: string;
  let dirty: boolean;
  try {
    repository = path.resolve(readGit(worktree, ['rev-parse', '--show-toplevel']));
    branch = readGit(worktree, ['branch', '--show-current']) || 'HEAD';
    head = readGit(worktree, ['rev-parse', 'HEAD']);
    dirty = Boolean(readGit(worktree, ['status', '--porcelain']));
  } catch {
    throw codedError('task preview 只能从可识别 Git checkout 的 Buildr worktree 启动。', 'preview_worktree_git_required');
  }
  return {
    schemaVersion: PREVIEW_SCHEMA,
    instance: assertPreviewName(name),
    worktree,
    repository,
    branch,
    head,
    dirty,
    taskId: taskWorktree?.taskId || null,
    workspaceRoot: taskWorktree?.workspaceRoot || null,
    worktreeEvidencePath: taskWorktree?.evidencePath || null,
    worktreePlanDigest: taskWorktree?.planDigest || null,
    productCheckout: productCheckout ? path.resolve(productCheckout) : null,
    repositorySet: taskWorktree?.repositorySet || [{ selector: 'workspace', checkoutPath: worktree, branch, head }],
    identityMode: taskWorktree ? 'task-worktree-v1' : 'standalone-checkout',
  };
}

function samePreviewOwner(left: PreviewOwner | null, right: PreviewOwner): boolean {
  return Boolean(left
    && sameFilesystemPath(left.worktree, right.worktree)
    && left.taskId === right.taskId
    && left.workspaceRoot === right.workspaceRoot
    && left.worktreeEvidencePath === right.worktreeEvidencePath
    && left.worktreePlanDigest === right.worktreePlanDigest);
}

export function assertPreviewStopOwner(owner: PreviewOwner, caller: PreviewCaller | null): void {
  if (owner.identityMode !== 'task-worktree-v1') return;
  if (!caller
    || caller.taskId !== owner.taskId
    || typeof owner.workspaceRoot !== 'string'
    || !sameFilesystemPath(caller.workspaceRoot, owner.workspaceRoot)
    || !sameFilesystemPath(caller.worktree, owner.worktree)
    || caller.worktreeEvidencePath !== owner.worktreeEvidencePath
    || caller.worktreePlanDigest !== owner.worktreePlanDigest) {
    throw codedError(`预览实例 ${owner.instance} 的 Task Worktree owner 不匹配。`, 'preview_stop_owner_mismatch', {
      instance: owner.instance,
      expected: { taskId: owner.taskId, workspaceRoot: owner.workspaceRoot, worktree: owner.worktree, worktreeEvidencePath: owner.worktreeEvidencePath, worktreePlanDigest: owner.worktreePlanDigest },
    });
  }
}

export function readPreviewOwner(name: string, dataRoot?: string): PreviewOwner | null {
  return parsePreviewOwner(readJson(previewOwnerPath(name, dataRoot)), name);
}

function readPreviewInstance(name: string, dataRoot?: string): PreviewInstance | null {
  return parsePreviewInstance(readJson(previewInstancePath(name, dataRoot)));
}

function writeOwner(runtime: PreviewRuntime, owner: PreviewOwner, dataRoot?: string): string {
  const file = previewOwnerPath(owner.instance, dataRoot);
  runtime.atomicWriteJson(file, owner);
  return file;
}

function clearOwner(name: string, dataRoot?: string): void {
  fs.rmSync(previewOwnerPath(name, dataRoot), { force: true });
}

async function waitForPreview(name: string, dataRoot: string, child: ChildProcess, startup: PreviewStartup, timeoutMs: number): Promise<PreviewInstance | null> {
  const began = performance.now();
  startup.phase = 'instance-missing';
  while (performance.now() - began < timeoutMs) {
    if (startup.spawnError || child.exitCode !== null || child.signalCode !== null) break;
    const instance = readPreviewInstance(name, dataRoot);
    startup.phase = !instance ? 'instance-missing' : instance.pid !== child.pid ? 'instance-pid-mismatch' : 'health-not-ready';
    const healthy = instance?.pid === child.pid ? await healthyInstance(instance) : null;
    if (healthy && !startup.spawnError && child.exitCode === null && child.signalCode === null) return healthy;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(50, Math.max(0, timeoutMs - (performance.now() - began)))));
  }
  startup.elapsedMs = Math.round(performance.now() - began);
  return null;
}

async function reclaimPreviewChild(child: ChildProcess, startup: PreviewStartup): Promise<'already-exited' | 'terminated'> {
  const exited = (): boolean => Boolean(startup.spawnError || child.exitCode !== null || child.signalCode !== null);
  if (exited()) return 'already-exited';
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGKILL'];
  for (const signal of signals) {
    if (!child.kill(signal) && !exited()) throw new Error(`无法发送 ${signal}：${startup.processError?.message || 'child.kill returned false'}`);
    const deadline = performance.now() + 1000;
    while (!exited() && performance.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 25));
    if (exited()) return 'terminated';
  }
  throw new Error('预览子进程在终止信号后仍未确认退出。');
}

function requestInstanceShutdown(instance: PreviewInstance): Promise<void> {
  const url = new URL('/api/v1/app/quit-instance', instance.url);
  return new Promise<void>((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers: { 'x-buildr-instance': instance.secret } }, (response) => {
      response.resume();
      response.on('end', () => response.statusCode === 202 ? resolve() : reject(new Error(`preview 停止请求失败：HTTP ${response.statusCode}`)));
    });
    request.once('error', reject);
    request.end();
  });
}

export function readPreviewIdentityFromEnvironment(env: NodeJS.ProcessEnv = process.env): PreviewOwner | null {
  const raw = env.BUILDR_LOCAL_APP_PREVIEW;
  if (!raw) return null;
  try { return parsePreviewOwner(JSON.parse(raw)); } catch { return null; }
}

export function resolveTaskPreviewWorktree(runtime: PreviewRuntime, workspaceRoot: string, taskId: string): TaskPreviewWorktree {
  const inspected = runtime.inspectGitWorktrees({ workspaceRoot, taskId });
  if (inspected.status !== 'ready') {
    throw codedError(inspected.diagnostic?.message || `Task Worktree 未 ready：${taskId}。`, inspected.diagnostic?.code || 'preview_worktree_not_ready');
  }
  const workspace = inspected.repositories.find((repository) => repository.selector === 'workspace');
  if (!workspace?.checkoutPath || workspace.state !== 'ready') throw codedError('Task Worktree 缺少 ready workspace repository。', 'preview_worktree_scope_missing');
  const stored = runtime.readGitWorktreeEvidence(workspaceRoot, taskId);
  return {
    taskId,
    workspaceRoot,
    worktree: workspace.checkoutPath,
    evidencePath: stored.file,
    planDigest: stored.evidence.planDigest,
    repositorySet: inspected.repositories.map((repository) => ({ selector: repository.selector, checkoutPath: repository.checkoutPath || '', branch: repository.branch, head: repository.head })),
  };
}

export async function startPreview(runtime: PreviewRuntime, name: string, args: string[], options: PreviewStartOptions = {}): Promise<PreviewResult> {
  const cliPath = options.cliPath || process.argv[1];
  const dataRoot = options.dataRoot || buildrWebDataRoot();
  const startupTimeoutMs = options.startupTimeoutMs ?? 10_000;
  const instance = assertPreviewName(name);
  runtime.assertNoUnknownOptions(args, new Set(['--target', '--task', '--port', '--no-open', '--json']), new Set(['--no-open', '--json']));
  const requestedRoot = path.resolve(runtime.optionValue(args, '--target', process.cwd()) || process.cwd());
  const taskId = runtime.optionValue(args, '--task', null);
  let targetRoot = requestedRoot;
  let taskWorktree: TaskPreviewWorktree | null = null;
  let appInvocation: ProductInvocation = { ...runtime.currentProductInvocation({ cliPath }), sourceRoot: runtime.productRoot() };
  if (taskId) {
    const workspaceRoot = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(requestedRoot));
    taskWorktree = resolveTaskPreviewWorktree(runtime, workspaceRoot, taskId);
    targetRoot = taskWorktree.worktree;
    const candidateProductRoot = path.resolve(targetRoot, path.relative(workspaceRoot, runtime.productRoot()));
    const candidateCli = path.join(candidateProductRoot, 'bin', 'buildr.mjs');
    if (!fs.statSync(candidateCli, { throwIfNoEntry: false })?.isFile()) throw codedError(`Task Worktree 中没有Buildr Product CLI：${candidateCli}。`, 'preview_worktree_cli_missing');
    appInvocation = { ...runtime.currentProductInvocation({ cliPath: candidateCli }), sourceRoot: candidateProductRoot };
  } else runtime.assertInitializedBuildrWorkspace(targetRoot);
  const rawPort = runtime.optionValue(args, '--port', '0') || '0';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
  const owner = previewOwnerForWorktree(instance, targetRoot, appInvocation.sourceRoot, taskWorktree);
  const existingOwner = readPreviewOwner(instance, dataRoot);
  const existingInstance = readPreviewInstance(instance, dataRoot);
  const healthy = await healthyInstance(existingInstance);
  if (healthy && !samePreviewOwner(existingOwner, owner)) {
    throw codedError(`预览实例 ${instance} 已在运行，但无法证明属于当前 worktree；请改用其他实例名，或由原 owner 停止它。`, 'preview_owner_conflict', { instance, owner: existingOwner });
  }
  if (healthy && existingOwner) {
    const result: PreviewResult = { schemaVersion: PREVIEW_SCHEMA, status: 'reused', owner: existingOwner, url: healthy.url, pid: healthy.pid };
    if (!args.includes('--no-open')) openBrowser(healthy.url);
    return result;
  }
  if (existingOwner && !samePreviewOwner(existingOwner, owner) && existingInstance) {
    throw codedError(`预览实例 ${instance} 留有其他 worktree 的陈旧记录；请由原 owner 执行 preview stop 后再复用。`, 'preview_owner_stale_conflict', { instance, owner: existingOwner });
  }
  const root = previewDataRoot(instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  writeOwner(runtime, owner, dataRoot);
  const logFile = path.join(root, 'preview.log');
  const logDescriptor = fs.openSync(logFile, 'a');
  let child: ChildProcess;
  try {
    child = spawn(appInvocation.command, [...appInvocation.argsPrefix, 'web', '--target', targetRoot, '--port', String(port), '--no-open'], {
      cwd: targetRoot,
      detached: true,
      stdio: ['ignore', logDescriptor, logDescriptor],
      env: { ...process.env, BUILDR_APP_DATA_DIR: root, BUILDR_LOCAL_APP_PREVIEW: JSON.stringify(owner) },
    });
  } finally { fs.closeSync(logDescriptor); }
  const startup: PreviewStartup = { spawnError: null, processError: null, phase: 'spawned', elapsedMs: 0 };
  child.on('error', (error) => {
    if (!child.pid) startup.spawnError = error;
    else startup.processError = error;
  });
  child.unref();
  const started = await waitForPreview(instance, dataRoot, child, startup, startupTimeoutMs);
  if (!started) {
    const failed = Boolean(startup.spawnError || child.exitCode !== null || child.signalCode !== null);
    let cleanup: string;
    try {
      cleanup = await reclaimPreviewChild(child, startup);
      const state = readPreviewInstance(instance, dataRoot);
      if (state?.pid === child.pid) runtime.removePath(previewInstancePath(instance, dataRoot));
      clearOwner(instance, dataRoot);
    } catch (error) {
      cleanup = errorMessage(error);
      writeOwner(runtime, { ...owner, managedProcess: { pid: child.pid || 0, state: 'cleanup-failed' } }, dataRoot);
    }
    let diagnostic: string | null = null;
    try { diagnostic = fs.readFileSync(logFile, 'utf8').trim().slice(-4096) || null; } catch {}
    const reason = failed ? '启动进程提前退出或无法创建' : '未在预期时间内就绪';
    const message = `预览实例 ${instance} ${reason}。pid=${child.pid ?? 'none'} phase=${startup.phase} elapsedMs=${startup.elapsedMs} exitCode=${child.exitCode} signal=${child.signalCode} cleanup=${cleanup}${startup.spawnError ? ` spawnError=${startup.spawnError.message}` : ''}${diagnostic ? `\n${diagnostic}` : ''}`;
    const code = !['terminated', 'already-exited'].includes(cleanup) ? 'preview_start_cleanup_failed' : failed ? 'preview_start_failed' : 'preview_start_timeout';
    throw codedError(message, code, { instance, pid: child.pid ?? null, phase: startup.phase, elapsedMs: startup.elapsedMs, exitCode: child.exitCode, signal: child.signalCode, cleanup, logFile, diagnostic });
  }
  const managedOwner: PreviewOwner = { ...owner, managedProcess: { pid: started.pid, url: started.url, state: 'healthy' } };
  writeOwner(runtime, managedOwner, dataRoot);
  const result: PreviewResult = { schemaVersion: PREVIEW_SCHEMA, status: 'started', owner: managedOwner, url: started.url, pid: started.pid };
  if (!args.includes('--no-open')) openBrowser(started.url);
  return result;
}

export async function listPreviews(options: { dataRoot?: string } = {}): Promise<{ schemaVersion: typeof PREVIEW_SCHEMA; previews: PreviewListItem[] }> {
  const dataRoot = options.dataRoot || buildrWebDataRoot();
  const root = path.join(path.resolve(dataRoot), 'previews');
  if (!fs.existsSync(root)) return { schemaVersion: PREVIEW_SCHEMA, previews: [] };
  const previews: PreviewListItem[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !PREVIEW_NAME.test(entry.name)) continue;
    const owner = readPreviewOwner(entry.name, dataRoot);
    if (!owner) continue;
    const instance = readPreviewInstance(entry.name, dataRoot);
    const healthy = await healthyInstance(instance);
    previews.push({ instance: entry.name, owner, url: instance?.url || null, pid: instance?.pid || null, status: healthy ? 'healthy' : instance ? 'stale' : 'stopped' });
  }
  return { schemaVersion: PREVIEW_SCHEMA, previews };
}

export async function stopPreview(name: string, options: PreviewStopOptions = {}): Promise<{ schemaVersion: typeof PREVIEW_SCHEMA; status: 'stopped' | 'stale_cleaned'; instance: string; owner: PreviewOwner }> {
  const dataRoot = options.dataRoot || buildrWebDataRoot();
  const instance = assertPreviewName(name);
  const owner = readPreviewOwner(instance, dataRoot);
  if (!owner) throw codedError(`预览实例不存在：${instance}`, 'preview_not_found');
  assertPreviewStopOwner(owner, options.caller || null);
  const state = readPreviewInstance(instance, dataRoot);
  const healthy = await healthyInstance(state);
  if (healthy) {
    await requestInstanceShutdown(healthy);
    for (let index = 0; index < 40; index += 1) {
      if (!await healthyInstance(readPreviewInstance(instance, dataRoot))) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    if (await healthyInstance(readPreviewInstance(instance, dataRoot))) throw codedError(`预览实例 ${instance} 停止后仍保持健康。`, 'preview_stop_unconfirmed');
  }
  if (!options.retainOwner) clearOwner(instance, dataRoot);
  return { schemaVersion: PREVIEW_SCHEMA, status: healthy ? 'stopped' : 'stale_cleaned', instance, owner };
}
