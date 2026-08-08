import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
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
const taskRuntime = createRuntime();

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
  return taskRuntime.createTaskRecord(root, { taskId, title: `Task ${taskId}`, intent: '验证 P0.2 Task Environment', projects: [], services: [], changes: [] });
}

function abandonTask(root, taskId, reason) {
  return taskRuntime.abandonTaskRecord(root, taskId, { reason });
}

function noServicePlan(taskId) {
  const file = path.join(managerFixtureRoot, `${taskId}-environment-plan.json`);
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 'buildr.task-environment-plan/v1', notApplicableReason: 'This fixture has no Service-scoped technical preparation.', services: [] })}\n`);
  return file;
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

test('Git provider cleanup 只容忍任意层级 Buildr control metadata，source dirt 仍 fail closed', (t) => {
  const root = fixtureWorkspace(t);
  const controlTask = 'provider-control-metadata-cleanup';
  const control = buildr(['worktree', 'create', controlTask, '--branch', `codex/${controlTask}`, '--start-point', 'main', '--target', root, '--json']);
  const nestedMetadata = path.join(control.repositories[0].checkoutPath, 'docs', '.buildr', 'receipt.yml');
  fs.mkdirSync(path.dirname(nestedMetadata), { recursive: true });
  fs.writeFileSync(nestedMetadata, 'status: current\n');
  const cleaned = buildr(['worktree', 'cleanup', controlTask, '--integrated-ref', 'workspace=main', '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned', JSON.stringify(cleaned, null, 2));
  assert.equal(fs.existsSync(control.repositories[0].checkoutPath), false);

  const sourceTask = 'provider-source-dirt-blocked';
  const source = buildr(['worktree', 'create', sourceTask, '--branch', `codex/${sourceTask}`, '--start-point', 'main', '--target', root, '--json']);
  const dirtySource = path.join(source.repositories[0].checkoutPath, 'source-dirty.txt');
  fs.writeFileSync(dirtySource, 'uncommitted source\n');
  const blocked = buildr(['worktree', 'cleanup', sourceTask, '--integrated-ref', 'workspace=main', '--target', root, '--json'], 1);
  assert.equal(blocked.diagnostic.code, 'git_worktree_dirty');
  assert.equal(fs.existsSync(source.repositories[0].checkoutPath), true);
  fs.rmSync(dirtySource);
  const sourceCleaned = buildr(['worktree', 'cleanup', sourceTask, '--integrated-ref', 'workspace=main', '--target', root, '--json']);
  assert.equal(sourceCleaned.status, 'cleaned');
});

test('共享 Task Environment 以正式 Task 为门禁并串联占用、恢复与 cleanup', (t) => {
  const root = fixtureWorkspace(t, { git: false });
  const ownerTask = 'shared-owner';
  const waiterTask = 'shared-waiter';
  const unavailable = buildr(['task', 'environment', 'inspect', ownerTask, '--target', root, '--json'], 1);
  assert.equal(unavailable.status, 'blocked');
  assert.equal(unavailable.diagnostic.code, 'task_record_not_found');

  const owner = createTask(root, ownerTask);
  createTask(root, waiterTask);
  const taskRecordBefore = owner.record;
  const taskDigestBefore = owner.recordDigest;
  const prepared = buildr(['task', 'environment', 'prepare', ownerTask, '--plan', noServicePlan(ownerTask), '--shared', '--agent', 'codex', '--target', root, '--json']);
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v4');
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
  const taskAfterPrepare = buildr(['task', 'inspect', ownerTask, '--target', root, '--json']);
  assert.deepEqual(taskAfterPrepare.record, taskRecordBefore);
  assert.equal(taskAfterPrepare.recordDigest, taskDigestBefore);

  const inspected = buildr(['task', 'environment', 'inspect', ownerTask, '--target', root, '--json']);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.source, 'current-machine');
  assert.ok(inspected.observedAt);

  const blocked = buildr(['task', 'environment', 'prepare', waiterTask, '--plan', noServicePlan(waiterTask), '--shared', '--target', root, '--json'], 1);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'task_environment_shared_occupancy_conflict');
  assert.equal(blocked.diagnostic.details.occupied.taskId, ownerTask);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', waiterTask, 'environment.json')), false);

  abandonTask(root, ownerTask, 'release shared root');
  const cleaned = buildr(['task', 'environment', 'cleanup', ownerTask, '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.environment.latest.cleanup.status, 'cleaned');
  assert.equal(cleaned.effects.some((effect) => effect.type === 'shared-scope-retained' && effect.selector === 'workspace'), true);
  assert.match(cleaned.environment.latest.cleanup.summary, /共享执行根已保留/);
  assert.equal(buildr(['task', 'inspect', ownerTask, '--target', root, '--json']).record.status, 'abandoned');

  const resumed = buildr(['task', 'environment', 'prepare', waiterTask, '--plan', noServicePlan(waiterTask), '--shared', '--target', root, '--json']);
  assert.equal(resumed.status, 'ready');
  abandonTask(root, waiterTask, 'fixture complete');
  buildr(['task', 'environment', 'cleanup', waiterTask, '--target', root, '--json']);
});

test('Git-backed Task Environment 组合 provider 并把 Git evidence 保持为窄引用', (t) => {
  const root = fixtureWorkspace(t);
  const taskId = 'git-environment';
  createTask(root, taskId);
  const prepared = buildr(['task', 'environment', 'prepare', taskId, '--plan', noServicePlan(taskId), '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json']);
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  const scope = prepared.environment.scopes[0];
  assert.equal(scope.executionRoot, path.join(root, '.worktrees', taskId));
  assert.equal(scope.validationRoot, path.join(root, '.worktrees', taskId));
  assert.equal(scope.shared, false);
  assert.equal(scope.provider.capability, 'buildr.git-worktree-provider/v1');
  assert.equal(prepared.execution.workdir, scope.validationRoot);
  assert.equal(prepared.execution.cliInvocation.kind, 'stable-controller');
  assert.equal(fs.existsSync(scope.provider.evidence), true);
  const provider = JSON.parse(fs.readFileSync(scope.provider.evidence, 'utf8'));
  assert.equal(provider.schemaVersion, 'buildr.git-worktree-evidence/v1');
  assert.equal(provider.repositories[0].checkoutPath, scope.executionRoot);
  abandonTask(root, taskId, 'integration fixture complete');
  const cleaned = buildr(['task', 'environment', 'cleanup', taskId, '--target', root, '--json']);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(fs.existsSync(scope.executionRoot), false);
  assert.equal(fs.existsSync(scope.provider.evidence), false);
  const opened = taskRuntime.openWorkspaceStructuredStore(root, { writable: false });
  const current = opened.database.prepare('SELECT status FROM task_environment_current WHERE task_id = ?').get(taskId);
  opened.database.close();
  assert.equal(current.status, 'cleaned');
});
