import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { FileCodeEditor } from '../../components/file-editing/FileCodeEditor';
type Props = { id: string; value: string; readOnly: boolean; canRun: boolean; onChange(value: string): void; onRun(): void };
const sqlTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.8', overflow: 'auto' },
  '.cm-content': { padding: '14px 0', minHeight: '100%' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: '#f8faf9', color: '#8b9792', borderRight: '1px solid #edf0ee' },
  '.cm-activeLine': { backgroundColor: '#f3f8f6' },
  '&.cm-focused': { outline: 'none' },
});
export function SqlEditor(props: Props) {
  const current = useRef(props); current.current = props;
  const readOnly = useRef(new Compartment());
  const [state, setState] = useState(() => EditorState.create({ doc: props.value, extensions: [basicSetup, sqlTheme, placeholder('粘贴或输入只读 SELECT 查询'), readOnly.current.of(EditorState.readOnly.of(props.readOnly)), EditorView.contentAttributes.of({ 'aria-label': '查询 SQL', spellcheck: 'false' }), keymap.of([{ key: 'Mod-Enter', run: () => { if (current.current.canRun) current.current.onRun(); return true; } }])] }));
  useEffect(() => { setState(previous => previous.doc.toString() === props.value ? previous : previous.update({ changes: { from: 0, to: previous.doc.length, insert: props.value } }).state); }, [props.value]);
  useEffect(() => { setState(previous => previous.update({ effects: readOnly.current.reconfigure(EditorState.readOnly.of(props.readOnly)) }).state); }, [props.readOnly]);
  return <div className="mysql-sql-editor"><FileCodeEditor state={state} documentId={props.id} onTransactions={transactions => {
    const next = transactions.at(-1)?.state; if (!next) return;
    setState(next); if (transactions.some(transaction => transaction.docChanged)) current.current.onChange(next.doc.toString());
  }} /></div>;
}
