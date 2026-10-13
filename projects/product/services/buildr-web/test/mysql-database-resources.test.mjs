import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/DatabaseResources.tsx')) {
      const source = ['useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__databaseResourcesHarness.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/DatabaseResources.tsx')) {
      return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { DatabaseResources } = await import('../src/features/connections/components/DatabaseResources.tsx');

function resourceHarness(visible, onVisible) {
  let cursor = 0;
  const slots = [];
  globalThis.__databaseResourcesHarness = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect() {},
  };
  return () => {
    cursor = 0;
    const node = DatabaseResources({ databases: ['orders', 'billing'], visible, current: '', loading: false, saving: false, writable: true, active: true, onCurrent() {}, onVisible });
    const header = React.Children.toArray(node.props.children)[0];
    const popover = React.Children.toArray(header.props.children)[1];
    const controls = React.Children.toArray(popover.props.content.props.children);
    return { popover: popover.props, choices: controls[0].props, apply: controls[2].props };
  };
}

test('启用库弹出层重复打开通知保留当前草稿，真正重开才读取已保存选择', () => {
  const applied = [], render = resourceHarness(['orders'], values => applied.push(values));
  render().popover.onOpenChange(true);
  render().choices.onChange(['orders', 'billing']);
  render().popover.onOpenChange(true);
  assert.deepEqual(render().choices.value, ['orders', 'billing']);
  render().apply.onClick();
  assert.deepEqual(applied, [['orders', 'billing']]); assert.equal(render().popover.open, false);
  render().popover.onOpenChange(true);
  assert.deepEqual(render().choices.value, ['orders']);
});
