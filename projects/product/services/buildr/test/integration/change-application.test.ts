import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerChangeApplication } from '../../src/task/change/application/change-application.ts';
import { inspectChangeChecklist } from '../../src/task/openspec/application/change-checklist.mjs';

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
};
type Prototype = { id: string; title: string; path: string; lifecycle: string; provenance: string };
type ChangeRuntime = {
  listProjects(): { projects: Project[] };
  projectDetail(root: string, code: string): { project: Project };
  readTaskRecordPersistence(root: string, taskId: string): { record: { taskId: string } };
  inspectTaskRecord(root: string, taskId: string): { record: { taskId: string; changes: Array<{ project: string; change: string }> } };
  inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): {
    status: string;
    repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>;
  };
  listChanges(root: string): { changes: ChangeSummary[] };
  changeDetail(root: string, project: string, ref: string): { change: ChangeSummary };
  resolveTaskScopedChange(root: string, taskId: string, reference: { project: string; change: string }, options?: { includeContent?: boolean }): ScopedResolution;
  taskUiPrototypes(root: string, taskId: string): { taskId: string; prototypes: Prototype[]; diagnostics: Array<{ code: string }> };
  taskUiPrototype(root: string, taskId: string, id: string): { html: string };
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
    readTaskRecordPersistence: (_target, taskId) => ({ record: { taskId } }),
    inspectTaskRecord: (_target, taskId) => ({ record: { taskId, changes: [] } }),
    inspectGitWorktrees: () => ({ status: 'blocked', repositories: [] }),
    listChanges: unavailable,
    changeDetail: unavailable,
    resolveTaskScopedChange: unavailable,
    taskUiPrototypes: unavailable,
    taskUiPrototype: unavailable,
  };
  registerChangeApplication(runtime, {
    openSpecQuery: { inspectChangeChecklist },
    projectQuery: { listProjects: runtime.listProjects, projectDetail: runtime.projectDetail },
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

test('Task-scoped Change优先使用matching Worktree，缺失时仍可读取retained Change', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'shared', { 'proposal.md': '# Retained\n' });
  const worktreeRoot = path.join(root, '.worktrees', 'reader-task');
  const candidateProjectRoot = path.join(worktreeRoot, 'projects', 'product');
  writeChange(candidateProjectRoot, 'candidate-only', { 'proposal.md': '# Candidate\n' });
  runtime.inspectGitWorktrees = () => ({
    status: 'ready',
    repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: worktreeRoot, state: 'ready' }],
  });
  const candidate = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'candidate-only' }, { includeContent: true });
  assert.equal(candidate.availability, 'available');
  assert.equal(candidate.workingCopy?.provenance, 'task-worktree-candidate');
  assert.equal(candidate.workingCopy?.change.artifacts.proposal.content, '# Candidate\n');

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
  runtime.inspectTaskRecord = (_target, taskId) => ({ record: { taskId, changes: [{ project: 'product', change: 'previewed' }] } });
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
