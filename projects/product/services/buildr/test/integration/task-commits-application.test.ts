import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createTaskCommitsApplication, type TaskCommitsDependencies } from '../../src/modules/task/commits/application/task-commits-application.ts';
import { TASK_COMMIT_LIMITS } from '../../src/modules/task/commits/infrastructure/git-commit-reader.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../src/modules/task/interfaces/http/task-http-schema.ts';

function git(root: string, args: string[], input?: string): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input, env: { ...env, GIT_AUTHOR_DATE: '2026-09-27T01:00:00Z', GIT_COMMITTER_DATE: '2026-09-27T01:00:00Z' } });
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
function init(root: string) {
  fs.mkdirSync(root, { recursive: true }); git(root, ['init', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Real Author']); git(root, ['config', 'user.email', 'real@example.com']);
}
function commit(root: string, message: string): string {
  git(root, ['-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-F', '-'], `${message}\n`);
  return git(root, ['rev-parse', 'HEAD']);
}
function snapshot(root: string): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  const walk = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else items.push([path.relative(root, file), stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString('base64')]);
    }
  };
  walk(root); return items;
}
function fixture(t: { after(action: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-commits-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'); init(root);
  const record = { taskId: 'task-one', scope: { projects: ['app'], services: [] as Array<{ project: string; service: string }> }, changes: [] };
  const projects = { app: { source: { path: '.' } } };
  const services: Record<string, { source: { path: string; root?: string }; repositorySource?: { path: string; root?: string } }> = {};
  let worktrees: Array<{ selector: string; sourceRepository: string; checkoutPath: string }> = [];
  const dependencies: TaskCommitsDependencies = {
    readTask: (_root, id) => { if (id !== record.taskId) throw Object.assign(new Error('Task missing'), { code: 'task_record_not_found', status: 404 }); return { root, record }; },
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects }),
    readServiceRegistryRecord: () => ({ services }),
    resolveSourceRoot: (_root, source) => source.root === 'attached' ? source.path : path.resolve(root, source.path),
    readGitWorktreeEvidence: () => worktrees.length ? { evidence: { repositories: worktrees } } : null,
  };
  const application = createTaskCommitsApplication(dependencies);
  return { base, root, record, projects, services, dependencies, application, setWorktrees(value: typeof worktrees) { worktrees = value; } };
}

test('真实多次提交保留全文并隔离其他任务，查询零写入且契约闭合', t => {
  const f = fixture(t);
  const first = commit(f.root, 'feat: first\n\nbody task-one\n\nBuildr-Task: task-one');
  const second = commit(f.root, 'fix: second\n\nBuildr-Task: task-one\nBuildr-Task: task-one');
  commit(f.root, 'feat: other\n\nBuildr-Task: task-two');
  commit(f.root, 'docs: example\n\nBuildr-Task: task-one\n\nNot a trailer.');
  const before = snapshot(f.root); const recordBefore = structuredClone(f.record);
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'complete'); assert.deepEqual(new Set(result.commits.map(item => item.hash)), new Set([first, second]));
  assert.equal(result.commits[0].authorName, 'Real Author'); assert.equal(result.commits[0].authorEmail, 'real@example.com');
  assert.equal(result.repositories.length, 1); assert.equal(result.repositories[0].scannedCommitCount, 4);
  assert.equal(result.coverage.refs.some(ref => ref.includes('refs/heads/main@')), true);
  assert.deepEqual(snapshot(f.root), before); assert.deepEqual(f.record, recordBefore); assert.deepEqual(result.effects, []);
  const validator = (value: unknown) => TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.commitsResponse.$id, value).valid;
  assert.equal(validator(result), true); assert.equal(validator({ ...result, secret: true }), false);
  assert.equal(validator({ ...result, commits: [{ ...result.commits[0], secret: true }] }), false);
  assert.equal(validator({ ...result, effects: [{ type: 'write' }] }), false);
  assert.throws(() => f.application.inspectTaskCommits(f.root, '../task-one'), /Task ID/);
  assert.throws(() => f.application.inspectTaskCommits(f.root, 'missing-task'), (error: { code: string }) => error.code === 'task_record_not_found');
});

test('工作空间级任务只读取权威根本身的Git，不从非Git工作空间向上猜测仓库', t => {
  const f = fixture(t);
  assert.equal(f.application.inspectTaskCommits(f.root, 'task-one').status, 'complete');
  const hash = commit(f.root, 'feat: scoped\n\nBuildr-Task: task-one');
  f.record.scope.projects = [];
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'complete'); assert.deepEqual(result.commits.map(item => item.hash), [hash]); assert.deepEqual(result.repositories[0].sources, ['workspace']);
  const timed = createTaskCommitsApplication(f.dependencies, { ...TASK_COMMIT_LIMITS, totalTimeoutMs: 0 }).inspectTaskCommits(f.root, 'task-one');
  assert.equal(timed.status, 'partial'); assert.ok(timed.diagnostics.some(item => item.code === 'task_commits_timeout'));
  const nested = path.join(f.root, 'non-git-workspace'); fs.mkdirSync(nested);
  const noGit = createTaskCommitsApplication({ ...f.dependencies, readTask: () => ({ root: nested, record: f.record }) }).inspectTaskCommits(nested, 'task-one');
  assert.equal(noGit.status, 'complete'); assert.deepEqual(noGit.commits, []); assert.deepEqual(noGit.repositories, []);
});

test('尾注冲突与非法值显式诊断，成功结果保持可读', t => {
  const f = fixture(t);
  const valid = commit(f.root, 'valid\n\nBuildr-Task: task-one');
  commit(f.root, 'conflict\n\nBuildr-Task: task-one\nBuildr-Task: task-two');
  commit(f.root, 'invalid\n\nBuildr-Task: task-one\nBuildr-Task: ../bad');
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'partial'); assert.deepEqual(result.commits.map(item => item.hash), [valid]);
  assert.deepEqual(result.diagnostics.map(item => item.code).sort(), ['task_commits_trailer_conflict', 'task_commits_trailer_invalid']);
});

test('已登记分离HEAD工作树与已有remote/tag引用可读，不读取其他工作树HEAD或reflog', t => {
  const f = fixture(t); commit(f.root, 'base');
  const checkout = path.join(f.base, 'task-worktree'); git(f.root, ['worktree', 'add', '--detach', checkout, 'HEAD']);
  const detached = commit(checkout, 'detached\n\nBuildr-Task: task-one');
  const other = path.join(f.base, 'other-worktree'); git(f.root, ['worktree', 'add', '--detach', other, 'main']);
  commit(other, 'unknown detached\n\nBuildr-Task: task-one');
  f.setWorktrees([{ selector: 'workspace', sourceRepository: f.root, checkoutPath: checkout }]);
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'complete'); assert.deepEqual(result.commits.map(item => item.hash), [detached]);
  assert.ok(result.repositories[0].sources.includes(`task-worktree:${checkout}`));
  git(f.root, ['update-ref', 'refs/remotes/origin/retained', detached]);
  git(f.root, ['tag', '-a', 'annotated', detached, '-m', 'tag']);
  const blob = git(f.root, ['hash-object', '-w', '--stdin'], 'blob');
  git(f.root, ['tag', '-a', 'blob-tag', blob, '-m', 'not a commit']);
  f.setWorktrees([]);
  const referenced = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(referenced.status, 'complete'); assert.deepEqual(referenced.commits.map(item => item.hash), [detached]);
  assert.ok(referenced.coverage.refs.some(ref => ref.includes('refs/remotes/origin/retained@')));
  assert.ok(referenced.coverage.refs.some(ref => ref.includes('refs/tags/annotated@')));
});

test('相同仓库多个服务和attached工作树合并身份但保留每个HEAD，克隆同SHA保留两条', t => {
  const f = fixture(t); const first = commit(f.root, 'base\n\nBuildr-Task: task-one');
  const clone = path.join(f.base, 'clone'); git(f.base, ['clone', '--no-local', f.root, clone]);
  const checkout = path.join(f.base, 'attached'); git(f.root, ['worktree', 'add', '--detach', checkout, 'HEAD']);
  const detached = commit(checkout, 'detached\n\nBuildr-Task: task-one');
  f.record.scope.services = ['same', 'attached', 'clone'].map(service => ({ project: 'app', service }));
  f.services.same = { source: { path: '.' } };
  f.services.attached = { source: { path: checkout, root: 'attached' } };
  f.services.clone = { source: { path: clone, root: 'attached' } };
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'complete'); assert.equal(result.repositories.length, 2);
  assert.equal(result.commits.filter(item => item.hash === first).length, 2);
  assert.equal(result.commits.filter(item => item.hash === detached).length, 1);
  assert.equal(new Set(result.commits.map(item => `${item.repositoryId}:${item.hash}`)).size, 3);
  const limited = createTaskCommitsApplication(f.dependencies, { ...TASK_COMMIT_LIMITS, repositoryLimit: 1 }).inspectTaskCommits(f.root, 'task-one');
  assert.equal(limited.status, 'partial'); assert.equal(limited.repositories.length, 1); assert.equal(limited.coverage.truncated, true);
  assert.ok(limited.diagnostics.some(item => item.code === 'task_commits_repository_limit'));
});

test('历史改写刷新使用新对象，不保留已不可达旧SHA', t => {
  const f = fixture(t); commit(f.root, 'base');
  const old = commit(f.root, 'old\n\nBuildr-Task: task-one');
  assert.deepEqual(f.application.inspectTaskCommits(f.root, 'task-one').commits.map(item => item.hash), [old]);
  git(f.root, ['reset', '--soft', 'HEAD^']);
  const fresh = commit(f.root, 'rewritten\n\nBuildr-Task: task-one');
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.deepEqual(result.commits.map(item => item.hash), [fresh]); assert.notEqual(old, fresh);
});

test('HEAD对象缺失显式partial但保留同库仍可读分支，正常unborn仍complete', t => {
  const f = fixture(t); const hash = commit(f.root, 'valid branch\n\nBuildr-Task: task-one');
  fs.writeFileSync(path.join(f.root, '.git', 'HEAD'), `${'a'.repeat(40)}\n`);
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'partial'); assert.deepEqual(result.commits.map(item => item.hash), [hash]);
  assert.ok(result.diagnostics.some(item => item.code === 'task_commits_head_unreadable'));
});

test('损坏标签目标只诊断该引用，合法blob标签不算读取失败', t => {
  const f = fixture(t); const hash = commit(f.root, 'valid\n\nBuildr-Task: task-one');
  const blob = git(f.root, ['hash-object', '-w', '--stdin'], 'temporary tag object');
  git(f.root, ['tag', '-a', 'broken-blob', blob, '-m', 'blob tag']);
  assert.equal(f.application.inspectTaskCommits(f.root, 'task-one').status, 'complete');
  fs.unlinkSync(path.join(f.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'partial'); assert.deepEqual(result.commits.map(item => item.hash), [hash]);
  assert.ok(result.diagnostics.some(item => item.code === 'task_commits_tag_unreadable'));
});

test('恶意Git环境、替换引用、notes与显示配置不改变原始提交身份和正文', t => {
  const f = fixture(t); const original = commit(f.root, 'original\n\nBuildr-Task: task-one');
  const substitute = commit(f.root, 'forged\n\nBuildr-Task: task-two');
  git(f.root, ['replace', original, substitute]); git(f.root, ['reset', '--soft', original]);
  git(f.root, ['notes', 'add', '-m', 'Buildr-Task: task-two', original]);
  git(f.root, ['config', 'color.ui', 'always']); git(f.root, ['config', 'log.showSignature', 'true']); git(f.root, ['config', 'log.showNotes', 'true']);
  const outside = path.join(f.base, 'outside'); init(outside); commit(outside, 'outside\n\nBuildr-Task: task-one');
  const inherited = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  process.env.GIT_DIR = path.join(outside, '.git'); process.env.GIT_WORK_TREE = outside;
  t.after(() => { for (const [key, value] of Object.entries(inherited)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const result = f.application.inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'complete'); assert.deepEqual(result.commits.map(item => item.hash), [original]);
  assert.equal(result.commits[0].message, 'original\n\nBuildr-Task: task-one\n');
});

test('失败服务、来源越界及无效工作树仅产生局部诊断', t => {
  const f = fixture(t); const hash = commit(f.root, 'valid\n\nBuildr-Task: task-one');
  f.record.scope.services = ['bad', 'good', 'outside'].map(service => ({ project: 'app', service }));
  f.services.bad = { source: { path: 'bad' } }; f.services.good = { source: { path: '.' } }; f.services.outside = { source: { path: '../outside' } };
  const outside = path.join(f.base, 'outside'); init(outside); commit(outside, 'should not appear\n\nBuildr-Task: task-one');
  const resolve = f.dependencies.resolveSourceRoot;
  f.dependencies.resolveSourceRoot = (root, source) => { if (source.path === 'bad') throw new Error('unreadable'); return resolve(root, source); };
  f.setWorktrees([{ selector: 'workspace', sourceRepository: f.root, checkoutPath: outside }]);
  const result = createTaskCommitsApplication(f.dependencies).inspectTaskCommits(f.root, 'task-one');
  assert.equal(result.status, 'partial'); assert.deepEqual(result.commits.map(item => item.hash), [hash]);
  assert.ok(result.repositories[0].sources.includes('service:app/good'));
  assert.ok(result.diagnostics.some(item => item.code === 'task_commits_scope_forbidden'));
  assert.ok(result.diagnostics.some(item => item.code === 'task_commits_worktree_unavailable'));
});

test('候选历史、结果、输出和总时间上限显式为部分结果', t => {
  const f = fixture(t); commit(f.root, `huge\n\n${'x'.repeat(32000)}\n\nBuildr-Task: task-one`);
  const recent = commit(f.root, 'recent\n\nBuildr-Task: task-one');
  for (let index = 0; index < 3; index += 1) commit(f.root, `unrelated ${index}`);
  const inspect = (limits: Partial<typeof TASK_COMMIT_LIMITS>) => createTaskCommitsApplication(f.dependencies, { ...TASK_COMMIT_LIMITS, ...limits }).inspectTaskCommits(f.root, 'task-one');
  const history = inspect({ historyLimitPerRepository: 1 });
  assert.equal(history.status, 'partial'); assert.equal(history.coverage.truncated, true); assert.deepEqual(history.commits.map(item => item.hash), [recent]);
  assert.ok(history.diagnostics.some(item => item.code === 'task_commits_history_truncated'));
  const limited = inspect({ commitLimit: 1 }); assert.equal(limited.commits.length, 1); assert.ok(limited.diagnostics.some(item => item.code === 'task_commits_result_truncated'));
  const bytes = inspect({ maxBytes: 4096 }); assert.equal(bytes.status, 'partial'); assert.equal(bytes.coverage.truncated, true);
  assert.ok(bytes.commits.some(item => item.hash === recent));
  const timed = inspect({ totalTimeoutMs: 0 }); assert.equal(timed.status, 'partial'); assert.ok(timed.diagnostics.some(item => item.code === 'task_commits_timeout'));
});
