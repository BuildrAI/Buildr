import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState, StateEffect, Text, Transaction } from '@codemirror/state';
import { Chunk, getChunks, unifiedMergeView } from '@codemirror/merge';
import { FileEditingSessionStore } from '../src/components/file-editing/file-editing-session.ts';
import { fileDiffRestoreChange, projectFileDiffTransactions, retainFileDiffPresentation } from '../src/components/file-editing/file-diff-transactions.ts';

const text = value => Text.of(value.split('\n'));
const file = (content, extra = {}) => ({ id: 'workspace:file', path: 'file.ts', location: '/repo', revision: 'first', content, kind: 'text', ...extra });
const storeFor = initial => {
  const store = new FileEditingSessionStore({ save: async (_file, content) => ({ ...initial, content, revision: 'saved' }) }, 100000);
  store.ensure(initial); return store;
};

test('composition freezes same-file mode, baseline and readonly presentation until the real end event', () => {
  const initial = { fileId: 'same', mode: 'split', original: 'initial index', readOnly: false };
  const pending = { ...initial, mode: 'unified', original: 'updated index', readOnly: true };
  assert.equal(retainFileDiffPresentation(initial, pending, true), initial);
  const newest = { ...pending, original: 'newest index' };
  const composing = retainFileDiffPresentation(initial, newest, true);
  assert.equal(composing, initial);
  assert.equal(retainFileDiffPresentation(composing, newest, false), newest);
  const other = { ...pending, fileId: 'other' };
  assert.equal(retainFileDiffPresentation(initial, other, true), other);
});

test('diff presentation edits use canonical history, retain disk line endings, and never copy merge configuration', () => {
  const initial = file('\ufeffone\r\ntwo\r\n');
  const store = storeFor(initial);
  try {
    const before = store.getSnapshot()[initial.id].editorState;
    const presentation = EditorState.create({ doc: before.doc, extensions: unifiedMergeView({ original: 'old\n' }) });
    const transaction = presentation.update({ changes: { from: 5, to: 8, insert: 'changed' }, userEvent: 'input.type', effects: StateEffect.appendConfig.of(EditorState.tabSize.of(8)) });
    const projected = projectFileDiffTransactions(before, [transaction]);
    assert.ok(projected);
    assert.equal(projected[0].annotation(Transaction.userEvent), 'input.type');
    assert.equal(projected[0].annotation(Transaction.time), transaction.annotation(Transaction.time));
    assert.equal(projected[0].effects.length, 0);
    assert.equal(store.applyTransactions(initial.id, projected), true);
    assert.equal(store.getSnapshot()[initial.id].content, '\ufeffone\r\nchanged\r\n');
    assert.equal(getChunks(store.getSnapshot()[initial.id].editorState), null);
    assert.equal(store.getSnapshot()[initial.id].editorState.tabSize, before.tabSize);
    store.undo(initial.id); assert.equal(store.getSnapshot()[initial.id].content, initial.content);
    store.redo(initial.id); assert.equal(store.getSnapshot()[initial.id].content, '\ufeffone\r\nchanged\r\n');
  } finally { store.clearTimers(); }
});

test('canonical protection and stale source text reject projected edits before they reach shared text', () => {
  const initial = file('before protected after', { protectedRanges: [{ from: 7, to: 16 }] });
  const store = storeFor(initial);
  try {
    const before = store.getSnapshot()[initial.id].editorState;
    const presentation = EditorState.create({ doc: before.doc });
    const blocked = presentation.update({ changes: { from: 8, to: 9, insert: 'x' }, userEvent: 'revert' });
    assert.equal(projectFileDiffTransactions(before, [blocked]), null);
    const stale = EditorState.create({ doc: 'another source' }).update({ changes: { from: 0, insert: 'x' } });
    assert.equal(projectFileDiffTransactions(before, [stale]), null);
    assert.equal(store.getSnapshot()[initial.id].content, initial.content);
  } finally { store.clearTimers(); }
});

test('projected composition edits retain intermediate text without saving before composition completes', async () => {
  const initial = file('before\n');
  const saves = [];
  const store = new FileEditingSessionStore({ save: async (_file, content) => { saves.push(content); return { ...initial, content, revision: 'saved' }; } }, 100000);
  store.ensure(initial);
  try {
    store.setComposing(initial.id, true);
    const canonical = store.getSnapshot()[initial.id].editorState;
    const local = EditorState.create({ doc: canonical.doc });
    const projected = projectFileDiffTransactions(canonical, [local.update({ changes: { from: 0, to: 6, insert: '中文' }, userEvent: 'input.type.compose' })]);
    assert.equal(store.applyTransactions(initial.id, projected), true);
    await store.saveNow(initial.id); assert.deepEqual(saves, []);
    assert.equal(store.getSnapshot()[initial.id].content, '中文\n');
    store.setComposing(initial.id, false);
    await store.saveNow(initial.id); assert.deepEqual(saves, ['中文\n']);
  } finally { store.clearTimers(); }
});

test('chunk restoration handles additions, removals, replacement, empty documents and final newlines exactly', () => {
  for (const [original, current] of [['old\n', 'new\n'], ['', 'new'], ['old', ''], ['one\ntwo', 'one'], ['one', 'one\ntwo'], ['one\n', 'one'], ['one', 'one\n'], ['\n', ''], ['', '\n']]) {
    const old = text(original), now = text(current), chunks = Chunk.build(old, now);
    const state = EditorState.create({ doc: now });
    const restored = state.update({ changes: chunks.map(chunk => fileDiffRestoreChange(old, now, chunk)) }).newDoc.toString();
    assert.equal(restored, original, JSON.stringify([original, current]));
  }
});

test('restoring one chunk keeps other edits and has its own undo event', () => {
  const original = ['first', ...Array.from({ length: 20 }, (_, index) => 'keep ' + index), 'last', ''].join('\n');
  const initial = file(original), store = storeFor(initial);
  try {
    let canonical = store.getSnapshot()[initial.id].editorState;
    const presentation = EditorState.create({ doc: canonical.doc });
    const last = original.lastIndexOf('last');
    let change = presentation.update({ changes: [{ from: 0, to: 5, insert: 'FIRST' }, { from: last, to: last + 4, insert: 'LAST' }], userEvent: 'input.type' });
    assert.equal(store.applyTransactions(initial.id, projectFileDiffTransactions(canonical, [change])), true);
    canonical = store.getSnapshot()[initial.id].editorState;
    const chunks = Chunk.build(text(original), canonical.doc), chunk = chunks[0];
    assert.equal(chunks.length, 2);
    const local = EditorState.create({ doc: canonical.doc });
    change = local.update({ changes: fileDiffRestoreChange(text(original), canonical.doc, chunk), userEvent: 'revert' });
    assert.equal(store.applyTransactions(initial.id, projectFileDiffTransactions(canonical, [change])), true);
    const restored = store.getSnapshot()[initial.id].content;
    assert.equal(restored, original.replace('last', 'LAST'));
    store.undo(initial.id); assert.equal(store.getSnapshot()[initial.id].content, original.replace('first', 'FIRST').replace('last', 'LAST'));
    store.redo(initial.id); assert.equal(store.getSnapshot()[initial.id].content, restored);
  } finally { store.clearTimers(); }
});
