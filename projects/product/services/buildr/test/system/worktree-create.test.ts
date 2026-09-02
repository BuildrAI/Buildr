import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerGitWorktreeProvider } from '../../src/task/infrastructure/git-worktree-provider.ts';
import { materializeCleanProductSource } from '../helpers/clean-product-source.mjs';

type JsonObject = Record<string, unknown>;
type RepositoryResult = JsonObject & {
  selector: string;
  checkoutPath: string;
  branch: string;
  head: string | null;
  state: string;
};
type WorktreeResult = JsonObject & {
  status: string;
  operation: string;
  taskId: string;
  evidencePath: string;
  repositories: RepositoryResult[];
  effects: JsonObject[];
  diagnostic: { code: string; message: string } | null;
};

const sourceProductRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const managerFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-worktree-provider-'));
const { root: productRoot, cli } = materializeCleanProductSource(sourceProductRoot, path.join(managerFixtureRoot, 'product'));
const fixtureRoots: string[] = [];

after(() => {
  for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(managerFixtureRoot, { recursive: true, force: true });
});

function command(
  cwd: string,
  executable: string,
  args: readonly string[],
  expectedStatus = 0,
  env: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', env });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function git(cwd: string, args: readonly string[], expectedStatus = 0): string {
  return command(cwd, 'git', args, expectedStatus).stdout.trim();
}

function parseResult(stdout: string): WorktreeResult {
  const value: unknown = JSON.parse(stdout);
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  const record = Object.fromEntries(Object.entries(value));
  assert.ok(Array.isArray(record.repositories));
  assert.ok(Array.isArray(record.effects));
  return {
    ...record,
    status: String(record.status),
    operation: String(record.operation),
    taskId: String(record.taskId),
    evidencePath: String(record.evidencePath),
    repositories: record.repositories.map((entry) => {
      assert.ok(entry && typeof entry === 'object' && !Array.isArray(entry));
      const repository = Object.fromEntries(Object.entries(entry));
      return {
        ...repository,
        selector: String(repository.selector),
        checkoutPath: String(repository.checkoutPath),
        branch: String(repository.branch),
        head: repository.head === null ? null : String(repository.head),
        state: String(repository.state),
      };
    }),
    effects: record.effects.map((entry) => {
      assert.ok(entry && typeof entry === 'object' && !Array.isArray(entry));
      return Object.fromEntries(Object.entries(entry));
    }),
    diagnostic: record.diagnostic && typeof record.diagnostic === 'object' && !Array.isArray(record.diagnostic)
      ? { code: String(Reflect.get(record.diagnostic, 'code')), message: String(Reflect.get(record.diagnostic, 'message')) }
      : null,
  };
}

function buildr(args: readonly string[], expectedStatus = 0, env: NodeJS.ProcessEnv = process.env): WorktreeResult {
  return parseResult(command(productRoot, process.execPath, [cli, ...args], expectedStatus, env).stdout);
}

function createGitWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-worktree-cli-'));
  fixtureRoots.push(root);
  command(productRoot, process.execPath, [
    cli, 'init', '--agent', 'codex', '--target', root,
    '--name', 'worktree-fixture', '--description', 'Git Worktree provider fixture', '--profile', 'team',
  ]);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr-test@example.com']);
  fs.appendFileSync(path.join(root, '.gitignore'), '.worktrees/\nprojects/\n');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git(root, ['add', '--', '.gitignore', 'base.txt']);
  git(root, ['commit', '-m', 'baseline']);
  return fs.realpathSync(root);
}

function createArgs(root: string, taskId: string): string[] {
  return ['worktree', 'create', taskId, '--branch', `codex/${taskId}`, '--start-point', 'main', '--target', root, '--json'];
}

function cleanupArgs(root: string, taskId: string, source: string, delivered: string): string[] {
  return [
    'worktree', 'cleanup', taskId,
    '--expected-source', `workspace=${source}`,
    '--delivered-ref', `workspace=${delivered}`,
    '--target', root, '--json',
  ];
}

test('worktree CLI创建、检查并按逐仓完整提交安全清理', () => {
  const root = createGitWorkspace();
  const taskId = 'direct-worktree';
  const created = buildr(createArgs(root, taskId));
  assert.equal(created.status, 'ready');
  assert.equal(created.repositories[0].selector, 'workspace');
  assert.equal(fs.existsSync(created.evidencePath), true);
  const source = git(created.repositories[0].checkoutPath, ['rev-parse', 'HEAD']);
  const delivered = git(root, ['rev-parse', 'main']);

  const inspected = buildr(['worktree', 'inspect', taskId, '--target', root, '--json']);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.repositories[0].state, 'ready');

  const missingCommand = command(productRoot, process.execPath, [cli, 'worktree', 'cleanup', taskId, '--target', root, '--json'], 2);
  const missing: unknown = JSON.parse(missingCommand.stdout);
  assert.ok(missing && typeof missing === 'object' && !Array.isArray(missing));
  assert.equal(Reflect.get(Reflect.get(missing, 'error'), 'code'), 'git_worktree_cli.syntax');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), true);

  const cleaned = buildr(cleanupArgs(root, taskId, source, delivered));
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.repositories[0].state, 'removed');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), false);
  assert.equal(fs.existsSync(created.evidencePath), false);
});

test('worktree provider完整预检在占用路径前零Git写入失败', () => {
  const root = createGitWorkspace();
  const taskId = 'occupied-worktree';
  const occupied = path.join(root, '.worktrees', taskId);
  fs.mkdirSync(occupied, { recursive: true });
  fs.writeFileSync(path.join(occupied, 'owner.txt'), 'foreign\n');
  const blocked = buildr(createArgs(root, taskId), 1);
  assert.equal(blocked.diagnostic?.code, 'git_worktree_preflight_failed');
  assert.deepEqual(blocked.effects, []);
  assert.equal(fs.readFileSync(path.join(occupied, 'owner.txt'), 'utf8'), 'foreign\n');
  git(root, ['show-ref', '--verify', '--quiet', `refs/heads/codex/${taskId}`], 1);
});

test('reviewed delivery允许不同提交编号并保护dirty与source漂移', () => {
  const root = createGitWorkspace();
  const taskId = 'reviewed-delivery';
  const created = buildr(createArgs(root, taskId));
  const checkout = created.repositories[0].checkoutPath;
  fs.writeFileSync(path.join(checkout, 'result.txt'), 'result\n');
  git(checkout, ['add', '--', 'result.txt']);
  git(checkout, ['commit', '-m', 'task result']);
  const source = git(checkout, ['rev-parse', 'HEAD']);
  git(root, ['commit', '--allow-empty', '-m', 'independent advance']);
  git(root, ['cherry-pick', source]);
  const delivered = git(root, ['rev-parse', 'HEAD']);
  assert.notEqual(source, delivered);
  git(root, ['merge-base', '--is-ancestor', source, delivered], 1);

  fs.writeFileSync(path.join(checkout, 'dirty.txt'), 'keep\n');
  const dirty = buildr(cleanupArgs(root, taskId, source, delivered), 1);
  assert.equal(dirty.diagnostic?.code, 'git_worktree_source_changed');
  assert.equal(fs.readFileSync(path.join(checkout, 'dirty.txt'), 'utf8'), 'keep\n');
  fs.unlinkSync(path.join(checkout, 'dirty.txt'));

  const wrongSource = buildr(cleanupArgs(root, taskId, '0'.repeat(40), delivered), 1);
  assert.equal(wrongSource.diagnostic?.code, 'git_worktree_source_changed');
  const cleaned = buildr(cleanupArgs(root, taskId, source, delivered));
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(fs.readFileSync(path.join(root, 'result.txt'), 'utf8'), 'result\n');
});

test('worktree cleanup从工作树已删但本地分支未删的部分效果恢复', () => {
  const root = createGitWorkspace();
  const taskId = 'cleanup-resume';
  const created = buildr(createArgs(root, taskId));
  const source = git(created.repositories[0].checkoutPath, ['rev-parse', 'HEAD']);
  const delivered = git(root, ['rev-parse', 'HEAD']);
  const partial = buildr(cleanupArgs(root, taskId, source, delivered), 1, {
    ...process.env,
    BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR: 'workspace',
  });
  assert.equal(partial.diagnostic?.code, 'git_worktree_branch_remove_failed');
  assert.equal(fs.existsSync(created.repositories[0].checkoutPath), false);
  assert.equal(fs.existsSync(created.evidencePath), true);

  const resumed = buildr(cleanupArgs(root, taskId, source, delivered));
  assert.equal(resumed.status, 'cleaned');
  assert.equal(resumed.effects.some((effect) => effect.type === 'worktree-absence-confirmed'), true);
  git(root, ['show-ref', '--verify', '--quiet', `refs/heads/codex/${taskId}`], 1);
});

test('多独立仓库要求成对覆盖全部selector并按nested-first清理', () => {
  const root = createGitWorkspace();
  const service = path.join(root, 'projects/demo/services/api');
  fs.mkdirSync(service, { recursive: true });
  git(service, ['init', '-b', 'main']);
  git(service, ['config', 'user.name', 'Buildr Test']);
  git(service, ['config', 'user.email', 'buildr-test@example.com']);
  fs.writeFileSync(path.join(service, '.gitignore'), '.worktrees/\n');
  fs.writeFileSync(path.join(service, 'base.txt'), 'base\n');
  git(service, ['add', '--', '.gitignore', 'base.txt']);
  git(service, ['commit', '-m', 'baseline']);

  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: () => root,
    atomicWriteJson: (file, value) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
    removePath: (file) => fs.rmSync(file, { force: true }),
    sameGitIdentity: (left, right) => left === right,
    readProjectRegistryRecord: () => ({
      registry: { migrationRequired: false },
      projects: { demo: { source: { type: 'workspace', path: 'projects/demo' } } },
    }),
    readServiceRegistryRecord: () => ({
      services: { api: { source: { type: 'git', path: 'projects/demo/services/api', git: { integrationBranch: 'main' } } } },
    }),
  });
  const taskId = 'multi-repository';
  const prepared = provider.prepareGitWorktrees({ workspaceRoot: root, taskId, branch: `codex/${taskId}`, includes: ['service:demo/api'] });
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.repositories.length, 2);
  const sourceHeads: Record<string, string> = {};
  const targetHeads: Record<string, string> = {};
  for (const repository of prepared.repositories) {
    const checkoutPath = String(repository.checkoutPath);
    const selector = String(repository.selector);
    sourceHeads[selector] = git(checkoutPath, ['rev-parse', 'HEAD']);
    targetHeads[selector] = selector === 'workspace' ? git(root, ['rev-parse', 'HEAD']) : git(service, ['rev-parse', 'HEAD']);
  }
  const partial = provider.cleanupGitWorktrees({
    workspaceRoot: root,
    taskId,
    allowCompleted: true,
    cleanupDelivery: {
      expectedSources: { workspace: sourceHeads.workspace },
      deliveredRefs: { workspace: targetHeads.workspace },
    },
  });
  assert.equal(partial.status, 'blocked');
  assert.equal(partial.diagnostic?.code, 'git_worktree_cleanup_delivery_invalid');
  for (const repository of prepared.repositories) assert.equal(fs.existsSync(String(repository.checkoutPath)), true);

  const cleaned = provider.cleanupGitWorktrees({
    workspaceRoot: root,
    taskId,
    allowCompleted: true,
    cleanupDelivery: { expectedSources: sourceHeads, deliveredRefs: targetHeads },
  });
  assert.equal(cleaned.status, 'cleaned');
  for (const repository of prepared.repositories) assert.equal(fs.existsSync(String(repository.checkoutPath)), false);
});
