import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { TaskDiffReader } = await import('../src/features/task/components/TaskDiffReader.tsx');
const { TaskChangesPane } = await import('../src/features/task/components/TaskChangesPane.tsx');
const commit = { repositoryId: 'repo', hash: 'a'.repeat(40), shortHash: 'a'.repeat(12), subject: '保存子任务交付', message: '保存子任务交付\n\nBuildr-Task: child', authorName: 'fixture', authorEmail: 'fixture@example.com', authoredAt: '2026-10-13T00:00:00Z', committedAt: '2026-10-13T00:00:00Z', taskId: 'child', taskTitle: '子任务交付说明' };
const repository = { id: 'repo', label: '交付仓库', root: '.', branch: 'dev', ahead: 0, status: 'complete', changes: [], commits: [{ key: 'repo:' + commit.hash, commit, files: [] }] };
const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('提交左栏省去零数量空分组并在组合视图显示真实来源', () => {
  const html = markup(TaskDiffReader, { repositories: [repository, { ...repository, id: 'empty', label: '空仓库', commits: [] }], selected: null, onSelect() {}, showTaskSource: true, taskId: 'parent' });
  assert.match(html, /交付仓库/);
  assert.match(html, /子任务交付说明/);
  assert.match(html, /title="child"/);
  assert.match(html, /1 提交/);
  assert.doesNotMatch(html, /更改 · 0|提交 · 0|工作区干净|暂无关联提交|task-rail-repo-meta/);
});

test('组合提交入口仅展示已提交文件，部分结果仍保留诊断', () => {
  const changed = { scopeKey: 'parent', loading: false, error: '', refresh: async () => {}, registerFullRefresh() {}, data: { taskId: 'parent', readAt: 'now', status: 'partial', repositories: [repository], files: [{ repositoryId: 'repo', path: 'unrelated-current.ts', kind: 'tracked', status: 'modified', additions: 1, deletions: 0 }], commits: [commit], commitFiles: {}, coverage: { repositoryLimit: 32, fileLimit: 500, truncated: false }, diagnostics: [{ message: '一个子任务来源暂不可读取' }] } };
  const html = markup(TaskChangesPane, { changed, commitsOnly: true, defaultCommit: true });
  assert.match(html, /提交记录读取不完整/);
  assert.match(html, /一个子任务来源暂不可读取/);
  assert.match(html, /保存子任务交付/);
  assert.doesNotMatch(html, /unrelated-current\.ts/);
});
