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

const { ModelPicker } = await import('../../src/components/ModelPicker.tsx');

function renderPicker(overrides = {}) {
  const no = () => {};
  const props = {
    selectedKey: 'codex:gpt-5',
    modelLabel: 'GPT-5',
    groups: [
      { id: 'native-codex', label: 'ChatGPT', options: [{ value: 'codex:gpt-5', label: 'GPT-5' }] },
      { id: 'native-qoder', label: 'Qoder', options: [{ value: 'qoder:qwen', label: 'Qwen' }] },
    ],
    reasoning: {
      options: [{ id: 'medium', label: '标准' }, { id: 'high', label: '高' }],
      index: 0,
      ordered: [{ id: 'medium', label: '标准' }, { id: 'high', label: '高' }],
      inherited: false,
      label: '标准',
    },
    disabled: false,
    unavailable: false,
    tierSwitchable: true,
    tierDisabled: false,
    tierLabel: 'Fast',
    accelerated: true,
    onSelectModel: no,
    onSelectEffort: no,
    onCycleTier: no,
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(App, null, React.createElement(ModelPicker, props)));
}

test('ModelPicker 默认触发器渲染完整选择器标签、推理档位与加速标记', () => {
  const html = renderPicker();
  assert.match(html, /class="[^"]*ac-model-trigger/);
  assert.match(html, /aria-label="模型与推理强度"/);
  assert.ok(html.includes('GPT-5'));
  assert.ok(html.includes('标准'));
  assert.match(html, /class="[^"]*ac-tier-mark/);
});

test('ModelPicker 紧凑模式与不可用状态渲染正确的触发器语义与禁用属性', () => {
  const compactHtml = renderPicker({ compact: true, accelerated: true });
  assert.match(compactHtml, /class="[^"]*execution-model-trigger/);
  assert.match(compactHtml, /aria-label="选择执行模型"/);
  assert.equal(compactHtml.includes('ac-tier-mark'), false);

  const unavailableHtml = renderPicker({ unavailable: true });
  assert.match(unavailableHtml, /<button[^>]*disabled/);
});
