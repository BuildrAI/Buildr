import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import type { ConversationEntry } from '../contracts.ts';
import type { NativeAttachmentContent, NativeContentSource, NativeContentValue, NativeTextPart, NativeToolContent } from '../native-content-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

export const nativeContentHash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const maxNativeSourceBytes = 32 * 1024 * 1024;
const maxDecoded = 128 * 1024 * 1024, cacheBudget = 32 * 1024 * 1024;
const roots: Record<string, RegExp> = {
  codex: /^codex-home\/sessions\/.+\.jsonl$/,
  qoder: /^qoder-config\/projects\/.+\.jsonl$/,
  dsh: /^dsh-home\/(?:sessions\/.+\/(?:session\.v4\.jsonl(?:\.zstd)?|attachments\/.+)|attachments\/v1\/objects\/[a-f0-9]{2}\/[a-f0-9]{64})$/,
};
const unavailable = () => new AgentServiceError('agent_native_content_unavailable', '原生正文缺失、变化或不可安全读取；已保留来源引用，不会重发操作。', 409);

/** Pure display transforms, never interpreted as executable shell input. */
export function nativeValueText(value: unknown, format?: NativeContentValue['format']): string {
  if (format === 'json') return JSON.stringify(value);
  if (format === 'json-document') return JSON.stringify(JSON.parse(String(value)));
  if (typeof value !== 'string') throw unavailable();
  if (format === 'quoted') return JSON.stringify(value);
  if (format === 'shell-double') return '"' + value.replace(/[\\"]/g, '\\$&') + '"';
  if (format === 'shell-single') return "'" + value.replace(/'/g, "'\\''") + "'";
  if (format === 'shell-posix') return "'" + value.replace(/'/g, "'\"'\"'") + "'";
  if (format !== undefined && format !== 'base64') throw unavailable();
  return value;
}

/** A stored address grants access only to a declared native content namespace. */
export function nativeContentPath(root: string, provider: string, relative: string): string {
  if (!roots[provider] || typeof relative !== 'string' || relative.includes('\\') || path.isAbsolute(relative)) throw unavailable();
  const prefix = `connections/${provider}/`;
  if (!relative.startsWith(prefix)) throw unavailable();
  const local = relative.slice(prefix.length).replace(/^model-bindings\/[a-f0-9]{64}\//, '');
  if (!roots[provider]!.test(local) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw unavailable();
  let current = root;
  for (const part of ['', ...relative.split('/')]) {
    if (part) current = path.join(current, part);
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink() || process.getuid && info.uid !== process.getuid() ||
      (current === path.join(root, relative) ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) throw unavailable();
  }
  return current;
}

/** Encoding/fragment validation is shared; adapters alone interpret native records during discovery. */
export class NativeContentReader {
  private readonly root: string;
  private readonly cache = new Map<string, { identity: string; value: unknown; bytes: number }>();
  private cacheBytes = 0;
  constructor(root: string) { this.root = path.resolve(root); }
  private source(provider: string, source: NativeContentSource): unknown {
    if (!source || !Number.isSafeInteger(source.offset) || source.offset < 0 || !Number.isSafeInteger(source.length) || source.length < 1 ||
      source.length > maxNativeSourceBytes || !/^[a-f0-9]{64}$/.test(source.sha256)) throw unavailable();
    const file = nativeContentPath(this.root, provider, source.path), before = fs.lstatSync(file);
    if (source.offset + source.length > before.size) throw unavailable();
    const identity = JSON.stringify([before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs]);
    const key = JSON.stringify([provider, source]);
    const cached = this.cache.get(key);
    if (cached?.identity === identity) { this.cache.delete(key); this.cache.set(key, cached); return cached.value; }
    if (cached) { this.cache.delete(key); this.cacheBytes -= cached.bytes; }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(fd);
      if (opened.dev !== before.dev || opened.ino !== before.ino || !opened.isFile() || opened.nlink !== 1) throw unavailable();
      bytes = Buffer.alloc(source.length); let read = 0;
      while (read < bytes.length) { const n = fs.readSync(fd, bytes, read, bytes.length - read, source.offset + read); if (!n) throw unavailable(); read += n; }
      const after = fs.fstatSync(fd);
      if (after.dev !== opened.dev || after.ino !== opened.ino || after.size < source.offset + source.length ||
        fs.lstatSync(file).ino !== opened.ino || nativeContentHash(bytes) !== source.sha256) throw unavailable();
    } finally { fs.closeSync(fd); }
    let value: unknown, decoded = bytes.length;
    if (source.codec === 'bytes') value = bytes;
    else {
      if (!['json', 'json-zstd'].includes(source.codec)) throw unavailable();
      const raw = source.codec === 'json-zstd' ? zstdDecompressSync(bytes, { maxOutputLength: maxDecoded }) : bytes;
      decoded = raw.length;
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      if (source.line !== undefined && (!Number.isSafeInteger(source.line) || source.line < 0)) throw unavailable();
      value = JSON.parse(source.line === undefined ? text : text.split('\n')[source.line]!);
    }
    if (decoded <= cacheBudget) {
      while (this.cache.size >= 128 || this.cacheBytes + decoded > cacheBudget) {
        const first = this.cache.keys().next().value; if (first === undefined) break;
        this.cacheBytes -= this.cache.get(first)!.bytes; this.cache.delete(first);
      }
      this.cache.set(key, { identity, value, bytes: decoded }); this.cacheBytes += decoded;
    }
    return value;
  }
  private value(provider: string, reference: NativeContentValue): string | Buffer {
    let value = this.source(provider, reference.source);
    const walk = (pointer: Array<string | number>) => {
    if (!Array.isArray(pointer) || pointer.length > 64) throw unavailable();
    for (const key of pointer) {
      if (typeof key !== 'string' && !Number.isSafeInteger(key) || ['__proto__', 'prototype', 'constructor'].includes(String(key)) ||
        value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw unavailable();
      value = (value as Record<string, unknown>)[key];
    }
    };
    walk(reference.pointer);
    if (reference.jsonPointer !== undefined) {
      if (typeof value !== 'string' || Buffer.byteLength(value) > maxDecoded) throw unavailable();
      value = JSON.parse(value); walk(reference.jsonPointer);
    }
    if (Buffer.isBuffer(value)) return value;
    let text = nativeValueText(value, reference.format);
    const start = reference.start ?? 0, length = reference.length ?? text.length - start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > text.length) throw unavailable();
    text = text.slice(start, start + length);
    return reference.format === 'base64' ? Buffer.from(text, 'base64') : text;
  }
  private text(provider: string, parts: NativeTextPart[], input?: string): string {
    if (!Array.isArray(parts) || parts.length > 256) throw unavailable();
    const values = parts.map(part => {
      if ('literal' in part) { if (typeof part.literal !== 'string' || Buffer.byteLength(part.literal) > 512) throw unavailable(); return part.literal; }
      if ('input' in part) { if (part.input !== true || input === undefined) throw unavailable(); return input; }
      const value = this.value(provider, part); if (typeof value !== 'string') throw unavailable(); return value;
    });
    if (values.reduce((sum, value) => sum + Buffer.byteLength(value), 0) > maxDecoded) throw unavailable();
    return values.join('');
  }
  tool(reference: NativeToolContent, revision: string): ConversationEntry {
    try {
      if (![1, 2].includes(reference.version) || typeof reference.contextId !== 'string' || reference.entry.kind !== 'tool') throw unavailable();
      const entry = structuredClone(reference.entry);
      if (reference.input) entry.input = this.text(reference.provider, reference.input);
      entry.text = this.text(reference.provider, reference.text, entry.input);
      if (nativeContentHash(JSON.stringify(entry)) !== revision) throw unavailable();
      return entry;
    } catch { throw unavailable(); }
  }
  attachment(reference: NativeAttachmentContent): Buffer {
    try {
      if (reference.version !== 1 || !Number.isSafeInteger(reference.size) || reference.size < 1 || reference.size > maxNativeSourceBytes) throw unavailable();
      const value = this.value(reference.provider, reference.value);
      if (!Buffer.isBuffer(value) || value.length !== reference.size || nativeContentHash(value) !== reference.sha256) throw unavailable();
      return Buffer.from(value);
    } catch { throw unavailable(); }
  }
}
