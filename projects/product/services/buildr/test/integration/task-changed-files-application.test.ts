import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createTaskChangedFilesApplication, type TaskChangedFilesDependencies } from '../../src/modules/task/changed-files/application/task-changed-files-application.ts';
import { createTaskChangedFilesHttpContribution } from '../../src/modules/task/changed-files/interfaces/http/task-changed-files-http.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../src/modules/task/interfaces/http/task-http-schema.ts';
import { TASK_CHANGED_FILE_LIMITS } from '../../src/modules/task/changed-files/infrastructure/git-changes-reader.ts';
import { TASK_COMMIT_LIMITS } from '../../src/modules/task/commits/infrastructure/git-commit-reader.ts';

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
function write(root: string, relative: string, content: string) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-changed-files-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'); init(root);
  const record = { taskId: 'task-one', scope: { projects: ['app'], services: [] as Array<{ project: string; service: string }> }, changes: [] };
  const projects = { app: { source: { path: '.' } } };
  const services: Record<string, { source: { path: string; root?: string }; repositorySource?: { path: string; root?: string } }> = {};
  let worktrees: Array<{ selector: string; sourceRepository: string; checkoutPath: string }> = [];
  const dependencies: TaskChangedFilesDependencies = {
    readTask: (_root, id) => { if (id !== record.taskId) throw Object.assign(new Error('Task missing'), { code: 'task_record_not_found', status: 404 }); return { root, record }; },
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects }),
    readServiceRegistryRecord: () => ({ services }),
    resolveSourceRoot: (_root, source) => source.root === 'attached' ? source.path : path.resolve(root, source.path),
    readGitWorktreeEvidence: () => worktrees.length ? { evidence: { repositories: worktrees } } : null,
  };
  const application = createTaskChangedFilesApplication(dependencies);
  return { base, root, record, dependencies, application, setWorktrees(value: typeof worktrees) { worktrees = value; } };
}

test('轻量计数与完整读取一致：同仓库路径去重、重命名和大未跟踪文件', t => {
  const f = fixture(t);
  write(f.root, 'old.ts', 'old\n'); write(f.root, 'deleted.ts', 'delete\n');
  git(f.root, ['add', '.']); commit(f.root, 'base\n\nBuildr-Task: task-one');
  const checkout = path.join(f.base, 'task-checkout');
  git(f.root, ['worktree', 'add', '-b', 'task', checkout]);
  f.setWorktrees([{ selector: 'project:app', sourceRepository: f.root, checkoutPath: checkout }]);
  git(f.root, ['mv', 'old.ts', 'renamed.ts']); fs.rmSync(path.join(f.root, 'deleted.ts'));
  write(f.root, 'large.ts', 'x'.repeat(1024 * 1024));
  write(checkout, 'large.ts', 'same path, different content');
  write(checkout, 'only-task.ts', 'task only');
  const before = snapshot(f.base);
  const counted = f.application.inspectTaskChangedFileCount(f.root, 'task-one');
  const full = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  assert.equal(counted.fileCount, full.files.length); assert.equal(counted.fileCount, 4);
  assert.equal(counted.status, 'complete');
  assert.equal(TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFileCountResponse.$id, counted).valid, true);
  assert.deepEqual(snapshot(f.base), before, '两种读取都不修改文件和Git');
});

test('轻量计数保留截断和局部来源失败，并拒绝HTTP额外参数', async t => {
  const f = fixture(t); write(f.root, 'a', 'one'); write(f.root, 'b', 'two');
  const limited = createTaskChangedFilesApplication(f.dependencies, TASK_COMMIT_LIMITS, { ...TASK_CHANGED_FILE_LIMITS, fileLimit: 1 });
  const counted = limited.inspectTaskChangedFileCount(f.root, 'task-one');
  assert.equal(counted.fileCount, 1); assert.equal(counted.coverage.truncated, true); assert.equal(counted.status, 'partial');
  f.record.scope.services.push({ project: 'app', service: 'missing' });
  assert.equal(f.application.inspectTaskChangedFileCount(f.root, 'task-one').status, 'partial');
  const handler = createTaskChangedFilesHttpContribution();
  const response = await handler.handle({ request: { method: 'GET' }, suffix: '/tasks/task-one/changed-file-count', searchParams: new URLSearchParams(), submitTaskRead: async (operation, taskId) => {
    assert.equal(operation, 'changed-file-count'); return f.application.inspectTaskChangedFileCount(f.root, taskId);
  } });
  assert.equal(response!.status, 200);
  await assert.rejects(handler.handle({ request: { method: 'GET' }, suffix: '/tasks/task-one/changed-file-count', searchParams: new URLSearchParams({ extra: 'x' }), submitTaskRead: async () => { throw Error('must not run'); } }), /不接受查询参数/);
});

test('轻量计数没有提交历史或差异命令', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t); write(f.root, 'a.ts', 'before'); git(f.root, ['add', '.']); commit(f.root, 'base\n\nBuildr-Task: task-one'); write(f.root, 'a.ts', 'after');
  const gitRoot = git(f.root, ['--exec-path']), realGit = path.join(gitRoot, 'git');
  const bin = path.join(f.base, 'bin'), calls = path.join(f.base, 'calls.jsonl'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!${process.execPath}\nconst fs = require('node:fs'); const { spawnSync } = require('node:child_process'); fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2))+'\\n'); const result = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), {stdio:'inherit'}); process.exit(result.status ?? 1);\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
    assert.equal(f.application.inspectTaskChangedFileCount(f.root, 'task-one').fileCount, 1);
  } finally { process.env.PATH = originalPath; }
  const commands: string[][] = fs.readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.ok(commands.some(args => args.includes('status')));
  assert.equal(commands.some(args => args.includes('HEAD^{commit}')), false);
  assert.equal(commands.some(args => args.some(arg => ['diff', 'diff-tree', 'rev-list', 'cat-file', 'for-each-ref'].includes(arg))), false);
});

test('工作区改动按状态、统计与预览返回，契约闭合且零写入', t => {
  const f = fixture(t);
  write(f.root, 'src/a.ts', 'export const a = 1;\n');
  git(f.root, ['add', '.']);
  commit(f.root, 'feat: baseline\n\nBuildr-Task: task-one');
  write(f.root, 'src/a.ts', 'export const a = 1;\nexport const a2 = 2;\nexport const a3 = 3;\n');
  write(f.root, 'src/new.ts', 'brand new file\nsecond line\n');
  fs.rmSync(path.join(f.root, 'src/a.ts'));
  const before = snapshot(f.root);
  const result = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  assert.equal(result.status, 'complete');
  assert.equal(result.repositories.length, 1);
  assert.equal(result.repositories[0].branch, 'main');
  const deleted = result.files.find(item => item.path === 'src/a.ts');
  assert.ok(deleted); assert.equal(deleted.status, 'deleted'); assert.equal(deleted.preview, null);
  const untracked = result.files.find(item => item.path === 'src/new.ts');
  assert.ok(untracked); assert.equal(untracked.status, 'untracked'); assert.equal(untracked.kind, 'untracked');
  assert.ok(untracked.preview?.includes('+brand new file'));
  assert.equal(untracked.additions, 2);
  assert.equal(result.repositories[0].fileCount, result.files.length);
  assert.equal(result.commits.length, 1);
  const key = `${encodeURIComponent(result.commits[0].repositoryId)}:${result.commits[0].hash}`;
  assert.ok(result.commitFiles[key]?.length >= 1);
  const committed = result.commitFiles[key].find(item => item.path === 'src/a.ts');
  assert.ok(committed); assert.equal(committed.status, 'added'); assert.ok(committed.preview?.includes('+export const a = 1;'));
  assert.equal(result.repositoryMeta[result.repositories[0].id].branch, 'main');
  assert.deepEqual(snapshot(f.root), before); assert.deepEqual(result.effects, []);
  const validator = (value: unknown) => TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFilesResponse.$id, value).valid;
  assert.equal(validator(result), true);
  assert.equal(validator({ ...result, secret: true }), false);
  assert.equal(validator({ ...result, files: [{ ...result.files[0], secret: true }] }), false);
  assert.throws(() => f.application.inspectTaskChangedFiles(f.root, 'missing-task'), (error: { code: string }) => error.code === 'task_record_not_found');
});

test('纯重命名与修改各有差异语义；合并到主检出与任务工作树', t => {
  const f = fixture(t);
  write(f.root, 'old.ts', 'export const x = 1;\n');
  git(f.root, ['add', '.']);
  commit(f.root, 'feat: base\n\nBuildr-Task: task-one');
  write(f.root, 'dir/mod.ts', 'before\n'); git(f.root, ['add', '.']); commit(f.root, 'feat: second\n\nBuildr-Task: task-one');
  git(f.root, ['mv', 'old.ts', 'new.ts']);
  write(f.root, 'dir/mod.ts', 'before\nafter\n');
  const result = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  const renamed = result.files.find(item => item.status === 'renamed');
  assert.ok(renamed); assert.equal(renamed.previousPath, 'old.ts'); assert.equal(renamed.path, 'new.ts');
  const modified = result.files.find(item => item.path === 'dir/mod.ts');
  assert.ok(modified); assert.equal(modified.status, 'modified'); assert.ok(modified.preview?.includes('+after'));
  assert.equal(modified.additions, 1);
});

test('预览按行数上限截断；超大仓库组内去重与截断标志', t => {
  const f = fixture(t);
  write(f.root, 'big.ts', `${Array.from({ length: 300 }, (_, index) => `line ${index}`).join('\n')}\n`);
  const result = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  const file = result.files.find(item => item.path === 'big.ts');
  assert.ok(file); assert.equal(file.status, 'untracked');
  assert.ok(file.preview); assert.equal(file.previewTruncated, true);
  assert.ok((file.preview.split('\n').length - 1) <= 250);
});

test('项目与服务共享检出时保留来源、提交统计与最新改动，任务范围只读取一次', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'service'));
  f.record.scope.services.push({ project: 'app', service: 'api' });
  const dependencies = { ...f.dependencies, readServiceRegistryRecord: () => ({ services: { api: { source: { path: 'service' } } } }) };
  let taskReads = 0;
  dependencies.readTask = (...args) => { taskReads += 1; return f.dependencies.readTask(...args); };
  write(f.root, 'service/a.ts', 'before\n'); git(f.root, ['add', '.']);
  const hash = commit(f.root, 'base\n\nBuildr-Task: task-one');
  const application = createTaskChangedFilesApplication(dependencies);
  write(f.root, 'service/a.ts', 'after\n');
  const result = application.inspectTaskChangedFiles(f.root, 'task-one');
  assert.equal(taskReads, 1);
  assert.equal(result.repositories.length, 1);
  assert.deepEqual(result.repositories[0].sources.sort(), ['project:app', 'service:app/api']);
  assert.equal(result.repositories[0].scannedCommitCount, 1);
  assert.equal(result.commits[0].hash, hash);
  assert.match(result.files[0].preview || '', /\+after/);
  write(f.root, 'service/a.ts', 'latest\n');
  assert.match(application.inspectTaskChangedFiles(f.root, 'task-one').files[0].preview || '', /\+latest/);
});

test('干净检出仍返回真实分支与领先数，游离检出不误报分支', t => {
  const f = fixture(t);
  write(f.root, 'a.ts', 'base\n'); git(f.root, ['add', '.']);
  commit(f.root, 'base\n\nBuildr-Task: task-one');
  git(f.root, ['branch', 'base']);
  git(f.root, ['config', 'branch.main.remote', '.']);
  git(f.root, ['config', 'branch.main.merge', 'refs/heads/base']);
  commit(f.root, 'ahead\n\nBuildr-Task: task-one');
  const clean = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  assert.equal(clean.files.length, 0);
  assert.equal(clean.repositories[0].branch, 'main');
  assert.equal(clean.repositories[0].ahead, 1);
  git(f.root, ['checkout', '--detach']);
  const detached = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  assert.equal(detached.repositories[0].branch, null);
  assert.equal(detached.repositories[0].ahead, null);
});

test('按文件读取完整上下文且保持工作区、提交来源和边界', async t => {
  const f = fixture(t);
  const before = Array.from({ length: 120 }, (_, index) => `line-${index + 1}`);
  write(f.root, 'src/full.ts', before.join('\n') + '\n'); git(f.root, ['add', '.']); commit(f.root, 'base\n\nBuildr-Task: task-one');
  const next = [...before]; next[44] = 'changed-45';
  write(f.root, 'src/full.ts', next.join('\n') + '\n');
  const list = f.application.inspectTaskChangedFiles(f.root, 'task-one');
  const id = list.repositories[0].id;
  assert.doesNotMatch(list.files[0].preview || '', /line-1\n|line-120/);
  const full = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'src/full.ts', 'worktree');
  assert.match(full.files[0].preview || '', / line-1\n/); assert.match(full.files[0].preview || '', / line-120\n/);
  assert.match(full.files[0].preview || '', /-line-45\n\+changed-45/);
  git(f.root, ['add', '.']); const hash = commit(f.root, 'change\n\nBuildr-Task: task-one');
  next[89] = 'uncommitted-90'; write(f.root, 'src/full.ts', next.join('\n') + '\n');
  const committed = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'src/full.ts', hash);
  assert.match(committed.files[0].preview || '', /changed-45/); assert.doesNotMatch(committed.files[0].preview || '', /uncommitted-90/);
  const foreign = commit(f.root, 'unrelated\n\nBuildr-Task: task-two');
  assert.throws(() => f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'src/full.ts', foreign), /不属于/);
  assert.throws(() => f.application.inspectTaskFileDiff(f.root, 'task-one', id, '../outside', 'worktree'), /相对路径/);
  assert.throws(() => f.application.inspectTaskFileDiff(f.root, 'task-one', 'other', 'src/full.ts', 'worktree'), /范围/);
  const handler = createTaskChangedFilesHttpContribution();
  const params = new URLSearchParams({ repositoryId: id, filePath: 'src/full.ts', commitHash: hash });
  const response = await handler.handle({ request: { method: 'GET' }, suffix: '/tasks/task-one/file-diff', searchParams: params, submitTaskRead: async (operation, taskId, input) => { assert.equal(operation, 'file-diff'); return f.application.inspectTaskFileDiff(f.root, taskId, input!.repositoryId, input!.filePath, input!.commitHash); } });
  assert.equal(response!.status, 200);
  params.append('unknown', 'x');
  await assert.rejects(handler.handle({ request: { method: 'GET' }, suffix: '/tasks/task-one/file-diff', searchParams: params, submitTaskRead: async () => { throw Error('must not run'); } }), /参数无效/);
});

test('完整上下文包含删除前正文，超大新增文件明确截断', t => {
  const f = fixture(t);
  write(f.root, 'deleted.ts', 'first\nmiddle\nlast\n');git(f.root, ['add', '.']);commit(f.root, 'base\n\nBuildr-Task: task-one');
  fs.rmSync(path.join(f.root, 'deleted.ts'));
  const id = f.application.inspectTaskChangedFiles(f.root, 'task-one').repositories[0].id;
  const deleted = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'deleted.ts', 'worktree');
  assert.match(deleted.files[0].preview || '', /-first\n-middle\n-last/);
  write(f.root, 'large.ts', Array.from({ length: 6000 }, (_, index) => `line-${index}`).join('\n'));
  const large = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'large.ts', 'worktree');
  assert.equal(large.coverage.truncated, true); assert.equal(large.files[0].previewTruncated, true); assert.equal(large.status, 'partial');
});

test('纯重命名的完整差异保留两边相同正文', t => {
  const f = fixture(t); write(f.root, 'old.ts', 'first\nlast\n');git(f.root, ['add', '.']);commit(f.root, 'base\n\nBuildr-Task: task-one');
  git(f.root, ['mv', 'old.ts', 'new.ts']);
  const id = f.application.inspectTaskChangedFiles(f.root, 'task-one').repositories[0].id;
  const current = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'new.ts', 'worktree');
  assert.match(current.files[0].preview || '', / first\n last/);
  const hash = commit(f.root, 'rename\n\nBuildr-Task: task-one');
  const committed = f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'new.ts', hash);
  assert.match(committed.files[0].preview || '', / first\n last/);
});

test('完整差异支持包含中文和空格的文件名', t => {
  const f = fixture(t);const file = 'folder/示例 文件.ts';
  write(f.root, file, '首行\n旧内容\n末行\n');git(f.root, ['add', file]);commit(f.root, 'base\n\nBuildr-Task: task-one');
  write(f.root, file, '首行\n新内容\n末行\n');
  const id = f.application.inspectTaskChangedFiles(f.root, 'task-one').repositories[0].id;
  const full = f.application.inspectTaskFileDiff(f.root, 'task-one', id, file, 'worktree');
  assert.match(full.files[0].preview || '', / 首行\n-旧内容\n\+新内容\n 末行/);
  git(f.root, ['add', file]);const hash = commit(f.root, 'update\n\nBuildr-Task: task-one');
  assert.match(f.application.inspectTaskFileDiff(f.root, 'task-one', id, file, hash).files[0].preview || '', /首行/);
});

test('完整差异不调用代码库配置的外部差异程序', t => {
  const f = fixture(t);write(f.root, 'a.ts', 'before\n');git(f.root, ['add', 'a.ts']);commit(f.root, 'base\n\nBuildr-Task: task-one');
  write(f.root, 'a.ts', 'after\n');
  const program = path.join(f.base, 'external-diff.sh'), marker = path.join(f.base, 'external-called');
  fs.writeFileSync(program, `#!/bin/sh\ntouch '${marker}'\nexit 0\n`, { mode: 0o755 });git(f.root, ['config', 'diff.external', program]);
  const id = f.application.inspectTaskChangedFiles(f.root, 'task-one').repositories[0].id;
  assert.match(f.application.inspectTaskFileDiff(f.root, 'task-one', id, 'a.ts', 'worktree').files[0].preview || '', /\+after/);
  assert.equal(fs.existsSync(marker), false);
});
