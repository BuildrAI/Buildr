import { Facet, StateField, type EditorState } from '@codemirror/state';
import { Decoration, Direction, EditorView, layer, type DecorationSet, type LayerMarker, type Rect } from '@codemirror/view';
import { sqlExecutionTarget, type SqlExecutionTarget } from '../sql-execution-target';

export type SqlRunningTarget = { document: string; target: SqlExecutionTarget };
export const sqlRunningTarget = Facet.define<SqlRunningTarget | null, SqlRunningTarget | null>({ combine: values => values[0] ?? null });

function highlight(state: EditorState): DecorationSet {
  const document = state.doc.toString(), running = state.facet(sqlRunningTarget);
  let target: SqlExecutionTarget;
  if (running) {
    // Never apply offsets captured from another document, or follow a new caret during a query.
    if (running.document !== document) return Decoration.none;
    target = running.target;
  } else {
    try { target = sqlExecutionTarget(document, state.selection.main); }
    catch { return Decoration.none; }
  }
  return Decoration.set([Decoration.mark({
    class: 'cm-sql-target',
    attributes: {
      'data-sql-target-from': String(target.from),
      'data-sql-target-to': String(target.to),
      'data-sql-target-mode': target.mode,
      'data-sql-target-state': running ? 'running' : 'current',
    },
  }).range(target.from, target.to)]);
}

export const sqlTargetHighlights = StateField.define<DecorationSet>({
  create: highlight,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection || transaction.startState.facet(sqlRunningTarget) !== transaction.state.facet(sqlRunningTarget)
      ? highlight(transaction.state) : value;
  },
  // Keep the range outside token styling, so syntax tokens do not each get a border.
  provide: field => EditorView.outerDecorations.from(field),
});

type Outline = { left: number; top: number; width: number; height: number; path: string };

/** Merge visual rows into one perimeter, with no horizontal borders between rows. */
export function statementOutline(rectangles: readonly Rect[], lineHeight: number): Outline | null {
  const rows: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const rect of [...rectangles].sort((a, b) => a.top - b.top || a.left - b.left)) {
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
    const previous = rows.at(-1);
    if (previous && Math.abs(previous.top - rect.top) < 1) {
      previous.left = Math.min(previous.left, rect.left); previous.right = Math.max(previous.right, rect.right);
      previous.bottom = Math.max(previous.bottom, rect.bottom);
    } else rows.push({ ...rect });
  }
  if (!rows.length) return null;
  const left = Math.min(...rows.map(row => row.left)), right = Math.max(...rows.map(row => row.right));
  const top = (rows[0].top + rows[0].bottom - lineHeight) / 2;
  const last = rows.at(-1)!, bottom = (last.top + last.bottom + lineHeight) / 2;
  const edges = rows.slice(1).map((row, index) => (rows[index].bottom + row.top) / 2);
  const points: [number, number][] = [[rows[0].left, top], [rows[0].right, top]];
  for (let index = 0; index < rows.length; index++) {
    const y = edges[index] ?? bottom;
    points.push([rows[index].right, y]);
    if (index + 1 < rows.length) points.push([rows[index + 1].right, y]);
  }
  points.push([last.left, bottom]);
  for (let index = rows.length - 1; index >= 0; index--) {
    const y = edges[index - 1] ?? top;
    points.push([rows[index].left, y]);
    if (index > 0) points.push([rows[index - 1].left, y]);
  }
  const coordinate = (value: number) => String(Math.round(value * 100) / 100);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${coordinate(x - left)} ${coordinate(y - top)}`).join(' ') + ' Z';
  return { left, top, width: right - left, height: bottom - top, path };
}

class StatementOutlineMarker implements LayerMarker {
  private readonly outline: Outline;
  constructor(outline: Outline) { this.outline = outline; }
  eq(other: StatementOutlineMarker) { return JSON.stringify(this.outline) === JSON.stringify(other.outline); }
  draw(): HTMLElement {
    const { left, top, width, height, path } = this.outline;
    const element = document.createElement('div'); element.className = 'cm-sql-statement-outline';
    Object.assign(element.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path); shape.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(shape); element.appendChild(svg); return element;
  }
}

const outlineLayer = layer({
  above: false,
  class: 'cm-sql-statement-layer',
  update: update => update.viewportChanged || update.startState.field(sqlTargetHighlights) !== update.state.field(sqlTargetHighlights),
  markers(view) {
    // The marks carry the exact execution range; measure their rendered fragments to include
    // wrapping, syntax styling and the current viewport without changing the document.
    const scroller = view.scrollDOM.getBoundingClientRect();
    const left = (view.textDirection === Direction.LTR ? scroller.left : scroller.right - view.scrollDOM.clientWidth * view.scaleX) - view.scrollDOM.scrollLeft * view.scaleX;
    const top = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
    const rectangles = [...view.contentDOM.querySelectorAll('.cm-sql-target')].flatMap(mark => [...mark.getClientRects()].map(rect => ({ left: rect.left - left, right: rect.right - left, top: rect.top - top, bottom: rect.bottom - top })));
    const outline = statementOutline(rectangles, view.defaultLineHeight * view.scaleY);
    return outline ? [new StatementOutlineMarker(outline)] : [];
  },
});

export const sqlStatementHighlight = [sqlTargetHighlights, outlineLayer, EditorView.baseTheme({
  '.cm-sql-statement-outline': { pointerEvents: 'none' },
  '.cm-sql-statement-outline svg': { display: 'block', overflow: 'visible' },
  '.cm-sql-statement-outline path': {
    fill: 'color-mix(in srgb, var(--ant-color-success, #5a9a78) 7%, transparent)',
    stroke: 'var(--ant-color-success, #5a9a78)',
    strokeWidth: '1px',
  },
})];
