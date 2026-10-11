import assert from 'node:assert/strict';
import test from 'node:test';
import { FileEditingSessionStore } from '../src/components/file-editing/file-editing-session.ts';
import { normalizeEditorText, originalTextOffset, editorTextOffset } from '../src/components/file-editing/file-editing-text.ts';

const file = (content = '# Example\n', extra = {}) => ({ id: 'workspace:file', path: 'README.md', content, kind: 'markdown', location: '/workspace', revision: 'r1', ...extra });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function memory(initial = file()) {
  let disk = initial;
  let count = 1;
  const writes = [];
  const operations = {
    read: async () => disk,
    save: async (_file, content, expectedRevision) => {
      writes.push({ content, expectedRevision });
      if (disk.revision !== expectedRevision) throw Object.assign(Error('Conflict'), { code: 'file_revision_conflict', details: { current: disk } });
      disk = { ...disk, content, revision: 'r' + ++count }; return disk;
    },
  };
  const store = new FileEditingSessionStore(operations, 100_000);
  store.ensure(initial);
  return { store, writes, disk: () => disk, external(content) { disk = { ...disk, content, revision: 'r' + ++count }; } };
}

test('saved edits keep CodeMirror undo/redo and share one actual-file session across entry points', async () => {
  const { store, writes, disk } = memory();
  try {
    store.change('workspace:file', '# Changed\n');
    await store.saveNow('workspace:file');
    const retained = store.getSnapshot()['workspace:file'].editorState;
    store.ensure({ ...file(), selector: { kind: 'other-entry' } });
    assert.equal(store.getSnapshot()['workspace:file'].editorState, retained);
    store.undo('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].content, '# Example\n');
    await store.saveNow('workspace:file');
    store.redo('workspace:file');
    await store.saveNow('workspace:file');
    assert.equal(disk().content, '# Changed\n');
    assert.equal(writes.length, 3);
    store.ensure(file('different worktree', { id: 'workspace:other-file' }));
    assert.equal(store.getSnapshot()['workspace:other-file'].content, 'different worktree');
  } finally { store.clearTimers(); }
});

test('serial saves never mark newer input saved or overwrite it with an older response', async () => {
  const requests = [];
  const store = new FileEditingSessionStore({ save: (source, content, revision) => { const pending = deferred(); requests.push({ ...pending, source, content, revision }); return pending.promise; } }, 100_000);
  store.ensure(file('start'));
  try {
    store.change('workspace:file', 'first');
    const first = store.saveNow('workspace:file');
    store.change('workspace:file', 'second');
    const second = store.saveNow('workspace:file');
    assert.equal(requests.length, 1);
    requests[0].resolve(file('first', { revision: 'r2' }));
    await first; await Promise.resolve();
    assert.equal(store.getSnapshot()['workspace:file'].content, 'second');
    assert.equal(store.getSnapshot()['workspace:file'].status, 'saving');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].revision, 'r2');
    requests[1].resolve(file('second', { revision: 'r3' }));
    await second;
    assert.equal(store.getSnapshot()['workspace:file'].status, 'saved');
  } finally { store.clearTimers(); }
});

test('IME composition pauses both scheduled and immediate saves until completion', async () => {
  const writes = [];
  const store = new FileEditingSessionStore({ save: async (source, content) => { writes.push(content); return { ...source, content, revision: 'r2' }; } }, 1);
  store.ensure(file(''));
  try {
    store.setComposing('workspace:file', true);
    store.change('workspace:file', '中文');
    await store.saveNow('workspace:file'); await tick();
    assert.deepEqual(writes, []);
    store.setComposing('workspace:file', false); await tick();
    assert.deepEqual(writes, ['中文']);
  } finally { store.clearTimers(); }
});

test('CRLF, mixed line endings and BOM outside edits retain their exact original bytes', () => {
  const original = '\ufeffalpha\r\nbeta\ngamma\rdelta\r\n';
  const { store } = memory(file(original));
  try {
    const current = store.getSnapshot()['workspace:file'];
    const state = current.editorState;
    const beta = state.doc.toString().indexOf('beta');
    const delta = state.doc.toString().indexOf('delta');
    store.applyTransactions('workspace:file', [state.update({ changes: [{ from: beta, to: beta + 4, insert: '中文' }, { from: delta, to: delta + 5, insert: 'done' }] })]);
    assert.equal(store.getSnapshot()['workspace:file'].content, '\ufeffalpha\r\n中文\ngamma\rdone\r\n');
    assert.equal(originalTextOffset(original, editorTextOffset(original, original.indexOf('gamma'))), original.indexOf('gamma'));
    assert.equal(normalizeEditorText(original), '\ufeffalpha\nbeta\ngamma\ndelta\n');
  } finally { store.clearTimers(); }
});

test('managed ranges move with preceding edits and block changes inside their content', async () => {
  const original = 'user\r\nMANAGED\r\ntail';
  const { store } = memory(file(original, { protectedRanges: [{ from: original.indexOf('MANAGED'), to: original.indexOf('MANAGED') + 7 }] }));
  try {
    let state = store.getSnapshot()['workspace:file'].editorState;
    store.applyTransactions('workspace:file', [state.update({ changes: { from: 0, to: 4, insert: 'longer user' } })]);
    state = store.getSnapshot()['workspace:file'].editorState;
    const at = state.doc.toString().indexOf('MANAGED');
    store.applyTransactions('workspace:file', [state.update({ changes: { from: at, to: at + 1, insert: 'X' } })]);
    await Promise.resolve();
    assert.equal(store.getSnapshot()['workspace:file'].content, 'longer user\r\nMANAGED\r\ntail');
    assert.match(store.getSnapshot()['workspace:file'].protectedMessage, /受管区块/);
  } finally { store.clearTimers(); }
});

test('external updates pause dirty sessions, and merging checks the newly observed revision again', async () => {
  const { store, external, writes, disk } = memory(file('base'));
  try {
    store.change('workspace:file', 'mine'); external('external one');
    await store.refresh('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].status, 'conflict');
    await store.saveNow('workspace:file');
    assert.equal(writes.length, 0);
    external('external two');
    assert.equal(await store.resolveConflict('workspace:file', 'merged one'), false);
    assert.equal(store.getSnapshot()['workspace:file'].content, 'merged one');
    assert.equal(store.getSnapshot()['workspace:file'].conflict.disk, 'external two');
    assert.equal(await store.resolveConflict('workspace:file', 'merged two'), true);
    assert.equal(disk().content, 'merged two');
    assert.equal(writes.at(-1).expectedRevision, 'r3');
  } finally { store.clearTimers(); }
});

test('failure retains input, leaves other files usable, and retries the current draft', async () => {
  let fail = true;
  const store = new FileEditingSessionStore({ save: async (source, content) => { if (source.id === 'workspace:file' && fail) throw Error('read-only volume'); return { ...source, content, revision: 'r2' }; } }, 100_000);
  store.ensure(file('base')); store.ensure(file('second base', { id: 'workspace:second' }));
  try {
    store.change('workspace:file', 'kept input'); await store.saveNow('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].status, 'error');
    assert.equal(store.getSnapshot()['workspace:file'].content, 'kept input');
    store.change('workspace:second', 'other input'); await store.saveNow('workspace:second');
    assert.equal(store.getSnapshot()['workspace:second'].status, 'saved');
    fail = false; store.change('workspace:file', 'latest draft'); await store.saveNow('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].diskContent, 'latest draft');
  } finally { store.clearTimers(); }
});

test('clean external reload and explicit disk adoption replace the correct session only', async () => {
  const { store, external } = memory(file('base'));
  try {
    external('clean external'); await store.refresh('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].content, 'clean external');
    store.change('workspace:file', 'my draft'); external('latest disk'); await store.refresh('workspace:file');
    store.acceptDisk('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].content, 'latest disk');
    assert.equal(store.getSnapshot()['workspace:file'].status, 'saved');
    store.undo('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].content, 'latest disk');
  } finally { store.clearTimers(); }
});

test('a read started before saving cannot roll back the saved revision or editor history', async () => {
  const read = deferred();
  const store = new FileEditingSessionStore({ read: () => read.promise, save: async (source, content) => ({ ...source, content, revision: 'r2' }) }, 100_000);
  store.ensure(file('base'));
  try {
    const refresh = store.refresh('workspace:file');
    store.change('workspace:file', 'saved'); await store.saveNow('workspace:file');
    const state = store.getSnapshot()['workspace:file'].editorState;
    read.resolve(file('base')); await refresh;
    assert.equal(store.getSnapshot()['workspace:file'].content, 'saved');
    assert.equal(store.getSnapshot()['workspace:file'].revision, 'r2');
    assert.equal(store.getSnapshot()['workspace:file'].editorState, state);
    store.undo('workspace:file'); assert.equal(store.getSnapshot()['workspace:file'].content, 'base');
  } finally { store.clearTimers(); }
});

test('a late save response cannot erase an external conflict observed through another entry', async () => {
  const save = deferred();
  const store = new FileEditingSessionStore({ save: () => save.promise }, 100_000);
  store.ensure(file('base'));
  try {
    store.change('workspace:file', 'mine');
    const saving = store.saveNow('workspace:file');
    store.ensure(file('external r3', { revision: 'r3', selector: { kind: 'other-entry' } }));
    assert.equal(store.getSnapshot()['workspace:file'].status, 'conflict');
    save.resolve(file('mine', { revision: 'r2' })); await saving;
    assert.equal(store.getSnapshot()['workspace:file'].status, 'conflict');
    assert.equal(store.getSnapshot()['workspace:file'].conflict.disk, 'external r3');
    assert.equal(store.getSnapshot()['workspace:file'].content, 'mine');
  } finally { store.clearTimers(); }
});

test('source identity drift pauses the binding until the user explicitly reviews the new source', async () => {
  const writes = [];
  const original = file('base', { sourceRevision: 'source1', sourceKey: 'project', selector: { snapshot: { selector: { kind: 'project' }, observedAt: 'first' } } });
  const next = { ...original, sourceRevision: 'source2' };
  const store = new FileEditingSessionStore({ read: async () => next, save: async (source, content) => { writes.push(source.sourceRevision); return { ...source, content, revision: 'r2' }; } }, 100_000);
  store.ensure(original);
  try {
    store.change('workspace:file', 'draft'); await store.refresh('workspace:file');
    assert.match(store.getSnapshot()['workspace:file'].bindingError, /来源/);
    await store.saveNow('workspace:file'); assert.deepEqual(writes, []);
    assert.equal(store.getSnapshot()['workspace:file'].file.sourceRevision, 'source1');
    await store.reviewSource('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].conflict.reason, 'source');
    await store.resolveConflict('workspace:file', 'reviewed draft');
    assert.deepEqual(writes, ['source2']);
  } finally { store.clearTimers(); }
});

test('a fresh alternative entry can recover an invalid old binding while stale pages cannot replace it', async () => {
  const original = file('base', { sourceRevision: 'project1', sourceKey: 'project', observedAt: '2026-10-11T01:00:00Z', selector: { kind: 'project' } });
  const writes = [];
  const store = new FileEditingSessionStore({ read: async () => { throw Error('Project removed'); }, save: async (source, content) => { writes.push(source.sourceRevision); return { ...source, content, revision: 'r2' }; } }, 100_000);
  store.ensure(original);
  try {
    store.change('workspace:file', 'draft'); await store.refresh('workspace:file');
    const retained = store.getSnapshot()['workspace:file'].editorState;
    store.ensure(file('base', { sourceRevision: 'code1', sourceKey: 'code', observedAt: '2026-10-11T02:00:00Z', selector: { kind: 'code' } }));
    store.ensure(original);
    assert.equal(store.getSnapshot()['workspace:file'].editorState, retained);
    assert.equal(store.getSnapshot()['workspace:file'].file.sourceRevision, 'code1');
    await store.saveNow('workspace:file'); assert.deepEqual(writes, ['code1']);
  } finally { store.clearTimers(); }
});

test('merge drafts and their history survive panel release and another external update', async () => {
  const { store, external } = memory(file('base'));
  try {
    store.change('workspace:file', 'mine'); external('disk one'); await store.refresh('workspace:file');
    const initial = store.getSnapshot()['workspace:file'].mergeEditorState;
    store.applyMergeTransactions('workspace:file', [initial.update({ changes: { from: 0, to: initial.doc.length, insert: 'partially merged draft' }, userEvent: 'input' })]);
    const retained = store.getSnapshot()['workspace:file'].mergeEditorState;
    const release = store.watch('workspace:file'); release();
    store.ensure(file('base'));
    external('disk two'); await store.refresh('workspace:file');
    assert.equal(store.getSnapshot()['workspace:file'].mergeContent, 'partially merged draft');
    assert.equal(store.getSnapshot()['workspace:file'].mergeEditorState, retained);
    assert.equal(store.getSnapshot()['workspace:file'].mergeStale, true);
    assert.equal(store.getSnapshot()['workspace:file'].conflict.disk, 'disk two');
  } finally { store.clearTimers(); }
});

test('merged external managed ranges are protected immediately without resetting undo history', async () => {
  const original = file('user\n');
  const externalText = 'user\nLOCKED\n';
  let disk = file(externalText, { revision: 'r2', protectedRanges: [{ from: 5, to: 11 }] });
  const store = new FileEditingSessionStore({ read: async () => disk, save: async (source, content) => { disk = { ...source, content, revision: 'r3', protectedRanges: [{ from: content.indexOf('LOCKED'), to: content.indexOf('LOCKED') + 6 }] }; return disk; } }, 100_000);
  store.ensure(original);
  try {
    store.change('workspace:file', 'mine\n'); await store.refresh('workspace:file');
    assert.equal(await store.resolveConflict('workspace:file', 'merged\nLOCKED\n'), true);
    const session = store.getSnapshot()['workspace:file'];
    assert.ok(session.historyIndex > 0);
    const at = session.editorState.doc.toString().indexOf('LOCKED');
    store.applyTransactions('workspace:file', [session.editorState.update({ changes: { from: at, to: at + 1, insert: 'X' } })]);
    await Promise.resolve();
    assert.equal(store.getSnapshot()['workspace:file'].content, 'merged\nLOCKED\n');
    store.undo('workspace:file');
    assert.match(store.getSnapshot()['workspace:file'].content, /LOCKED/);
  } finally { store.clearTimers(); }
});

test('an old conflict snapshot from another entry cannot roll back a subsequently merged save', async () => {
  const initial = file('base', { observedAt: '2026-10-11T00:00:00Z' });
  const external = file('external', { revision: 'r2', observedAt: '2026-10-11T01:00:00Z' });
  let conflict = true;
  const store = new FileEditingSessionStore({ save: async (source, content) => {
    if (conflict) { conflict = false; throw Object.assign(Error('Conflict'), { code: 'file_revision_conflict', details: { current: external } }); }
    return { ...source, content, revision: 'r3', observedAt: '2026-10-11T02:00:00Z' };
  } }, 100_000);
  store.ensure(initial);
  try {
    store.change(initial.id, 'mine'); await store.saveNow(initial.id);
    await store.resolveConflict(initial.id, 'merged');
    const state = store.getSnapshot()[initial.id].editorState;
    store.ensure(external);
    assert.equal(store.getSnapshot()[initial.id].content, 'merged');
    assert.equal(store.getSnapshot()[initial.id].revision, 'r3');
    assert.equal(store.getSnapshot()[initial.id].editorState, state);
  } finally { store.clearTimers(); }
});

test('workspace suspension retains failed and conflicted drafts, and releases clean sessions', async () => {
  const { WorkspaceFileEditingStores } = await import('../src/components/file-editing/file-editing-workspaces.ts');
  const cache = new WorkspaceFileEditingStores();
  const failed = new FileEditingSessionStore({ save: async () => { throw Error('disk unavailable'); } }, 100_000);
  const conflict = memory(file('base', { id: 'workspaceB:file' }));
  failed.ensure(file('base'));
  try {
    failed.change('workspace:file', 'failed draft'); await failed.saveNow('workspace:file');
    conflict.store.change('workspaceB:file', 'conflict draft'); conflict.external('other disk'); await conflict.store.refresh('workspaceB:file');
    const mergeState = conflict.store.getSnapshot()['workspaceB:file'].mergeEditorState;
    await cache.suspend('A', failed); await cache.suspend('B', conflict.store);
    assert.equal(cache.hasUnsaved(), true);
    assert.equal(cache.take('A'), failed);
    const resumed = cache.take('B');
    assert.equal(resumed, conflict.store);
    assert.equal(resumed.getSnapshot()['workspaceB:file'].content, 'conflict draft');
    assert.equal(resumed.getSnapshot()['workspaceB:file'].mergeEditorState, mergeState);
    assert.equal(failed.getSnapshot()['workspace:file'].content, 'failed draft');
    conflict.store.acceptDisk('workspaceB:file'); await cache.suspend('B', conflict.store);
    assert.equal(cache.take('B'), undefined);
  } finally { failed.clearTimers(); conflict.store.clearTimers(); }
});

test('same-version policy refresh updates readonly metadata in both directions without losing a draft or undo history', async () => {
  const initial = file('base', { sourceRevision: 'project1', sourceKey: 'project', observedAt: '2026-10-11T01:00:00Z' });
  let disk = initial;
  const writes = [];
  const store = new FileEditingSessionStore({
    read: async () => disk,
    save: async (_source, content, expectedRevision) => { writes.push(expectedRevision); disk = { ...disk, content, revision: 'r2' }; return disk; },
  }, 100_000);
  store.ensure(initial); store.setMode(initial.id, 'edit'); store.change(initial.id, 'retained draft');
  const retained = store.getSnapshot()[initial.id].editorState;
  try {
    // A policy observation can change editability without changing the observed byte revision.
    disk = { ...initial, readOnlyReason: '当前受管副本保持只读', observedAt: '2026-10-11T02:00:00Z' };
    await store.refresh(initial.id);
    assert.equal(store.getSnapshot()[initial.id].file.readOnlyReason, disk.readOnlyReason);
    assert.equal(store.getSnapshot()[initial.id].content, 'retained draft');
    assert.equal(store.getSnapshot()[initial.id].editorState, retained);
    await store.saveNow(initial.id); assert.deepEqual(writes, []);
    disk = { ...initial, observedAt: '2026-10-11T03:00:00Z' };
    await store.refresh(initial.id);
    assert.equal(store.getSnapshot()[initial.id].file.readOnlyReason, undefined);
    assert.equal(store.getSnapshot()[initial.id].editorState, retained);
    assert.equal(store.getSnapshot()[initial.id].content, 'retained draft');
    await store.saveNow(initial.id); assert.deepEqual(writes, ['r1']);
    store.undo(initial.id); assert.equal(store.getSnapshot()[initial.id].content, 'base');
  } finally { store.clearTimers(); }
});

test('fresh same-binding policy snapshots update metadata while stale, alternative and changed-source observations retain their boundaries', () => {
  const initial = file('base', { sourceRevision: 'project1', sourceKey: 'project', observedAt: '2026-10-11T01:00:00Z' });
  const store = new FileEditingSessionStore({ save: async (source, content) => ({ ...source, content, revision: 'r2' }) }, 100_000);
  store.ensure(initial); store.change(initial.id, 'draft');
  const retained = store.getSnapshot()[initial.id].editorState;
  try {
    store.ensure({ ...initial, readOnlyReason: '新受管政策', observedAt: '2026-10-11T02:00:00Z' });
    assert.equal(store.getSnapshot()[initial.id].file.readOnlyReason, '新受管政策');
    store.ensure(initial);
    store.ensure({ ...initial, sourceRevision: 'code1', sourceKey: 'code', observedAt: '2026-10-11T02:30:00Z' });
    assert.equal(store.getSnapshot()[initial.id].file.sourceKey, 'project');
    assert.equal(store.getSnapshot()[initial.id].file.readOnlyReason, '新受管政策');
    store.ensure({ ...initial, versionLabel: 'new-branch · 当前文件', observedAt: '2026-10-11T03:00:00Z' });
    assert.equal(store.getSnapshot()[initial.id].file.readOnlyReason, undefined);
    assert.equal(store.getSnapshot()[initial.id].file.versionLabel, 'new-branch · 当前文件');
    assert.equal(store.getSnapshot()[initial.id].editorState, retained);
    assert.equal(store.getSnapshot()[initial.id].content, 'draft');
    store.ensure({ ...initial, sourceRevision: 'project2', observedAt: '2026-10-11T04:00:00Z' });
    assert.match(store.getSnapshot()[initial.id].bindingError, /来源/);
    assert.equal(store.getSnapshot()[initial.id].file.sourceRevision, 'project1');
  } finally { store.clearTimers(); }
});
