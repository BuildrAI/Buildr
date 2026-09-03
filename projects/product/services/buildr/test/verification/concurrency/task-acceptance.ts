import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { processesOverlap, spawnSupervised } from '../../helpers/child-process-supervisor.mjs';
import { materializeCleanProductSource } from '../../helpers/clean-product-source.mjs';
import { assertPreviewStopOwner, previewOwnerForWorktree, type PreviewCaller, type TaskPreviewWorktree } from '../../../src/web/application/preview-lifecycle.ts';

type JsonObject = Record<string, unknown>;

const sourceProductRoot = path.resolve(import.meta.dirname, '../../..');
const fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-concurrent-task-acceptance-')));
const { root: productRoot, cli } = materializeCleanProductSource(sourceProductRoot, path.join(fixtureRoot, 'product'));
const workspace = path.join(fixtureRoot, 'workspace');
const appData = path.join(fixtureRoot, 'app-data');
const environment = { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData };
const taskIds = ['acceptance-task-a', 'acceptance-task-b'];
const previews = taskIds.map((taskId) => `${taskId}-preview`);
const worktrees = new Map<string, string>();
const startedAt = Date.now();

const summary: JsonObject = {
  schemaVersion: 'buildr.concurrent-task-acceptance/v2',
  status: 'failed',
  tasks: [],
  workLocations: [],
  verificationRuns: [],
  previews: [],
  cleanup: [],
  durationMs: 0,
};

function run(args: readonly string[], expectedStatus = 0): SpawnSyncReturns<string> {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: productRoot,
    env: environment,
    encoding: 'utf8',
    timeout: process.platform === 'win32' ? 90_000 : 30_000,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function parseObject(stdout: string): JsonObject {
  const value: unknown = JSON.parse(stdout);
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

function rows(value: unknown): JsonObject[] {
  assert.ok(Array.isArray(value));
  return value.map((item) => {
    assert.ok(item && typeof item === 'object' && !Array.isArray(item));
    return Object.fromEntries(Object.entries(item));
  });
}

function object(value: unknown): JsonObject {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function worktreeArgs(action: 'create' | 'inspect', taskId: string): string[] {
  return action === 'create'
    ? ['worktree', 'create', taskId, '--branch', `codex/${taskId}`, '--start-point', 'dev', '--target', workspace, '--json']
    : ['worktree', 'inspect', taskId, '--target', workspace, '--json'];
}

function cleanupArgs(taskId: string, source: string, delivered: string): string[] {
  return [
    'worktree', 'cleanup', taskId,
    '--expected-source', `workspace=${source}`,
    '--delivered-ref', `workspace=${delivered}`,
    '--target', workspace,
    '--json',
  ];
}

try {
  run(['init', '--target', workspace, '--name', 'concurrent-acceptance', '--description', 'Concurrent owner acceptance', '--profile', 'team']);
  execFileSync('git', ['init', '--initial-branch=dev', workspace], { stdio: 'ignore' });
  git(workspace, ['config', 'user.email', 'buildr-test@example.com']);
  git(workspace, ['config', 'user.name', 'Buildr Test']);
  fs.appendFileSync(path.join(workspace, '.gitignore'), '.worktrees/\n');
  fs.writeFileSync(path.join(workspace, 'README.md'), '# concurrent acceptance\n');
  git(workspace, ['add', '.']);
  git(workspace, ['commit', '-m', 'fixture']);

  for (const taskId of taskIds) {
    const createdTask = parseObject(run([
      'task', 'create', taskId,
      '--title', taskId,
      '--intent', '验证独立工作位置与资源归属',
      '--target', workspace,
      '--json',
    ]).stdout);
    assert.equal(createdTask.status, 'created');

    const created = parseObject(run(worktreeArgs('create', taskId)).stdout);
    assert.equal(created.status, 'ready');
    const repository = rows(created.repositories)[0];
    const checkoutPath = String(repository.checkoutPath);
    assert.equal(path.isAbsolute(checkoutPath), true);
    worktrees.set(taskId, checkoutPath);
  }
  assert.notEqual(worktrees.get(taskIds[0]), worktrees.get(taskIds[1]));
  summary.tasks = [...taskIds];
  summary.workLocations = taskIds.map((taskId) => ({ taskId, workdir: worktrees.get(taskId) }));

  const verificationProcesses = taskIds.map((taskId) => spawnSupervised(process.execPath, [
    '-e', 'process.chdir(process.argv[1]); setTimeout(() => {}, 180)', worktrees.get(taskId) ?? '',
  ], {
    env: environment,
    timeoutMs: 10_000,
  }));
  const verificationResults = await Promise.all(verificationProcesses.map((item) => item.completed));
  assert.equal(processesOverlap(verificationResults[0], verificationResults[1]), true);
  assert.equal(verificationResults.every((item) => item.exitCode === 0), true);
  summary.verificationRuns = verificationResults.map((item, index) => ({ taskId: taskIds[index], durationMs: item.durationMs }));

  const previewOwners = taskIds.map((taskId, index) => {
    const inspected = parseObject(run(worktreeArgs('inspect', taskId)).stdout);
    const repositories = rows(inspected.repositories).map((repository) => ({
      selector: String(repository.selector),
      checkoutPath: String(repository.checkoutPath),
      branch: repository.branch === null ? null : String(repository.branch),
      head: repository.head === null ? null : String(repository.head),
    }));
    const evidencePath = String(inspected.evidencePath);
    const evidence = parseObject(fs.readFileSync(evidencePath, 'utf8'));
    const taskWorktree: TaskPreviewWorktree = {
      taskId,
      workspaceRoot: workspace,
      worktree: worktrees.get(taskId) ?? '',
      evidencePath,
      planDigest: String(evidence.planDigest),
      repositorySet: repositories,
    };
    return previewOwnerForWorktree(previews[index], taskWorktree.worktree, null, taskWorktree);
  });
  assert.notEqual(previewOwners[0].worktree, previewOwners[1].worktree);
  assert.deepEqual(previewOwners.map((owner) => owner.taskId), taskIds);
  summary.previews = previewOwners.map((owner) => ({ taskId: owner.taskId, instance: owner.instance, ownerMode: owner.identityMode }));

  const wrongCaller: PreviewCaller = {
    taskId: taskIds[0],
    workspaceRoot: workspace,
    worktree: previewOwners[0].worktree,
    worktreeEvidencePath: previewOwners[0].worktreeEvidencePath ?? '',
    worktreePlanDigest: previewOwners[0].worktreePlanDigest ?? '',
  };
  assert.throws(() => assertPreviewStopOwner(previewOwners[1], wrongCaller), (error) => error instanceof Error && 'code' in error && error.code === 'preview_stop_owner_mismatch');

  for (const taskId of taskIds) {
    const observed = parseObject(run(['task', 'inspect', taskId, '--target', workspace, '--json']).stdout);
    const completed = parseObject(run([
      'task', 'complete', taskId,
      '--summary', '并发能力验收完成',
      '--expected-record', String(Reflect.get(observed, 'recordDigest')),
      '--target', workspace,
      '--json',
    ]).stdout);
    assert.equal(completed.status, 'completed');
  }

  const dirtyTask = taskIds[0];
  const dirtyRoot = worktrees.get(dirtyTask);
  assert.ok(dirtyRoot);
  fs.writeFileSync(path.join(dirtyRoot, 'unsaved.txt'), 'preserve\n');
  const source = git(dirtyRoot, ['rev-parse', 'HEAD']);
  const delivered = git(workspace, ['rev-parse', 'dev']);
  const blocked = parseObject(run(cleanupArgs(dirtyTask, source, delivered), 1).stdout);
  assert.equal(Reflect.get(object(blocked.diagnostic), 'code'), 'git_worktree_source_changed');
  assert.equal(fs.readFileSync(path.join(dirtyRoot, 'unsaved.txt'), 'utf8'), 'preserve\n');
  const stillCompleted = parseObject(run(['task', 'inspect', dirtyTask, '--target', workspace, '--json']).stdout);
  assert.equal(Reflect.get(object(stillCompleted.record), 'status'), 'completed');
  fs.unlinkSync(path.join(dirtyRoot, 'unsaved.txt'));

  for (const taskId of taskIds) {
    const root = worktrees.get(taskId);
    assert.ok(root);
    const cleaned = parseObject(run(cleanupArgs(taskId, git(root, ['rev-parse', 'HEAD']), delivered)).stdout);
    assert.equal(cleaned.status, 'cleaned');
    summary.cleanup = [...rows(summary.cleanup), { taskId, status: cleaned.status }];
  }

  summary.status = 'passed';
} catch (error) {
  summary.error = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  process.exitCode = 1;
} finally {
  summary.durationMs = Date.now() - startedAt;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
