import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { history, undoDepth } from '@codemirror/commands';
import { startCompletion, completionStatus } from '@codemirror/autocomplete';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('/FileCodeEditor') && context.parentURL?.endsWith('/SqlQueryEditor.tsx')) return { url: 'data:text/javascript,export function FileCodeEditor(props) { globalThis.__sqlEditorState = props.state; return null; }', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.includes('/features/mysql-query/')) {
      const url = new URL(specifier + '.ts', context.parentURL); if (existsSync(url)) return {url:url.href,shortCircuit:true};
    }
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
const { sqlExecutionTarget } = await import('../src/features/mysql-query/sql-execution-target.ts');
const { sqlTargetHighlights, sqlRunningTarget, sqlStatementHighlight, statementOutline } = await import('../src/features/mysql-query/editor/sql-statement-highlight.ts');

function editor(value, busy, onRun, completion) {
  renderToStaticMarkup(React.createElement(SqlQueryEditor, { value, busy, onRun, completion, onChange() {}, onSelectionChange() {} }));
  return globalThis.__sqlEditorState;
}
function enterBinding(state) { return state.facet(keymap).flat().find(binding => binding.key === 'Mod-Enter'); }

test('sel 后立即按 Enter 或 Tab 不依赖候选弹层就绪，普通换行保持有效', () => {
  for (const key of ['Enter', 'Tab']) {
    const prefix = 'WITH a AS (SELECT 1 AS id) SELECT id FROM a UNION SELECT 9\n\n';
    const original = prefix + 'sel\n\nSELECT 3;';
    let state = editor(original, false, () => assert.fail('展开不能执行查询'));
    state = state.update({ selection: { anchor: prefix.length + 3 } }).state;
    const view = { state, dom: { isConnected: false }, focus() {}, dispatch(spec) { this.state = this.state.update(spec).state; } };
    assert.equal(state.facet(keymap).flat().find(binding => binding.key === key).run(view), true);
    assert.equal(view.state.doc.toString(), prefix + 'SELECT *\nFROM ;\n\nSELECT 3;');
    assert.equal(view.state.selection.main.head, prefix.length + 'SELECT *\nFROM '.length);
  }
  for (const original of ['SELECT 1\n\ns', 'SELECT * FROM users sel', 'SELECT * FROM users AS\n\nsel']) {
    const state = editor(original, false, () => {}).update({ selection: { anchor: original.length } }).state;
    assert.equal(state.facet(keymap).flat().find(binding => binding.key === 'Enter').run({ state }), false, original);
  }
});

test('表候选仍在更新时确认使用当前输入，不能插入换行或旧候选', () => {
  for (const key of ['Enter', 'Tab']) {
    const text = 'SELECT * FROM order_l;';
    const catalog = { read() { return { status: 'ready', tables: [{ name: 'order_headers' }, { name: 'order_lines' }] }; } };
    let state = editor(text, false, () => assert.fail('选表不能执行查询'), { catalog, database: 'orders', databases: ['orders'], enabled: true });
    state = state.update({ selection: { anchor: text.length - 1 } }).state;
    const view = { state, dom: { isConnected: false }, focus() {}, dispatch(spec) { this.state = this.state.update(spec).state; } };
    const confirm = state.facet(keymap).flat().find(binding => binding.key === key);
    assert.equal(confirm.run(view), false, '关闭候选后普通编辑不隐式选表');
    startCompletion(view);
    assert.equal(completionStatus(view.state), 'pending');
    assert.equal(confirm.run(view), true);
    assert.equal(view.state.doc.toString(), 'SELECT * FROM `order_lines`;');
  }
});

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

function marks(state) {
  const result = [];
  state.field(sqlTargetHighlights).between(0, state.doc.length, (from, to, decoration) => result.push({ from, to, attributes: decoration.spec.attributes }));
  return result;
}

test('多行范围只有一个连续外轮廓，行间连接且没有逐行横向边框', () => {
  const outline = statementOutline([{ left: 10, right: 110, top: 5, bottom: 15 }, { left: 10, right: 70, top: 25, bottom: 35 }], 20);
  assert.deepEqual({ left: outline.left, top: outline.top, width: outline.width, height: outline.height }, { left: 10, top: 0, width: 100, height: 40 });
  assert.equal(outline.path.match(/M/g).length, 1); assert.equal(outline.path.match(/Z/g).length, 1);
  const vertices = [...outline.path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  let perimeter = 0, area = 0;
  for (let index = 0; index < vertices.length; index++) {
    const [x, y] = vertices[index], [nextX, nextY] = vertices[(index + 1) % vertices.length];
    perimeter += Math.abs(nextX - x) + Math.abs(nextY - y); area += x * nextY - nextX * y;
  }
  assert.equal(perimeter, 280, '整体外周长不包含两行接缝的内部横线');
  assert.equal(Math.abs(area / 2), 3200, '背景连续覆盖两行及行间距');
  assert.deepEqual(statementOutline([{ left: 50, right: 70, top: 25, bottom: 35 }, { left: 10, right: 50, top: 25, bottom: 35 }, { left: 10, right: 110, top: 5, bottom: 15 }], 20), outline, '同一视觉行的片段不会形成额外轮廓');
  assert.equal(statementOutline([], 20), null);
});

test('正式编辑器范围框与实际运行共用定位，移动、选区和编辑后立即更新', () => {
  const sql = " SELECT ';' AS text;\n\n-- comment;\nSELECT 2;\n ";
  let state = editor(sql, false, () => {});
  for (let pos = 0; pos <= sql.length; pos++) {
    state = state.update({ selection: { anchor: pos } }).state;
    const target = sqlExecutionTarget(sql, state.selection.main), [mark] = marks(state);
    assert.equal(mark.from, target.from); assert.equal(mark.to, target.to);
    assert.equal(state.doc.sliceString(mark.from, mark.to), target.sql);
    assert.equal(mark.attributes['data-sql-target-state'], 'current');
  }
  const from = sql.indexOf('SELECT 2'), to = from + 8;
  state = state.update({ selection: { anchor: to, head: from } }).state;
  assert.equal(marks(state)[0].attributes['data-sql-target-mode'], 'selection');
  assert.equal(state.doc.sliceString(marks(state)[0].from, marks(state)[0].to), 'SELECT 2');
  state = state.update({ changes: { from, to, insert: 'SELECT 333' } }).state;
  const target = sqlExecutionTarget(state.doc.toString(), state.selection.main);
  assert.equal(state.doc.sliceString(marks(state)[0].from, marks(state)[0].to), target.sql);
});

test('无法执行的选区、空白、纯注释和未闭合语句不显示可执行框', () => {
  for (const text of ['', '\n ', '-- comment;', '/* comment */', "SELECT 'unclosed", 'SELECT 1 /* unclosed']) assert.deepEqual(marks(editor(text, false, () => {})), []);
  const sql = 'SELECT 1;\nSELECT 2;';
  const state = editor(sql, false, () => {}).update({ selection: { anchor: 0, head: sql.length } }).state;
  assert.deepEqual(marks(state), []);
});

test('无分号和复杂查询移动光标时，范围与运行始终使用同一原文，歧义时无框', () => {
  const complex = 'WITH a AS (SELECT 1 AS id), b AS (SELECT id FROM a)\nSELECT * FROM b UNION ALL SELECT 2';
  const sql = `SELECT 0\n${complex}\nSELECT 3;`;
  const submitted = [];
  let state = editor(sql, false, selection => submitted.push(sqlExecutionTarget(sql, selection)));
  for (let pos = 0; pos <= sql.length; pos++) {
    state = state.update({ selection: { anchor: pos } }).state;
    const [mark] = marks(state);
    enterBinding(state).run({ state });
    const target = submitted.at(-1);
    assert.equal(mark.from, target.from); assert.equal(mark.to, target.to);
    assert.equal(state.doc.sliceString(mark.from, mark.to), target.sql);
    if (pos > sql.indexOf(complex) && pos < sql.indexOf(complex) + complex.length) assert.equal(target.sql, complex);
  }
  for (const text of ['SELECT * FROM\nSELECT 2', 'WITH a AS (SELECT 1) SELECT', 'SELECT 1 UNION SELECT']) assert.deepEqual(marks(editor(text, false, () => {})), []);
});

test('执行范围固定至请求结束，旧文档范围失效且状态变化不进入撤销历史', () => {
  const sql = 'SELECT 1;\nSELECT 2;', target = sqlExecutionTarget(sql, { from: 0, to: 0 });
  const compartment = new Compartment();
  let state = EditorState.create({ doc: sql, extensions: [history(), sqlStatementHighlight, compartment.of(sqlRunningTarget.of(null))] });
  state = state.update({ effects: compartment.reconfigure(sqlRunningTarget.of({ document: sql, target })) }).state;
  state = state.update({ selection: { anchor: sql.length } }).state;
  assert.equal(marks(state)[0].from, 0); assert.equal(marks(state)[0].to, 9);
  assert.equal(marks(state)[0].attributes['data-sql-target-state'], 'running');
  assert.equal(undoDepth(state), 0, '范围变化不是文本编辑');
  state = state.update({ effects: compartment.reconfigure(sqlRunningTarget.of(null)) }).state;
  assert.equal(marks(state)[0].from, sql.indexOf('SELECT 2'));
  assert.equal(marks(state)[0].attributes['data-sql-target-state'], 'current');
  state = state.update({ effects: compartment.reconfigure(sqlRunningTarget.of({ document: sql, target })) }).state;
  state = state.update({ changes: { from: 0, to: sql.length, insert: 'SELECT 333;' } }).state;
  assert.deepEqual(marks(state), [], '外部替换文档后不复用旧执行范围');
  state = state.update({ effects: compartment.reconfigure(sqlRunningTarget.of(null)) }).state;
  assert.equal(state.doc.sliceString(marks(state)[0].from, marks(state)[0].to), 'SELECT 333;');
});
