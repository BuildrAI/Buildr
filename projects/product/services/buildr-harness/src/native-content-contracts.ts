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
  version: 1 | 2 | 3; provider: string; contextId: string;
  nativeId?:string;
  session?: { config: string; cwd: string; turnId?: string; parentToolId?: string };
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
export interface NativeSessionRoot {
  /** Directory relative to the executor's configRoot (e.g. 'codex-home/sessions'). */
  relative: string;
  /** Matches the exact session transcript file(s) for a known contextId. */
  matchSessionFile(file: string, contextId: string): boolean;
  /** Matches candidate session transcript files during historical maintenance scan. */
  matchAnySessionFile(file: string): boolean;
  /** Extracts contextId from a candidate session transcript file during maintenance scan. */
  extractContextId(file: string): string | undefined;
  /** Optional traversal depth override for resolver scan (defaults to 5). */
  depth?: number;
  /** Optional traversal depth override for maintenance scan (defaults to 6). */
  maintenanceDepth?: number;
}
export interface ExecutorNativeContentSpec {
  /** Allowed local path pattern relative to the connection/account config directory. */
  allowedPath: RegExp;
  /** Optional account-owned config prefix under agent-service root (with trailing '/'). */
  accountConfigPrefix?: string;
  /** Context ID format for semantic v3 tool references (defaults to UUID v4 pattern). */
  contextIdPattern?: RegExp;
  /** True when executionRef.id is not persisted as the native turn/prompt filter. */
  omitExecutionTurnId?: boolean;
  /** True when maintenance should also index normalized command hashes for historical lookup. */
  indexCommands?: boolean;
  /** Session transcript roots relative to configRoot (omitted if executor has no JSONL inventory). */
  sessionRoots?: readonly NativeSessionRoot[];
  /** Locate durable native content inventory without opening a runtime. */
  inventory?(input: NativeContentContext): NativeContentInventory | undefined;
  /** Read full tool detail from a semantic v3 reference. */
  readTool(root: string, reference: NativeToolContent): ConversationEntry | undefined;
}
export type ExecutorNativeContent =
  ((input: NativeContentContext) => NativeContentInventory | undefined) & ExecutorNativeContentSpec;

export function defineNativeContent(
  spec: ExecutorNativeContentSpec,
): ((input: NativeContentContext) => NativeContentInventory | undefined) & ExecutorNativeContentSpec {
  const fn = (input: NativeContentContext) => spec.inventory?.(input);
  return Object.assign(fn, spec);
}
export function resolveNativeContentSpec(value: ExecutorNativeContent | undefined): ExecutorNativeContentSpec | undefined {
  if (!value) return undefined;
  if (typeof value === 'function') {
    return {
      allowedPath: value.allowedPath,
      ...(value.accountConfigPrefix ? { accountConfigPrefix: value.accountConfigPrefix } : {}),
      ...(value.contextIdPattern ? { contextIdPattern: value.contextIdPattern } : {}),
      ...(value.omitExecutionTurnId ? { omitExecutionTurnId: value.omitExecutionTurnId } : {}),
      ...(value.indexCommands ? { indexCommands: value.indexCommands } : {}),
      ...(value.sessionRoots ? { sessionRoots: value.sessionRoots } : {}),
      inventory: value.inventory ?? value,
      readTool: value.readTool,
    };
  }
  return value;
}
