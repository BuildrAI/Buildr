import { ChangeSet, Compartment, EditorState, Facet, StateEffect, StateField, Transaction, type EditorSelection, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import { redo, undo, undoDepth } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { editorTextOffset, initialMerge, normalizeEditorText, originalTextOffset, preferredLineBreak, textDifference } from './file-editing-text.ts';
import type { FileEditingDocument, FileEditingOperations, FileEditingSession } from './file-editing-types';

type Range = { from: number; to: number };
const initialRanges = Facet.define<Range[], Range[]>({ combine: values => values.flat() });
const replaceProtectedRanges = StateEffect.define<Range[]>();
const protectedRanges = StateField.define<Range[]>({
  create: state => state.facet(initialRanges),
  update(ranges, transaction) {
    const replacement = transaction.effects.find(effect => effect.is(replaceProtectedRanges));
    return replacement ? replacement.value : ranges.map(range => ({ from: transaction.changes.mapPos(range.from, 1), to: transaction.changes.mapPos(range.to, -1) }));
  },
});

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--font-size-code)', backgroundColor: 'var(--ant-color-bg-container, #fff)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.8', overflow: 'auto' },
  '.cm-content': { padding: '14px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: 'var(--ant-color-bg-layout, #f7f8f9)', color: 'var(--ant-color-text-quaternary, #9aa4ad)', borderRight: '1px solid var(--ant-color-border-secondary, #eceef1)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: '#397d7409' },
  '.cm-activeLineGutter': { backgroundColor: '#397d740d' },
  '.file-editor-managed': { backgroundColor: '#5b8fa814', color: 'var(--ant-color-text-secondary, #68717b)' },
});

/** A workspace owns this store. File panels only subscribe and dispatch editor transactions. */
export class FileEditingSessionStore {
  private sessions: Record<string, FileEditingSession> = {};
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = new Map<string, Promise<void>>();
  private refreshing = new Map<string, Promise<void>>();
  private active = new Map<string, number>();
  private languages = new Map<string, Compartment>();
  private editability = new Map<string, Compartment>();
  private languageExtensions = new Map<string, Extension>();
  private observed = new Map<string, Set<string>>();
  private observedTimes = new Map<string, string>();
  private saveGenerations = new Map<string, number>();
  private diskGenerations = new Map<string, number>();
  private operations: FileEditingOperations;
  private delay: number;
  private epoch = 0;

  constructor(operations: FileEditingOperations, delay = 700) { this.operations = operations; this.delay = delay; }
  setOperations(operations: FileEditingOperations) { this.operations = operations; }
  getSnapshot = () => this.sessions;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(id: string, session: FileEditingSession) {
    const compartment = this.editability.get(id), readOnly = Boolean(session.file.readOnlyReason);
    if (compartment && (session.editorState.facet(EditorState.readOnly) !== readOnly || session.editorState.facet(EditorView.editable) === readOnly)) {
      session = { ...session, editorState: session.editorState.update({ effects: compartment.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]), annotations: Transaction.addToHistory.of(false) }).state };
    }
    this.sessions = { ...this.sessions, [id]: session };
    for (const listener of this.listeners) listener();
  }
  private update(id: string, transform: (session: FileEditingSession) => FileEditingSession) {
    const current = this.sessions[id];
    if (current) this.publish(id, transform(current));
  }
  private cancel(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  private remember(id: string, revision: string, observedAt?: string) {
    const revisions = this.observed.get(id) || new Set<string>();
    revisions.add(revision); this.observed.set(id, revisions);
    if (observedAt && observedAt > (this.observedTimes.get(id) || '')) this.observedTimes.set(id, observedAt);
  }
  private createEditor(file: FileEditingDocument, content = file.content, selection?: EditorSelection): EditorState {
    const language = new Compartment(); this.languages.set(file.id, language);
    const editability = new Compartment(); this.editability.set(file.id, editability);
    const readOnly = Boolean(file.readOnlyReason);
    const ranges = (file.protectedRanges || []).map(range => ({ from: editorTextOffset(content, range.from), to: editorTextOffset(content, range.to) }));
    return EditorState.create({ doc: normalizeEditorText(content), selection, extensions: [
      basicSetup, editorTheme, language.of(this.languageExtensions.get(file.id) || []), editability.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]), initialRanges.of(ranges), protectedRanges,
      EditorView.contentAttributes.of({ 'aria-label': '文件源码编辑器', 'aria-keyshortcuts': 'Meta+Z Meta+Shift+Z Meta+S Control+Z Control+Shift+Z Control+S', tabindex: '0' }),
      keymap.of([{ key: 'Mod-s', run: () => { void this.saveNow(file.id); return true; } }]),
      EditorState.changeFilter.of(transaction => {
        if (!transaction.docChanged) return true;
        const protectedAreas = transaction.startState.field(protectedRanges);
        let blocked = false;
        transaction.changes.iterChangedRanges((from, to) => {
          if (protectedAreas.some(range => from === to ? from > range.from && from < range.to : from < range.to && to > range.from)) blocked = true;
        });
        if (blocked) queueMicrotask(() => this.update(file.id, session => ({ ...session, protectedMessage: '受管区块（Managed Block）由 Buildr 维护，请修改区块外的内容。' })));
        return !blocked;
      }),
      EditorView.decorations.compute([protectedRanges], state => Decoration.set(state.field(protectedRanges).filter(range => range.to > range.from).map(range => Decoration.mark({ class: 'file-editor-managed' }).range(range.from, range.to)), true)),
    ] });
  }
  private mergeState(content: string) {
    return EditorState.create({ doc: normalizeEditorText(content), extensions: [basicSetup, editorTheme, EditorView.contentAttributes.of({ 'aria-label': '合并结果编辑器' })] });
  }
  private withConflict(session: FileEditingSession, file: FileEditingDocument, reason?: 'source'): FileEditingSession {
    this.remember(file.id, file.revision, file.observedAt);
    this.diskGenerations.set(file.id, (this.diskGenerations.get(file.id) || 0) + 1);
    const merged = session.mergeContent ?? initialMerge(session.baseContent, session.content, file.content);
    return { ...session, diskContent: file.content, status: 'conflict', conflict: { base: session.baseContent, disk: file.content, file, reason }, error: undefined, readError: undefined, bindingError: undefined,
      mergeContent: merged, mergeEditorState: session.mergeEditorState || this.mergeState(merged), mergeObservedRevision: session.mergeObservedRevision || file.revision,
      mergeStale: Boolean(session.mergeObservedRevision && session.mergeObservedRevision !== file.revision),
    };
  }
  private rangesFor(file: FileEditingDocument, content: string): Range[] | null {
    let cursor = 0;
    const ranges: Range[] = [];
    for (const range of file.protectedRanges || []) {
      const protectedText = file.content.slice(range.from, range.to);
      const from = content.indexOf(protectedText, cursor);
      if (from < 0) return null;
      const to = from + protectedText.length;
      ranges.push({ from: editorTextOffset(content, from), to: editorTextOffset(content, to) });
      cursor = to;
    }
    return ranges;
  }
  ensure = (file: FileEditingDocument) => {
    const current = this.sessions[file.id];
    if (current) {
      if (file.observedAt && file.observedAt < (this.observedTimes.get(file.id) || '')) return;
      const sameSelector = current.file.sourceKey === file.sourceKey;
      const fresh = Boolean(file.observedAt && (!current.file.observedAt || file.observedAt > current.file.observedAt));
      if (fresh && sameSelector && file.sourceRevision !== current.file.sourceRevision) { this.receive(file.id, file, true); return; }
      if (fresh && !sameSelector && (current.bindingError || current.readError || current.status === 'error') && current.revision === file.revision && current.diskContent === file.content) {
        this.update(file.id, session => ({ ...session, file, bindingError: undefined, readError: undefined, error: undefined, status: session.conflict ? 'conflict' : session.content === session.diskContent ? 'saved' : 'saving' }));
        this.remember(file.id, file.revision, file.observedAt);
        this.schedule(file.id); return;
      }
      if (fresh && sameSelector && current.revision === file.revision && current.diskContent === file.content) { this.receive(file.id, file, true); return; }
      // A retained page can still carry an older read response after this session saved.
      if (!this.observed.get(file.id)?.has(file.revision)) this.receive(file.id, file);
      return;
    }
    this.remember(file.id, file.revision, file.observedAt);
    this.publish(file.id, { file, content: file.content, diskContent: file.content, baseContent: file.content, editorState: this.createEditor(file), mode: 'read', status: 'saved', savedAt: null, revision: file.revision, historyIndex: 0, composing: false });
  };
  private receive(id: string, file: FileEditingDocument, checkBinding = false) {
    const current = this.sessions[id];
    if (!current) return;
    if (file.id !== id || checkBinding && current.file.sourceRevision !== file.sourceRevision) {
      this.cancel(id);
      this.diskGenerations.set(id, (this.diskGenerations.get(id) || 0) + 1);
      this.update(id, session => ({ ...session, status: 'error', bindingError: '文件来源已变化，保存已暂停。请核对最新来源后再继续。', error: undefined, readError: undefined }));
      return;
    }
    if (current.revision === file.revision && current.diskContent === file.content) {
      const latestMetadata = !file.observedAt || file.observedAt >= (this.observedTimes.get(id) || '');
      this.remember(id, file.revision, file.observedAt);
      if (checkBinding && current.file.sourceKey === file.sourceKey && latestMetadata) {
        // Policy/labels can change without a byte revision. Keep the draft and
        // editor document, selection and undo history across configuration updates.
        this.update(id, session => ({ ...session, file, readError: undefined }));
        if (file.readOnlyReason) this.cancel(id);
        else if (current.file.readOnlyReason) this.schedule(id);
      } else if (current.readError) this.update(id, session => ({ ...session, readError: undefined }));
      return;
    }
    // Alternate entry points share content, but retain one complete observed source binding.
    if (!checkBinding) file = { ...file, selector: current.file.selector, sourceRevision: current.file.sourceRevision, sourceKey: current.file.sourceKey };
    this.remember(id, file.revision, file.observedAt);
    this.diskGenerations.set(id, (this.diskGenerations.get(id) || 0) + 1);
    this.cancel(id);
    if (current.content === file.content) {
      this.update(id, session => ({ ...session, diskContent: file.content, baseContent: file.content, revision: file.revision, file, status: 'saved', conflict: undefined, error: undefined, readError: undefined }));
    } else if (current.content === current.baseContent && !current.conflict && !current.composing) {
      this.update(id, session => {
        const length = normalizeEditorText(file.content).length, before = session.editorState;
        // Keep valid cursor/range coordinates. A synthetic tail deletion only clamps
        // positions beyond the new document and never adds external text to undo.
        const selection = length < before.doc.length ? before.selection.map(ChangeSet.of({from:length, to:before.doc.length}, before.doc.length)) : before.selection;
        return { ...session, file, content: file.content, diskContent: file.content, baseContent: file.content, revision: file.revision, editorState: this.createEditor(file, file.content, selection), historyIndex: 0, savedAt: null, status: 'saved', error: undefined, readError: undefined, protectedMessage: undefined };
      });
    } else {
      this.update(id, session => this.withConflict(session, file));
    }
  }
  watch = (id: string) => {
    this.active.set(id, (this.active.get(id) || 0) + 1);
    return () => { const count = (this.active.get(id) || 1) - 1; if (count > 0) this.active.set(id, count); else this.active.delete(id); void this.saveNow(id); };
  };
  refreshActive = () => Promise.all([...this.active.keys()].map(id => this.refresh(id)));
  refresh = async (id: string): Promise<void> => {
    if (!this.operations.read || this.pending.has(id)) return;
    const existing = this.refreshing.get(id); if (existing) return existing;
    const current = this.sessions[id]; if (!current) return;
    const generation = this.saveGenerations.get(id) || 0;
    const epoch = this.epoch;
    const stillCurrent = () => epoch === this.epoch && generation === (this.saveGenerations.get(id) || 0) && this.sessions[id]?.revision === current.revision;
    const operation = this.operations.read(current.file).then(file => { if (!this.pending.has(id) && stillCurrent()) this.receive(id, file, true); }).catch(error => {
      if (stillCurrent()) this.update(id, session => ({ ...session, readError: error instanceof Error ? error.message : '无法核对文件最新内容。' }));
    }).finally(() => { this.refreshing.delete(id); });
    this.refreshing.set(id, operation); return operation;
  };
  reviewSource = async (id: string): Promise<void> => {
    const session = this.sessions[id];
    if (!session || !this.operations.read) return;
    try {
      const file = await this.operations.read(session.file);
      if (file.id !== id) throw Error('最新来源指向了另一个文件。请从项目资料或资源管理器（Explorer）重新打开并核对位置，原输入继续保留。');
      this.cancel(id);
      this.update(id, current => this.withConflict(current, file, 'source'));
    } catch (error) { this.update(id, current => ({ ...current, readError: error instanceof Error ? error.message : '无法核对文件来源。' })); }
  };
  applyMergeTransactions = (id: string, transactions: readonly Transaction[]) => {
    const session = this.sessions[id]; if (!session?.mergeEditorState || !transactions.length || transactions[0].startState !== session.mergeEditorState) return;
    const state = transactions.at(-1)!.state;
    const content = this.editedText(session.mergeContent || '', transactions);
    this.update(id, current => ({ ...current, mergeEditorState: state, mergeContent: content }));
  };
  setMode = (id: string, mode: 'read' | 'edit') => {
    this.update(id, session => ({ ...session, mode: session.file.readOnlyReason ? 'read' : mode }));
    if (mode === 'read') void this.saveNow(id);
  };
  setLanguage = (id: string, language: Extension) => {
    this.languageExtensions.set(id, language);
    const session = this.sessions[id], compartment = this.languages.get(id);
    if (session && compartment) this.applyTransactions(id, [session.editorState.update({ effects: compartment.reconfigure(language) })]);
  };
  setComposing = (id: string, value: boolean) => {
    this.update(id, session => ({ ...session, composing: value }));
    if (value) this.cancel(id); else this.schedule(id);
  };
  applyTransactions = (id: string, transactions: readonly Transaction[]) => {
    const session = this.sessions[id]; if (!session || !transactions.length) return false;
    let previous = session.editorState;
    for (const transaction of transactions) {
      if (transaction.startState !== previous) return false;
      if (transaction.docChanged && (session.file.readOnlyReason || transaction.startState.facet(EditorState.readOnly))) return false;
      let blocked = false;
      transaction.changes.iterChangedRanges((from, to) => {
        if (transaction.startState.field(protectedRanges).some(range => from === to ? from > range.from && from < range.to : from < range.to && to > range.from)) blocked = true;
      });
      // CodeMirror history transactions intentionally disable filters. Check their final changes too.
      if (blocked) { this.update(id, current => ({ ...current, protectedMessage: '该操作涉及受管区块（Managed Block），请只修改区块外的内容。' })); return false; }
      previous = transaction.state;
    }
    const raw = this.editedText(session.content, transactions);
    const editorState = transactions.at(-1)!.state;
    const changed = raw !== session.content;
    this.update(id, current => ({ ...current, editorState, content: raw, historyIndex: undoDepth(editorState), ...(changed ? { status: current.conflict ? 'conflict' : raw === current.diskContent && !this.pending.has(id) ? 'saved' : 'saving', error: undefined, protectedMessage: undefined } : {}) }));
    if (changed) this.schedule(id);
    return true;
  };
  private editedText(content: string, transactions: readonly Transaction[]): string {
    let raw = content;
    for (const transaction of transactions) {
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => changes.push({ from: originalTextOffset(raw, from), to: originalTextOffset(raw, to), insert: insert.toString().replaceAll('\n', preferredLineBreak(raw)) }));
      for (const change of changes.reverse()) raw = raw.slice(0, change.from) + change.insert + raw.slice(change.to);
    }
    return raw;
  }
  change = (id: string, content: string) => {
    const session = this.sessions[id]; if (!session || session.file.readOnlyReason) return;
    const difference = textDifference(session.editorState.doc.toString(), normalizeEditorText(content));
    this.applyTransactions(id, [session.editorState.update({ changes: difference, userEvent: 'input' })]);
  };
  private history(id: string, command: typeof undo) {
    const session = this.sessions[id]; if (!session || session.file.readOnlyReason) return;
    command({ state: session.editorState, dispatch: transaction => this.applyTransactions(id, [transaction]) });
  }
  undo = (id: string) => this.history(id, undo);
  redo = (id: string) => this.history(id, redo);
  private schedule(id: string) {
    this.cancel(id);
    const session = this.sessions[id];
    if (!session || session.composing || session.conflict || session.bindingError || session.file.readOnlyReason || session.content === session.diskContent) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.saveNow(id); }, this.delay));
  }
  saveNow = async (id: string): Promise<void> => {
    this.cancel(id);
    const waiting = this.pending.get(id);
    if (waiting) { await waiting; if (this.sessions[id]?.status !== 'error') await this.saveNow(id); return; }
    const session = this.sessions[id];
    if (!session || session.composing || session.conflict || session.bindingError || session.file.readOnlyReason || session.content === session.diskContent) return;
    const content = session.content;
    const revision = session.revision;
    const epoch = this.epoch;
    const diskGeneration = this.diskGenerations.get(id) || 0;
    this.saveGenerations.set(id, (this.saveGenerations.get(id) || 0) + 1);
    this.update(id, current => ({ ...current, status: 'saving', error: undefined }));
    const operation = this.operations.save(session.file, content, revision).then(file => {
      if (epoch !== this.epoch) return;
      if (file.id !== id) throw new Error('文件来源已变化，未将返回内容应用到当前文件。');
      this.remember(id, file.revision, file.observedAt);
      if (diskGeneration !== (this.diskGenerations.get(id) || 0)) return;
      this.update(id, current => {
        const ranges = this.rangesFor(file, current.content);
        return { ...current, file, diskContent: file.content, baseContent: file.content, revision: file.revision, editorState: ranges ? current.editorState.update({ effects: replaceProtectedRanges.of(ranges), annotations: Transaction.addToHistory.of(false) }).state : current.editorState,
          status: current.content === file.content ? 'saved' : 'saving', savedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }), error: undefined, readError: undefined, conflict: undefined, mergeContent: undefined, mergeEditorState: undefined, mergeObservedRevision: undefined, mergeStale: undefined };
      });
    }).catch(error => {
      if (epoch !== this.epoch) return;
      if (diskGeneration !== (this.diskGenerations.get(id) || 0)) return;
      const failure = error as { code?: string; details?: { current?: FileEditingDocument }; message?: string };
      if (failure.code === 'file_revision_conflict' && failure.details?.current) {
        const latest = failure.details.current;
        this.update(id, current => this.withConflict(current, latest));
      } else if (failure.code === 'file_identity_changed' || failure.code === 'file_source_changed') this.update(id, current => ({ ...current, status: 'error', bindingError: failure.message || '文件来源已变化，保存已暂停。请核对最新来源后再继续。' }));
      else this.update(id, current => ({ ...current, status: 'error', error: failure.message || '文件暂时无法写入。你的输入已保留，可以重试保存。' }));
    }).finally(() => {
      if (this.pending.get(id) === operation) this.pending.delete(id);
      if (epoch === this.epoch && this.sessions[id]?.status === 'saving') this.schedule(id);
    });
    this.pending.set(id, operation);
    await operation;
  };
  resolveConflict = async (id: string, content: string): Promise<boolean> => {
    const session = this.sessions[id]; if (!session?.conflict) return false;
    const disk = session.conflict.file;
    const ranges = this.rangesFor(disk, content);
    if (!ranges) { this.update(id, current => ({ ...current, protectedMessage: '请保留磁盘最新受管区块（Managed Block）的完整内容，再保存合并结果。' })); return false; }
    const difference = textDifference(session.editorState.doc.toString(), normalizeEditorText(content));
    const transaction = session.editorState.update({ changes: difference, effects: replaceProtectedRanges.of(ranges), filter: false, userEvent: 'input' });
    this.saveGenerations.set(id, (this.saveGenerations.get(id) || 0) + 1);
    this.diskGenerations.set(id, (this.diskGenerations.get(id) || 0) + 1);
    this.update(id, current => ({ ...current, file: disk, revision: disk.revision, baseContent: disk.content, conflict: undefined, status: content === disk.content ? 'saved' : 'saving', error: undefined, protectedMessage: undefined, mergeContent: content, content, editorState: transaction.state, historyIndex: undoDepth(transaction.state) }));
    await this.saveNow(id);
    return this.sessions[id]?.status === 'saved';
  };
  acceptDisk = (id: string) => {
    const session = this.sessions[id]; if (!session?.conflict) return;
    this.cancel(id);
    const file = session.conflict.file;
    this.saveGenerations.set(id, (this.saveGenerations.get(id) || 0) + 1);
    this.diskGenerations.set(id, (this.diskGenerations.get(id) || 0) + 1);
    this.remember(id, file.revision, file.observedAt);
    this.update(id, current => ({ ...current, file, content: file.content, diskContent: file.content, baseContent: file.content, revision: file.revision, editorState: this.createEditor(file), historyIndex: 0, conflict: undefined, status: 'saved', error: undefined, readError: undefined, bindingError: undefined, protectedMessage: undefined, savedAt: null, mergeContent: undefined, mergeEditorState: undefined, mergeObservedRevision: undefined, mergeStale: undefined }));
  };
  flush = () => Promise.all(Object.keys(this.sessions).map(id => this.saveNow(id)));
  hasUnsaved = () => this.pending.size > 0 || Object.values(this.sessions).some(session => session.content !== session.diskContent || Boolean(session.conflict));
  clearTimers = () => { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); };
  /** The offline prototype can reset its memory without touching a real filesystem. */
  reset = (files: FileEditingDocument[]) => {
    this.epoch += 1; this.clearTimers(); this.pending.clear(); this.saveGenerations.clear(); this.diskGenerations.clear(); this.sessions = {}; this.observed.clear(); this.observedTimes.clear(); this.languages.clear(); this.editability.clear(); this.languageExtensions.clear();
    for (const file of files) this.ensure(file);
  };
}
