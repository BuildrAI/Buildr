import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerChangeApplication } from '../../src/modules/task/change/application/change-application.ts';
import { createChangeQuery } from '../../src/modules/openspec/application/change-query.ts';

type Project = { id: string; code: string; name: string; source: { type: string; path: string } };
type ChangeSummary = {
  code: string;
  lifecycle: string;
  progress: { exists: boolean; completed: number | null; total: number | null; remaining: number | null };
  brief: { exists: boolean; content?: string };
  artifacts: { proposal: { content?: string } };
};
type ScopedResolution = {
  availability: string;
  workingCopy: { provenance: string; change: ChangeSummary } | null;
  retainedBaseline: { provenance: string; change: ChangeSummary } | null;
};
type Prototype = { id: string; title: string; path: string; lifecycle: string; provenance: string };
type ChangeRuntime = {
  listProjects(): { projects: Project[] };
  projectDetail(root: string, code: string): { project: Project };
  resolveSourceRoot(root: string, source: Project['source']): string;
  readTask(root: string, taskId: string): { record: { taskId: string } };
  inspectTask(root: string, taskId: string): { record: { taskId: string; changes: Array<{ project: string; change: string }> } };
  inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): {
    status: string;
    repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>;
  };
  listChanges(root: string): { changes: ChangeSummary[] };
  changeDetail(root: string, project: string, ref: string): { change: ChangeSummary };
  resolveTaskScopedChange(root: string, taskId: string, reference: { project: string; change: string }, options?: { includeContent?: boolean }): ScopedResolution;
  taskUiPrototypes(root: string, taskId: string): { taskId: string; prototypes: Prototype[]; diagnostics: Array<{ code: string }> };
  taskUiPrototype(root: string, taskId: string, id: string): { html: string };
  taskProjectDocument(root: string, taskId: string, project: string, documentPath: string): { content: string | null; exists: boolean; provenance: string };
};

function unavailable(): never {
  throw new Error('Change Application method not registered.');
}

function fixture(): { root: string; runtime: ChangeRuntime; projectRoot: string; project: Project } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-change-'));
  const project: Project = {
    id: 'd15bde2c-9aab-4ed8-bf43-28a5372ca407',
    code: 'product',
    name: 'Buildr Product',
    source: { type: 'workspace', path: 'projects/product' },
  };
  const runtime: ChangeRuntime = {
    listProjects: () => ({ projects: [project] }),
    projectDetail: (_root, code) => {
      if (code !== project.code) throw Object.assign(new Error(`Project 不存在：${code}。`), { code: 'project_not_found', status: 404 });
      return { project };
    },
    resolveSourceRoot: (workspaceRoot, source) => path.resolve(workspaceRoot, source.path),
    readTask: (_target, taskId) => ({ record: { taskId } }),
    inspectTask: (_target, taskId) => ({ record: { taskId, changes: [] } }),
    inspectGitWorktrees: () => ({ status: 'blocked', repositories: [] }),
    listChanges: unavailable,
    changeDetail: unavailable,
    resolveTaskScopedChange: unavailable,
    taskUiPrototypes: unavailable,
    taskUiPrototype: unavailable,
    taskProjectDocument: unavailable,
  };
  const projectQuery = { listProjects: runtime.listProjects, projectDetail: runtime.projectDetail, resolveSourceRoot: runtime.resolveSourceRoot };
  const openSpecQuery = createChangeQuery(projectQuery);
  Object.assign(runtime, openSpecQuery);
  registerChangeApplication(runtime, {
    openSpecQuery,
    projectQuery,
    worktreeQuery: { inspectGitWorktrees: (input: { workspaceRoot: string; taskId: string }) => runtime.inspectGitWorktrees(input) },
  });
  return { root, runtime, projectRoot: path.join(root, project.source.path), project };
}

function writeChange(projectRoot: string, relative: string, files: Record<string, string> = {}): string {
  const root = path.join(projectRoot, 'openspec', 'changes', relative);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.openspec.yaml'), 'schema: spec-driven\n');
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function coded(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

test('Change read model直接投影当前active与archived artifacts', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'ship-ui', { 'brief.md': '# Brief\n', 'proposal.md': '# Ship UI\n', 'tasks.md': '- [x] model\n- [ ] ui\n' });
  writeChange(projectRoot, 'archive/2026-07-22-old-flow', { 'proposal.md': '# Old Flow\n' });
  const result = runtime.listChanges(root);
  assert.deepEqual(result.changes.map(({ code, lifecycle }) => [code, lifecycle]).sort(), [['old-flow', 'archived'], ['ship-ui', 'active']].sort());
  const detail = runtime.changeDetail(root, 'product', 'active~ship-ui').change;
  assert.equal(detail.brief.content, '# Brief\n');
  assert.equal(detail.artifacts.proposal.content, '# Ship UI\n');
  assert.deepEqual(detail.progress, { exists: true, completed: 1, total: 2, remaining: 1 });
  assert.throws(() => runtime.changeDetail(root, 'product', 'active~..'), /不合法/);
});

test('带两位归档序号的Change仍以原始code解析', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'archive/2026-09-03-01-finalize-flow', { 'proposal.md': '# Finalize Flow\n' });

  const listed = runtime.listChanges(root);
  assert.deepEqual(listed.changes.map(({ code, lifecycle }) => [code, lifecycle]), [['finalize-flow', 'archived']]);
  const resolved = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'finalize-flow' });
  assert.equal(resolved.availability, 'available');
  assert.equal(resolved.workingCopy?.provenance, 'retained-archive');
  assert.equal(resolved.workingCopy?.change.code, 'finalize-flow');
});

test('Task-scoped Change优先使用matching Worktree，缺失时仍可读取retained Change', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'shared', { 'proposal.md': '# Retained\n' });
  const worktreeRoot = path.join(root, '.worktrees', 'reader-task');
  const candidateProjectRoot = path.join(worktreeRoot, 'projects', 'product');
  writeChange(candidateProjectRoot, 'candidate-only', { 'proposal.md': '# Candidate\n' });
  writeChange(candidateProjectRoot, 'shared', { 'proposal.md': '# Candidate Shared\n' });
  runtime.inspectGitWorktrees = () => ({
    status: 'ready',
    repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'ready' }],
  });
  const candidate = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'candidate-only' }, { includeContent: true });
  assert.equal(candidate.availability, 'available');
  assert.equal(candidate.workingCopy?.provenance, 'task-worktree-candidate');
  assert.equal(candidate.workingCopy?.change.artifacts.proposal.content, '# Candidate\n');
  const shared = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'shared' }, { includeContent: true });
  assert.equal(shared.workingCopy?.change.artifacts.proposal.content, '# Candidate Shared\n');
  assert.equal(shared.retainedBaseline?.provenance, 'retained-baseline');
  assert.equal(shared.retainedBaseline?.change.artifacts.proposal.content, '# Retained\n');

  runtime.inspectGitWorktrees = () => ({ status: 'blocked', repositories: [] });
  const retained = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'shared' }, { includeContent: true });
  assert.equal(retained.availability, 'available');
  assert.equal(retained.workingCopy?.provenance, 'retained-active');
  assert.equal(runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'candidate-only' }).availability, 'unavailable');
});

test('Task UI Prototype使用Worktree owner并由Change内容决定展示', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worktreeRoot = path.join(root, '.worktrees', 'prototype-task');
  const candidateProjectRoot = path.join(worktreeRoot, 'projects', 'product');
  writeChange(candidateProjectRoot, 'previewed', {
    'screens/task.html': '<!doctype html><html><head><title>Task Prototype</title></head><body><!-- buildr:ui-prototype --></body></html>',
    'screens/incomplete.html': '<!-- buildr:ui-prototype --><title>Incomplete</title>',
  });
  runtime.inspectTask = (_target, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'previewed' }] } });
  runtime.inspectGitWorktrees = () => ({
    status: 'ready',
    repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'ready' }],
  });
  const result = runtime.taskUiPrototypes(root, 'prototype-task');
  assert.equal(result.prototypes.length, 1);
  assert.equal(result.prototypes[0].provenance, 'task-worktree-candidate');
  assert.equal(result.prototypes[0].title, 'Task Prototype');
  assert.equal(runtime.taskUiPrototype(root, 'prototype-task', result.prototypes[0].id).html.includes('Task Prototype'), true);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), ['ui_prototype_document_incomplete']);
  assert.throws(() => runtime.taskUiPrototype(root, 'prototype-task', 'not-an-id'), (error) => coded(error, 'ui_prototype_reference_invalid'));
});

test('OpenSpec 查询独立于任务，保持全局保留副本、归档提示与文件安全边界', (t) => {
  const { root, projectRoot, project } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const query = createChangeQuery({
    listProjects: () => ({ projects: [project] }),
    projectDetail: () => ({ project }),
    resolveSourceRoot: (base, source) => path.resolve(base, source.path),
  });
  assert.deepEqual(query.listChanges(root).changes, []);
  assert.equal(fs.existsSync(projectRoot), false, '空列表不得创建项目目录');
  const retained = writeChange(projectRoot, 'shared', { 'proposal.md': '# Retained\n' });
  writeChange(path.join(root, '.worktrees/reader/projects/product'), 'candidate-only', { 'proposal.md': '# Candidate\n' });
  writeChange(projectRoot, 'archive/2026-09-03-01-done', { 'proposal.md': '# Done\n' });
  const outside = path.join(root, 'outside.html');
  fs.writeFileSync(outside, '<html><head><title>Private</title></head><body><!-- buildr:ui-prototype --></body></html>');
  fs.symlinkSync(outside, path.join(retained, 'brief.md'));
  fs.symlinkSync(outside, path.join(retained, 'escape.html'));
  assert.deepEqual(query.listChanges(root).changes.map((item) => item.code).sort(), ['done', 'shared']);
  assert.equal(query.changeDetail(root, 'product', 'active~shared').change.brief.exists, false);
  assert.equal(query.findLogicalChange(root, project, projectRoot, 'done')?.ref, 'archived~2026-09-03-01-done');
  assert.throws(() => query.findLogicalChange(root, project, projectRoot, '../outside'), (error) => coded(error, 'change_reference_invalid'));
  assert.deepEqual(query.discoverUiPrototypes(retained).prototypes, []);
  assert.deepEqual(query.discoverUiPrototypes(retained).diagnostics.map((item) => item.code), ['ui_prototype_symlink_ignored']);
  assert.equal(query.generateChangeCreatePrompt(root, { projectCode: 'product', goal: '整理' }).copiedMeansCreated, false);
  assert.match(query.generateChangeActionPrompt(root, { projectCode: 'product', ref: 'archived~2026-09-03-01-done', action: 'continue' }).prompt, /不要修改历史归档/);
});


test('任务文档读取工作树未提交内容，相对文件不回退且拒绝越界与符号链接', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worktreeRoot = path.join(root, '.worktrees', 'reader-task');
  const candidateRoot = path.join(worktreeRoot, 'projects/product');
  writeChange(projectRoot, 'shared', { 'brief.md': 'retained brief', 'proposal.md': 'retained design' });
  writeChange(candidateRoot, 'shared', { 'brief.md': 'worktree brief', 'proposal.md': 'worktree design' });
  fs.mkdirSync(path.join(projectRoot, 'docs')); fs.mkdirSync(path.join(candidateRoot, 'docs'));
  fs.writeFileSync(path.join(projectRoot, 'docs/task.md'), 'main copy');
  fs.writeFileSync(path.join(candidateRoot, 'docs/task.md'), 'uncommitted worktree copy');
  fs.writeFileSync(path.join(projectRoot, 'docs/only-main.md'), 'main only');
  runtime.inspectTask = (_target, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'shared' }] } });
  runtime.inspectGitWorktrees = () => ({ status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'ready' }] });
  assert.equal(runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/task.md').content, 'uncommitted worktree copy');
  assert.equal(runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/only-main.md').exists, false);
  assert.equal(runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/task.md').provenance, 'task-worktree-candidate');
  for (const file of ['../AGENTS.md', '/etc/passwd', 'docs/task.txt']) assert.throws(() => runtime.taskProjectDocument(root, 'reader-task', 'product', file), error => coded(error, 'task_document_path_forbidden'));
  assert.throws(() => runtime.taskProjectDocument(root, 'reader-task', 'unrelated', 'docs/task.md'), error => coded(error, 'task_document_scope_forbidden'));
  fs.symlinkSync(path.join(projectRoot, 'docs/task.md'), path.join(candidateRoot, 'docs/link.md'));
  assert.throws(() => runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/link.md'), error => coded(error, 'task_document_path_forbidden'));
  fs.rmSync(path.join(candidateRoot, 'openspec/changes/shared'), { recursive: true });
  assert.equal(runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'shared' }).availability, 'unavailable');
  runtime.inspectGitWorktrees = () => ({ status: 'blocked', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'blocked' }] });
  assert.equal(runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'shared' }).availability, 'unavailable');
  assert.throws(() => runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/task.md'), error => coded(error, 'task_worktree_unavailable'));
  runtime.inspectGitWorktrees = () => ({ status: 'blocked', repositories: [] });
  assert.equal(runtime.taskProjectDocument(root, 'reader-task', 'product', 'docs/task.md').content, 'main copy');
});
