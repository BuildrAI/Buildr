import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { materializeCleanProductSource } from '../helpers/clean-product-source.mjs';

const sourceProductRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const managerFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-clean-environment-manager-'));
const { root: productRoot, cli } = materializeCleanProductSource(sourceProductRoot, path.join(managerFixtureRoot, 'product'));

function command(cwd, executable, args, expectedStatus = 0, env = process.env) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', env });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function buildr(args, expectedStatus = 0, env = process.env) {
  const result = command(productRoot, process.execPath, [cli, ...args], expectedStatus, env);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

const fixtureWorkspaces = new Map();

function fixtureWorkspace(_t, { git = true } = {}) {
  const key = git ? 'git' : 'shared';
  if (fixtureWorkspaces.has(key)) return fixtureWorkspaces.get(key);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-task-environment-${key}-`));
  command(productRoot, process.execPath, [cli, 'init', '--agent', 'codex', '--target', root, '--name', 'environment-fixture', '--description', 'Task Environment fixture', '--profile', 'team']);
  if (git) {
    command(root, 'git', ['init', '-b', 'main']);
    command(root, 'git', ['config', 'user.name', 'Buildr Test']);
    command(root, 'git', ['config', 'user.email', 'buildr-test@example.com']);
    command(root, 'git', ['add', '.']);
    command(root, 'git', ['commit', '-m', 'baseline']);
  }
  const resolved = fs.realpathSync(root);
  fixtureWorkspaces.set(key, resolved);
  return resolved;
}

after(() => {
  for (const root of fixtureWorkspaces.values()) fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(managerFixtureRoot, { recursive: true, force: true });
});

function createTask(root, taskId) {
  return buildr(['task', 'create', taskId, '--title', `Task ${taskId}`, '--intent', '验证 P0.2 Task Environment', '--target', root, '--json']);
}

test('worktree CLI 只维护窄 Git provider evidence', (t) => {
  const root = fixtureWorkspace(t);
  const taskId = 'git-provider';
  const created = buildr(['worktree', 'create', taskId, '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json']);
  assert.equal(created.schemaVersion, 'buildr.git-worktree-result/v1');
  assert.equal(created.operation, 'create');
  assert.equal(created.status, 'ready');
  assert.deepEqual(created.repositories.map((item) => item.selector), ['workspace']);
  assert.equal(created.repositories[0].checkoutPath, path.join(root, '.worktrees', taskId));
  assert.equal(created.repositories[0].registered, true);
  assert.equal(fs.existsSync(created.evidencePath), true);

  const evidence = JSON.parse(fs.readFileSync(created.evidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, 'buildr.git-worktree-evidence/v1');
  for (const forbidden of ['ready', 'runtime', 'dependencies', 'projection', 'resources', 'controller', 'session', 'cleanup']) {
    assert.equal(Object.hasOwn(evidence, forbidden), false, forbidden);
  }
  const evidenceBytes = fs.readFileSync(created.evidencePath, 'utf8');
  fs.writeFileSync(created.evidencePath, `${JSON.stringify({ ...evidence, ready: true }, null, 2)}\n`);
  const invalidEvidence = buildr(['worktree', 'inspect', taskId, '--target', root, '--json'], 1);
  assert.equal(invalidEvidence.diagnostic.code, 'git_worktree_inspect_failed');
  fs.writeFileSync(created.evidencePath, evidenceBytes);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', taskId, 'environment.json')), false);

  const inspected = buildr(['worktree', 'inspect', taskId, '--target', root, '--json']);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.repositories[0].state, 'ready');

  const missingDelivery = buildr(['worktree', 'cleanup', taskId, '--target', root, '--json'], 1);
  assert.equal(missingDelivery.diagnostic.code, 'git_worktree_integrated_ref_missing');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), true);

  const cleaned = buildr(['worktree', 'cleanup', taskId, '--integrated-ref', 'workspace=main', '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.repositories[0].state, 'removed');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), false);
  assert.equal(fs.existsSync(created.evidencePath), false);
});

test('worktree provider plan 冲突在新 Git mutation 前 fail closed', (t) => {
  const root = fixtureWorkspace(t);
  const taskId = 'provider-conflict';
  const occupied = path.join(root, '.worktrees', taskId);
  fs.mkdirSync(occupied, { recursive: true });
  fs.writeFileSync(path.join(occupied, 'owner.txt'), 'foreign\n');
  const blocked = buildr(['worktree', 'create', taskId, '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json'], 1);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'git_worktree_preflight_failed');
  assert.deepEqual(blocked.effects, []);
  assert.equal(fs.readFileSync(path.join(occupied, 'owner.txt'), 'utf8'), 'foreign\n');
  assert.equal(command(root, 'git', ['show-ref', '--verify', '--quiet', `refs/heads/codex/${taskId}`], 1).status, 1);
});

test('Git provider cleanup 可从 worktree 已删除但本地分支尚未删除的部分效果恢复', (t) => {
  const root = fixtureWorkspace(t);
  const taskId = 'provider-cleanup-resume';
  const created = buildr(['worktree', 'create', taskId, '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json']);
  const injected = buildr(['worktree', 'cleanup', taskId, '--integrated-ref', 'workspace=main', '--target', root, '--json'], 1, { ...process.env, BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR: 'workspace' });
  assert.equal(injected.diagnostic.code, 'git_worktree_branch_remove_failed');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), false);
  assert.equal(fs.existsSync(created.evidencePath), true);
  assert.equal(command(root, 'git', ['show-ref', '--verify', '--quiet', `refs/heads/codex/${taskId}`]).status, 0);

  const resumed = buildr(['worktree', 'cleanup', taskId, '--integrated-ref', 'workspace=main', '--target', root, '--json']);
  assert.equal(resumed.status, 'cleaned');
  assert.equal(resumed.effects.some((effect) => effect.type === 'worktree-absence-confirmed'), true);
  assert.equal(command(root, 'git', ['show-ref', '--verify', '--quiet', `refs/heads/codex/${taskId}`], 1).status, 1);
  assert.equal(fs.existsSync(created.evidencePath), false);
});

test('共享 Task Environment 以正式 Task 为门禁并独占 ready、恢复与 cleanup', (t) => {
  const root = fixtureWorkspace(t, { git: false });
  const taskId = 'shared-environment';
  const unavailable = buildr(['task', 'environment', 'inspect', taskId, '--target', root, '--json'], 1);
  assert.equal(unavailable.status, 'blocked');
  assert.equal(unavailable.diagnostic.code, 'task_record_not_found');

  const task = createTask(root, taskId);
  const taskBytes = fs.readFileSync(task.path, 'utf8');
  const prepared = buildr(['task', 'environment', 'prepare', taskId, '--shared', '--agent', 'codex', '--target', root, '--json']);
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v1');
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.environment.status, 'ready');
  assert.equal(prepared.environment.scopes[0].executionRoot, root);
  assert.equal(prepared.environment.scopes[0].validationRoot, root);
  assert.equal(prepared.environment.scopes[0].shared, true);
  assert.equal(prepared.environment.scopes[0].provider, null);
  assert.equal(prepared.execution.ready, true);
  assert.equal(prepared.execution.workdir, root);
  assert.deepEqual(prepared.execution.allowedExecutionRoots, [root]);
  assert.equal(path.isAbsolute(prepared.execution.cliInvocation.command), true);
  assert.equal(fs.readFileSync(task.path, 'utf8'), taskBytes);

  const restored = buildr(['task', 'environment', 'prepare', taskId, '--agent', 'codex', '--target', root, '--json']);
  assert.equal(restored.status, 'ready');
  assert.equal(restored.environment.controller.identity, prepared.environment.controller.identity);
  const inspected = buildr(['task', 'environment', 'inspect', taskId, '--target', root, '--json']);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.source, 'current-machine');
  assert.ok(inspected.observedAt);

  const unauthorized = buildr(['task', 'environment', 'cleanup', taskId, '--target', root, '--json'], 1);
  assert.equal(unauthorized.diagnostic.code, 'task_environment_cleanup_unauthorized');
  buildr(['task', 'abandon', taskId, '--reason', 'integration fixture complete', '--target', root, '--json']);
  const cleaned = buildr(['task', 'environment', 'cleanup', taskId, '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.environment.latest.cleanup.status, 'cleaned');
  assert.equal(cleaned.effects.some((effect) => effect.type === 'shared-scope-retained' && effect.selector === 'workspace'), true);
  assert.match(cleaned.environment.latest.cleanup.summary, /共享执行根已保留/);
  assert.equal(fs.existsSync(task.path), true);
});

test('共享执行根只允许一个未清理 Task 占用，清理后下一 Task 才能准备', (t) => {
  const root = fixtureWorkspace(t, { git: false });
  createTask(root, 'shared-owner');
  createTask(root, 'shared-waiter');
  const owner = buildr(['task', 'environment', 'prepare', 'shared-owner', '--shared', '--target', root, '--json']);
  assert.equal(owner.status, 'ready');

  const blocked = buildr(['task', 'environment', 'prepare', 'shared-waiter', '--shared', '--target', root, '--json'], 1);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'task_environment_shared_occupancy_conflict');
  assert.equal(blocked.diagnostic.details.occupied.taskId, 'shared-owner');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'shared-waiter', 'environment.json')), false);

  buildr(['task', 'abandon', 'shared-owner', '--reason', 'release shared root', '--target', root, '--json']);
  buildr(['task', 'environment', 'cleanup', 'shared-owner', '--target', root, '--json']);
  const resumed = buildr(['task', 'environment', 'prepare', 'shared-waiter', '--shared', '--target', root, '--json']);
  assert.equal(resumed.status, 'ready');
  buildr(['task', 'abandon', 'shared-waiter', '--reason', 'fixture complete', '--target', root, '--json']);
  buildr(['task', 'environment', 'cleanup', 'shared-waiter', '--target', root, '--json']);
});

test('Git-backed Task Environment 组合 provider 并把 Git evidence 保持为窄引用', (t) => {
  const root = fixtureWorkspace(t);
  const taskId = 'git-environment';
  createTask(root, taskId);
  const prepared = buildr(['task', 'environment', 'prepare', taskId, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json']);
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  const scope = prepared.environment.scopes[0];
  assert.equal(scope.executionRoot, path.join(root, '.worktrees', taskId));
  assert.equal(scope.validationRoot, path.join(root, '.worktrees', taskId));
  assert.equal(scope.shared, false);
  assert.equal(scope.provider.capability, 'buildr.git-worktree-provider/v1');
  assert.equal(prepared.execution.workdir, scope.validationRoot);
  assert.equal(prepared.execution.cliInvocation.kind, 'stable-controller');
  assert.equal(fs.existsSync(scope.provider.evidence), true);
  const provider = buildr(['worktree', 'inspect', taskId, '--target', root, '--json']);
  assert.equal(provider.status, 'ready');
  assert.equal(provider.repositories[0].checkoutPath, scope.executionRoot);

  const restored = buildr(['task', 'environment', 'prepare', taskId, '--agent', 'codex', '--target', root, '--json']);
  assert.equal(restored.status, 'ready');
  assert.equal(restored.environment.scopes[0].executionRoot, scope.executionRoot);
  const switched = buildr(['task', 'environment', 'prepare', taskId, '--shared', '--target', root, '--json'], 1);
  assert.equal(switched.diagnostic.code, 'task_environment_plan_mismatch');
  assert.equal(buildr(['task', 'environment', 'inspect', taskId, '--target', root, '--json']).status, 'ready');

  buildr(['task', 'abandon', taskId, '--reason', 'integration fixture complete', '--target', root, '--json']);
  const cleaned = buildr(['task', 'environment', 'cleanup', taskId, '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(fs.existsSync(scope.executionRoot), false);
  assert.equal(fs.existsSync(scope.provider.evidence), false);
  const receipt = JSON.parse(fs.readFileSync(path.join(root, '.buildr', 'tasks', taskId, 'environment.json'), 'utf8'));
  assert.equal(receipt.status, 'cleaned');
});
