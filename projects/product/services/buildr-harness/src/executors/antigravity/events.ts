import { nativePreview } from '../native-process.ts';

export function extractAntigravityText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractAntigravityText).join('');
  if (content && typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') return part.text;
    if (part.type === 'content') return extractAntigravityText(part.content);
    if (typeof part.stdout === 'string' || typeof part.stderr === 'string') {
      return [part.stdout, part.stderr].filter(v => typeof v === 'string' && v.length > 0).join('\n');
    }
  }
  return '';
}

const DIFF_CONTEXT_LINES = 3;
const MAX_MYERS_EDIT_DISTANCE = 1000;
export const MAX_DIFF_BYTES = 256 * 1024;
const DIFF_TRUNCATED_NOTICE = '\n...（差异内容超出容量已截断，完整变更见原文件）';

type DiffOp =
  | { type: 'equal'; oldIdx: number; newIdx: number }
  | { type: 'delete'; oldIdx: number }
  | { type: 'insert'; newIdx: number };

function splitDiffLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function truncateDiffBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const noticeBytes = Buffer.byteLength(DIFF_TRUNCATED_NOTICE, 'utf8');
  const budget = Math.max(0, maxBytes - noticeBytes);
  const raw = Buffer.from(text, 'utf8');
  let end = budget;
  while (end > 0 && end < raw.length && (raw[end]! & 0xc0) === 0x80) end--;
  let clipped = raw.subarray(0, end).toString('utf8');
  const lastNewline = clipped.lastIndexOf('\n');
  if (lastNewline > 0) clipped = clipped.slice(0, lastNewline);
  return clipped + DIFF_TRUNCATED_NOTICE;
}

function computeBoundedMyersOps(
  oldMid: string[],
  newMid: string[],
  prefix: number,
): DiffOp[] | undefined {
  const n = oldMid.length;
  const m = newMid.length;
  const maxD = Math.min(MAX_MYERS_EDIT_DISTANCE, n + m);
  const offset = maxD;
  const v = new Int32Array(2 * maxD + 1);
  v.fill(-1);
  v[offset + 1] = 0;

  const trace: Int32Array[] = [];
  let foundD = -1;

  for (let d = 0; d <= maxD; d++) {
    // Capture V before step d writes new frontier values; slice width is 2*(d-1)+1 for d>=1.
    trace.push(d === 0 ? new Int32Array(0) : v.slice(offset - (d - 1), offset + (d - 1) + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!))
        ? v[offset + k + 1]!
        : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && oldMid[x] === newMid[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        foundD = d;
        break;
      }
    }
    if (foundD >= 0) break;
  }
  if (foundD < 0) return undefined;

  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = foundD; d >= 1; d--) {
    const prevV = trace[d]!;
    const prevSpan = d - 1;
    const k = x - y;
    const fromInsert = k === -d || (k !== d && prevV[prevSpan + k - 1]! < prevV[prevSpan + k + 1]!);
    const prevK = fromInsert ? k + 1 : k - 1;
    const prevX = prevV[prevSpan + prevK]!;
    const prevY = prevX - prevK;
    const xMid = fromInsert ? prevX : prevX + 1;
    const yMid = fromInsert ? prevY + 1 : prevY;
    while (x > xMid && y > yMid) {
      x--;
      y--;
      ops.push({ type: 'equal', oldIdx: prefix + x, newIdx: prefix + y });
    }
    if (fromInsert) ops.push({ type: 'insert', newIdx: prefix + prevY });
    else ops.push({ type: 'delete', oldIdx: prefix + prevX });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({ type: 'equal', oldIdx: prefix + x, newIdx: prefix + y });
  }
  ops.reverse();
  return ops;
}

function renderUnifiedHunks(
  oldLines: string[],
  newLines: string[],
  ops: DiffOp[],
  prefix: number,
  ctxPrefix: number,
): string[] {
  const changeIndices: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.type !== 'equal') changeIndices.push(i);
  }
  if (!changeIndices.length) return [];

  // Precompute 0-based (oldPos, newPos) cursor just before each op index.
  const startOld = new Int32Array(ops.length);
  const startNew = new Int32Array(ops.length);
  let curOld = prefix - ctxPrefix;
  let curNew = prefix - ctxPrefix;
  for (let i = 0; i < ops.length; i++) {
    startOld[i] = curOld;
    startNew[i] = curNew;
    const op = ops[i]!;
    if (op.type === 'equal') { curOld++; curNew++; }
    else if (op.type === 'delete') curOld++;
    else curNew++;
  }

  const hunks: string[] = [];
  let groupStart = 0;
  while (groupStart < changeIndices.length) {
    let groupEnd = groupStart;
    while (
      groupEnd + 1 < changeIndices.length &&
      changeIndices[groupEnd + 1]! - changeIndices[groupEnd]! - 1 <= 2 * DIFF_CONTEXT_LINES
    ) {
      groupEnd++;
    }
    const hStart = Math.max(0, changeIndices[groupStart]! - DIFF_CONTEXT_LINES);
    const hEnd = Math.min(ops.length - 1, changeIndices[groupEnd]! + DIFF_CONTEXT_LINES);
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let i = hStart; i <= hEnd; i++) {
      const op = ops[i]!;
      if (op.type === 'equal') {
        oldCount++;
        newCount++;
        body.push(` ${oldLines[op.oldIdx]}`);
      } else if (op.type === 'delete') {
        oldCount++;
        body.push(`-${oldLines[op.oldIdx]}`);
      } else {
        newCount++;
        body.push(`+${newLines[op.newIdx]}`);
      }
    }
    const oldStartNo = oldCount === 0 ? startOld[hStart]! : startOld[hStart]! + 1;
    const newStartNo = newCount === 0 ? startNew[hStart]! : startNew[hStart]! + 1;
    hunks.push(`@@ -${oldStartNo},${oldCount} +${newStartNo},${newCount} @@`, ...body);
    groupStart = groupEnd + 1;
  }
  return hunks;
}

function formatDiffPart(part: Record<string, unknown>): string {
  const filePath = typeof part.path === 'string' && part.path ? part.path : 'file';
  const oldText = typeof part.oldText === 'string' ? part.oldText : '';
  const newText = typeof part.newText === 'string' ? part.newText : '';
  const headers = [`--- a/${filePath}`, `+++ b/${filePath}`];
  if (oldText === newText) return headers.join('\n');

  const oldLines = splitDiffLines(oldText);
  const newLines = splitDiffLines(newText);

  if (oldLines.length === 0) {
    const out = [
      ...headers,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...newLines.map(line => `+${line}`),
    ].join('\n');
    return truncateDiffBytes(out, MAX_DIFF_BYTES);
  }
  if (newLines.length === 0) {
    const out = [
      ...headers,
      `@@ -1,${oldLines.length} +0,0 @@`,
      ...oldLines.map(line => `-${line}`),
    ].join('\n');
    return truncateDiffBytes(out, MAX_DIFF_BYTES);
  }

  const minLen = Math.min(oldLines.length, newLines.length);
  let prefix = 0;
  while (prefix < minLen && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    prefix + suffix < minLen &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
  const newMid = newLines.slice(prefix, newLines.length - suffix);
  if (oldMid.length === 0 && newMid.length === 0) {
    const lastOld = oldLines.at(-1)!;
    const lastNew = newLines.at(-1)!;
    return [
      ...headers,
      `@@ -${oldLines.length},1 +${newLines.length},1 @@`,
      `-${lastOld}`,
      `+${lastNew}`,
    ].join('\n');
  }

  const ctxPrefix = Math.min(DIFF_CONTEXT_LINES, prefix);
  const ctxSuffix = Math.min(DIFF_CONTEXT_LINES, suffix);
  const midOps = computeBoundedMyersOps(oldMid, newMid, prefix);

  if (midOps) {
    const windowOps: DiffOp[] = [];
    for (let i = prefix - ctxPrefix; i < prefix; i++) {
      windowOps.push({ type: 'equal', oldIdx: i, newIdx: i });
    }
    windowOps.push(...midOps);
    const suffixOldStart = oldLines.length - suffix;
    const suffixNewStart = newLines.length - suffix;
    for (let i = 0; i < ctxSuffix; i++) {
      windowOps.push({ type: 'equal', oldIdx: suffixOldStart + i, newIdx: suffixNewStart + i });
    }
    const hunks = renderUnifiedHunks(oldLines, newLines, windowOps, prefix, ctxPrefix);
    return truncateDiffBytes([...headers, ...hunks].join('\n'), MAX_DIFF_BYTES);
  }

  // Fallback for huge rewrites exceeding MAX_MYERS_EDIT_DISTANCE: single bounded hunk.
  const oldCount = ctxPrefix + oldMid.length + ctxSuffix;
  const newCount = ctxPrefix + newMid.length + ctxSuffix;
  const oldStartNo = oldCount === 0 ? prefix : prefix - ctxPrefix + 1;
  const newStartNo = newCount === 0 ? prefix : prefix - ctxPrefix + 1;
  const body: string[] = [];
  for (let i = prefix - ctxPrefix; i < prefix; i++) body.push(` ${oldLines[i]}`);
  for (const line of oldMid) body.push(`-${line}`);
  for (const line of newMid) body.push(`+${line}`);
  const suffixOldStart = oldLines.length - suffix;
  for (let i = 0; i < ctxSuffix; i++) body.push(` ${oldLines[suffixOldStart + i]}`);
  return truncateDiffBytes(
    [...headers, `@@ -${oldStartNo},${oldCount} +${newStartNo},${newCount} @@`, ...body].join('\n'),
    MAX_DIFF_BYTES,
  );
}

export function extractAntigravityToolOutput(content: unknown): {
  fullText: string;
  previewText: string;
  hasDiff: boolean;
} {
  if (content === undefined || content === null) {
    return { fullText: '', previewText: '', hasDiff: false };
  }
  let hasDiff = false;
  const pieces: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node) pieces.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const part = node as Record<string, unknown>;
    if (part.type === 'diff') {
      hasDiff = true;
      pieces.push(formatDiffPart(part));
      return;
    }
    if (part.type === 'content') {
      visit(part.content);
      return;
    }
    if (part.type === 'terminal' && typeof part.output === 'string') {
      pieces.push(part.output);
      return;
    }
    if (typeof part.text === 'string') {
      pieces.push(part.text);
      return;
    }
    if (typeof part.stdout === 'string' || typeof part.stderr === 'string') {
      const joined = [part.stdout, part.stderr].filter(v => typeof v === 'string' && v.length > 0).join('\n');
      if (joined) pieces.push(joined);
      return;
    }
    try {
      const serialized = JSON.stringify(part);
      if (serialized && serialized !== '{}') pieces.push(serialized);
    } catch {
      // Unserializable metadata is ignored.
    }
  };
  visit(content);
  const fullText = pieces.join('\n');
  return {
    fullText,
    previewText: fullText ? nativePreview(fullText) : '',
    hasDiff,
  };
}

/**
 * Standardize ACP tool categories onto Buildr's unified tool step names (`command`, `read`,
 * `edit`, `file-change`, `grep`, `web_fetch`), preserving prior name on status-only updates.
 */
export function mapAntigravityToolName(
  kind: unknown,
  title: unknown,
  hasDiff: boolean,
  priorName?: string,
): string {
  if (kind === undefined && title === undefined && priorName) {
    return priorName === 'edit' && hasDiff ? 'file-change' : priorName;
  }
  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (normalizedKind === 'execute') return 'command';
  if (normalizedKind === 'read') return 'read';
  if (normalizedKind === 'edit' || normalizedKind === 'delete' || normalizedKind === 'move') {
    return hasDiff ? 'file-change' : 'edit';
  }
  if (normalizedKind === 'search') return 'grep';
  if (normalizedKind === 'fetch') return 'web_fetch';
  if (priorName && (!normalizedKind || normalizedKind === 'other')) {
    return priorName;
  }
  if (typeof title === 'string' && title.trim()) return title.trim();
  if (typeof kind === 'string' && kind.trim()) return kind.trim();
  return priorName ?? '工具';
}

export function extractFirstLocationPath(locations: unknown): string | undefined {
  if (!Array.isArray(locations) || !locations.length) return undefined;
  const first = locations[0];
  if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).path === 'string') {
    const loc = (first as Record<string, unknown>).path as string;
    return loc.trim() ? loc : undefined;
  }
  return undefined;
}

export function mergeAntigravityToolInput(
  rawInput: unknown,
  locations: unknown,
  priorInput?: string,
): { objectInput?: Record<string, unknown>; previewInput?: string; fullInput?: string } {
  const locPath = extractFirstLocationPath(locations);
  if (rawInput === undefined && !locPath) {
    return priorInput !== undefined ? { previewInput: priorInput, fullInput: priorInput } : {};
  }
  let merged: unknown = rawInput;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    merged = locPath && (rawInput as Record<string, unknown>).path === undefined
      ? { ...(rawInput as Record<string, unknown>), path: locPath }
      : { ...(rawInput as Record<string, unknown>) };
  } else if (rawInput === undefined && priorInput) {
    try {
      const parsed = JSON.parse(priorInput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        merged = locPath && parsed.path === undefined ? { ...parsed, path: locPath } : parsed;
      } else {
        merged = locPath ? { value: priorInput, path: locPath } : priorInput;
      }
    } catch {
      merged = locPath ? { input: priorInput, path: locPath } : priorInput;
    }
  } else if (rawInput === undefined && locPath) {
    merged = { path: locPath };
  }

  const serialized = typeof merged === 'string' ? merged : JSON.stringify(merged ?? {});
  return {
    ...(merged && typeof merged === 'object' && !Array.isArray(merged) ? { objectInput: merged as Record<string, unknown> } : {}),
    fullInput: serialized,
    previewInput: nativePreview(serialized, 4000),
  };
}
