import { useEffect, useMemo, useRef, useState } from 'react';
import { Compartment, type EditorState } from '@codemirror/state';
import { LanguageDescription } from '@codemirror/language';
import { FileCodeEditor } from './FileCodeEditor';
import { fileEditingLanguages } from './file-editing-language';
import { createReadOnlyFileCodeState, readOnlyFileCodePresentation, readOnlyFileCodeTransactionResult, updateReadOnlyFileCodePresentation, type ReadOnlyFileCodeOptions } from './read-only-file-code';
import './read-only-file-code.css';

type Props = ReadOnlyFileCodeOptions & {
  documentId: string;
  path: string;
  focusLine?: number;
  focusRequest?: number;
  onSelectLine?(line: number, extend: boolean): void;
  readOnlyReason?: string;
  initialScrollTop?: number;
  onScroll?(top: number): void;
};

/** The common editor view without a current-file identity, session or save operation. */
export function ReadOnlyFileCodeEditor(props: Props) {
  const current = useRef(props); current.current = props;
  const language = useMemo(() => new Compartment(), [props.documentId, props.path, props.content, props.startLine, props.omitTrailingEmpty]);
  const source = useMemo(() => createReadOnlyFileCodeState(props, (line, extend) => current.current.onSelectLine?.(line, extend), language.of([])),
    [language]);
  const [local, setLocal] = useState({ source, state: source });
  const state = local.source === source ? local.state : source;
  const displayed = useRef(state); displayed.current = state;
  const update = (transform: (state: EditorState) => EditorState) => setLocal(previous => ({ source, state: transform(previous.source === source ? previous.state : source) }));
  const shown = useMemo(() => readOnlyFileCodePresentation(props), [props.content, props.omitTrailingEmpty, props.startLine, props.selectedLines?.[0], props.selectedLines?.[1], props.query, props.observedMatch?.start, props.observedMatch?.end, props.startsMidLine, props.endsMidLine]);

  useEffect(() => { update(state => state.update({ effects: updateReadOnlyFileCodePresentation.of(shown) }).state); }, [source, shown]);
  useEffect(() => {
    let cancelled = false;
    const description = LanguageDescription.matchFilename(fileEditingLanguages, props.path);
    if (description) void description.load().then(support => {
      if (!cancelled) update(state => state.update({ effects: language.reconfigure(support) }).state);
    }).catch(() => { /* Plain text remains readable when a language chunk is unavailable. */ });
    return () => { cancelled = true; };
  }, [source, language, props.path]);

  return <section className="read-only-file-code-editor repository-source-code" aria-label="文件内容">
    {props.readOnlyReason && <div className="read-only-file-code-notice" role="status">{props.readOnlyReason}</div>}
    <FileCodeEditor documentId={props.documentId} state={state} initialScrollTop={props.initialScrollTop} onScroll={props.onScroll}
      focusLine={props.focusLine ? props.focusLine - shown.startLine + 1 : undefined} focusRequest={props.focusRequest}
      onTransactions={transactions => {
        const latest = readOnlyFileCodeTransactionResult(displayed.current, transactions);
        if (!latest) return false;
        displayed.current = latest;
        setLocal({ source, state: latest });
      }} />
  </section>;
}
