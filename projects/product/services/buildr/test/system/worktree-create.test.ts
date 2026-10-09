import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import test, { after, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerGitWorktreeProvider } from '../../src/modules/task/infrastructure/git-worktree-provider.ts';
import { createTaskProjectDocumentReader, type TaskDocumentWorktreeQuery } from '../../src/modules/task/materials/application/task-project-document-reader.ts';
import { materializeCleanProductSource } from '../helpers/clean-product-source.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { cleanupDefaultTestContextPool } from '../context/node-test.ts';

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
  cleanupDefaultTestContextPool();
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

function createGitWorkspace(t: TestContext, { viaCli = false } = {}): string {
  const root = viaCli
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-worktree-cli-'))
    : copyPreparedWorkspace(t, 'worktree-fixture').root;
  if (viaCli) {
    fixtureRoots.push(root);
    command(productRoot, process.execPath, [
      cli, 'init', '--agent', 'codex', '--target', root,
      '--name', 'worktree-fixture', '--description', 'Git Worktree provider fixture', '--profile', 'team',
    ]);
  }
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

function observedFile(root: string, checkoutPath: string, branch: string): string {
  const file = path.join(root, '.git', 'observed-checkouts.json');
  fs.writeFileSync(file, JSON.stringify([{ selector: 'workspace', sourceRepository: root, checkoutPath, branch }]));
  return file;
}

test('原型先于正式任务时沿用隔离标识并保留同一工作树的未提交成果', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'prototype-continuation';
  const inspectTask = () => JSON.parse(command(productRoot, process.execPath,
    [cli, 'task', 'inspect', taskId, '--target', root, '--json'], 1).stdout);
  assert.equal(inspectTask().diagnostic.code, 'task_record_not_found');

  const prototype = buildr(createArgs(root, taskId));
  const checkout = prototype.repositories[0].checkoutPath;
  const evidence = fs.readFileSync(prototype.evidencePath);
  const source = 'prototype implementation in progress\n';
  const page = '<!doctype html><!-- buildr:ui-prototype --><html><body>confirmed version</body></html>\n';
  fs.writeFileSync(path.join(checkout, 'base.txt'), source);
  fs.writeFileSync(path.join(checkout, 'prototype.html'), page);
  const status = git(checkout, ['status', '--porcelain']);
  const inventory = git(root, ['worktree', 'list', '--porcelain']);

  const input = path.join(root, '.buildr', 'local', 'prototype-task-input.md');
  fs.mkdirSync(path.dirname(input), { recursive: true });
  fs.writeFileSync(input, '# 接续确认原型\n\n在原型实际位置完成同一目标，保留现有源码与确认页面。\n');
  const registered = JSON.parse(command(productRoot, process.execPath, [
    cli, 'task', 'create', taskId, '--title', '接续确认原型', '--intent', '在既有隔离位置完成同一目标。',
    '--status', 'active', '--brief-file', input, '--target', root, '--json',
  ]).stdout);
  fs.unlinkSync(input);
  assert.equal(registered.status, 'created');
  assert.equal(registered.record.taskId, taskId);
  assert.match(registered.record.brief, /保留现有源码与确认页面/);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const continued = buildr(['worktree', 'inspect', taskId, '--target', root, '--json']);
    assert.equal(continued.status, 'ready');
    assert.equal(continued.evidenceSource, 'stored');
    assert.equal(continued.repositories[0].checkoutPath, checkout);
    assert.equal(continued.repositories[0].branch, prototype.repositories[0].branch);
    assert.equal(continued.repositories[0].head, prototype.repositories[0].head);
    assert.equal(continued.repositories[0].clean, false);
    assert.deepEqual(continued.effects, []);
  }
  assert.equal(git(root, ['worktree', 'list', '--porcelain']), inventory);
  assert.equal(git(checkout, ['status', '--porcelain']), status);
  assert.equal(fs.readFileSync(path.join(checkout, 'base.txt'), 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(checkout, 'prototype.html'), 'utf8'), page);
  assert.deepEqual(fs.readFileSync(prototype.evidencePath), evidence);
});

test('缺少历史登记时不误报cleaned，显式当前对象可检查和清理且不补造历史', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'external-worktree';
  const checkout = path.join(root, '.worktrees', 'other-host-location');
  const branch = `codex/${taskId}`;
  git(root, ['worktree', 'add', '-b', branch, checkout, 'main']);
  const head = git(checkout, ['rev-parse', 'HEAD']);
  const evidence = path.join(root, '.git', 'buildr', 'task-worktrees', `${taskId}.json`);
  const absentInput = buildr(cleanupArgs(root, taskId, head, head), 1);
  assert.equal(absentInput.status, 'blocked');
  assert.equal(absentInput.diagnostic?.code, 'git_worktree_evidence_missing');
  assert.deepEqual(absentInput.effects, []);
  assert.equal(fs.existsSync(checkout), true);

  const observation = observedFile(root, checkout, branch);
  const inspected = buildr(['worktree', 'inspect', taskId, '--target', root, '--observed-checkouts', observation, '--json']);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.evidenceSource, 'observed');
  assert.equal(inspected.repositories[0].startPoint, null);
  assert.equal(fs.existsSync(evidence), false);
  const args = [...cleanupArgs(root, taskId, head, head), '--observed-checkouts', observation];
  const cleaned = buildr(args);
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.evidenceSource, 'observed');
  assert.equal(cleaned.effects.some((item) => item.type === 'provider-evidence-removed'), false);
  assert.equal(fs.existsSync(checkout), false);
  assert.equal(fs.existsSync(evidence), false);
  git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], 1);

  const repeated = buildr(args);
  assert.equal(repeated.status, 'cleaned');
  assert.deepEqual(repeated.effects.map((item) => item.type), ['worktree-absence-confirmed', 'local-branch-absence-confirmed']);
});

test('缺少历史登记时仍保护脏文件、版本、保留引用、锁定和遗漏嵌套仓库', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'observed-safety';
  const checkout = path.join(root, '.worktrees', taskId);
  const branch = `codex/${taskId}`;
  git(root, ['worktree', 'add', '-b', branch, checkout, 'main']);
  const head = git(checkout, ['rev-parse', 'HEAD']);
  const observation = observedFile(root, checkout, branch);
  const args = [...cleanupArgs(root, taskId, head, head), '--observed-checkouts', observation];
  fs.writeFileSync(path.join(checkout, 'unsaved.txt'), 'preserve');
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_source_changed');
  assert.equal(fs.readFileSync(path.join(checkout, 'unsaved.txt'), 'utf8'), 'preserve');
  fs.unlinkSync(path.join(checkout, 'unsaved.txt'));
  assert.equal(buildr([...cleanupArgs(root, taskId, '0'.repeat(40), head), '--observed-checkouts', observation], 1).diagnostic?.code, 'git_worktree_source_changed');
  assert.equal(buildr([...cleanupArgs(root, taskId, head, '0'.repeat(40)), '--observed-checkouts', observation], 1).diagnostic?.code, 'git_worktree_delivery_target_mismatch');
  git(root, ['worktree', 'lock', checkout, '--reason', 'another agent is using this']);
  assert.equal(buildr(['worktree', 'inspect', taskId, '--target', root, '--observed-checkouts', observation, '--json']).status, 'ready');
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_identity_mismatch');
  git(root, ['worktree', 'unlock', checkout]);
  const nested = path.join(checkout, 'projects', 'unknown');
  fs.mkdirSync(nested, { recursive: true });
  git(nested, ['init', '-b', 'main']);
  const omitted = buildr(args, 1);
  assert.equal(omitted.diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.deepEqual(omitted.effects, []);
  assert.equal(fs.existsSync(path.join(nested, '.git')), true);
  assert.equal(git(root, ['rev-parse', branch]), head);
  fs.rmSync(nested, { recursive: true });
  git(checkout, ['init', '--bare', nested]);
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.equal(fs.existsSync(path.join(nested, 'HEAD')), true);
});

test('当前对象不能掩盖已有登记冲突或误指主目录及不同Git仓库', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'observed-identity';
  const created = buildr(createArgs(root, taskId));
  const checkout = created.repositories[0].checkoutPath;
  const head = git(root, ['rev-parse', 'HEAD']);
  const observation = observedFile(root, checkout, 'codex/wrong-owner');
  const args = [...cleanupArgs(root, taskId, head, head), '--observed-checkouts', observation];
  const valid = fs.readFileSync(observation, 'utf8');
  fs.writeFileSync(observation, JSON.stringify([...JSON.parse(valid), ...JSON.parse(valid)]));
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_observation_invalid');
  fs.writeFileSync(observation, valid);
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_identity_mismatch');
  const original = fs.readFileSync(created.evidencePath, 'utf8');
  fs.writeFileSync(created.evidencePath, '{invalid');
  assert.equal(buildr(args, 1).status, 'blocked');
  assert.equal(fs.readFileSync(created.evidencePath, 'utf8'), '{invalid');
  fs.writeFileSync(created.evidencePath, original);
  fs.unlinkSync(created.evidencePath);
  observedFile(root, root, 'main');
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_identity_mismatch');
  const foreign = path.join(root, '.worktrees', 'foreign');
  fs.mkdirSync(foreign, { recursive: true });
  git(foreign, ['init', '-b', 'main']);
  observedFile(root, foreign, `codex/${taskId}`);
  assert.equal(buildr(args, 1).diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.equal(fs.existsSync(checkout), true);
  assert.equal(fs.existsSync(path.join(foreign, '.git')), true);
});

test('无登记清理的部分效果可接续，分支被其他位置占用时保留', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'observed-resume';
  const checkout = path.join(root, '.worktrees', taskId);
  const branch = `codex/${taskId}`;
  git(root, ['worktree', 'add', '-b', branch, checkout, 'main']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const observation = observedFile(root, checkout, branch);
  const args = [...cleanupArgs(root, taskId, head, head), '--observed-checkouts', observation];
  const partial = buildr(args, 1, { ...process.env, BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR: 'workspace' });
  assert.equal(partial.diagnostic?.code, 'git_worktree_branch_remove_failed');
  assert.equal(fs.existsSync(checkout), false);
  const other = path.join(root, '.worktrees', 'new-owner');
  git(root, ['worktree', 'add', other, branch]);
  const occupied = buildr(args, 1);
  assert.equal(occupied.diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.deepEqual(occupied.effects, []);
  assert.equal(git(other, ['symbolic-ref', '--short', 'HEAD']), branch);
  git(root, ['worktree', 'remove', other]);
  assert.equal(buildr(args).status, 'cleaned');
});

test('worktree CLI创建、检查并按逐仓完整提交安全清理', (t) => {
  const root = createGitWorkspace(t, { viaCli: true });
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

test('worktree provider完整预检在占用路径前零Git写入失败', (t) => {
  const root = createGitWorkspace(t);
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

test('reviewed delivery允许不同提交编号并保护dirty与source漂移', (t) => {
  const root = createGitWorkspace(t);
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

test('worktree cleanup从工作树已删但本地分支未删的部分效果恢复', (t) => {
  const root = createGitWorkspace(t);
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

test('worktree inspect 对 linked worktree 目标归一到同一证据身份', (t) => {
  const root = createGitWorkspace(t);
  const taskId = 'linked-target';
  const created = buildr(createArgs(root, taskId));
  assert.equal(created.status, 'ready');
  const checkout = String(created.repositories[0].checkoutPath);

  // 真实 canonical workspace 的身份文件由 Git 跟踪，工作树内同样可见。
  fs.mkdirSync(path.join(checkout, '.buildr'), { recursive: true });
  fs.copyFileSync(path.join(root, '.buildr', 'workspace.yml'), path.join(checkout, '.buildr', 'workspace.yml'));
  fs.copyFileSync(path.join(root, 'AGENTS.md'), path.join(checkout, 'AGENTS.md'));
  fs.mkdirSync(path.join(checkout, 'projects'), { recursive: true });

  const fromCanonical = buildr(['worktree', 'inspect', taskId, '--target', root, '--json']);
  assert.equal(fromCanonical.status, 'ready');
  const fromWorktree = buildr(['worktree', 'inspect', taskId, '--target', checkout, '--json']);
  assert.equal(fromWorktree.status, 'ready');
  assert.deepEqual(
    fromWorktree.repositories.map((item) => [item.selector, item.checkoutPath]),
    fromCanonical.repositories.map((item) => [item.selector, item.checkoutPath]),
  );
});

test('多独立仓库要求成对覆盖全部selector并按nested-first清理', (t) => {
  const root = createGitWorkspace(t);
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

  const recreated = provider.prepareGitWorktrees({ workspaceRoot: root, taskId, branch: `codex/${taskId}`, includes: ['service:demo/api'] });
  assert.equal(recreated.status, 'ready');
  const observed = recreated.repositories.map((item) => ({ selector: String(item.selector), sourceRepository: String(item.sourceRepository), checkoutPath: String(item.checkoutPath), branch: String(item.branch) }));
  fs.unlinkSync(provider.gitWorktreeEvidencePath(root, taskId));
  const omitted = provider.cleanupGitWorktrees({ workspaceRoot: root, taskId, allowCompleted: true, observedCheckouts: observed.filter((item) => item.selector === 'workspace'), cleanupDelivery: { expectedSources: { workspace: sourceHeads.workspace }, deliveredRefs: { workspace: targetHeads.workspace } } });
  assert.equal(omitted.diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.deepEqual(omitted.effects, []);
  const observedPartial = provider.cleanupGitWorktrees({ workspaceRoot: root, taskId, allowCompleted: true, observedCheckouts: observed, cleanupDelivery: { expectedSources: { workspace: sourceHeads.workspace }, deliveredRefs: { workspace: targetHeads.workspace } } });
  assert.equal(observedPartial.diagnostic?.code, 'git_worktree_cleanup_delivery_invalid');
  const recovered = provider.cleanupGitWorktrees({ workspaceRoot: root, taskId, allowCompleted: true, observedCheckouts: observed, cleanupDelivery: { expectedSources: sourceHeads, deliveredRefs: targetHeads } });
  assert.equal(recovered.status, 'cleaned');
  assert.equal(recovered.evidenceSource, 'observed');
  assert.deepEqual(recovered.effects.filter((item) => item.type === 'worktree-removed').map((item) => item.selector), ['service:demo/api', 'workspace']);
  assert.equal(fs.existsSync(provider.gitWorktreeEvidencePath(root, taskId)), false);
});

test('非 Git 根通过公共入口隔离独立子仓库并保留资料', { timeout: 90_000 }, () => {
  const result = spawnSync(process.execPath, [
    path.join(sourceProductRoot, 'tools/development/run-isolated-workspace-smoke.ts'),
    '--script', path.join(sourceProductRoot, 'test/integration/non-git-workspace-continuity.test.ts'),
    '--', '--nested-git-isolation-scenario',
  ], { cwd: sourceProductRoot, encoding: 'utf8', timeout: 85_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Nested Git public Worktree lifecycle passed/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
  process.stdout.write(result.stdout);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
});

test('项目与服务共享实际仓库时两种选择顺序均去重，冲突集成引用零效果拒绝', (t) => {
  const actualRoot = createGitWorkspace(t);
  const caseAlias = path.join(path.dirname(actualRoot), path.basename(actualRoot).toUpperCase());
  // Exercise a real case alias where supported, including Windows temporary path spellings.
  const root = fs.existsSync(caseAlias) ? caseAlias : actualRoot, projectRoot = path.join(root, 'projects/demo');
  // This fixture must have no parent checkout that could mask a lost project member.
  fs.rmSync(path.join(root, '.git'), { recursive: true });
  git(root, ['rev-parse', '--show-toplevel'], 128);
  fs.mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ['init', '--initial-branch=main']);
  git(projectRoot, ['config', 'user.name', 'Buildr Test']);
  git(projectRoot, ['config', 'user.email', 'buildr-test@example.com']);
  fs.writeFileSync(path.join(projectRoot, 'base.txt'), 'project baseline\n');
  const documentPath = 'knowledge/current.md', retainedContent = '# 保留项目资料\n\n当前保留正文。\n';
  fs.mkdirSync(path.join(projectRoot, 'knowledge'));
  fs.writeFileSync(path.join(projectRoot, documentPath), retainedContent);
  git(projectRoot, ['add', '--', 'base.txt', documentPath]);
  git(projectRoot, ['-c', 'commit.gpgSign=false', 'commit', '-m', 'project baseline']);
  git(projectRoot, ['branch', 'alternative']);
  let serviceBranch = 'main';
  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: () => root,
    atomicWriteJson: (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); },
    removePath: file => fs.rmSync(file, { force: true }),
    sameGitIdentity: (left, right) => left === right,
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: { demo: { source: { type: 'git', path: 'projects/demo', git: { integrationBranch: 'main' } } } } }),
    readServiceRegistryRecord: () => ({ services: { api: { repositorySource: { type: 'git', path: 'projects/demo', integrationBranch: serviceBranch }, source: { type: 'workspace', path: 'projects/demo/modules/api' } } } }),
  });
  const orders = [['project:demo', 'service:demo/api'], ['service:demo/api', 'project:demo']];
  orders.forEach((includes, index) => {
    const taskId = `shared-order-${index}`, branch = `codex/${taskId}`;
    const created = provider.prepareGitWorktrees({ workspaceRoot: root, taskId, branch, includes });
    assert.equal(created.status, 'ready', JSON.stringify(created.diagnostic));
    assert.equal(created.repositories.length, 1);
    assert.equal(created.repositories[0].selector, 'project:demo');
    assert.equal(created.repositories[0].entityType, 'project');
    assert.equal(new Set(created.repositories.map(item => item.sourceRepository)).size, 1);
    assert.equal(created.repositories.filter(item => item.sourceRepository === projectRoot).length, 1);
    const candidateDocument = path.join(String(created.repositories[0].checkoutPath), documentPath);
    const candidateContent = `# 候选项目资料\n\n选择顺序 ${index} 的当前正文。\n`;
    fs.writeFileSync(candidateDocument, candidateContent);
    const reader = createTaskProjectDocumentReader(
      { readTask: () => ({ record: { scope: { projects: ['demo'], services: [{ project: 'demo', service: 'api' }] }, changes: [] } }) },
      { projectDetail: () => ({ project: { source: { type: 'git', path: 'projects/demo' } } }), resolveSourceRoot: (workspaceRoot, source) => path.resolve(workspaceRoot, source.path) },
      provider as unknown as TaskDocumentWorktreeQuery,
    );
    const document = reader.taskProjectDocument(root, taskId, 'demo', documentPath);
    assert.equal(document.provenance, 'task-worktree-candidate');
    assert.equal(document.content, candidateContent);
    assert.equal(fs.readFileSync(path.join(projectRoot, documentPath), 'utf8'), retainedContent);
    fs.writeFileSync(candidateDocument, retainedContent);
    const heads = Object.fromEntries(created.repositories.map(item => [String(item.selector), git(String(item.checkoutPath), ['rev-parse', 'HEAD'])]));
    const cleaned = provider.cleanupGitWorktrees({ workspaceRoot: root, taskId, allowCompleted: true, cleanupDelivery: { expectedSources: heads, deliveredRefs: heads } });
    assert.equal(cleaned.status, 'cleaned');
  });
  serviceBranch = 'alternative';
  const before = git(projectRoot, ['show-ref']);
  orders.forEach((includes, index) => {
    const taskId = `conflicting-order-${index}`;
    const rejected = provider.prepareGitWorktrees({ workspaceRoot: root, taskId, branch: `codex/${taskId}`, includes });
    assert.equal(rejected.status, 'blocked'); assert.deepEqual(rejected.effects, []);
    assert.equal(fs.existsSync(path.join(root, '.worktrees', taskId)), false);
  });
  assert.equal(git(projectRoot, ['show-ref']), before);
  git(root, ['rev-parse', '--show-toplevel'], 128);
});

test('旧 Git 根的有效组记录可独立读取，坏子仓只阻止相关身份与整组删除', (t) => {
  const root = createGitWorkspace(t), sourcePath = 'projects/demo/services/api', service = path.join(root, sourcePath);
  fs.mkdirSync(service, { recursive: true });
  git(service, ['init', '--initial-branch=main']); git(service, ['config', 'user.name', 'Buildr Test']); git(service, ['config', 'user.email', 'test@example.com']);
  fs.writeFileSync(path.join(service, 'api.md'), '# baseline\n'); git(service, ['add', '--', 'api.md']); git(service, ['-c', 'commit.gpgSign=false', 'commit', '-m', 'baseline']);
  let registryUnavailable = false;
  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: () => root,
    atomicWriteJson: (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); },
    removePath: file => fs.rmSync(file, { force: true }), sameGitIdentity: (left, right) => left === right,
    readProjectRegistryRecord: () => { if (registryUnavailable) throw new Error('Unrelated project registry is temporarily unreadable.'); return { registry: { migrationRequired: false }, projects: { demo: { source: { type: 'workspace', path: 'projects/demo' } } } }; },
    readServiceRegistryRecord: () => ({ services: { api: { source: { type: 'git', path: sourcePath, integrationBranch: 'main' } } } }),
  });
  const taskId = 'retained-root-evidence', created = provider.prepareGitWorktrees({ workspaceRoot: root, taskId, branch: 'codex/' + taskId, includes: ['service:demo/api'] });
  assert.equal(created.status, 'ready'); assert.equal(created.repositories.length, 2);
  registryUnavailable = true;
  assert.equal(provider.readGitWorktreeEvidence(root, taskId)?.evidence.repositories.length, 2);
  assert.equal(provider.inspectGitWorktrees({ workspaceRoot: root, taskId }).status, 'ready');
  assert.throws(() => provider.gitWorktreeEvidenceDirectories(root, { requireComplete: true }), (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === 'git_worktree_evidence_discovery_incomplete');
  const originalMetadata = path.join(service, '.git'), heldMetadata = path.join(root, 'held-api-metadata');
  fs.renameSync(originalMetadata, heldMetadata);
  const damaged = provider.inspectGitWorktrees({ workspaceRoot: root, taskId });
  assert.equal(damaged.status, 'blocked'); assert.equal(damaged.repositories.find(item => item.selector === 'workspace')?.state, 'ready'); assert.equal(damaged.repositories.find(item => item.selector === 'service:demo/api')?.state, 'blocked');
  const heads = Object.fromEntries(created.repositories.map(item => [item.selector, item.head!]));
  const input = { workspaceRoot: root, taskId, allowCompleted: true, cleanupDelivery: { expectedSources: heads, deliveredRefs: heads } };
  const refused = provider.cleanupGitWorktrees(input);
  assert.equal(refused.status, 'blocked'); assert.deepEqual(refused.effects, []);
  for (const item of created.repositories) assert.equal(fs.existsSync(item.checkoutPath), true);
  fs.renameSync(heldMetadata, originalMetadata);
  assert.equal(provider.cleanupGitWorktrees(input).status, 'cleaned');
});
