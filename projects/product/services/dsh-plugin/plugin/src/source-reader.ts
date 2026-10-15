/** Local recorded source metadata and explicit reads of the original event content. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { TrajectoryRecordContext } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { SourceRecordResult } from './source-types.ts';
import { recordedSourceHasContent, recordedSourceKey, recordedSourceSummary } from './event-sources.ts';
export type SourceReadMode = 'marker' | 'content';
type SourceReadValue =
  | { readonly kind: 'queued' | 'loading'; readonly value: SourceRecordResult; readonly mode: SourceReadMode; readonly contentFailed?: true }
  | { readonly kind: 'settled'; readonly value: SourceRecordResult; readonly mode: SourceReadMode; readonly contentFailed?: true };
export type SourceReadState = SourceReadValue & { readonly revision: string };
export interface SourceReadSnapshot { readonly records: Readonly<Record<string, SourceReadState>> }
export interface SourceReader extends ObservableSnapshot<SourceReadSnapshot> {
  ensure(record: TrajectoryRecordContext): Promise<void>;
  /** Derive marks synchronously from already loaded metadata; never starts a Remote call. */
  ensureWindow(records: readonly TrajectoryRecordContext[]): void;
  releaseWindow(): void;
  refresh(record: TrajectoryRecordContext): Promise<void>;
  dispose(): void;
}
/** Actual source metadata participates in cache identity, without file or current-installation checks. */
export function sourceRecordKey(record: TrajectoryRecordContext): string {
  return recordedSourceKey(record);
}
interface ReadOperation { epoch: number; key: string; record: TrajectoryRecordContext; promise: Promise<void>; settle(): void }
export interface SourceReaderOptions { readonly maxCachedBodyBytes?: number; readonly maxCachedBodyRecords?: number }
export const SOURCE_BODY_CACHE_MAX_BYTES = 8 * 1024 * 1024;
export const SOURCE_BODY_CACHE_MAX_RECORDS = 32;
function bodyBytes(value: SourceRecordResult): number {
  // Conservatively count UTF-16 storage without encoding/copying whole body strings.
  return value.ready ? value.result.items.reduce((total, item) => total + item.objects.reduce((sum, object) =>
    sum + (object.observed.content?.length ?? 0) * 2, 0), 0) : 0;
}
/** One serial lane for explicitly selected original content. Latest selection takes priority. */
export function createSourceReader(query: (record: TrajectoryRecordContext) => Promise<SourceRecordResult>, options: SourceReaderOptions = {}): SourceReader {
  const maxBytes = options.maxCachedBodyBytes ?? SOURCE_BODY_CACHE_MAX_BYTES, maxRecords = options.maxCachedBodyRecords ?? SOURCE_BODY_CACHE_MAX_RECORDS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new TypeError('Invalid source body cache limits');
  let snapshot: SourceReadSnapshot = { records: {} }, disposed = false, epoch = 0;
  let active: ReadOperation | undefined;
  let selectedId: string | undefined, retainedBodyBytes = 0;
  const listeners = new Set<() => void>(), operations = new Map<string, ReadOperation>(), revisions = new Map<string, string>();
  const bodies = new Map<string, { readonly bytes: number; readonly record: TrajectoryRecordContext }>();
  const queued: ReadOperation[] = [];
  const notify = (): void => { for (const listener of listeners) listener(); };
  const local = (record: TrajectoryRecordContext): SourceRecordResult => recordedSourceSummary(record);
  const removeBody = (id: string): void => { const prior = bodies.get(id); if (prior) retainedBodyBytes -= prior.bytes; bodies.delete(id); };
  const touchBody = (id: string): void => { const prior = bodies.get(id); if (prior) { bodies.delete(id); bodies.set(id, prior); } };
  const clearBodies = (): void => { bodies.clear(); retainedBodyBytes = 0; selectedId = undefined; };
  const publish = (id: string, input: SourceReadValue, record?: TrajectoryRecordContext): void => {
    const revision = revisions.get(id);
    if (disposed || revision === undefined) return;
    let value = input;
    if (value.kind === 'settled' && value.mode === 'content' && record !== undefined) {
      const bytes = bodyBytes(value.value);
      removeBody(id);
      if (bytes > maxBytes) {
        const base = local(record);
        value = { kind: 'settled', mode: 'content', contentFailed: true, value: base.ready
          ? { ...base, diagnostics: [...(base.diagnostics ?? []), { code: 'source-content-limit', message: '' }] } : base };
      } else if (bytes > 0) {
        bodies.set(id, { bytes, record }); retainedBodyBytes += bytes;
      }
    } else if (value.mode === 'marker') removeBody(id);
    const next: Record<string, SourceReadState> = { ...snapshot.records, [id]: { ...value, revision } };
    while (bodies.size > maxRecords || retainedBodyBytes > maxBytes) {
      const victim = [...bodies.keys()].find(candidate => candidate !== selectedId);
      if (victim === undefined) break;
      const previous = bodies.get(victim)!;
      removeBody(victim);
      const state = next[victim];
      if (state !== undefined) next[victim] = { kind: 'settled', mode: 'marker', revision: state.revision, value: local(previous.record) };
    }
    snapshot = { records: next }; notify();
  };
  const drain = (): void => {
    if (disposed || active !== undefined) return;
    let next = queued.shift();
    while (next !== undefined && (next.epoch !== epoch || revisions.get(next.record.recordId) !== next.key)) {
      if (operations.get(next.key) === next) operations.delete(next.key);
      next.settle(); next = queued.shift();
    }
    if (next === undefined) return;
    const operation = next, id = operation.record.recordId;
    active = operation;
    publish(id, { kind: 'loading', mode: 'content', value: snapshot.records[id]?.value ?? local(operation.record) });
    const accept = (value: SourceRecordResult): void => {
      if (operation.epoch !== epoch || revisions.get(id) !== operation.key) return;
      const mismatch = value.ready && value.recordId !== id;
      const unsupported = value.ready && (value.result.schemaVersion !== 'buildr.dsh-event-source-result/v1' || value.marker?.status !== 'confirmed' || value.marker.basis !== 'recorded-source');
      if (!value.ready || mismatch || unsupported) {
        const previous = snapshot.records[id]?.value ?? local(operation.record), code = mismatch ? 'source-record-mismatch' : !value.ready ? value.code : 'source-content-unavailable';
        const retained = previous.ready ? { ...previous, diagnostics: [...(previous.diagnostics ?? []), { code, message: '' }] } : previous;
        publish(id, { kind: 'settled', mode: 'content', value: retained, contentFailed: true }, operation.record);
      } else publish(id, { kind: 'settled', mode: 'content', value }, operation.record);
    };
    void Promise.resolve().then(() => disposed || operation.epoch !== epoch
      ? { ready: false as const, code: 'source-withdrawn', message: '' } : query(operation.record)).then(accept,
      () => accept({ ready: false, code: 'source-content-unavailable', message: '' })).finally(() => {
      if (operations.get(operation.key) === operation) operations.delete(operation.key);
      active = undefined; operation.settle(); drain();
    });
  };
  const read = (record: TrajectoryRecordContext, refresh: boolean): Promise<void> => {
    if (disposed || listeners.size === 0) return Promise.resolve();
    selectedId = record.recordId;
    const key = sourceRecordKey(record), previous = snapshot.records[record.recordId], same = revisions.get(record.recordId) === key;
    if (!refresh && same && previous?.kind === 'settled' && previous.mode === 'content') { touchBody(record.recordId); return Promise.resolve(); }
    revisions.set(record.recordId, key);
    const pending = operations.get(key);
    if (pending !== undefined && pending.epoch === epoch) {
      if (active !== pending) { const index = queued.indexOf(pending); if (index >= 0) queued.splice(index, 1); queued.unshift(pending); }
      return pending.promise;
    }
    const base = local(record);
    if (base.marker?.status !== 'confirmed' || base.marker.basis !== 'recorded-source') {
      publish(record.recordId, { kind: 'settled', mode: 'marker', value: base }); return Promise.resolve();
    }
    if (!recordedSourceHasContent(record)) {
      publish(record.recordId, { kind: 'settled', mode: 'content', value: base }); return Promise.resolve();
    }
    let settle!: () => void; const promise = new Promise<void>(resolve => { settle = resolve; });
    const operation = { epoch, key, record, promise, settle }; operations.set(key, operation); queued.unshift(operation);
    publish(record.recordId, { kind: 'queued', mode: 'content', value: same && previous !== undefined ? previous.value : base });
    drain(); return promise;
  };
  const releaseConsumers = (): void => {
    if (disposed || listeners.size !== 0) return;
    epoch++; for (const operation of queued) operation.settle();
    queued.length = 0; operations.clear(); revisions.clear(); clearBodies(); snapshot = { records: {} };
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); if (listeners.size === 0) queueMicrotask(releaseConsumers); };
    },
    ensure: record => read(record, false),
    ensureWindow: records => {
      if (disposed || listeners.size === 0) return;
      const live = new Set<string>(), next: Record<string, SourceReadState> = {};
      for (const record of records) {
        const id = record.recordId, key = sourceRecordKey(record), previous = snapshot.records[id];
        live.add(id); revisions.set(id, key);
        if (previous?.revision === key) { next[id] = previous; continue; }
        const pending = operations.get(key);
        next[id] = { kind: pending === undefined ? 'settled' : active === pending ? 'loading' : 'queued', mode: pending === undefined ? 'marker' : 'content', value: local(record), revision: key };
      }
      for (const id of revisions.keys()) if (!live.has(id)) revisions.delete(id);
      for (const [id, body] of bodies) if (!live.has(id) || next[id]?.revision !== sourceRecordKey(body.record)) removeBody(id);
      for (let index = queued.length - 1; index >= 0; index--) {
        const operation = queued[index]!;
        if (revisions.get(operation.record.recordId) === operation.key) continue;
        queued.splice(index, 1); if (operations.get(operation.key) === operation) operations.delete(operation.key); operation.settle();
      }
      if (Object.keys(next).length !== Object.keys(snapshot.records).length || Object.entries(next).some(([id, state]) => snapshot.records[id] !== state)) {
        snapshot = { records: next }; notify();
      }
      drain();
    },
    releaseWindow: () => {},
    refresh: record => read(record, true),
    dispose: () => {
      disposed = true; epoch++; snapshot = { records: {} };
      for (const operation of queued) operation.settle();
      queued.length = 0; operations.clear(); revisions.clear(); clearBodies(); listeners.clear();
    },
  };
}
