export type DiffRow = { oldNo: number | null; newNo: number | null; kind: 'ctx' | 'add' | 'del' | 'meta' | 'hunk'; text: string };

export function parseUnifiedDiff(text: string): { rows: DiffRow[]; totalAdd: number; totalDel: number } {
  const rows: DiffRow[] = [];
  let oldNo = 0, newNo = 0, adds = 0, dels = 0;
  let inHunk = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      inHunk = Boolean(match);
      if (match) { oldNo = Number(match[1]); newNo = Number(match[3]); }
      rows.push({ oldNo: null, newNo: null, kind: 'hunk', text: line });
      continue;
    }
    if (!inHunk || line.startsWith('\\ No newline')) { rows.push({ oldNo: null, newNo: null, kind: 'meta', text: line }); continue; }
    if (line.startsWith('+')) { rows.push({ oldNo: null, newNo: newNo++, kind: 'add', text: line.slice(1) }); adds += 1; continue; }
    if (line.startsWith('-')) { rows.push({ oldNo: oldNo++, newNo: null, kind: 'del', text: line.slice(1) }); dels += 1; continue; }
    if (line) rows.push({ oldNo: oldNo++, newNo: newNo++, kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line });
  }
  return { rows, totalAdd: adds, totalDel: dels };
}

/** Hide patch transport details while retaining boundaries between partial code sections. */
export function diffContentRows(rows: DiffRow[]): DiffRow[] {
  const content: DiffRow[] = [];
  let oldEnd = 0, newEnd = 0;
  for (const row of rows) {
    if (row.kind === 'meta') continue;
    if (row.kind === 'hunk') {
      const range = row.text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (range) {
        const oldStart = Number(range[1]), newStart = Number(range[3]);
        if (content.length && (oldStart > oldEnd + 1 || newStart > newEnd + 1)) content.push({ ...row, text: '… 未显示的行 …' });
        oldEnd = oldStart - (range[2] === '0' ? 0 : 1);
        newEnd = newStart - (range[4] === '0' ? 0 : 1);
      }
      continue;
    }
    content.push(row);
    if (row.oldNo !== null) oldEnd = row.oldNo;
    if (row.newNo !== null) newEnd = row.newNo;
  }
  return content;
}

export type InlineSegment = { start: number; end: number; changed: boolean };
export type InlineSegments = { old: InlineSegment[]; new: InlineSegment[] };

/** Token budget keeps the LCS bounded; oversized middles stay highlighted as a whole. */
const INLINE_TOKEN_LIMIT = 500;
const INLINE_TOKEN_PRODUCT_LIMIT = 60_000;

function isWordUnit(unit: string): boolean {
  const code = unit.codePointAt(0)!;
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}

/** Split text into comparable units: whitespace runs, latin word runs, punctuation runs, and one token per CJK or other unit. */
function inlineTokens(text: string): string[] {
  const units = Array.from(text);
  const classes = units.map(unit => /\s/u.test(unit) ? 0 : isWordUnit(unit) ? 1 : /[\p{P}\p{S}]/u.test(unit) ? 2 : 3);
  const tokens: string[] = [];
  for (let index = 0; index < units.length; index += 1) {
    if (classes[index] !== 3 && tokens.length && classes[index] === classes[index - 1]) tokens[tokens.length - 1] += units[index];
    else tokens.push(units[index]);
  }
  return tokens;
}

/** Keep flags for tokens matched by the longest common subsequence between `a` and `b`. */
function commonTokenIndexes(a: string[], b: string[]): Set<number> {
  const width = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      dp[i * width + j] = a[i] === b[j] ? dp[(i + 1) * width + j + 1] + 1 : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  const keep = new Set<number>();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { keep.add(i); i += 1; j += 1; continue; }
    if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i += 1; else j += 1;
  }
  return keep;
}

function toSegments(units: string[], changed: boolean[]): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (let index = 0; index < units.length; index += 1) {
    const end = cursor + units[index].length;
    const last = segments.at(-1);
    if (last && last.changed === changed[index]) last.end = end;
    else segments.push({ start: cursor, end, changed: changed[index] });
    cursor = end;
  }
  return segments;
}

/**
 * Intra-line diff for one deleted line paired with one added line. Shared
 * leading/trailing tokens stay unhighlighted; the differing middle part is
 * refined by a token-level LCS. `changed` ranges mark the text that differs.
 */
export function inlineSegments(oldText: string, newText: string): InlineSegments {
  const oldTokens = inlineTokens(oldText);
  const newTokens = inlineTokens(newText);
  let head = 0;
  while (head < oldTokens.length && head < newTokens.length && oldTokens[head] === newTokens[head]) head += 1;
  let tail = 0;
  while (oldTokens.length - tail > head && newTokens.length - tail > head && oldTokens[oldTokens.length - tail - 1] === newTokens[newTokens.length - tail - 1]) tail += 1;
  const oldMiddle = oldTokens.slice(head, oldTokens.length - tail);
  const newMiddle = newTokens.slice(head, newTokens.length - tail);
  const oversized = oldMiddle.length > INLINE_TOKEN_LIMIT || newMiddle.length > INLINE_TOKEN_LIMIT || oldMiddle.length * newMiddle.length > INLINE_TOKEN_PRODUCT_LIMIT;
  const unrelated = oldTokens.length > 0 && newTokens.length > 0 && (head + tail) * 2 * 3 < Math.max(oldTokens.length, newTokens.length);
  const oldKeep = oversized || unrelated || !newMiddle.length ? new Set<number>() : commonTokenIndexes(oldMiddle, newMiddle);
  const newKeep = oversized || unrelated || !oldMiddle.length ? new Set<number>() : commonTokenIndexes(newMiddle, oldMiddle);
  const oldEnd = head + oldMiddle.length;
  const newEnd = head + newMiddle.length;
  return {
    old: toSegments(oldTokens, oldTokens.map((_unit, index) => index >= head && index < oldEnd && !oldKeep.has(index - head))),
    new: toSegments(newTokens, newTokens.map((_unit, index) => index >= head && index < newEnd && !newKeep.has(index - head))),
  };
}

/** Pair each deleted line with the same-position added line inside every contiguous del/add block, both directions. */
export function inlineChangePairs(rows: DiffRow[]): Map<number, number> {
  const pairs = new Map<number, number>();
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].kind !== 'del') continue;
    const dels: number[] = [];
    while (index < rows.length && rows[index].kind === 'del') { dels.push(index); index += 1; }
    const adds: number[] = [];
    while (index < rows.length && rows[index].kind === 'add') { adds.push(index); index += 1; }
    index -= 1;
    const length = Math.min(dels.length, adds.length);
    for (let i = 0; i < length; i += 1) { pairs.set(dels[i], adds[i]); pairs.set(adds[i], dels[i]); }
  }
  return pairs;
}

export function pairForSplit(rows: DiffRow[]): { left: DiffRow | null; right: DiffRow | null }[] {
  const pairs: { left: DiffRow | null; right: DiffRow | null }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.kind === 'add') { pairs.push({ left: null, right: row }); continue; }
    if (row.kind !== 'del') { pairs.push({ left: row, right: row.kind === 'ctx' ? row : null }); continue; }
    const dels: DiffRow[] = [];
    while (index < rows.length && rows[index].kind === 'del') { dels.push(rows[index]); index += 1; }
    const adds: DiffRow[] = [];
    while (index < rows.length && rows[index].kind === 'add') { adds.push(rows[index]); index += 1; }
    index -= 1;
    const length = Math.max(dels.length, adds.length);
    for (let i = 0; i < length; i += 1) pairs.push({ left: dels[i] ?? null, right: adds[i] ?? null });
  }
  return pairs;
}
