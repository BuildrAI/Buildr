import { useEffect, useRef } from 'react';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

type Props = {
  state: EditorState;
  documentId: string;
  onTransactions?(transactions: readonly Transaction[]): boolean | void;
  onComposing?(value: boolean): void;
  onBlur?(): void;
  autoFocus?: boolean;
  focusLine?: number;
  focusRequest?: number;
};

/** The same mature editor view is used for source editing and conflict comparison. */
export function FileCodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef(props); current.current = props;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      state: current.current.state, parent: host.current,
      dispatchTransactions: transactions => {
        if (current.current.onTransactions?.(transactions) === false) return;
        editor.update(transactions);
      },
    });
    view.current = editor;
    const start = () => current.current.onComposing?.(true);
    const end = () => current.current.onComposing?.(false);
    const blur = () => current.current.onBlur?.();
    editor.contentDOM.addEventListener('compositionstart', start, true);
    editor.contentDOM.addEventListener('compositionend', end, true);
    editor.contentDOM.addEventListener('blur', blur);
    if (current.current.autoFocus) editor.focus();
    return () => {
      editor.contentDOM.removeEventListener('compositionstart', start, true);
      editor.contentDOM.removeEventListener('compositionend', end, true);
      editor.contentDOM.removeEventListener('blur', blur);
      editor.destroy(); view.current = null;
    };
  }, [props.documentId]);

  useEffect(() => { if (view.current && view.current.state !== props.state) view.current.setState(props.state); }, [props.state]);
  useEffect(() => { if (props.autoFocus) view.current?.focus(); }, [props.autoFocus]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !props.focusLine) return;
    const position = editor.state.doc.line(Math.max(1, Math.min(props.focusLine, editor.state.doc.lines))).from;
    editor.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
  }, [props.documentId, props.focusLine, props.focusRequest]);

  return <div className="file-code-editor" ref={host} />;
}
