import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createReleaseToolRuntime } from './runtime.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

export const releaseExecutionBindingSchema = 'buildr.release-execution-binding/v2';

type ReleaseTask = { taskId: string; status: string };
type WorktreeRepository = { selector: string; checkoutPath: string; branch: string; head: string | null; state: string };
type WorktreeResult = { status: string; taskId: string; evidencePath: string | null; repositories: WorktreeRepository[] };
type WorktreeEvidence = { schemaVersion: string; taskId: string; status: string; branch: string; repositories: WorktreeRepository[] };
type ReleaseExecutionBinding = {
  schemaVersion: typeof releaseExecutionBindingSchema;
  version: string | null;
  selectionId?: string;
  taskId: string;
  workspaceRoot: string;
  executionRoot: string;
  branch: string;
  head: string;
  providerEvidence: string;
  providerIdentity: string;
  identity: string;
};

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const digest = (value: unknown): string => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/** A selection key names Git/Task resources; package versions retain their own meaning. */
export function releaseSelectionKey(input: { version?: string | null; selectionId?: string }): string {
  if (input.selectionId !== undefined) {
    const key = input.selectionId;
    if (typeof key !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]{0,238}[a-z0-9])?$/u.test(key)
        || key.includes('..') || key.endsWith('.lock')) throw new Error('Release selectionId must be a safe, bounded Git/Task identity.');
    return key;
  }
  if (typeof input.version !== 'string' || !VERSION.test(input.version)) throw new Error('Release version must be a valid semantic version without the leading v.');
  return input.version;
}

function selectedVersion(input: { version?: string | null; selectionId?: string }): string | null {
  releaseSelectionKey(input);
  const version = input.version ?? null;
  if (version !== null && (typeof version !== 'string' || !VERSION.test(version))) throw new Error('Release main package version is invalid.');
  return version;
}

function git(repo: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function samePath(left: string, right: string): boolean {
  return sameFilesystemPath(left, right);
}

function regularJson(filename: string): unknown {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Release execution provider evidence must be a regular file: ${filename}`);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function evidence(value: unknown): WorktreeEvidence {
  const item = record(value, 'worktree evidence');
  if (item.schemaVersion !== 'buildr.git-worktree-evidence/v1' || typeof item.taskId !== 'string' || item.status !== 'ready' || typeof item.branch !== 'string' || !Array.isArray(item.repositories)) throw new Error('Release Task Worktree evidence is invalid.');
  const repositories: WorktreeRepository[] = item.repositories.map((entry, index) => {
    const repository = record(entry, `worktree evidence repositories[${index}]`);
    if (typeof repository.selector !== 'string' || typeof repository.checkoutPath !== 'string' || typeof repository.branch !== 'string') throw new Error('Release Task Worktree repository evidence is invalid.');
    const head = typeof repository.head === 'string' ? repository.head : null;
    const state = typeof repository.state === 'string' ? repository.state : 'ready';
    return { selector: repository.selector, checkoutPath: repository.checkoutPath, branch: repository.branch, head, state };
  });
  return { schemaVersion: String(item.schemaVersion), taskId: item.taskId, status: item.status, branch: item.branch, repositories };
}

function binding(value: unknown): ReleaseExecutionBinding {
  const item = record(value, 'release execution binding');
  const fields = ['schemaVersion', 'version', 'selectionId', 'taskId', 'workspaceRoot', 'executionRoot', 'branch', 'head', 'providerEvidence', 'providerIdentity', 'identity'];
  for (const field of Object.keys(item)) if (!fields.includes(field)) throw new Error(`release execution binding.${field} is not supported.`);
  const text = (field: string): string => {
    const candidate = item[field];
    if (typeof candidate !== 'string') throw new Error(`Release execution binding ${field} is invalid.`);
    return candidate;
  };
  const selectionId = item.selectionId === undefined ? undefined : text('selectionId');
  const version = selectedVersion({ version: item.version as string | null, selectionId });
  const taskId = text('taskId');
  const workspaceRoot = text('workspaceRoot');
  const executionRoot = text('executionRoot');
  const branch = text('branch');
  const head = text('head');
  const providerEvidence = text('providerEvidence');
  const providerIdentity = text('providerIdentity');
  const savedIdentity = text('identity');
  if (item.schemaVersion !== releaseExecutionBindingSchema || taskId !== `release-${releaseSelectionKey({ version, selectionId })}` || !SHA.test(head) || !DIGEST.test(providerIdentity) || !DIGEST.test(savedIdentity)) throw new Error('Release execution binding identity is invalid.');
  const unsigned: Omit<ReleaseExecutionBinding, 'identity'> = {
    schemaVersion: releaseExecutionBindingSchema,
    version,
    taskId,
    workspaceRoot,
    executionRoot,
    branch,
    head,
    providerEvidence,
    providerIdentity,
    ...(selectionId === undefined ? {} : { selectionId }),
  };
  if (savedIdentity !== digest(unsigned)) throw new Error('Release execution binding identity mismatch.');
  return { ...unsigned, identity: savedIdentity };
}

export function createReleaseExecutionBinding(input: { version?: string | null; selectionId?: string; task: ReleaseTask; worktreeResult: WorktreeResult; workspaceRoot: string; repo: string }): ReleaseExecutionBinding {
  const taskId = `release-${releaseSelectionKey(input)}`;
  if (input.task?.taskId !== taskId || input.task.status !== 'active') throw new Error(`Release execution requires active Task ${taskId}.`);
  if (input.worktreeResult?.status !== 'ready' || input.worktreeResult.taskId !== taskId || !input.worktreeResult.evidencePath) throw new Error(`Release execution requires ready Worktree ${taskId}.`);
  const workspaceRoot = fs.realpathSync(path.resolve(input.workspaceRoot));
  const executionRoot = fs.realpathSync(path.resolve(input.repo));
  const providerEvidence = path.resolve(input.worktreeResult.evidencePath);
  const stored = evidence(regularJson(providerEvidence));
  const repository = stored.repositories.find((item) => item.selector === 'workspace');
  const observed = input.worktreeResult.repositories.find((item) => item.selector === 'workspace');
  if (stored.taskId !== taskId || !repository || !observed || observed.state !== 'ready' || !samePath(repository.checkoutPath, executionRoot) || !samePath(observed.checkoutPath, executionRoot) || repository.branch !== observed.branch) throw new Error('Release Worktree evidence does not match the execution root.');
  const topLevel = fs.realpathSync(git(executionRoot, ['rev-parse', '--show-toplevel']));
  const commonDir = path.resolve(executionRoot, git(executionRoot, ['rev-parse', '--git-common-dir']));
  if (samePath(topLevel, path.dirname(commonDir))) throw new Error('Release Git mutation is forbidden in the retained primary worktree.');
  const branch = git(executionRoot, ['branch', '--show-current']);
  const head = git(executionRoot, ['rev-parse', 'HEAD']);
  if (!samePath(topLevel, executionRoot) || branch !== observed.branch || head !== observed.head || !SHA.test(head)) throw new Error(`Release Worktree branch or HEAD identity is invalid: ${JSON.stringify({ topLevel, executionRoot, branch, expectedBranch: observed.branch, head, expectedHead: observed.head })}`);
  const unsigned: Omit<ReleaseExecutionBinding, 'identity'> = {
    schemaVersion: releaseExecutionBindingSchema,
    version: selectedVersion(input),
    taskId,
    workspaceRoot,
    executionRoot,
    branch,
    head,
    providerEvidence,
    providerIdentity: digest(stored),
    ...(input.selectionId === undefined ? {} : { selectionId: input.selectionId }),
  };
  return validateReleaseExecutionBinding({ ...unsigned, identity: digest(unsigned) }, { repo: executionRoot });
}

export function validateReleaseExecutionBinding(value: unknown, options: { repo?: string } = {}): ReleaseExecutionBinding {
  const normalized = binding(value);
  if (![normalized.workspaceRoot, normalized.executionRoot, normalized.providerEvidence].every(path.isAbsolute)) throw new Error('Release execution binding paths must be absolute.');
  const actualRepo = path.resolve(options.repo || normalized.executionRoot);
  if (!samePath(actualRepo, normalized.executionRoot)) throw new Error('Release repo does not match the bound Task Worktree execution root.');
  const stored = evidence(regularJson(normalized.providerEvidence));
  if (digest(stored) !== normalized.providerIdentity || stored.taskId !== normalized.taskId || stored.status !== 'ready') throw new Error('Release Worktree evidence drifted.');
  const repository = stored.repositories.find((item) => item.selector === 'workspace');
  if (!repository || !samePath(repository.checkoutPath, actualRepo) || repository.branch !== normalized.branch) throw new Error('Release Worktree ownership drifted.');
  const topLevel = fs.realpathSync(git(actualRepo, ['rev-parse', '--show-toplevel']));
  const commonDir = path.resolve(actualRepo, git(actualRepo, ['rev-parse', '--git-common-dir']));
  if (samePath(topLevel, path.dirname(commonDir))) throw new Error('Release Git mutation is forbidden in the retained primary worktree.');
  const actual = { branch: git(actualRepo, ['branch', '--show-current']), head: git(actualRepo, ['rev-parse', 'HEAD']) };
  if (!samePath(topLevel, normalized.executionRoot) || actual.branch !== normalized.branch || actual.head !== normalized.head) throw Object.assign(new Error('Release execution binding branch or HEAD drifted.'), { details: { expected: { root: normalized.executionRoot, branch: normalized.branch, head: normalized.head }, actual: { root: topLevel, ...actual } } });
  return normalized;
}

function option(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1]) throw new Error(`Missing required ${name}.`);
  return argv[index + 1];
}

export function resolveReleaseExecutionBinding(input: { version?: string | null; selectionId?: string; workspace: string; repo: string }, runtimeValue: any = createReleaseToolRuntime()): ReleaseExecutionBinding {
  const workspace = fs.realpathSync(path.resolve(input.workspace));
  const taskId = `release-${releaseSelectionKey(input)}`;
  const task = runtimeValue.inspectTask(workspace, taskId)?.record;
  const worktreeResult = runtimeValue.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
  return createReleaseExecutionBinding({ version: input.version, selectionId: input.selectionId, task, worktreeResult, workspaceRoot: workspace, repo: input.repo });
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const argv = process.argv.slice(2);
    if (argv[0] !== 'create') throw new Error('Usage: release-execution-binding.ts create [--version <main-version>] [--selection-id <id>] --workspace <canonical-root> --repo <task-root>');
    const version = argv.includes('--version') ? option(argv, '--version') : undefined;
    const selectionId = argv.includes('--selection-id') ? option(argv, '--selection-id') : undefined;
    const workspace = path.resolve(option(argv, '--workspace'));
    const repo = path.resolve(option(argv, '--repo'));
    const taskId = `release-${releaseSelectionKey({ version, selectionId })}`;
    const runtime = createReleaseToolRuntime();
    if (typeof runtime.inspectTask !== 'function' || typeof runtime.inspectGitWorktrees !== 'function') throw new Error('Release execution runtime ports are unavailable.');
    const taskResult = Reflect.apply(runtime.inspectTask, runtime, [workspace, taskId]);
    const worktreeResult = Reflect.apply(runtime.inspectGitWorktrees, runtime, [{ workspaceRoot: workspace, taskId }]) as WorktreeResult;
    const taskValue = record(record(taskResult, 'Task result').record, 'Task record');
    if (typeof taskValue.taskId !== 'string' || typeof taskValue.status !== 'string') throw new Error('Release Task record is invalid.');
    const task: ReleaseTask = { taskId: taskValue.taskId, status: taskValue.status };
    process.stdout.write(`${JSON.stringify(createReleaseExecutionBinding({ version, selectionId, task, worktreeResult, workspaceRoot: workspace, repo }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
