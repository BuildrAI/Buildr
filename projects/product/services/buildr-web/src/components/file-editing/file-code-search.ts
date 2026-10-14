import { Facet, StateEffect, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { readOnlyFileCodeMatches } from './read-only-file-code';

type Presentation = { query: string; selectedLines: readonly [number, number] | null; enabled: boolean };
const presentations = new WeakMap<EditorView, Presentation>();
export const fileCodeSearchInstalled = Facet.define<boolean, boolean>({ combine: values => values.some(Boolean) });
export const refreshFileCodeSearch = StateEffect.define<null>();

/** Search belongs to a view, never to the shared file content or undo history. */
export function setFileCodeSearch(view: EditorView, presentation: Presentation) { presentations.set(view, presentation); }

function visibleDecorations(view: EditorView): DecorationSet {
  const shown = presentations.get(view);
  if (!shown?.enabled) return Decoration.none;
  const decorations: Range<Decoration>[] = [], visited = new Set<number>();
  for (const visible of view.visibleRanges) {
    for (let position = visible.from; position <= visible.to;) {
      const line = view.state.doc.lineAt(position);
      if (!visited.has(line.from)) {
        visited.add(line.from);
        const selected = shown.selectedLines && line.number >= shown.selectedLines[0] && line.number <= shown.selectedLines[1];
        decorations.push(Decoration.line({ attributes: { 'data-line': String(line.number) }, class: 'repository-source-row' + (selected ? ' selected-line' : '') }).range(line.from));
        for (const match of readOnlyFileCodeMatches(line.text, shown.query)) decorations.push(Decoration.mark({ tagName: 'mark', class: 'repository-search-hit' }).range(line.from + match.start, line.from + match.end));
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
  update(update: ViewUpdate) { this.decorations = visibleDecorations(update.view); }
}, { decorations: plugin => plugin.decorations });

export const fileCodeSearchExtension = [fileCodeSearchInstalled.of(true), decorations, EditorView.theme({
  '.cm-line.repository-source-row': { display: 'block', padding: '0 16px', minHeight: '23px' },
  '.cm-line.selected-line': { backgroundColor: '#e9f3ee', boxShadow: 'inset 3px 0 #478e7f' },
  '.repository-search-hit': { backgroundColor: '#fff0b8', color: 'inherit', borderRadius: '2px' },
})];
