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
type Prototype = { id: string; title: string; path: string; source: 'task' | 'change'; project: string | null; change: string | null; lifecycle: string | null; provenance: string };
type ChangeRuntime = {
  listProjects(): { projects: Project[] };
  projectDetail(root: string, code: string): { project: Project };
  resolveSourceRoot(root: string, source: Project['source']): string;
  readTask(root: string, taskId: string): { record: { taskId: string; changes: Array<{ project: string; change: string }> } };
  inspectTask(root: string, taskId: string): { record: { taskId: string; changes: Array<{ project: string; change: string }> } };
  inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): {
    status: string;
    repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>;
  };
  listChanges(root: string): { changes: ChangeSummary[] };
  changeDetail(root: string, project: string, ref: string): { change: ChangeSummary };
  resolveTaskScopedChange(root: string, taskId: string, reference: { project: string; change: string }, options?: { includeContent?: boolean }): ScopedResolution;
  taskScopedChangeDetail(root: string, taskId: string, project: string, change: string): { resolution: ScopedResolution };
  taskUiPrototypes(root: string, taskId: string): { taskId: string; prototypes: Prototype[]; diagnostics: Array<{ code: string }> };
  taskUiPrototype(root: string, taskId: string, id: string): { html: string };
  taskProjectDocument(root: string, taskId: string, project: string, documentPath: string): { content: string | null; exists: boolean; provenance: string };
};

function unavailable(): never {
  throw new Error('Change Application method not registered.');
}

function fixture(projectCode = 'product'): { root: string; runtime: ChangeRuntime; projectRoot: string; project: Project } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-change-'));
  const project: Project = {
    id: 'd15bde2c-9aab-4ed8-bf43-28a5372ca407',
    code: projectCode,
    name: 'Buildr Product',
    source: { type: 'workspace', path: `projects/${projectCode}` },
  };
  const runtime: ChangeRuntime = {
    listProjects: () => ({ projects: [project] }),
    projectDetail: (_root, code) => {
      if (code !== project.code) throw Object.assign(new Error(`Project 不存在：${code}。`), { code: 'project_not_found', status: 404 });
      return { project };
    },
    resolveSourceRoot: (workspaceRoot, source) => path.resolve(workspaceRoot, source.path),
    readTask: (_target, taskId) => ({ record: { taskId, changes: [] } }),
    inspectTask: (_target, taskId) => ({ record: { taskId, changes: [] } }),
    inspectGitWorktrees: () => ({ status: 'blocked', repositories: [] }),
    listChanges: unavailable,
    changeDetail: unavailable,
    resolveTaskScopedChange: unavailable,
    taskScopedChangeDetail: unavailable,
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
  assert.deepEqual(query.discoverUiPrototypes(retained).diagnostics.map((item) => item.code), ['ui_prototype_symlink_ignored', 'ui_prototype_symlink_ignored']);
  assert.equal(query.generateChangeCreatePrompt(root, { projectCode: 'product', goal: '整理' }).copiedMeansCreated, false);
  assert.match(query.generateChangeActionPrompt(root, { projectCode: 'product', ref: 'archived~2026-09-03-01-done', action: 'continue' }).prompt, /不要修改历史归档/);
});

test('无变更任务从精确本机目录读取原型，未知任务及其他任务不获得访问', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const html = '<!doctype html><html><head><title>本机任务原型</title></head><body><!-- buildr:ui-prototype --><p>本任务内容</p></body></html>';
  const taskRoot = path.join(root, '.buildr/local/task-prototypes/local-task');
  assert.deepEqual(runtime.taskUiPrototypes(root, 'local-task'), { taskId: 'local-task', prototypes: [], diagnostics: [] });
  assert.equal(fs.existsSync(path.join(root, '.buildr')), false, '读取不创建原型目录');
  fs.mkdirSync(taskRoot, { recursive: true });
  fs.writeFileSync(path.join(taskRoot, 'screen.html'), html);
  const result = runtime.taskUiPrototypes(root, 'local-task');
  assert.equal(result.prototypes.length, 1);
  const page = result.prototypes[0];
  assert.deepEqual([page.source, page.project, page.change, page.lifecycle, page.provenance], ['task', null, null, null, 'task-local']);
  assert.equal(runtime.taskUiPrototype(root, 'local-task', page.id).html, html);
  const worktreeRoot = path.join(root, '.worktrees/local-task');
  const worktreePrototypeRoot = path.join(worktreeRoot, '.buildr/local/task-prototypes/local-task');
  fs.mkdirSync(worktreePrototypeRoot, { recursive: true });
  fs.writeFileSync(path.join(worktreePrototypeRoot, 'screen.html'), html.replace('本任务内容', '错误工作树副本'));
  runtime.inspectGitWorktrees = () => ({ status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'ready' }] });
  assert.equal(runtime.taskUiPrototype(root, 'local-task', page.id).html, html, '本机任务来源只读取显式主根，不读取工作树的同名目录');
  assert.deepEqual(runtime.taskUiPrototypes(root, 'other-task').prototypes, []);
  assert.throws(() => runtime.taskUiPrototype(root, 'other-task', page.id), error => coded(error, 'ui_prototype_not_found'));
  assert.throws(() => runtime.taskUiPrototypes(root, '../local-task'), error => coded(error, 'task_record_identity_invalid'));
  runtime.inspectTask = () => { throw Object.assign(new Error('不存在'), { code: 'task_record_not_found', status: 404 }); };
  assert.throws(() => runtime.taskUiPrototypes(root, 'local-task'), error => coded(error, 'task_record_not_found'));
  assert.throws(() => runtime.taskUiPrototype(root, 'local-task', page.id), error => coded(error, 'task_record_not_found'));
  assert.equal(fs.readFileSync(path.join(taskRoot, 'screen.html'), 'utf8'), html);
});

test('本机与变更原型并存，非法本机文件不影响安全来源', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const html = '<html><head><title>原型</title></head><body><!-- buildr:ui-prototype --></body></html>';
  writeChange(projectRoot, 'linked', { 'screen.html': html });
  runtime.inspectTask = (_root, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'linked' }] } });
  const previous = runtime.taskUiPrototypes(root, 'local-task').prototypes[0];
  const localRoot = path.join(root, '.buildr/local/task-prototypes/local-task');
  fs.mkdirSync(localRoot, { recursive: true });
  fs.writeFileSync(path.join(localRoot, 'screen.html'), html);
  fs.writeFileSync(path.join(localRoot, 'unmarked.html'), '<html><head></head><body>private</body></html>');
  fs.writeFileSync(path.join(localRoot, 'incomplete.html'), '<!-- buildr:ui-prototype -->');
  fs.writeFileSync(path.join(localRoot, 'large.html'), html + ' '.repeat(2 * 1024 * 1024));
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.html'), html);
  fs.symlinkSync(path.join(outside, 'private.html'), path.join(localRoot, 'file.html'));
  fs.symlinkSync(outside, path.join(localRoot, 'directory'));
  const result = runtime.taskUiPrototypes(root, 'local-task');
  assert.equal(result.prototypes.length, 2);
  assert.equal(result.prototypes.find(page => page.source === 'change')?.id, previous.id, '新增来源不改变既有原型身份');
  assert.notEqual(result.prototypes.find(page => page.source === 'task')?.id, previous.id);
  assert.deepEqual(result.diagnostics.map(item => item.code).sort(), ['ui_prototype_document_incomplete', 'ui_prototype_file_too_large', 'ui_prototype_symlink_ignored', 'ui_prototype_symlink_ignored'].sort());
  runtime.inspectTask = (_root, taskId) => ({ record: { taskId, changes: [{ project: 'deleted-project', change: 'unavailable' }, { project: 'product', change: 'linked' }] } });
  const partial = runtime.taskUiPrototypes(root, 'local-task');
  assert.equal(partial.prototypes.length, 2, '失效项目引用不阻断本机或其他安全变更');
  assert.ok(partial.diagnostics.some(item => item.code === 'project_not_found'));
  assert.equal(runtime.taskUiPrototype(root, 'local-task', partial.prototypes.find(page => page.source === 'task')!.id).html, html);
});

test('任务本机原型逐级拒绝符号链接，仍返回可读变更原型', (t) => {
  const html = '<html><head></head><body><!-- buildr:ui-prototype --></body></html>';
  for (const level of ['.buildr', '.buildr/local', '.buildr/local/task-prototypes', '.buildr/local/task-prototypes/local-task']) {
    const { root, runtime, projectRoot } = fixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    writeChange(projectRoot, 'linked', { 'screen.html': html });
    runtime.inspectTask = (_root, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'linked' }] } });
    const outside = path.join(root, 'outside');
    const remainder = path.relative(level, '.buildr/local/task-prototypes/local-task');
    fs.mkdirSync(path.join(outside, remainder), { recursive: true });
    fs.writeFileSync(path.join(outside, remainder, 'private.html'), html);
    fs.mkdirSync(path.dirname(path.join(root, level)), { recursive: true });
    fs.symlinkSync(outside, path.join(root, level));
    const result = runtime.taskUiPrototypes(root, 'local-task');
    assert.deepEqual(result.prototypes.map(page => page.source), ['change'], level);
    assert.deepEqual(result.diagnostics.map(item => item.code), ['ui_prototype_task_path_forbidden'], level);
  }
});

test('本机任务标识与名为task的项目变更使用不同身份命名域', (t) => {
  const { root, runtime, projectRoot } = fixture('task');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const taskId = 'same-task';
  const html = (title: string) => `<html><head><title>${title}</title></head><body><!-- buildr:ui-prototype -->${title}</body></html>`;
  writeChange(projectRoot, taskId, { 'screen.html': html('变更正文') });
  runtime.inspectTask = (_root, id) => ({ record: { taskId: id, changes: [{ project: 'task', change: taskId }] } });
  const directory = path.join(root, '.buildr/local/task-prototypes', taskId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'screen.html'), html('本机正文'));
  const pages = runtime.taskUiPrototypes(root, taskId).prototypes;
  assert.equal(pages.length, 2);
  assert.equal(new Set(pages.map(page => page.id)).size, 2);
  for (const page of pages) assert.equal(runtime.taskUiPrototype(root, taskId, page.id).html, html(page.source === 'task' ? '本机正文' : '变更正文'));
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


test('读取任务材料只解析关联目标并保留关联授权检查', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'read-target', { 'proposal.md': '# Current content\n' });
  runtime.readTask = (_root, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'read-target' }] } });
  runtime.inspectTask = () => { throw new Error('不应为材料授权解析完整任务及其他材料'); };
  let resolutions = 0;
  runtime.inspectGitWorktrees = () => { resolutions += 1; return { status: 'ready', repositories: [] }; };
  const result = runtime.taskScopedChangeDetail(root, 'reader-task', 'product', 'read-target');
  assert.equal(result.resolution.workingCopy?.change.artifacts.proposal.content, '# Current content\n');
  assert.equal(resolutions, 1);
  assert.throws(() => runtime.taskScopedChangeDetail(root, 'reader-task', 'product', 'unrelated'), error => coded(error, 'task_change_not_associated'));
  assert.equal(resolutions, 1);
  runtime.readTask = () => { throw Object.assign(new Error('不存在'), { code: 'task_record_not_found' }); };
  assert.throws(() => runtime.taskScopedChangeDetail(root, 'missing', 'product', 'read-target'), error => coded(error, 'task_record_not_found'));
});
