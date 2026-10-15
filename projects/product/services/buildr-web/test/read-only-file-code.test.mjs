import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { LanguageDescription } from '@codemirror/language';
import { fileEditingLanguages } from '../src/components/file-editing/file-editing-language.ts';
import { createReadOnlyFileCodeState, readOnlyFileCodeLineNumber, readOnlyFileCodeMatches, readOnlyFileCodePresentation, readOnlyFileCodeText, readOnlyFileCodeTransactionResult, updateReadOnlyFileCodePresentation } from '../src/components/file-editing/read-only-file-code.ts';

test('historical and partial text rejects edits while allowing selection without a save session', () => {
  const initial = createReadOnlyFileCodeState({ content: 'const answer = 42;\nnext', startLine: 810 });
  assert.equal(initial.facet(EditorState.readOnly), true);
  assert.equal(initial.facet(EditorView.editable), false);
  const selection = initial.update({ selection: { anchor: 0, head: 5 } }).state;
  assert.equal(selection.selection.main.to, 5);
  for (const changes of [{ from: 0, insert: 'paste' }, { from: 0, to: selection.doc.length, insert: '' }]) {
    const transaction = selection.update({ changes });
    assert.equal(transaction.docChanged, false);
    assert.equal(transaction.state.doc.toString(), 'const answer = 42;\nnext');
  }
  assert.equal(readOnlyFileCodeLineNumber(selection, 1), 810);
  assert.equal(readOnlyFileCodeLineNumber(selection, 2), 811);
});

test('a refreshed source rejects late view selection and unfiltered document changes', () => {
  const oldSource = createReadOnlyFileCodeState({ content: 'old observation' });
  const current = createReadOnlyFileCodeState({ content: 'latest observation' });
  assert.equal(readOnlyFileCodeTransactionResult(current, [oldSource.update({ selection: { anchor: 2 } })]), null);
  assert.equal(readOnlyFileCodeTransactionResult(current, [current.update({ changes: { from: 0, insert: 'bypass' }, filter: false })]), null);
  const selection = current.update({ selection: { anchor: 3, head: 6 } });
  const result = readOnlyFileCodeTransactionResult(current, [selection]);
  assert.equal(result.doc.toString(), 'latest observation');
  assert.deepEqual([result.selection.main.from, result.selection.main.to], [3, 6]);
});

test('partial source line numbers and trailing LF stay aligned at a page boundary', () => {
  const first = createReadOnlyFileCodeState({ content: 'line 40\r\nline 41\r\n', startLine: 40, omitTrailingEmpty: true });
  const next = createReadOnlyFileCodeState({ content: 'line 42\r\n', startLine: 42 });
  assert.equal(first.doc.lines, 2);
  assert.equal(next.doc.lines, 2);
  assert.equal(readOnlyFileCodeLineNumber(first, first.doc.lines), 41);
  assert.equal(readOnlyFileCodeLineNumber(next, 1), 42);
  assert.equal(readOnlyFileCodeLineNumber(next, next.doc.lines), 43);
  assert.equal(readOnlyFileCodeText('not a complete line', true), 'not a complete line');
});

test('observed partial matches survive CRLF normalization and retain only visible text', () => {
  const content = '前😀界\r\nneedle\r\n尾';
  const shown = readOnlyFileCodePresentation({ content, startLine: 77, observedMatch: { start: content.indexOf('needle'), end: content.indexOf('needle') + 6 }, startsMidLine: true });
  const text = readOnlyFileCodeText(content);
  assert.equal(text.slice(shown.observedMatch.start, shown.observedMatch.end), 'needle');
  assert.equal(shown.startsMidLine, true);
  const overlap = readOnlyFileCodeMatches('edle尾', 'needle', { start: -2, end: 4 });
  assert.deepEqual(overlap, [{ start: 0, end: 4 }]);
  assert.deepEqual(readOnlyFileCodeMatches('edle尾', 'needle'), []);
  assert.equal(readOnlyFileCodePresentation({ content: 'line\n', omitTrailingEmpty: true, observedMatch: { start: 4, end: 5 } }).observedMatch, null);
});

test('literal and observed search matches use exact original Unicode offsets', () => {
  const text = 'İ😀前 Search.Hit[0] SEARCH.HIT[0] 尾';
  const matches = readOnlyFileCodeMatches(text, 'search.hit[0]');
  assert.deepEqual(matches.map(match => text.slice(match.start, match.end)), ['Search.Hit[0]', 'SEARCH.HIT[0]']);
  assert.equal(matches[0].start, text.indexOf('Search.Hit[0]'));
  assert.deepEqual(readOnlyFileCodeMatches('needle needle', 'needle', { start: 3, end: 8 }), [{ start: 0, end: 13 }]);
  assert.deepEqual(readOnlyFileCodeMatches('needle', '[.*]'), []);
});

test('selection and query presentation plus asynchronous language reconfiguration retain the source and selection', async () => {
  const language = new Compartment();
  let state = createReadOnlyFileCodeState({ content: 'export const answer = 42;\n', startLine: 120 }, undefined, language.of([]));
  state = state.update({ selection: { anchor: 7, head: 12 } }).state;
  const doc = state.doc;
  state = state.update({ effects: updateReadOnlyFileCodePresentation.of(readOnlyFileCodePresentation({ content: doc.toString(), startLine: 120, selectedLines: [120, 121], query: 'answer' })) }).state;
  const support = await LanguageDescription.matchFilename(fileEditingLanguages, 'answer.ts').load();
  state = state.update({ effects: language.reconfigure(support) }).state;
  assert.equal(state.doc, doc);
  assert.deepEqual([state.selection.main.from, state.selection.main.to], [7, 12]);
  assert.equal(readOnlyFileCodeLineNumber(state, 2), 121);
  assert.equal(state.facet(EditorState.readOnly), true);
  assert.equal(state.update({ changes: { from: 0, insert: 'changed' } }).docChanged, false);
});
