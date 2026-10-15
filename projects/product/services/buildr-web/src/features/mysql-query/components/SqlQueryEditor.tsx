import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { FileCodeEditor } from '../../../components/file-editing/FileCodeEditor';
import type { SqlSelection } from '../sql-execution-target';

type Props = { value: string; busy: boolean; onChange(value: string): void; onSelectionChange(selection: SqlSelection): void; onRun(selection: SqlSelection): void };
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.8', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { backgroundColor: 'var(--soft-bg, #f7f8f9)', color: 'var(--soft-muted)', borderRight: '1px solid var(--soft-line)' },
  '&.cm-focused': { outline: 'none' },
});

export function SqlQueryEditor(props: Props) {
  const current = useRef(props); current.current = props;
  const readOnly = useRef(new Compartment());
  const [state, setState] = useState(() => EditorState.create({ doc: props.value, extensions: [basicSetup, theme, placeholder('输入只读查询语句，例如 SELECT * FROM orders LIMIT 100;'), readOnly.current.of(EditorState.readOnly.of(props.busy)), EditorView.contentAttributes.of({ 'aria-label': '查询 SQL', spellcheck: 'false' }), Prec.highest(keymap.of([{ key: 'Mod-Enter', run: view => { if (!current.current.busy && current.current.value.trim()) current.current.onRun(view.state.selection.main); return true; } }]))] }));
  useEffect(() => { setState(previous => {
    if (previous.doc.toString() === props.value) return previous;
    const next = previous.update({ changes: { from: 0, to: previous.doc.length, insert: props.value } }).state;
    return next;
  }); }, [props.value]);
  useEffect(() => { current.current.onSelectionChange(state.selection.main); }, [state.selection.main.from, state.selection.main.to]);
  useEffect(() => { setState(previous => previous.update({ effects: readOnly.current.reconfigure(EditorState.readOnly.of(props.busy)) }).state); }, [props.busy]);
  return <div className="buildr-mysql-editor" id="mysql-query-editor"><FileCodeEditor state={state} documentId="mysql-query" onTransactions={transactions => {
    const next = transactions.at(-1)?.state; if (!next) return;
    setState(next); current.current.onSelectionChange(next.selection.main);
    if (transactions.some(transaction => transaction.docChanged)) current.current.onChange(next.doc.toString());
  }} /></div>;
}
