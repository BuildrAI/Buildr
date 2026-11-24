import { isolateHistory } from '@codemirror/commands';
import { Transaction, type EditorState, type Text } from '@codemirror/state';

export type FileDiffChunk = { fromA: number; toA: number; fromB: number; toB: number; endB: number };
export type FileDiffPresentation = { fileId: string; mode: 'split' | 'unified'; original: string; readOnly: boolean };

/** Keep a composing contentDOM alive; apply the latest requested configuration after its real end event. */
export function retainFileDiffPresentation(previous: FileDiffPresentation | undefined, next: FileDiffPresentation, composing: boolean): FileDiffPresentation {
  return composing && previous?.fileId === next.fileId ? previous : next;
}

/** Only document intent crosses into the shared file state. Merge configuration stays in the view. */
export function projectFileDiffTransactions(state: EditorState, transactions: readonly Transaction[]): Transaction[] | null {
  const projected: Transaction[] = [];
  for (const transaction of transactions) {
    if (!state.doc.eq(transaction.startState.doc)) return null;
    if (!transaction.docChanged && !transaction.selection) continue;
    const annotations = [];
    const event = transaction.annotation(Transaction.userEvent);
    const time = transaction.annotation(Transaction.time);
    const history = transaction.annotation(Transaction.addToHistory);
    if (event !== undefined) annotations.push(Transaction.userEvent.of(event));
    if (time !== undefined) annotations.push(Transaction.time.of(time));
    if (history !== undefined) annotations.push(Transaction.addToHistory.of(history));
    if (transaction.isUserEvent('revert')) annotations.push(isolateHistory.of('full'));
    const next = state.update({ changes: transaction.changes, selection: transaction.selection, annotations });
    // A canonical protection filter may reject an otherwise valid presentation edit.
    if (!next.newDoc.eq(transaction.newDoc)) return null;
    projected.push(next);
    state = next.state;
  }
  return projected;
}

/** Same line-boundary semantics as CodeMirror merge, including insertions at EOF. */
export function fileDiffRestoreChange(original: Text, current: Text, chunk: FileDiffChunk) {
  let insert = original.sliceString(chunk.fromA, Math.max(chunk.fromA, chunk.toA - 1));
  if (chunk.fromA !== chunk.toA && chunk.toB <= current.length) insert += '\n';
  return { from: chunk.fromB, to: Math.min(current.length, chunk.toB), insert };
}

export function fileDiffChunkIndex(chunks: readonly FileDiffChunk[], position: number) {
  return chunks.findIndex(chunk => chunk.fromB <= position && chunk.endB >= position);
}
