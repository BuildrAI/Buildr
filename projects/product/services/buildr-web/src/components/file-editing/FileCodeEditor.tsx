import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fileCodeSearchExtension, fileCodeSearchInstalled, refreshFileCodeSearch, setFileCodeSearch } from './file-code-search';
import { readOnlyFileCodeMatches } from './read-only-file-code';

type Props = {
  state: EditorState;
  documentId: string;
  onTransactions?(transactions: readonly Transaction[]): boolean | void;
  onComposing?(value: boolean): void;
  onBlur?(): void;
  onViewReady?(view: EditorView | null): void;
  autoFocus?: boolean;
  active?: boolean;
  focusLine?: number;
  focusPosition?: number;
  focusRequest?: number;
  searchQuery?: string;
  selectedLines?: readonly [number, number] | null;
  onSelectLines?(lines: [number, number] | null): void;
  initialScrollTop?: number;
  onScroll?(top: number): void;
};

/** The same mature editor view is used for source editing and conflict comparison. */
export function FileCodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef(props); current.current = props;
  const incoming = useRef(props.state);
  const appliedFocus = useRef<{ documentId: string; line?: number; position?: number; request?: number } | null>(null);
  const presentation = (editor: EditorView, refresh = true) => {
    const latest = current.current;
    setFileCodeSearch(editor, { query: latest.searchQuery || '', selectedLines: latest.selectedLines || null, enabled: latest.searchQuery !== undefined });
    if (latest.searchQuery !== undefined && (!editor.state.facet(fileCodeSearchInstalled) || refresh)) editor.dispatch({
      effects: editor.state.facet(fileCodeSearchInstalled) ? refreshFileCodeSearch.of(null) : StateEffect.appendConfig.of(fileCodeSearchExtension),
      annotations: Transaction.addToHistory.of(false),
    });
  };

  useEffect(() => {
    if (!host.current) return;
    const documentId = current.current.documentId;
    const editor = new EditorView({
      state: current.current.state, parent: host.current,
      dispatchTransactions: transactions => {
        if (current.current.documentId !== documentId) return;
        if (current.current.onTransactions?.(transactions) === false) return;
        editor.update(transactions);
        if (transactions.some(transaction => transaction.selection !== undefined || transaction.docChanged)) {
          const selection = editor.state.selection.main;
          const from = editor.state.doc.lineAt(selection.from).number;
          const end = selection.to > selection.from && selection.to === editor.state.doc.lineAt(selection.to).from ? selection.to - 1 : selection.to;
          current.current.onSelectLines?.(selection.empty && !current.current.focusLine ? null : [from, editor.state.doc.lineAt(end).number]);
        }
      },
    });
    view.current = editor;
    incoming.current = current.current.state;
    presentation(editor);
    current.current.onViewReady?.(editor);
    const start = () => { if (current.current.documentId === documentId) current.current.onComposing?.(true); };
    const end = () => { if (current.current.documentId === documentId) current.current.onComposing?.(false); };
    const blur = () => { if (current.current.documentId === documentId) current.current.onBlur?.(); };
    const scroll = () => { if (current.current.documentId === documentId) current.current.onScroll?.(editor.scrollDOM.scrollTop); };
    editor.contentDOM.addEventListener('compositionstart', start, true);
    editor.contentDOM.addEventListener('compositionend', end, true);
    editor.contentDOM.addEventListener('blur', blur);
    editor.scrollDOM.addEventListener('scroll', scroll, { passive: true });
    const restore = requestAnimationFrame(() => { if (current.current.initialScrollTop !== undefined && !current.current.focusLine && !Number.isFinite(current.current.focusPosition)) editor.scrollDOM.scrollTop = current.current.initialScrollTop; });
    if (current.current.autoFocus) editor.focus();
    return () => {
      editor.contentDOM.removeEventListener('compositionstart', start, true);
      editor.contentDOM.removeEventListener('compositionend', end, true);
      editor.contentDOM.removeEventListener('blur', blur);
      editor.scrollDOM.removeEventListener('scroll', scroll);
      cancelAnimationFrame(restore);
      editor.destroy(); view.current = null;
      current.current.onViewReady?.(null);
    };
  }, [props.documentId]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || incoming.current === props.state) return;
    incoming.current = props.state;
    if (editor.state === props.state) return;
    // Restore through CodeMirror so its own layout anchoring cannot move the viewport
    // again after an external save replaces this document's editor state.
    const scroll = props.initialScrollTop !== undefined ? editor.scrollSnapshot() : null;
    editor.setState(props.state);
    if (scroll) editor.dispatch({ effects: scroll, annotations: Transaction.addToHistory.of(false) });
    presentation(editor, false);
    current.current.onViewReady?.(editor);
  }, [props.state]);
  useEffect(() => { if (view.current) presentation(view.current); }, [props.searchQuery, props.selectedLines?.[0], props.selectedLines?.[1]]);
  useEffect(() => { if (props.autoFocus) view.current?.focus(); }, [props.autoFocus]);
  useEffect(() => {
    const editor = view.current;
    const byPosition = props.focusPosition !== undefined && Number.isFinite(props.focusPosition);
    if (!editor || props.active === false || !byPosition && !props.focusLine) return;
    const previous = appliedFocus.current;
    // Restoring a hidden view is not another request to revisit its old search anchor.
    if (previous && previous.documentId === props.documentId && previous.line === props.focusLine
      && previous.position === props.focusPosition && previous.request === props.focusRequest) return;
    appliedFocus.current = { documentId: props.documentId, line: props.focusLine, position: props.focusPosition, request: props.focusRequest };
    let position: number;
    if (byPosition) position = Math.max(0, Math.min(Math.trunc(props.focusPosition!), editor.state.doc.length));
    else {
      const line = editor.state.doc.line(Math.max(1, Math.min(props.focusLine!, editor.state.doc.lines)));
      position = line.from + (readOnlyFileCodeMatches(line.text, props.searchQuery || '')[0]?.start || 0);
    }
    editor.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { x: 'center', y: 'center' }), annotations: Transaction.addToHistory.of(false) });
  }, [props.documentId, props.focusLine, props.focusPosition, props.focusRequest, props.active]);

  return <div className="file-code-editor" ref={host} />;
}
