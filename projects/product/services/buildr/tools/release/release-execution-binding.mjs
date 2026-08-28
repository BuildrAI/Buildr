import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

export const releaseExecutionBindingSchema = 'buildr.release-execution-binding/v1';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function samePath(left, right) {
  return fs.realpathSync(path.resolve(left)) === fs.realpathSync(path.resolve(right));
}

function regularJson(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Release execution provider evidence must be a regular file: ${filename}`);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
}

export function createReleaseExecutionBinding({ version, task, environmentResult, repo }) {
  const taskId = `release-${version}`;
  if (task?.taskId !== taskId || task?.status !== 'active') throw new Error(`Release execution requires active Task ${taskId}.`);
  if (environmentResult?.status !== 'ready' || environmentResult?.taskId !== taskId) throw new Error(`Release execution requires ready Environment ${taskId}.`);
  const environment = environmentResult.environment;
  const workspace = environment?.workspace;
  const scope = environment?.scopes?.find((item) => item.selector === 'workspace');
  const executionRoot = path.resolve(repo);
  if (!workspace?.root || !scope?.executionRoot || !samePath(scope.executionRoot, executionRoot)) throw new Error('Release repo is not the matching Task Environment workspace execution root.');
  const providerEvidence = path.resolve(scope.provider?.evidence ?? '');
  const evidence = regularJson(providerEvidence);
  const repository = evidence.repositories?.find((item) => item.selector === 'workspace');
  if (evidence.schemaVersion !== 'buildr.git-worktree-evidence/v1' || evidence.taskId !== taskId || evidence.status !== 'ready') throw new Error('Release Task worktree provider evidence is invalid.');
  if (!repository?.checkoutPath || !samePath(repository.checkoutPath, executionRoot) || repository.branch !== evidence.branch) throw new Error('Release Task worktree provider evidence does not match the execution root.');
  const branch = git(executionRoot, ['branch', '--show-current']);
  const head = git(executionRoot, ['rev-parse', 'HEAD']);
  const topLevel = git(executionRoot, ['rev-parse', '--show-toplevel']);
  const commonDir = path.resolve(executionRoot, git(executionRoot, ['rev-parse', '--git-common-dir']));
  const primaryRoot = path.dirname(commonDir);
  if (samePath(topLevel, primaryRoot)) throw new Error('Release Git mutation is forbidden in the retained primary worktree.');
  if (!samePath(topLevel, executionRoot) || branch !== repository.branch || !SHA.test(head)) throw new Error('Release Task worktree branch or HEAD identity is invalid.');
  const value = {
    schemaVersion: releaseExecutionBindingSchema,
    version,
    taskId,
    workspaceRoot: path.resolve(workspace.root),
    executionRoot,
    branch,
    head,
    providerEvidence,
    providerIdentity: digest(evidence),
    controllerIdentity: environment.controller?.identity ?? null,
    runtimeIdentity: environment.runtimeInvocation?.identity ?? null,
  };
  if (!DIGEST.test(value.controllerIdentity || '') || typeof value.runtimeIdentity !== 'string' || !value.runtimeIdentity) throw new Error('Release Task Environment controller/runtime identity is invalid.');
  value.identity = digest(value);
  return validateReleaseExecutionBinding(value, { repo: executionRoot });
}

export function validateReleaseExecutionBinding(value, { repo } = {}) {
  closed(value, ['schemaVersion', 'version', 'taskId', 'workspaceRoot', 'executionRoot', 'branch', 'head', 'providerEvidence', 'providerIdentity', 'controllerIdentity', 'runtimeIdentity', 'identity'], 'release execution binding');
  if (value.schemaVersion !== releaseExecutionBindingSchema || value.taskId !== `release-${value.version}`) throw new Error('Release execution binding Task/version is invalid.');
  if (!path.isAbsolute(value.workspaceRoot || '') || !path.isAbsolute(value.executionRoot || '') || !path.isAbsolute(value.providerEvidence || '')) throw new Error('Release execution binding paths must be absolute.');
  if (!SHA.test(value.head || '') || !DIGEST.test(value.providerIdentity || '') || !DIGEST.test(value.controllerIdentity || '')) throw new Error('Release execution binding identities are invalid.');
  const { identity, ...unsigned } = value;
  if (identity !== digest(unsigned)) throw new Error('Release execution binding identity mismatch.');
  const actualRepo = path.resolve(repo ?? value.executionRoot);
  if (!samePath(actualRepo, value.executionRoot)) throw new Error('Release repo does not match the bound Task Environment execution root.');
  const evidence = regularJson(value.providerEvidence);
  if (digest(evidence) !== value.providerIdentity || evidence.taskId !== value.taskId || evidence.status !== 'ready') throw new Error('Release worktree provider evidence drifted.');
  const repository = evidence.repositories?.find((item) => item.selector === 'workspace');
  if (!repository?.checkoutPath || !samePath(repository.checkoutPath, actualRepo) || repository.branch !== value.branch) throw new Error('Release worktree ownership drifted.');
  const topLevel = git(actualRepo, ['rev-parse', '--show-toplevel']);
  const commonDir = path.resolve(actualRepo, git(actualRepo, ['rev-parse', '--git-common-dir']));
  if (samePath(topLevel, path.dirname(commonDir))) throw new Error('Release Git mutation is forbidden in the retained primary worktree.');
  const actual = { branch: git(actualRepo, ['branch', '--show-current']), head: git(actualRepo, ['rev-parse', 'HEAD']) };
  if (!samePath(topLevel, value.executionRoot) || actual.branch !== value.branch || actual.head !== value.head) {
    const error = new Error('Release execution binding branch or HEAD drifted.');
    error.details = { expected: { root: value.executionRoot, branch: value.branch, head: value.head }, actual: { root: topLevel, ...actual } };
    throw error;
  }
  return value;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1]) throw new Error(`Missing required ${name}.`);
  return argv[index + 1];
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const argv = process.argv.slice(2);
    if (argv[0] !== 'create') throw new Error('Usage: release-execution-binding.mjs create --version <version> --workspace <canonical-root> --repo <task-root>');
    const version = option(argv, '--version');
    const workspace = path.resolve(option(argv, '--workspace'));
    const repo = path.resolve(option(argv, '--repo'));
    const taskId = `release-${version}`;
    const runtime = createRuntime();
    const task = runtime.inspectTaskRecord(workspace, taskId)?.record;
    const environmentResult = runtime.inspectTaskEnvironment(workspace, taskId);
    process.stdout.write(`${JSON.stringify(createReleaseExecutionBinding({ version, task, environmentResult, repo }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
