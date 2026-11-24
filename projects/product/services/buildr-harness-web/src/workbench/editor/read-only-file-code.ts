import { EditorState, Facet, StateEffect, StateField, type Extension, type Range, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { editorTextOffset, normalizeEditorText } from './file-editing-text.ts';

export type ReadOnlyFileCodeMatch = { start: number; end: number };
export type ReadOnlyFileCodePresentation = {
  startLine: number;
  selectedLines: readonly [number, number] | null;
  query: string;
  observedMatch: ReadOnlyFileCodeMatch | null;
  startsMidLine: boolean;
  endsMidLine: boolean;
};
export type ReadOnlyFileCodeOptions = {
  content: string;
  startLine?: number;
  omitTrailingEmpty?: boolean;
  selectedLines?: readonly [number, number] | null;
  query?: string;
  observedMatch?: ReadOnlyFileCodeMatch | null;
  startsMidLine?: boolean;
  endsMidLine?: boolean;
};

/** A final LF in a nonfinal page belongs to the next page's first row. */
export function readOnlyFileCodeText(content: string, omitTrailingEmpty = false) {
  const text = normalizeEditorText(content);
  return omitTrailingEmpty && text.endsWith('\n') ? text.slice(0, -1) : text;
}

export function readOnlyFileCodePresentation(options: ReadOnlyFileCodeOptions): ReadOnlyFileCodePresentation {
  const length = readOnlyFileCodeText(options.content, options.omitTrailingEmpty).length;
  const start = options.observedMatch ? Math.min(length, editorTextOffset(options.content, options.observedMatch.start)) : 0;
  const end = options.observedMatch ? Math.min(length, editorTextOffset(options.content, options.observedMatch.end)) : 0;
  return {
    startLine: Math.max(1, options.startLine || 1), selectedLines: options.selectedLines || null,
    query: options.query || '', observedMatch: start < end ? { start, end } : null,
    startsMidLine: Boolean(options.startsMidLine), endsMidLine: Boolean(options.endsMidLine),
  };
}

/** Literal matches retain original UTF-16 offsets, including case-folded Unicode. */
export function readOnlyFileCodeMatches(text: string, query: string, observed?: ReadOnlyFileCodeMatch | null) {
  const matches: ReadOnlyFileCodeMatch[] = [];
  if (query) {
    const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    for (const match of text.matchAll(expression)) matches.push({ start: match.index, end: match.index + match[0].length });
  }
  if (observed) {
    const start = Math.max(0, observed.start), end = Math.min(text.length, observed.end);
    if (start < end) matches.push({ start, end });
  }
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: ReadOnlyFileCodeMatch[] = [];
  for (const match of matches) {
    const previous = merged.at(-1);
    if (previous && match.start < previous.end) previous.end = Math.max(previous.end, match.end);
    else merged.push({ ...match });
  }
  return merged;
}

const initialPresentation = Facet.define<ReadOnlyFileCodePresentation, ReadOnlyFileCodePresentation>({ combine: values => values[0] });
export const updateReadOnlyFileCodePresentation = StateEffect.define<ReadOnlyFileCodePresentation>();
const presentation = StateField.define<ReadOnlyFileCodePresentation>({
  create: state => state.facet(initialPresentation),
  update: (value, transaction) => transaction.effects.find(effect => effect.is(updateReadOnlyFileCodePresentation))?.value || value,
});

export function readOnlyFileCodeLineNumber(state: EditorState, localLine: number) {
  return state.field(presentation).startLine + localLine - 1;
}

/** A late selection from a replaced view must not bring its old source back. */
export function readOnlyFileCodeTransactionResult(state: EditorState, transactions: readonly Transaction[]): EditorState | null {
  if (!transactions.length) return null;
  for (const transaction of transactions) {
    if (transaction.startState !== state || transaction.docChanged) return null;
    state = transaction.state;
  }
  return state;
}

function visibleDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const shown = view.state.field(presentation);
  const visited = new Set<number>();
  for (const visible of view.visibleRanges) {
    for (let position = visible.from; position <= visible.to;) {
      const line = view.state.doc.lineAt(position);
      if (!visited.has(line.from)) {
        visited.add(line.from);
        const globalLine = readOnlyFileCodeLineNumber(view.state, line.number);
        const selected = Boolean(shown.selectedLines && globalLine >= shown.selectedLines[0] && globalLine <= shown.selectedLines[1]);
        const continuation = line.number === 1 && shown.startsMidLine || line.number === view.state.doc.lines && shown.endsMidLine;
        decorations.push(Decoration.line({ attributes: { 'data-line': String(globalLine), ...(continuation ? { 'data-line-continuation': 'true' } : {}) }, class: 'repository-source-row' + (selected ? ' selected-line' : '') }).range(line.from));
        const observed = shown.observedMatch && { start: shown.observedMatch.start - line.from, end: shown.observedMatch.end - line.from };
        for (const match of readOnlyFileCodeMatches(line.text, shown.query, observed)) {
          decorations.push(Decoration.mark({ tagName: 'mark', class: 'repository-search-hit' }).range(line.from + match.start, line.from + match.end));
        }
      }
      if (line.to >= view.state.doc.length) break;
      position = line.to + 1;
    }
  }
  return Decoration.set(decorations, true);
}

const decorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = visibleDecorations(view); }
  update(update: ViewUpdate) {
    if (update.viewportChanged || update.docChanged || update.startState.field(presentation) !== update.state.field(presentation)) this.decorations = visibleDecorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--font-size-code)', backgroundColor: 'var(--ant-color-bg-container, #fff)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.8', overflow: 'auto', overscrollBehavior: 'contain' },
  '.cm-content': { padding: '14px 0 32px', minHeight: '100%' },
  '.cm-line.repository-source-row': { display: 'block', padding: '0 16px', minHeight: '23px' },
  '.cm-gutters': { backgroundColor: 'var(--ant-color-bg-layout, #f7f8f9)', color: 'var(--ant-color-text-quaternary, #9aa4ad)', borderRight: '1px solid var(--ant-color-border-secondary, #eceef1)' },
  '.cm-lineNumbers .cm-gutterElement': { cursor: 'pointer', minWidth: '44px', padding: '0 12px 0 5px' },
  '.cm-lineNumbers .cm-gutterElement:hover': { color: 'var(--soft-primary, #397f75)', backgroundColor: '#eef5f2' },
  '.cm-line.selected-line': { backgroundColor: '#e9f3ee', boxShadow: 'inset 3px 0 #478e7f' },
  '.repository-search-hit': { backgroundColor: '#fff0b8', color: 'inherit', borderRadius: '2px' },
  '&.cm-focused': { outline: 'none' },
});

/** Historical and partial sources have a separate, unsavable editor state. */
export function createReadOnlyFileCodeState(options: ReadOnlyFileCodeOptions, onSelectLine?: (line: number, extend: boolean) => void, extension: Extension = []) {
  return EditorState.create({ doc: readOnlyFileCodeText(options.content, options.omitTrailingEmpty), extensions: [
    basicSetup, theme, extension, initialPresentation.of(readOnlyFileCodePresentation(options)), presentation, decorations,
    EditorState.readOnly.of(true), EditorView.editable.of(false), EditorState.changeFilter.of(transaction => !transaction.docChanged),
    EditorView.contentAttributes.of({ 'aria-label': '文件只读编辑器', 'aria-readonly': 'true', tabindex: '0' }),
    keymap.of([{ key: 'Mod-s', run: () => true }]),
    lineNumbers({ formatNumber: (line, state) => String(readOnlyFileCodeLineNumber(state, line)), domEventHandlers: { mousedown: (view, line, event) => {
      if (!(event instanceof MouseEvent) || event.button !== 0) return false;
      event.preventDefault();
      onSelectLine?.(readOnlyFileCodeLineNumber(view.state, view.state.doc.lineAt(line.from).number), event.shiftKey);
      return true;
    } } }),
  ] });
}
