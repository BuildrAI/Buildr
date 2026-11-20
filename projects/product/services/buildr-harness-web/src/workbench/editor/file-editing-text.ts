/** CodeMirror uses one position per line break; disk text may use CRLF. */
export function normalizeEditorText(content: string): string {
  return content.replace(/\r\n?|\n/g, '\n');
}

export function originalTextOffset(content: string, editorOffset: number): number {
  let original = 0;
  let normalized = 0;
  while (original < content.length && normalized < editorOffset) {
    original += content[original] === '\r' && content[original + 1] === '\n' ? 2 : 1;
    normalized += 1;
  }
  return original;
}

export function editorTextOffset(content: string, originalOffset: number): number {
  return normalizeEditorText(content.slice(0, originalOffset)).length;
}

export function preferredLineBreak(content: string): string {
  return content.match(/\r\n|\r|\n/)?.[0] || '\n';
}

export function textDifference(before: string, after: string) {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  return { from, to: oldEnd, insert: after.slice(from, newEnd) };
}

export function initialMerge(base: string, mine: string, disk: string): string {
  if (mine === base || mine === disk) return disk;
  if (disk === base) return mine;
  return '<<<<<<< 我的输入\n' + mine.replace(/\n?$/, '\n') + '=======\n' + disk.replace(/\n?$/, '\n') + '>>>>>>> 磁盘最新内容\n';
}
