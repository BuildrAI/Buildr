import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, UndoOutlined } from '@ant-design/icons';
import { defaultKeymap } from '@codemirror/commands';
import { HighlightStyle, LanguageDescription, bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { MergeView, getChunks, goToNextChunk, goToPreviousChunk, unifiedMergeView, type Chunk } from '@codemirror/merge';
import { Annotation, Compartment, EditorState, Prec, Text, Transaction, type Extension, type TransactionSpec } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view';
import { FileEditingFeedback } from './FileEditingFeedback';
import { fileEditingLanguages } from './file-editing-language';
import { normalizeEditorText, textDifference } from './file-editing-text';
import { fileDiffChunkIndex, fileDiffRestoreChange, projectFileDiffTransactions, retainFileDiffPresentation, type FileDiffPresentation } from './file-diff-transactions';
import type { FileEditingController, FileEditingDocument } from './file-editing-types';
import './file-diff-editor.css';

type Props = {
  file: FileEditingDocument;
  editing: FileEditingController;
  original: string;
  mode: 'split' | 'unified';
  active?: boolean;
  originalLabel?: string;
  currentLabel?: string;
  beforeRestore?(): Promise<boolean>;
};
const mirrored = Annotation.define<boolean>();
const diffHighlightStyle = HighlightStyle.define(defaultHighlightStyle.specs.map(spec =>
  spec.textDecoration === 'underline' ? { ...spec, textDecoration: 'none' } : spec));
const diffTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--font-size-code)', backgroundColor: 'var(--ant-color-bg-container, #fff)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.8' },
  '.cm-content': { padding: '12px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--ant-color-bg-layout, #f7f8f9)', color: 'var(--ant-color-text-quaternary, #9aa4ad)', borderRight: '1px solid var(--ant-color-border-secondary, #eceef1)' },
  '&.cm-focused': { outline: 'none' },
});

/** Network-free presentation; the existing file controller owns all text, history and writes. */
export function FileDiffEditor(props: Props) {
  const { file, editing, active = true } = props;
  const session = editing.sessions[file.id];
  const presentation = useRef<FileDiffPresentation>(undefined);
  presentation.current = retainFileDiffPresentation(presentation.current, { fileId: file.id, mode: props.mode, original: props.original, readOnly: Boolean(session?.file.readOnlyReason) }, Boolean(session?.composing));
  const { mode, original, readOnly: presentationReadonly } = presentation.current;
  const current = useRef(props); current.current = props;
  const canonical = useRef(session?.editorState);
  const incoming = useRef(session?.editorState);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const merge = useRef<MergeView | null>(null);
  const language = useRef(new Compartment());
  const originalLanguage = useRef(new Compartment());
  const editability = useRef(new Compartment());
  const watchedFile = useRef<string | null>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);
  const [position, setPosition] = useState({ index: -1, count: 0 });
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const restoringRef = useRef(false);
  const generation = useRef(0);
  const scrolls = useRef(new Map<string, { top: number; left: number }>());
  const seen = useRef(new Set<string>());
  const chunks = (): readonly Chunk[] => editor.current ? getChunks(editor.current.state)?.chunks || [] : [];
  const updatePosition = () => {
    const view = editor.current;
    if (!view) return;
    const changed = getChunks(view.state)?.chunks || [];
    const index = fileDiffChunkIndex(changed, view.state.selection.main.head);
    setPosition(previous => previous.index === index && previous.count === changed.length ? previous : { index, count: changed.length });
    for (const deleted of view.dom.querySelectorAll<HTMLElement>('.cm-deletedChunk')) {
      deleted.contentEditable = 'false'; deleted.dataset.diffOriginal = 'true';
      deleted.setAttribute('role', 'region'); deleted.setAttribute('aria-label', '旧版本只读内容');
    }
  };
  useEffect(() => { editing.ensure(file); }, [file, editing.ensure]);
  useEffect(() => {
    if (!active || !session) return;
    const release = editing.watch(file.id);
    // The caller just read this complete file. Recheck when its retained view
    // becomes active again; ordinary observation continues through watch().
    if (watchedFile.current === file.id) void editing.refresh(file.id);
    watchedFile.current = file.id;
    return release;
  }, [file.id, active, Boolean(session), editing.watch, editing.refresh]);
  useEffect(() => {
    let cancelled = false;
    setLanguageExtension([]);
    const description = LanguageDescription.matchFilename(fileEditingLanguages, file.path);
    if (description) void description.load().then(extension => {
      if (!cancelled) { current.current.editing.setLanguage(file.id, extension); setLanguageExtension(extension); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [file.id, file.path]);

  const restore = async (transactions: readonly Transaction[], forward: (transactions: readonly Transaction[]) => void, token: number) => {
    const latest = current.current.editing.sessions[current.current.file.id];
    if (restoringRef.current || !editor.current || latest?.file.readOnlyReason || latest?.composing) return;
    const observed = { id: current.current.file.id, original: current.current.original, doc: editor.current.state.doc };
    restoringRef.current = true; setRestoring(true); setRestoreMessage('');
    try {
      if (current.current.beforeRestore && !await current.current.beforeRestore()) return;
      if (generation.current !== token || current.current.file.id !== observed.id || current.current.original !== observed.original || !editor.current?.state.doc.eq(observed.doc)) {
        setRestoreMessage('比较内容已变化，请核对后重新恢复。'); return;
      }
      route(transactions, forward, token, true);
    } catch (error) { setRestoreMessage(error instanceof Error ? error.message : '暂时无法核对比较内容，请重试。'); }
    finally { restoringRef.current = false; setRestoring(false); }
  };
  const route = (transactions: readonly Transaction[], forward: (transactions: readonly Transaction[]) => void, token: number, checked = false) => {
    if (token !== generation.current) return;
    if (transactions.every(transaction => transaction.annotation(mirrored))) { forward(transactions); return; }
    const latest = current.current.editing.sessions[current.current.file.id];
    if (transactions.some(transaction => transaction.isUserEvent('revert')) && (latest?.composing || latest?.file.readOnlyReason)) return;
    if (!checked && transactions.some(transaction => transaction.isUserEvent('revert'))) { void restore(transactions, forward, token); return; }
    const state = canonical.current;
    if (!state) return;
    const projected = projectFileDiffTransactions(state, transactions);
    if (!projected) return;
    if (projected.length && !current.current.editing.applyTransactions(current.current.file.id, projected)) return;
    if (projected.length) canonical.current = projected.at(-1)!.state;
    forward(transactions);
  };

  useLayoutEffect(() => {
    if (!host.current || !session) return;
    const token = ++generation.current;
    canonical.current = session.editorState; incoming.current = session.editorState;
    const readonly = presentationReadonly;
    const commands = Prec.highest(keymap.of([
      { key: 'Mod-z', run: () => { current.current.editing.undo(file.id); return true; } },
      { key: 'Mod-Shift-z', run: () => { current.current.editing.redo(file.id); return true; } },
      { key: 'Mod-y', run: () => { current.current.editing.redo(file.id); return true; } },
      { key: 'Mod-s', run: () => { void current.current.editing.saveNow(file.id); return true; } },
    ]));
    const extensions: Extension[] = [lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), drawSelection(), highlightActiveLine(), bracketMatching(), indentOnInput(), syntaxHighlighting(diffHighlightStyle, { fallback: true }), keymap.of(defaultKeymap), diffTheme];
    const bindings = EditorView.domEventHandlers({
      compositionstart: () => { current.current.editing.setComposing(file.id, true); },
      compositionend: () => { current.current.editing.setComposing(file.id, false); },
      blur: () => { void current.current.editing.saveNow(file.id); },
      beforeinput: event => {
        if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return false;
        event.preventDefault();
        if (event.inputType === 'historyUndo') current.current.editing.undo(file.id); else current.current.editing.redo(file.id);
        return true;
      },
    });
    const currentExtensions = [extensions, commands, bindings, language.current.of(languageExtension), editability.current.of([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]), EditorView.editorAttributes.of({ class: 'file-diff-current' }), EditorView.contentAttributes.of({ 'aria-label': '当前文件编辑器', spellcheck: 'false' }), EditorView.updateListener.of(updatePosition)];
    const old = Text.of(normalizeEditorText(original).split('\n'));
    let view: EditorView;
    if (mode === 'split') {
      const split = new MergeView({
        parent: host.current,
        a: { doc: old, extensions: [extensions, originalLanguage.current.of(languageExtension), EditorState.readOnly.of(true), EditorView.editable.of(false), EditorState.changeFilter.of(transaction => !transaction.docChanged), EditorView.editorAttributes.of({ class: 'file-diff-original' }), EditorView.contentAttributes.of({ 'aria-label': '旧版本只读编辑器', tabindex: '0' })] },
        b: { doc: session.editorState.doc, selection: session.editorState.selection, extensions: currentExtensions },
        revertControls: readonly ? undefined : 'a-to-b',
        renderRevertControl: () => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = '↶';
          button.title = '恢复此处改动'; button.setAttribute('aria-label', '恢复此处改动');
          // MergeView handles pointer mousedown; keyboard activation needs the same transaction.
          button.onclick = event => {
            if (event.detail !== 0) return;
            const changed = merge.current?.chunks[Number(button.dataset.chunk)];
            if (changed) restoreChunk(changed);
          };
          return button;
        },
      });
      merge.current = split; view = split.b;
      const dispatch = view.dispatch;
      view.dispatch = ((...input: (Transaction | readonly Transaction[] | TransactionSpec)[]) => {
        const transactions = input.length === 1 && input[0] instanceof Transaction ? [input[0]] : input.length === 1 && Array.isArray(input[0]) ? input[0] as readonly Transaction[] : [view.state.update(...input as TransactionSpec[])];
        route(transactions, value => dispatch(value), token);
      }) as EditorView['dispatch'];
    } else {
      view = new EditorView({ parent: host.current, state: EditorState.create({ doc: session.editorState.doc, selection: session.editorState.selection, extensions: [currentExtensions, unifiedMergeView({ original: old, mergeControls: readonly ? false : (type, action) => {
        if (type === 'accept') { const hidden = document.createElement('span'); hidden.hidden = true; return hidden; }
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '↶';
        button.title = '恢复此处改动'; button.setAttribute('aria-label', '恢复此处改动'); button.onclick = action;
        return button;
      } })] }), dispatchTransactions: transactions => route(transactions, value => view.update(value), token) });
    }
    editor.current = view;
    const key = file.id + ':' + mode;
    const scroll = scrolls.current.get(key);
    const scrollHost = merge.current?.dom || view.scrollDOM;
    const frame = requestAnimationFrame(() => {
      if (token !== generation.current) return;
      if (scroll) { scrollHost.scrollTop = scroll.top; view.scrollDOM.scrollLeft = scroll.left; }
      else if (!seen.current.has(file.id) && view.state.selection.main.head === 0) {
        const first = getChunks(view.state)?.chunks[0];
        if (first) view.dispatch({ selection: { anchor: first.fromB }, effects: EditorView.scrollIntoView(first.fromB, { y: 'center' }), annotations: Transaction.addToHistory.of(false), userEvent: 'select.byChunk' });
      } else view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
      seen.current.add(file.id); updatePosition();
    });
    updatePosition();
    return () => {
      scrolls.current.set(key, { top: scrollHost.scrollTop, left: view.scrollDOM.scrollLeft });
      cancelAnimationFrame(frame); generation.current += 1;
      if (merge.current) { merge.current.destroy(); merge.current = null; } else view.destroy();
      editor.current = null; host.current?.replaceChildren();
    };
  }, [file.id, mode, original, Boolean(session), presentationReadonly]);

  useLayoutEffect(() => {
    const view = editor.current;
    if (!session || !view) return;
    if (incoming.current !== session.editorState) { incoming.current = session.editorState; canonical.current = session.editorState; }
    const state = canonical.current!;
    const changes = textDifference(view.state.doc.toString(), state.doc.toString());
    if (changes.from !== changes.to || changes.insert || !view.state.selection.eq(state.selection)) view.dispatch({ changes, selection: state.selection, annotations: [mirrored.of(true), Transaction.addToHistory.of(false)], filter: false });
    view.dispatch({ effects: [language.current.reconfigure(languageExtension), editability.current.reconfigure([EditorState.readOnly.of(presentationReadonly), EditorView.editable.of(!presentationReadonly)])], annotations: mirrored.of(true) });
    merge.current?.a.dispatch({ effects: originalLanguage.current.reconfigure(languageExtension) });
    merge.current?.reconfigure({ revertControls: presentationReadonly ? undefined : 'a-to-b' });
    updatePosition();
  }, [session?.editorState, presentationReadonly, languageExtension]);

  function restoreChunk(chunk: Chunk) {
    const view = editor.current;
    const latest = current.current.editing.sessions[current.current.file.id];
    if (!view || !canonical.current || latest?.composing || latest?.file.readOnlyReason) return;
    const old = Text.of(normalizeEditorText(current.current.original).split('\n'));
    view.dispatch({ changes: fileDiffRestoreChange(old, view.state.doc, chunk), userEvent: 'revert' });
  }
  function navigate(direction: 'previous' | 'next') {
    const view = editor.current;
    if (!view) return;
    (direction === 'previous' ? goToPreviousChunk : goToNextChunk)(view);
    view.focus(); updatePosition();
  }
  const readonly = Boolean(session?.file.readOnlyReason);
  const status = session?.status === 'conflict' ? '保存已暂停' : session?.status === 'error' ? '保存失败' : session?.status === 'saving' ? '保存中…' : '已保存';
  return <section className="file-diff-editor" data-diff-mode={mode} data-file-id={file.id} data-file-status={session?.status}>
    <div className="file-diff-toolbar">
      <div className="file-diff-navigation">
        <Button size="small" icon={<ArrowUpOutlined />} aria-label="上一个差异" title="上一个差异" disabled={!position.count} onClick={() => navigate('previous')} />
        <span className="file-diff-position" role="status" data-diff-index={position.index + 1} data-diff-count={position.count}>{position.index < 0 ? '—' : position.index + 1} / {position.count}</span>
        <Button size="small" icon={<ArrowDownOutlined />} aria-label="下一个差异" title="下一个差异" disabled={!position.count} onClick={() => navigate('next')} />
        {!readonly && <Button size="small" aria-label="恢复此处改动" icon={<UndoOutlined />} loading={restoring} disabled={position.index < 0 || Boolean(session?.composing)} onClick={() => { const chunk = chunks()[position.index]; if (chunk) restoreChunk(chunk); }}>恢复此处改动</Button>}
      </div>
      <span className={'file-diff-save state-' + session?.status} role="status">{readonly ? '只读' : <>自动保存 · {status}</>}</span>
    </div>
    {session && <FileEditingFeedback file={file} session={session} editing={editing} active={active} />}
    {restoreMessage && <Alert type="warning" showIcon message={restoreMessage} closable onClose={() => setRestoreMessage('')} />}
    <div className="file-diff-version-labels"><span>{props.originalLabel || '旧版本'} · 只读</span><span>{props.currentLabel || '当前文件'}{readonly ? ' · 只读' : ' · 可编辑'}</span></div>
    {!session && <Spin className="file-diff-loading" />}
    <div className="file-diff-host" ref={host} />
  </section>;
}
