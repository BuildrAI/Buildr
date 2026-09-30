import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createTaskChangedFilesApplication, type TaskChangedFilesDependencies } from '../../src/modules/task/changed-files/application/task-changed-files-application.ts';
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
