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

function formatDiffPart(part: Record<string, unknown>): string {
  const filePath = typeof part.path === 'string' && part.path ? part.path : 'file';
  const oldText = typeof part.oldText === 'string' ? part.oldText : '';
  const newText = typeof part.newText === 'string' ? part.newText : '';
  const removed = oldText ? oldText.split('\n').map(line => `-${line}`).join('\n') : '';
  const added = newText ? newText.split('\n').map(line => `+${line}`).join('\n') : '';
  return [`--- a/${filePath}`, `+++ b/${filePath}`, '@@', removed, added].filter(Boolean).join('\n');
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
