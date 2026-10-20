import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import test from 'node:test';

import { registerGitWorktreeProvider } from '../../src/modules/task/infrastructure/git-worktree-provider.ts';

type Sources = Record<string, { source: { type: string; path: string } }>;

function fixture(t: test.TestContext, rootGit = true) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-incremental-worktrees-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const repository = (relative: string) => {
    const directory = path.join(root, relative);
    fs.mkdirSync(directory, { recursive: true });
    git(directory, 'init', '--initial-branch=main');
    fs.writeFileSync(path.join(directory, '.gitignore'), '.worktrees/\n.buildr/local/\nrepositories/\n');
    fs.writeFileSync(path.join(directory, 'base.txt'), 'original\n');
    git(directory, 'add', '.');
    git(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'baseline');
    return directory;
  };
  if (rootGit) repository('.');
  const sources: Sources = {};
  for (const name of ['a', 'b', 'c', 'z']) {
    repository(`repositories/${name}`);
    sources[name] = { source: { type: 'git', path: `repositories/${name}` } };
  }
  sources.alias = sources.a;
  const project = { source: { type: 'workspace', path: '.' } };
  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: directory => fs.realpathSync(directory),
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: { demo: project } }),
    readServiceRegistryRecord: () => ({ services: sources }), sameGitIdentity: (left, right) => left === right,
    atomicWriteJson: (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); },
    removePath: file => fs.rmSync(file, { force: true }),
  });
  const input = { workspaceRoot: root, taskId: 'incremental', branch: 'codex/incremental' };
  return { root, sources, project, provider, input, git };
}

test('方案未提交时追加两仓并保留所有旧成员、起点及共享来源', t => {
  const f = fixture(t);
  f.git(f.root, 'branch', 'planning');
  const first = f.provider.prepareGitWorktrees({ ...f.input, startPoint: 'planning' });
  f.git(f.root, 'branch', '-d', 'planning');
  assert.equal(first.status, 'ready');
  const checkout = first.repositories[0].checkoutPath as string;
  fs.writeFileSync(path.join(checkout, 'proposal.md'), '方案尚未提交\n');
  fs.writeFileSync(path.join(checkout, 'base.txt'), '实现进行中\n');
  const before = f.git(checkout, 'status', '--porcelain');
  // Existing creation references need not remain resolvable to reuse a checkout.
  const expanded = f.provider.prepareGitWorktrees({ ...f.input, startPoint: 'no-longer-present', includes: ['service:demo/a', 'service:demo/b'] });
  assert.equal(expanded.status, 'ready', JSON.stringify(expanded.diagnostic));
  assert.equal(expanded.repositories.length, 3);
  assert.equal(expanded.effects.length, 2);
  assert.equal(expanded.repositories[0].startPoint, 'planning');
  assert.equal(expanded.repositories[0].clean, false);
  assert.equal(f.git(checkout, 'status', '--porcelain'), before);
  assert.equal(fs.readFileSync(path.join(checkout, 'proposal.md'), 'utf8'), '方案尚未提交\n');
  const expandedDigest = f.provider.readGitWorktreeEvidence(f.root, f.input.taskId)!.evidence.planDigest;
  const repeated = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/alias'] });
  assert.equal(repeated.status, 'ready', JSON.stringify(repeated.diagnostic));
  assert.equal(repeated.repositories.length, 3);
  assert.deepEqual(repeated.effects, []);
  assert.deepEqual(repeated.repositories.map(r => r.selector), expanded.repositories.map(r => r.selector));
  assert.equal(f.provider.readGitWorktreeEvidence(f.root, f.input.taskId)!.evidence.planDigest, expandedDigest);
});

test('同源服务追加完整项目选择时不重复检出并保留项目语义', t => {
  const f = fixture(t, false);
  const initial = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/a'] });
  assert.equal(initial.status, 'ready');
  f.project.source = { type: 'git', path: 'repositories/a' };
  const promoted = f.provider.prepareGitWorktrees({ ...f.input, includes: ['project:demo'] });
  assert.equal(promoted.status, 'ready', JSON.stringify(promoted.diagnostic));
  assert.equal(promoted.repositories.length, 1);
  assert.equal(promoted.repositories[0].selector, 'project:demo');
  assert.equal(promoted.repositories[0].checkoutPath, initial.repositories[0].checkoutPath);
  assert.deepEqual(promoted.effects, []);
});

test('追加失败登记全部成员并在省略选择时继续未完成部分', t => {
  const f = fixture(t);
  f.provider.prepareGitWorktrees(f.input);
  const previousFault = process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR;
  let partial: ReturnType<typeof f.provider.prepareGitWorktrees>;
  try {
    process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR = 'service:demo/b';
    partial = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/a', 'service:demo/b', 'service:demo/c'] });
  } finally {
    if (previousFault === undefined) delete process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR;
    else process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR = previousFault;
  }
  assert.equal(partial.status, 'blocked');
  assert.equal(partial.repositories.length, 4);
  assert.deepEqual(partial.effects.map(r => r.selector), ['service:demo/a']);
  assert.equal(f.provider.readGitWorktreeEvidence(f.root, f.input.taskId)!.evidence.repositories.length, 4);
  const resumed = f.provider.prepareGitWorktrees(f.input);
  assert.equal(resumed.status, 'ready', JSON.stringify(resumed.diagnostic));
  assert.equal(resumed.repositories.length, 4);
  assert.deepEqual(resumed.effects.map(r => r.selector), ['service:demo/b', 'service:demo/c']);
});

test('追加核对真实来源及分支冲突且保持零新增效果', t => {
  const f = fixture(t);
  const first = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/a'] });
  const before = fs.readFileSync(first.evidencePath!, 'utf8');
  f.sources.a = f.sources.b;
  const changedSource = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/c'] });
  assert.equal(changedSource.status, 'blocked');
  assert.equal(changedSource.diagnostic?.code, 'git_worktree_identity_mismatch');
  assert.deepEqual(changedSource.effects, []);
  assert.equal(fs.readFileSync(first.evidencePath!, 'utf8'), before);
  const changedBranch = f.provider.prepareGitWorktrees({ ...f.input, branch: 'codex/other' });
  assert.equal(changedBranch.status, 'blocked');
  assert.deepEqual(changedBranch.effects, []);
  assert.equal(f.git(path.join(f.root, 'repositories/c'), 'worktree', 'list', '--porcelain').includes('codex/incremental'), false);
});

test('非 Git 根追加排序靠前成员时保留登记位置与未遍历旧成员', t => {
  const f = fixture(t, false);
  const first = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/z'] });
  assert.equal(first.status, 'ready');
  const oldCheckout = first.repositories[0].checkoutPath as string;
  fs.writeFileSync(path.join(oldCheckout, 'proposal.md'), '保留旧成员\n');
  const appended = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/a'] });
  assert.equal(appended.status, 'ready', JSON.stringify(appended.diagnostic));
  assert.equal(appended.evidencePath, first.evidencePath);
  assert.equal(appended.repositories.length, 2);
  assert.equal(fs.readFileSync(path.join(oldCheckout, 'proposal.md'), 'utf8'), '保留旧成员\n');
  assert.equal(fs.existsSync(path.join(f.root, 'repositories/a/.git/buildr/task-worktrees/incremental.json')), false);
});

test('追加位置被已有任务索引跟踪时拒绝创建并保留索引', t => {
  const f = fixture(t);
  const initial = f.provider.prepareGitWorktrees(f.input);
  const checkout = initial.repositories[0].checkoutPath as string;
  const target = path.join(checkout, 'repositories/a');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'pending.txt'), '先前暂存内容\n');
  f.git(checkout, 'add', '-f', 'repositories/a/pending.txt');
  fs.rmSync(target, { recursive: true });
  const index = f.git(checkout, 'ls-files', '--stage');
  const rejected = f.provider.prepareGitWorktrees({ ...f.input, includes: ['service:demo/a'] });
  assert.equal(rejected.status, 'blocked');
  assert.deepEqual(rejected.effects, []);
  assert.equal(f.git(checkout, 'ls-files', '--stage'), index);
  assert.equal(fs.existsSync(target), false);
});

function worker(f: ReturnType<typeof fixture>, request: object) {
  const file = path.join(f.root, 'worker.mjs');
  fs.writeFileSync(file, `
import fs from 'node:fs';
import path from 'node:path';
import { registerGitWorktreeProvider } from ${JSON.stringify(new URL('../../src/modules/task/infrastructure/git-worktree-provider.ts', import.meta.url).href)};
const [root, rawSources, rawRequest] = process.argv.slice(2);
const request = JSON.parse(rawRequest);
const provider = registerGitWorktreeProvider({
  assertCanonicalTaskWorkspace: directory => fs.realpathSync(directory),
  readProjectRegistryRecord: () => ({registry:{migrationRequired:false},projects:{demo:{source:{type:'workspace',path:'.'}}}}),
  readServiceRegistryRecord: () => ({services:JSON.parse(rawSources)}), sameGitIdentity:(a,b)=>a===b,
  atomicWriteJson: (file, value) => {
    if (request.gate) {
      fs.writeFileSync(request.gate, 'locked');
      const deadline=Date.now()+10000;
      while (!fs.existsSync(request.gate+'.release')) {
        if(Date.now()>deadline) throw new Error('worker gate timeout');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
      }
    }
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));
  },
  removePath: file=>fs.rmSync(file,{force:true}),
});
const {operation,gate,...input}=request;
console.log(JSON.stringify(operation==='cleanup'?provider.cleanupGitWorktrees(input):provider.prepareGitWorktrees(input)));
`);
  const child = spawn(process.execPath, [file, f.root, JSON.stringify(f.sources), JSON.stringify(request)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const promise = new Promise<ReturnType<typeof f.provider.prepareGitWorktrees>>((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) reject(new Error(stderr || `worker exited ${code}`));
      else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }
    });
  });
  return promise;
}

async function waitFor(file: string) {
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < deadline, `waiting for ${file}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('并发追加等待同组写入并保留双方成员', async t => {
  const f = fixture(t);
  f.provider.prepareGitWorktrees(f.input);
  const gate = path.join(f.root, 'append.gate');
  const first = worker(f, { ...f.input, includes: ['service:demo/a'], gate });
  await waitFor(gate);
  const second = worker(f, { ...f.input, includes: ['service:demo/b'] });
  fs.writeFileSync(gate + '.release', 'continue');
  assert.equal((await first).status, 'ready');
  assert.equal((await second).status, 'ready');
  assert.equal(f.provider.readGitWorktreeEvidence(f.root, f.input.taskId)!.evidence.repositories.length, 3);
});

test('追加持锁期间启动的旧清理输入不能遗漏新增成员', async t => {
  const f = fixture(t);
  const initial = f.provider.prepareGitWorktrees(f.input);
  const head = initial.repositories[0].head as string;
  const gate = path.join(f.root, 'cleanup.gate');
  const append = worker(f, { ...f.input, includes: ['service:demo/a'], gate });
  await waitFor(gate);
  const cleanup = worker(f, { ...f.input, operation: 'cleanup', allowCompleted: true, cleanupDelivery: { expectedSources: { workspace: head }, deliveredRefs: { workspace: head } } });
  fs.writeFileSync(gate + '.release', 'continue');
  assert.equal((await append).status, 'ready');
  const stopped = await cleanup;
  assert.equal(stopped.status, 'blocked');
  assert.equal(stopped.diagnostic?.code, 'git_worktree_cleanup_delivery_invalid');
  assert.deepEqual(stopped.effects, []);
  assert.equal(fs.existsSync(initial.repositories[0].checkoutPath as string), true);
  assert.equal(f.provider.readGitWorktreeEvidence(f.root, f.input.taskId)!.evidence.repositories.length, 2);
});
