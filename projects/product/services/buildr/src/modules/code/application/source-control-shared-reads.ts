import type { CodeSourceControlResponse } from './source-control-model.ts';

const MAX_BYTES = 4 * 1024 * 1024;
type Entry = { repositoryId: string; signature: string; controller: AbortController; valid: boolean; pending?: Promise<CodeSourceControlResponse>; value?: CodeSourceControlResponse; expires: number; bytes: number };

/** Short-lived observations, never used by an authoritative/manual read. */
export class SourceControlSharedReads {
  private readonly entries = new Map<string, Entry>();
  private closed = false;
  private readonly maxAgeMs: number;
  constructor(maxAgeMs = 10_000) { this.maxAgeMs = maxAgeMs; }

  invalidate(repositoryIds?: string[]) {
    const ids = repositoryIds && new Set(repositoryIds);
    for (const [key, entry] of this.entries) if (!ids || ids.has(entry.repositoryId)) {
      entry.valid = false; entry.value = undefined; entry.bytes = 0;
      if (!entry.pending) this.entries.delete(key);
    }
  }

  async read(key: string, repositoryId: string, signature: string, load: (signal: AbortSignal) => Promise<CodeSourceControlResponse>): Promise<CodeSourceControlResponse> {
    if (this.closed) throw new Error('Shared observation is closed.');
    const previous = this.entries.get(key);
    if (previous) {
      if (previous.signature === signature && previous.valid) {
        if (previous.pending) return previous.pending;
        if (previous.value && previous.expires > Date.now()) return previous.value;
      }
      previous.valid = false;
      // A change during a read requires one subsequent check. Do not cancel useful work.
      if (previous.pending) {
        await previous.pending.catch(() => {});
        return this.read(key, repositoryId, signature, load);
      }
      this.entries.delete(key);
    }
    if (this.entries.size >= 128) {
      const idle = [...this.entries].find(([, entry]) => !entry.pending);
      if (idle) this.entries.delete(idle[0]);
      else throw Object.assign(new Error('共享代码观察读取已达上限。'), { code: 'code_watch_capacity', status: 429 });
    }
    const entry: Entry = {repositoryId, signature, controller: new AbortController(), valid: true, expires: 0, bytes: 0};
    this.entries.set(key, entry);
    const pending = Promise.resolve().then(() => load(entry.controller.signal)).then(value => {
      const bytes = Buffer.byteLength(JSON.stringify(value));
      if (entry.valid && !this.closed && !value.diagnostics.length && bytes <= MAX_BYTES) {
        for (const [otherKey, other] of this.entries) {
          if ([...this.entries.values()].reduce((sum, item) => sum + item.bytes, 0) + bytes <= MAX_BYTES) break;
          if (other !== entry && other.value) {
            other.valid = false; other.value = undefined; other.bytes = 0;
            if (!other.pending) this.entries.delete(otherKey);
          }
        }
        entry.value = value; entry.bytes = bytes; entry.expires = Date.now() + this.maxAgeMs;
      }
      return value;
    }).finally(() => {
      entry.pending = undefined;
      if (!entry.value && this.entries.get(key) === entry) this.entries.delete(key);
    });
    entry.pending = pending;
    return pending;
  }

  close() {
    this.closed = true;
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }
}
