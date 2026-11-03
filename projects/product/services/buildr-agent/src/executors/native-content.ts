import fs from 'node:fs';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import type { ConversationEntry } from '../contracts.ts';
import type { NativeContentContext, NativeContentInventory, NativeContentRecord, NativeContentSource, NativeContentValue, NativeTextPart, NativeToolContent } from '../native-content-contracts.ts';
import { maxNativeSourceBytes, nativeContentHash, nativeContentPath, NativeContentReader } from '../storage/native-content.ts';
import { safeStoragePath } from '../storage/files.ts';
import { nativePreview } from './native-process.ts';

export interface NativeJsonRow { source: NativeContentSource; value: any }
export function nativeContentFiles(input: NativeContentContext, directory: string, matches: (file: string) => boolean, depth = 5): string[] {
  const result: string[] = []; let visited = 0;
  const walk = (dir: string, remaining: number) => {
    if (++visited > 10000 || !remaining || !safeStoragePath(input.root, dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file, remaining - 1);
      else if (item.isFile() && matches(file)) result.push(file);
    }
  };
  walk(directory, depth); return visited > 10000 ? [] : result;
}

/** Preserve byte offsets and exact compressed frames; no new native files or SDK processes. */
export function nativeContentRows(input: NativeContentContext, provider: string, file: string): NativeJsonRow[] {
  const relative = path.relative(input.root, file).split(path.sep).join('/');
  nativeContentPath(input.root, provider, relative);
  const before = fs.lstatSync(file);
  if (before.size > 64 * 1024 * 1024) return [];
  const descriptor=fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW??0));
  let bytes:Buffer;
  try {
    const opened=fs.fstatSync(descriptor);
    if (opened.dev!==before.dev || opened.ino!==before.ino || opened.size!==before.size || opened.nlink!==1 || !opened.isFile()) return [];
    const buffer=Buffer.alloc(before.size+1); let length=0;
    while (length<buffer.length) {
      const read=fs.readSync(descriptor,buffer,length,buffer.length-length,length);
      if (!read) break;
      length+=read;
    }
    if (length!==before.size) return [];
    bytes=buffer.subarray(0,length);
  } finally { fs.closeSync(descriptor); }
  const result: NativeJsonRow[] = [];
  const lines = (buffer: Buffer, base: number, frame?: NativeContentSource) => {
    let start = 0, line = 0;
    while (start < buffer.length) {
      const end = buffer.indexOf(10, start); if (end < 0) throw new Error('native_content_partial_line');
      const raw = buffer.subarray(start, end);
      if (raw.length && raw.length <= maxNativeSourceBytes) {
        const source: NativeContentSource = frame ? { ...frame, line } : {
          path: relative, offset: base + start, length: raw.length, sha256: nativeContentHash(raw), codec: 'json',
        };
        result.push({ source, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) });
      }
      start = end + 1; line++;
      if (result.length > 100000) throw new Error('native_content_row_budget');
    }
  };
  if (file.endsWith('.zstd')) {
    let offset = 0, decoded = 0;
    while (offset < bytes.length) {
      const frame = zstdDecompressSync(bytes.subarray(offset), { info: true, maxOutputLength: 128 * 1024 * 1024 - decoded }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
      const length = frame.engine.bytesWritten;
      if (!length || length > maxNativeSourceBytes) return [];
      decoded += frame.buffer.length;
      lines(frame.buffer, 0, { path: relative, offset, length, codec: 'json-zstd', sha256: nativeContentHash(bytes.subarray(offset, offset + length)) });
      offset += length;
    }
  } else lines(bytes, 0);
  const after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return [];
  return result;
}

/** Image bytes are admitted only from explicit native image content, never prose or file paths. */
export function nativeContentImages(row: NativeJsonRow, pointer: Array<string | number>, content: unknown): NativeContentInventory['images'] {
  if (!Array.isArray(content)) return [];
  return content.flatMap<NativeContentInventory['images'][number]>((part: any, index) => {
    const base = [...pointer, index];
    if (part?.type === 'image' && part.source?.type === 'base64' && typeof part.source.data === 'string') {
      return [{ value: { source: row.source, pointer: [...base, 'source', 'data'], format: 'base64' as const }, mimeType: part.source.media_type }];
    }
    if (part?.type === 'input_image' && typeof part.image_url === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(part.image_url)) {
      const start = part.image_url.indexOf(',') + 1;
      return [{ value: { source: row.source, pointer: [...base, 'image_url'], start, format: 'base64' as const } }];
    }
    return [];
  });
}

function matchingText(text: string, records: NativeContentRecord[]): NativeTextPart[] | undefined {
  let visited = 0;
  for (const record of records) {
    const walk = (value: any, pointer: Array<string | number>, depth: number): NativeTextPart[] | undefined => {
      if (++visited > 100000 || depth > 32) return;
      const candidates: Array<{ text: string; format?: NativeContentValue['format'] }> = [];
      if (typeof value === 'string') {
        candidates.push({ text: value });
        try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') candidates.push({ text: JSON.stringify(parsed), format: 'json-document' }); } catch { /* Ordinary native strings. */ }
      } else if (value && typeof value === 'object') candidates.push({ text: JSON.stringify(value), format: 'json' });
      for (const candidate of candidates) {
        if (!text.length) continue;
        const start = candidate.text.indexOf(text);
        if (start >= 0) return [{ source: record.source, pointer, format: candidate.format, start, length: text.length }];
        if (nativePreview(candidate.text) === text) {
          const length = candidate.text.charCodeAt(15999) >= 0xd800 && candidate.text.charCodeAt(15999) <= 0xdbff ? 15999 : 16000;
          return [{ source: record.source, pointer, format: candidate.format, start: 0, length }, { literal: text.slice(length) }];
        }
      }
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
        const found = walk(child, [...pointer, Array.isArray(value) ? Number(key) : key], depth + 1); if (found) return found;
      }
      return;
    };
    const found = walk(record.value, [], 0); if (found) return found;
  }
  return text === '' ? [] : undefined;
}

/** Content equality is the final authority; format differences keep the existing local body. */
export function nativeToolReference(root: string, provider: string, contextId: string, nativeId: string, entry: ConversationEntry, inventory: NativeContentInventory): NativeToolContent | undefined {
  const records = inventory.records.filter(record => record.toolIds.includes(nativeId));
  if (!records.length || entry.kind !== 'tool' || entry.parentToolId) return;
  const input = entry.input === undefined ? undefined : matchingText(entry.input, records);
  if (entry.input !== undefined && !input) return;
  let text = matchingText(entry.text, records);
  if (!text && entry.input && entry.text.startsWith(entry.input + '\n')) {
    const remainder = matchingText(entry.text.slice(entry.input.length + 1), records);
    if (remainder) text = [{ input: true }, { literal: '\n' }, ...remainder];
  }
  if (!text) {
    const split = entry.text.indexOf('\n');
    if (split >= 0 && Buffer.byteLength(entry.text.slice(0, split + 1)) <= 512) {
      const remainder = matchingText(entry.text.slice(split + 1), records);
      if (remainder) text = [{ literal: entry.text.slice(0, split + 1) }, ...remainder];
    }
  }
  if (!text && Buffer.byteLength(entry.text) <= 512) text = [{ literal: entry.text }];
  if (!text) return;
  const skeleton = { ...entry, text: '' }; if (input) skeleton.input = '';
  const reference: NativeToolContent = { version: 1, provider, contextId, entry: skeleton, text, ...(input ? { input } : {}) };
  try { new NativeContentReader(root).tool(reference, nativeContentHash(JSON.stringify(entry))); return reference; } catch { return; }
}
