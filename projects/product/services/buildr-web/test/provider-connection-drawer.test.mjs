import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const drawerStubUrl = new URL('../src/components/DrawerShell.tsx?stub=1', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {};', shortCircuit: true };
    }
    if (specifier.endsWith('/DrawerShell') || specifier.endsWith('/DrawerShell.tsx')) {
      return { url: drawerStubUrl, shortCircuit: true };
    }
    if (
      context.parentURL?.includes('/buildr-web/src/') &&
      specifier.startsWith('.') &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      for (const ext of ['.tsx', '.ts']) {
        try {
          const candidate = new URL(specifier + ext, context.parentURL);
          readFileSync(candidate);
          return { url: candidate.href, shortCircuit: true };
        } catch {
          // try next extension
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === drawerStubUrl) {
      return {
        format: 'module',
        source: `import React from 'react'; export function DrawerShell({ open, title, footer, children }) { return open ? React.createElement('div', { 'data-drawer-title': title }, React.createElement('h2', null, title), children, footer) : null; }`,
        shortCircuit: true,
      };
    }
    if (url.endsWith('.tsx')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const { ProviderConnectionDrawer } = await import('../src/features/agent-conversations/ProviderConnectionDrawer.tsx');

test('ProviderConnectionDrawer shows Google AI as OAuth subscription provider with save-and-login action', () => {
  const providers = [
    {
      id: 'google-ai-subscription',
      label: 'Google AI',
      singleton: true,
      authentication: {
        type: 'oauth',
        label: 'Google AI',
        description: '登录 Google AI 账号后即可使用订阅模型；首次添加会自动下载并初始化本地代理组件。',
      },
    },
    { id: 'custom', label: '自定义供应商', custom: true },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ProviderConnectionDrawer, {
      open: true,
      initial: { kind: 'google-ai-subscription', label: 'Google AI' },
      providers,
      configuredProviders: [],
      onClose() {},
      async onSave() {},
    }),
  );
  assert.ok(html.includes('添加供应商'));
  assert.ok(html.includes('保存并登录'));
  assert.ok(html.includes('首次添加会自动下载并初始化本地代理组件'));
});

test('AgentConnectionSettings saveProvider preserves underlying failure message for the drawer alert', () => {
  const source = readFileSync(
    new URL('../src/features/agent-conversations/AgentConnectionSettings.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /let failureMessage='';/);
  assert.match(source, /if\(!saved\)throw new Error\(failureMessage\|\|'供应商配置未完成。'\);/);
});
