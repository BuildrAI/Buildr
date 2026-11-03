import type { ConversationEntry } from './contracts.ts';

/** Private storage addresses, never part of a public conversation or model prompt. */
export interface NativeContentSource {
  path: string; offset: number; length: number; sha256: string;
  codec: 'json' | 'json-zstd' | 'bytes'; line?: number;
}
export interface NativeContentValue {
  source: NativeContentSource; pointer: Array<string | number>;
  /** A JSON document stored inside a native string (for example Codex arguments). */
  jsonPointer?: Array<string | number>;
  format?: 'json' | 'json-document' | 'base64' | 'quoted' | 'shell-double' | 'shell-single' | 'shell-posix'; start?: number; length?: number;
}
export type NativeTextPart = NativeContentValue | { literal: string; residual?: true } | { input: true };
export interface NativeToolContent {
  version: 1 | 2; provider: string; contextId: string;
  nativeId?:string;
  entry: ConversationEntry; text: NativeTextPart[]; input?: NativeTextPart[];
}
export interface NativeAttachmentContent {
  version: 1; provider: string; contextId: string;
  value: NativeContentValue; sha256: string; size: number;
}
export interface NativeContentContext { root: string; configRoot: string; contextId: string; cwd: string }
export interface NativeContentRecord {
  source: NativeContentSource; value: unknown; toolIds: string[];executionId?:string;input?:boolean;
}
export interface NativeContentInventory {
  records: NativeContentRecord[];
  images: Array<{ value: NativeContentValue; mimeType?: string }>;
  /** All source files used to rule out already-issued local path dependencies. */
  sourcePaths: string[];
}
