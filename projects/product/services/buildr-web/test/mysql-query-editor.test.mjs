import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keymap } from '@codemirror/view';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('/FileCodeEditor') && context.parentURL?.endsWith('/SqlQueryEditor.tsx')) return { url: 'data:text/javascript,export function FileCodeEditor(props) { globalThis.__sqlEditorState = props.state; return null; }', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/SqlQueryEditor.tsx')) {
      const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { SqlQueryEditor } = await import('../src/features/mysql-query/components/SqlQueryEditor.tsx');

function editor(value, busy, onRun) {
  renderToStaticMarkup(React.createElement(SqlQueryEditor, { value, busy, onRun, onChange() {}, onSelectionChange() {} }));
  return globalThis.__sqlEditorState;
}
function enterBinding(state) { return state.facet(keymap).flat().find(binding => binding.key === 'Mod-Enter'); }

test('真实查询编辑器的 Mod-Enter 优先运行当前选择，不被默认插入空行吞掉', () => {
  const calls = [], original = 'SELECT 1;\nSELECT 2;';
  const initial = editor(original, false, selection => calls.push({ from: selection.from, to: selection.to }));
  const from = original.indexOf('SELECT 2'), state = initial.update({ selection: { anchor: from, head: original.length } }).state;
  const view = { state, dispatch() { assert.fail('运行快捷键不能修改编辑文档。'); } };
  assert.equal(enterBinding(state).run(view), true);
  assert.deepEqual(calls, [{ from, to: original.length }]);
  assert.equal(view.state.doc.toString(), original);
});

test('查询忙碌或文档空白时快捷键不重复查询，也不落到插入空行', () => {
  for (const [value, busy] of [['SELECT 1;', true], ['  \n', false]]) {
    let calls = 0;
    const state = editor(value, busy, () => calls++);
    assert.equal(enterBinding(state).run({ state, dispatch() { assert.fail('禁止默认修改文档。'); } }), true);
    assert.equal(calls, 0); assert.equal(state.doc.toString(), value);
  }
});
