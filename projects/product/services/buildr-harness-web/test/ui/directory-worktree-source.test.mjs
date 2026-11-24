import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    try { return next(specifier, context); }
    catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('/FileEditingContext.tsx')) {
      return {
        format: 'module',
        source: 'export const useFileEditingContext = () => ({ sessions: {} });',
        shortCircuit: true,
      };
    }
    if (url.endsWith('/RepositoryFileBrowser.tsx')) {
      return {
        format: 'module',
        source: 'import React from "react"; export function RepositoryFileBrowser(props) { return React.createElement("div", { "data-mock-browser": "1" }, props.context); }',
        shortCircuit: true,
      };
    }
    if (url.endsWith('.tsx')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const { DirectoryExplorer } = await import('../../src/features/directory-workbench/DirectoryExplorer.tsx');

function withDomGlobals(fn) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fakeWindow = { innerWidth: 1440, addEventListener() {}, removeEventListener() {} };
  fakeWindow.parent = fakeWindow;
  globalThis.window = fakeWindow;
  globalThis.document = { querySelector: () => null, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  try { return fn(); }
  finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
}

test('DirectoryExplorer 默认渲染紧凑中性工作树入口且不展开内联表单', () => {
  const html = withDomGlobals(() => renderToStaticMarkup(
    React.createElement(App, null,
      React.createElement(DirectoryExplorer, {
        workspaceId: 'ws-1',
        scope: { ref: { sourceId: 'buildr', id: 'ws-1' }, rootPath: '/fixture/repo', name: 'Buildr', revision: '1' },
        scopeKey: 'ws-1:1',
        catalog: null,
        catalogError: '',
        catalogLoading: false,
        refreshCatalog: async () => {},
        choosingCheckout: false,
        onChooseCheckout: () => {},
        requestFor: () => async () => ({}),
        active: true,
        initialTreeOpen: true,
        onSaved: () => {},
      })),
  ));

  assert.match(html, /class="code-root-selectors directory-browse-source"/);
  assert.doesNotMatch(html, /class="[^"]*\bis-selected\b/);
  assert.match(html, /aria-label="浏览来源"/);
  assert.match(html, />工作空间目录</);
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*class="[^"]*directory-browse-source-toggle[^"]*"[^>]*><span>选择工作树<\/span><\/button>/);
  assert.doesNotMatch(html, /directory-browse-source-fields/, '默认态不应展开双 Select 下拉表单');
  assert.doesNotMatch(html, /directory-browse-source-clear/, '默认态不应显示清除工作树按钮');
});

test('code-explorer-pane.css 使用中性文字与统一 10px 水平对齐且不再使用彩色主色文字', () => {
  const css = readFileSync(new URL('../../src/workbench/explorer/code-explorer-pane.css', import.meta.url), 'utf8');
  assert.match(css, /\.global-source-sidebar \.repository-tree-heading\s*\{\s*padding:8px 10px 6px 10px;/);
  assert.match(css, /\.global-source-sidebar \.repository-file-search\s*\{\s*padding-inline:10px;/);
  assert.match(css, /\.directory-browse-source\s*\{[^}]*padding:0 10px 8px;/);

  const sourceRules = css.split('\n').filter(line => line.includes('directory-browse-source'));
  assert.ok(sourceRules.length > 0);
  for (const line of sourceRules) {
    assert.doesNotMatch(line, /color:\s*var\(--soft-primary\)/, `工作树控件样式应保持中性色：${line}`);
  }
  assert.match(css, /\.directory-browse-source-actions \.ant-btn\s*\{[^}]*color:var\(--soft-muted\)/);
  assert.match(css, /\.directory-browse-source\.is-selected \.directory-browse-source-current\s*\{[^}]*color:var\(--soft-ink\)/);
  assert.match(css, /\.directory-browse-source-fields\s*\{[^}]*border:1px solid var\(--soft-line\)/);
});

test('DirectoryExplorer 支持单仓库预选及选中工作树后自动收起表单', () => {
  const source = readFileSync(new URL('../../src/features/directory-workbench/DirectoryExplorer.tsx', import.meta.url), 'utf8');
  assert.match(source, /if\s*\(\s*!pickerOpen\s*\|\|\s*repositoryPath\s*!==\s*undefined\s*\|\|\s*repos\.length\s*!==\s*1\s*\)\s*return;/);
  assert.match(source, /setCheckout\(\{\s*repositoryId:\s*selectedRepo\.id,\s*checkoutId:\s*id\s*\}\);\s*setPickerOpen\(false\);/);
  assert.match(source, /if\s*\(\s*!checkout\s*\)\s*onChooseCheckout\(false\);/);
});
