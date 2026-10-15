/** Original-event reader. Viewing never resolves an installation or queries current assets. */
import { BuildrBridgeError, objectRecord } from './bridge.ts';
import { parseSourceRecordRequest, recordedSourceResult } from './src/source-records.ts';
import type { SourceRecordEvent } from './src/source-records.ts';
import type { SourceRecordRequest, SourceRecordResult } from './src/source-types.ts';

export interface SourceGatewayDependencies {
  readEvents?(request: SourceEventReadRequest, signal: AbortSignal): Promise<unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface SourceEventReadRequest { readonly sessionId: string; readonly seqs: readonly number[] }
export interface SourceEventObservation extends Disposable {
  readonly header: { readonly id: string };
  readonly events: readonly unknown[];
}
/** Acquire one original public cut, clone only addressed events and always release its lease.
 * Cancellation races this whole operation, never the acquisition alone: a late acquired lease
 * still enters this try/finally before an aborted read is discarded.
 */
export async function readObservedSourceEvents(request: SourceEventReadRequest, signal: AbortSignal,
  observe: (sessionId: string, options: { readonly signal: AbortSignal; readonly projectionMode: 'none' }) => Promise<SourceEventObservation>): Promise<unknown> {
  if (request.seqs.length < 1 || request.seqs.length > 32 || new Set(request.seqs).size !== request.seqs.length
    || request.seqs.some(seq => !Number.isSafeInteger(seq) || seq < 0)) throw new BuildrBridgeError('source-invalid-record', '原事件地址无效。');
  signal.throwIfAborted();
  const observation = await observe(request.sessionId, { signal, projectionMode: 'none' });
  try {
    signal.throwIfAborted();
    if (observation.header.id !== request.sessionId) throw new BuildrBridgeError('source-event-mismatch', '原观察不属于所选会话。');
    const events = observation.events;
    const selected = request.seqs.map(seq => {
      signal.throwIfAborted();
      const event = objectRecord(events[seq]);
      if (event.seq !== seq || typeof event.type !== 'string') throw new BuildrBridgeError('source-event-mismatch', '所选原事件不存在。');
      return structuredClone(event);
    });
    return { session: { id: observation.header.id }, events: selected };
  } finally { observation[Symbol.dispose](); }
}
function failure(code: string, message: string): SourceRecordResult { return { ready: false, code, message }; }
function checkedEvents(value: unknown, request: SourceEventReadRequest): SourceRecordEvent[] {
  const batch = objectRecord(value), header = objectRecord(batch.session);
  if (header.id !== request.sessionId || !Array.isArray(batch.events) || batch.events.length !== request.seqs.length) {
    throw new BuildrBridgeError('source-event-mismatch', '查询结果不属于所选原事件，未关联其他记录。');
  }
  const events = new Map<number, unknown>();
  for (const raw of batch.events) {
    const event = objectRecord(raw);
    if (typeof event.seq !== 'number' || !request.seqs.includes(event.seq) || events.has(event.seq) || typeof event.type !== 'string') {
      throw new BuildrBridgeError('source-event-mismatch', '查询结果包含重复或无关原事件。');
    }
    events.set(event.seq, raw);
  }
  return request.seqs.map(seq => ({ sessionId: request.sessionId, event: events.get(seq) }));
}
function withCancellation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new BuildrBridgeError('source-cancelled', '原事件读取已取消。'));
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Detail content is fetched by exact original references; provenance is never reconstructed. */
export async function sourceRecord(request: SourceRecordRequest, dependencies: SourceGatewayDependencies): Promise<SourceRecordResult> {
  const caller = dependencies.signal ?? new AbortController().signal;
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) return failure('source-invalid-input', '原事件读取时间上限无效。');
  const deadline = new AbortController(), signal = AbortSignal.any([caller, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  try {
    const checked = parseSourceRecordRequest(request);
    signal.throwIfAborted();
    if (checked.record.transient || !checked.record.eventRefs.length) return failure('source-no-durable-record', '此记录尚无持久地址；未反查当前文件。');
    if (!dependencies.readEvents) return failure('source-reader-unavailable', '原事件观察接口不可用；已加载来源仍可查看。');
    const address = { sessionId: checked.sessionId, seqs: checked.record.eventRefs.map(ref => ref.seq) };
    const value = await withCancellation(dependencies.readEvents(address, signal), signal);
    const events = checkedEvents(value, address);
    signal.throwIfAborted();
    return recordedSourceResult(checked.record, events, checked.mode !== 'marker');
  } catch (error) {
    if (caller.aborted) return failure('source-cancelled', '原事件读取已取消。');
    if (deadline.signal.aborted) return failure('source-timeout', '原事件读取超时；已加载来源身份仍保留。');
    if (error instanceof BuildrBridgeError) return failure(error.code, error.message);
    return failure('source-unavailable', '原事件暂时不可读取；未查询当前安装或文件。');
  } finally { clearTimeout(timer); }
}
