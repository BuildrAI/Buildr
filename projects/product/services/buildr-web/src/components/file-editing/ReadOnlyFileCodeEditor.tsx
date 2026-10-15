import { useEffect, useMemo, useRef, useState } from 'react';
import { Compartment, Transaction, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { LanguageDescription } from '@codemirror/language';
import { FileCodeEditor } from './FileCodeEditor';
import { fileEditingLanguages } from './file-editing-language';
import { createReadOnlyFileCodeState, readOnlyFileCodeMatches, readOnlyFileCodePresentation, readOnlyFileCodeTransactionResult, updateReadOnlyFileCodePresentation, type ReadOnlyFileCodeOptions } from './read-only-file-code';
import './read-only-file-code.css';

type Props = ReadOnlyFileCodeOptions & {
  documentId: string;
  path: string;
  focusLine?: number;
  focusRequest?: number;
  active?: boolean;
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
  const currentSource = useRef(source); currentSource.current = source;
  const reader = useRef<{ source: EditorState; view: EditorView } | null>(null);
  const updateEffects = (effects: NonNullable<TransactionSpec['effects']>) => {
    const target = reader.current;
    if (!target || target.source !== source || currentSource.current !== source || target.view.state.doc !== source.doc) return;
    // Display changes use the same accepted transaction in local state and the existing measured view.
    target.view.dispatch({ effects, annotations: Transaction.addToHistory.of(false) });
  };
  const shown = useMemo(() => readOnlyFileCodePresentation(props), [props.content, props.omitTrailingEmpty, props.startLine, props.selectedLines?.[0], props.selectedLines?.[1], props.query, props.observedMatch?.start, props.observedMatch?.end, props.startsMidLine, props.endsMidLine]);
  const appliedPresentation = useRef({ source, shown });
  const localFocusLine = props.focusLine ? props.focusLine - shown.startLine + 1 : undefined;
  const focusSequence = useRef(0);
  // Snapshot the selected match on explicit navigation; live query decorations must not move the reader.
  const focus = useMemo(() => {
    const request = ++focusSequence.current;
    if (shown.observedMatch) return { position: shown.observedMatch.start, request };
    if (!localFocusLine || localFocusLine < 1 || localFocusLine > state.doc.lines) return { position: undefined, request };
    const line = state.doc.line(localFocusLine);
    return { position: line.from + (readOnlyFileCodeMatches(line.text, shown.query)[0]?.start || 0), request };
  }, [props.documentId, state.doc, localFocusLine, props.focusRequest]);

  useEffect(() => {
    const previous = appliedPresentation.current;
    appliedPresentation.current = { source, shown };
    // A new source already has this presentation; do not reset its freshly positioned virtualized view.
    if (previous.source !== source) return;
    const before = previous.shown;
    if (before.startLine === shown.startLine && before.query === shown.query
      && before.selectedLines?.[0] === shown.selectedLines?.[0] && before.selectedLines?.[1] === shown.selectedLines?.[1]
      && before.observedMatch?.start === shown.observedMatch?.start && before.observedMatch?.end === shown.observedMatch?.end
      && before.startsMidLine === shown.startsMidLine && before.endsMidLine === shown.endsMidLine) return;
    updateEffects(updateReadOnlyFileCodePresentation.of(shown));
  }, [source, shown]);
  useEffect(() => {
    let cancelled = false;
    const description = LanguageDescription.matchFilename(fileEditingLanguages, props.path);
    if (description) void description.load().then(support => {
      if (!cancelled) updateEffects(language.reconfigure(support));
    }).catch(() => { /* Plain text remains readable when a language chunk is unavailable. */ });
    return () => { cancelled = true; };
  }, [source, language, props.path]);

  return <section className="read-only-file-code-editor repository-source-code" aria-label="文件内容">
    {props.readOnlyReason && <div className="read-only-file-code-notice" role="status">{props.readOnlyReason}</div>}
    <FileCodeEditor documentId={props.documentId} state={state} active={props.active} initialScrollTop={props.initialScrollTop} onScroll={props.onScroll}
      onViewReady={view => {
        if (!view) reader.current = null;
        else if (currentSource.current === source && view.state.doc === source.doc) reader.current = { source, view };
      }}
      focusLine={localFocusLine} focusPosition={focus.position} focusRequest={focus.request}
      onTransactions={transactions => {
        const latest = readOnlyFileCodeTransactionResult(displayed.current, transactions);
        if (!latest) return false;
        displayed.current = latest;
        setLocal({ source, state: latest });
      }} />
  </section>;
}
