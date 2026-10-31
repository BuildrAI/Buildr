import type { CodeSourceControlResponse } from './api/code-api';

type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
type Decoder<T> = (value: unknown) => T;
const PREFIX = 'buildr:source-control-cache:v1:';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACES = 4;
const MAX_AGE = 24 * 60 * 60 * 1000;

function invalid(): never { throw new TypeError('Invalid source-control cache'); }
const text: Decoder<string> = value => typeof value === 'string' ? value : invalid();
const boolean: Decoder<boolean> = value => typeof value === 'boolean' ? value : invalid();
const count: Decoder<number> = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const nullable = <T>(decode: Decoder<T>): Decoder<T | null> => value => value === null ? null : decode(value);
const optional = <T>(decode: Decoder<T>): Decoder<T | undefined> => value => value === undefined ? undefined : decode(value);
const list = <T>(decode: Decoder<T>): Decoder<T[]> => value => Array.isArray(value) ? Array.from(value, item => decode(item)) : invalid();
const oneOf = <T extends string>(...choices: T[]): Decoder<T> => value => choices.find(choice => choice === value) ?? invalid();
function object<S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<{ [K in keyof S]: ReturnType<S[K]> }> {
  return value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const input = value as Record<string, unknown>;
    // Whitelist browser data so future fields cannot persist bodies or credentials.
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const decoded = shape[key](Object.hasOwn(input, key) ? input[key] : undefined);
      if (decoded !== undefined) output[key] = decoded;
    }
    return output as { [K in keyof S]: ReturnType<S[K]> };
  };
}
const timestamp: Decoder<string> = value => {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result)) || Date.parse(result) < 0) return invalid();
  return result;
};
const nullableText = nullable(text);
const nullableCount = nullable(count);
const status = oneOf('complete', 'partial', 'unavailable');
const diagnostic = object({ code: text, message: text, repositoryId: nullableText, worktreeId: optional(nullableText) });
const diagnostics = list(diagnostic);
const coverage = object({ limit: count, truncated: boolean, nextCursor: nullableText });
const worktreeCoverage = object({ limit: count, total: nullableCount, read: count, truncated: boolean });
const source = nullable(object({
  repositoryId: text, worktreeId: optional(nullableText), taskId: nullableText, commitHash: nullableText,
  checkoutId: nullableText, worktreeGroupId: nullableText, location: text, version: text,
  kind: oneOf('default', 'task', 'worktree', 'commit'),
}));
const changeMetadata = object({
  repositoryId: text, worktreeId: nullableText, area: oneOf('unstaged', 'staged', 'untracked', 'working', 'commit'),
  path: text, previousPath: nullableText, kind: oneOf('tracked', 'untracked'),
  status: oneOf('modified', 'untracked', 'added', 'deleted', 'renamed', 'conflicted'),
  additions: nullableCount, deletions: nullableCount,
});
const changes = list((value: unknown) => ({ ...changeMetadata(value), preview: null, previewTruncated: false }));
const refs = { branch: nullableText, head: nullableText, upstream: nullableText, ahead: nullableCount, behind: nullableCount };
const worktree = object({
  worktreeId: text, name: text, location: text, isMain: boolean, isRegistered: boolean, available: boolean, source, status,
  ...refs, taskId: nullableText, taskTitle: nullableText, taskDiagnostic: nullableText,
  fileCount: nullableCount, changes, observedRevision: nullableText, readAt: timestamp,
  coverage: object({ fileLimit: count, truncated: boolean }), diagnostics,
});
const repository = object({
  id: text, code: text, name: text, location: text, available: boolean, gitId: nullableText, source, status,
  clone: nullable(object({ state: oneOf('cloning', 'failed'), diagnostic: nullableText, startedAt: nullableText })),
  ...refs, fileCount: nullableCount, changes, observedRevision: nullableText, diagnostics,
  worktrees: list(worktree), worktreeCount: nullableCount, worktreeCoverage,
});
// The return annotation also checks the projection against the real HTTP type.
const decodeData: Decoder<CodeSourceControlResponse> = object({
  readAt: timestamp, observedRevision: text, coverage, diagnostics, repositories: list(repository),
  selectedRepositoryIds: list(text), selectedWorktreeIds: list(text),
  selectedWorktrees: list(object({ repositoryId: text, worktreeId: text })), worktreeCoverage, scopeReason: text,
});
const decodeEnvelope = object({ version: count, workspaceId: text, savedAt: count, data: decodeData });
type Envelope = ReturnType<typeof decodeEnvelope>;

function browserStorage(): CacheStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
function validObservation(data: CodeSourceControlResponse, time: number): boolean {
  const observed = Date.parse(data.readAt);
  return observed <= time && time - observed < MAX_AGE
    && data.repositories.every(repository => repository.worktrees.every(worktree => Date.parse(worktree.readAt) <= time));
}

/** Untrusted, display-only metadata. A cache hit never confirms a live source. */
export function createSourceControlCache(workspaceId: string, storage: CacheStorage | undefined = browserStorage(), now: () => number = Date.now): {
  read(): CodeSourceControlResponse | null;
  write(data: CodeSourceControlResponse): void;
} {
  const key = PREFIX + workspaceId;
  const remove = (entryKey: string) => { try { storage?.removeItem(entryKey); } catch { /* Storage is optional. */ } };
  const currentTime = () => {
    const time = now();
    return Number.isFinite(time) && time >= 0 ? time : invalid();
  };
  const load = (entryKey: string, time: number): Envelope | null => {
    // Storage access failures are not a cache miss: writers must not replace a
    // potentially newer observation that they could not inspect.
    const raw = storage?.getItem(entryKey);
    try {
      if (raw == null) return null;
      if (raw.length > MAX_BYTES || byteLength(raw) > MAX_BYTES) return invalid();
      const entry = decodeEnvelope(JSON.parse(raw));
      if (entry.version !== 1 || PREFIX + entry.workspaceId !== entryKey || entry.savedAt > time
        || time - entry.savedAt >= MAX_AGE || !validObservation(entry.data, time)) return invalid();
      return entry;
    } catch {
      remove(entryKey);
      return null;
    }
  };
  // Evict oldest saves, not the most recently read entries: reading must not
  // renew an observation. Snapshot keys before deletion shifts Storage indices.
  const prune = (time: number) => {
    if (!storage) return;
    const keys: string[] = [];
    for (let index = 0, length = storage.length; index < length; index++) {
      const candidate = storage.key(index);
      if (candidate?.startsWith(PREFIX) && candidate !== key) keys.push(candidate);
    }
    const entries = keys.flatMap(candidate => {
      const entry = load(candidate, time);
      return entry ? [{ key: candidate, savedAt: entry.savedAt }] : [];
    }).sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key));
    for (const entry of entries.slice(0, Math.max(0, entries.length - (MAX_WORKSPACES - 1)))) remove(entry.key);
  };
  return {
    read() {
      if (!storage) return null;
      try { return load(key, currentTime())?.data ?? null; } catch { return null; }
    },
    write(data) {
      if (!storage) return;
      try {
        const time = currentTime();
        const projected = decodeData(data);
        // Re-read on every write, including writes from already-created pages.
        // localStorage has no compare-and-swap; this guards observed newer saves.
        let existing: Envelope | null;
        try { existing = load(key, time); } catch { return; }
        if (existing && Date.parse(existing.data.readAt) > Date.parse(projected.readAt)) return;
        if (!validObservation(projected, time)) { remove(key); return; }
        const serialized = JSON.stringify({ version: 1, workspaceId, savedAt: time, data: projected });
        if (byteLength(serialized) > MAX_BYTES) { remove(key); return; }
        storage.setItem(key, serialized);
        prune(time);
      } catch {
        // A failed replacement must not leave an older, apparently complete save.
        remove(key);
      }
    },
  };
}
