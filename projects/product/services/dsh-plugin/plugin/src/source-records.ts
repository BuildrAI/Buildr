/** Exact original-record addresses and immutable event-source projections. No ownership lookup. */
import { BuildrBridgeError, objectRecord } from '../bridge.ts';
import { parseEventSources, recordedSourceSummary } from './event-sources.ts';
import type { EventSources, SourceDiagnostic, SourceParticipationOutcome, SourceRecordContext,
  SourceRecordRequest, SourceRecordResult } from './source-types.ts';

export interface SourceRecordEvent { readonly sessionId: string; readonly event: unknown }
const KINDS = ['system', 'user', 'context', 'compacted', 'message', 'tool', 'subtool'];
const MAX_REFS = 32;
const MAX_BODY_BYTES = 512 * 1024;
function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && Buffer.byteLength(value) <= 4096;
}
function reject(): never { throw new BuildrBridgeError('source-invalid-record', '原记录地址无效；未读取会话或文件。'); }

/** Client metadata is deliberately discarded: the Host reads the original event as authority. */
export function parseSourceRecordRequest(value: unknown): SourceRecordRequest {
  const request = objectRecord(value), record = objectRecord(request.record);
  if (!validText(request.sessionId) || !validText(record.recordId) || !KINDS.includes(String(record.kind))
    || (request.mode !== undefined && request.mode !== 'marker' && request.mode !== 'content')
    || typeof record.transient !== 'boolean' || !Array.isArray(record.eventRefs) || record.eventRefs.length > MAX_REFS) reject();
  const eventRefs: { sessionId: string; seq: number }[] = [], seen = new Set<number>();
  for (const raw of record.eventRefs) {
    const ref = objectRecord(raw);
    if (ref.sessionId !== request.sessionId || !Number.isSafeInteger(ref.seq) || Number(ref.seq) < 0 || seen.has(Number(ref.seq))) reject();
    seen.add(Number(ref.seq)); eventRefs.push({ sessionId: request.sessionId, seq: Number(ref.seq) });
  }
  const output: SourceRecordContext = { recordId: record.recordId, kind: record.kind as SourceRecordContext['kind'],
    eventRefs, transient: record.transient, ...optionalId(record, 'callId'), ...optionalId(record, 'parentCallId'), ...optionalId(record, 'rootCallId') };
  return { sessionId: request.sessionId, record: output, ...(request.mode === undefined ? {} : { mode: request.mode as 'marker' | 'content' }) };
}
function optionalId<K extends 'callId' | 'parentCallId' | 'rootCallId'>(record: Record<string, unknown>, key: K): Partial<Record<K, string>> {
  if (record[key] === undefined) return {};
  if (!validText(record[key])) reject();
  return { [key]: record[key] } as Partial<Record<K, string>>;
}
function compatibleCall(record: SourceRecordContext, event: Record<string, unknown>): boolean {
  const data = objectRecord(event.data);
  const message = objectRecord(data.message), source = objectRecord(message.source);
  const callId = event.type === 'tool/result' ? source.kind === 'tool' ? source.callId : message.toolCallId
    : event.type === 'tool/ptc-dispatch' ? data.subCallId : undefined;
  if (event.type === 'tool/result' && source.kind === 'tool' && typeof source.callId !== 'string') return false;
  if (callId !== undefined && record.callId !== undefined && callId !== record.callId) return false;
  if (event.type === 'tool/ptc-dispatch') {
    if (record.parentCallId !== undefined && data.parentCallId !== record.parentCallId) return false;
    if (record.rootCallId !== undefined && data.rootCallId !== record.rootCallId) return false;
  }
  return true;
}
function namespace(event: Record<string, unknown>): unknown {
  const data = objectRecord(event.data);
  if (event.type === 'user/message') return objectRecord(data.source).eventSources;
  if (event.type === 'system/message' || event.type === 'developer/message') return objectRecord(objectRecord(data.message).source).eventSources;
  return data.eventSources;
}
function outcome(event: Record<string, unknown>): SourceParticipationOutcome {
  const data = objectRecord(event.data);
  const sources = parseEventSources(namespace(event));
  if (event.type === 'tool/result') {
    const message = objectRecord(data.message);
    if (message.isError === true || data.error !== undefined) return 'failed';
    if (sources?.execution) return sources.execution.outcome;
    if (sources?.matches.some(match => match.kind === 'capability')) return 'unknown';
    return message.isError === false ? 'succeeded' : 'unknown';
  }
  if (event.type === 'tool/ptc-dispatch') {
    if (data.isError === true || data.error !== undefined) return 'failed';
    if (sources?.execution) return sources.execution.outcome;
    if (sources?.matches.some(match => match.kind === 'capability')) return 'unknown';
    return data.isError === false ? 'succeeded' : 'unknown';
  }
  if (event.type === 'user/message' || event.type === 'system/message' || event.type === 'developer/message') return 'succeeded';
  return 'unknown';
}

/** Collect only provenance actually carried by the addressed original events. */
export function recordedSourcesForEvents(record: SourceRecordContext, events: readonly SourceRecordEvent[]): SourceRecordContext {
  const entries: NonNullable<SourceRecordContext['eventSources']>[number][] = [];
  const refs = new Set(record.eventRefs.map(ref => ref.sessionId + ':' + ref.seq));
  for (const located of events) {
    const event = objectRecord(located.event);
    if (!Number.isSafeInteger(event.seq) || !refs.has(located.sessionId + ':' + event.seq) || !compatibleCall(record, event)) {
      throw new BuildrBridgeError('source-event-mismatch', '原事件引用或调用关系不一致，未关联其他记录。');
    }
    const sources = namespace(event);
    if (sources !== undefined) entries.push({ seq: Number(event.seq), sources: sources as EventSources, outcome: outcome(event) });
  }
  return { ...record, eventSources: entries };
}

function textBlocks(event: Record<string, unknown>): readonly unknown[] {
  const data = objectRecord(event.data);
  const content = event.type === 'user/message' || event.type === 'tool/ptc-dispatch' ? data.content : objectRecord(data.message).content;
  return Array.isArray(content) ? content : [];
}
function validBoundary(text: string, index: number): boolean {
  return !(index > 0 && index < text.length && /[\uD800-\uDBFF]/.test(text[index - 1]!) && /[\uDC00-\uDFFF]/.test(text[index]!));
}

/** Explicit detail reads slice Buildr's own rule/skill text from the original event, never current files. */
export function recordedSourceResult(record: SourceRecordContext, events: readonly SourceRecordEvent[], includeContent: boolean): SourceRecordResult {
  const metadata = recordedSourceSummary(recordedSourcesForEvents(record, events));
  if (!includeContent || !metadata.ready) return metadata;
  // The shared local projection remains body-free. Only objects about to receive an original
  // fragment are copied; no JSON or whole event body is duplicated to construct the detail DTO.
  const summary = { ...metadata, result: { ...metadata.result, items: metadata.result.items.map(item => ({ ...item,
    objects: item.objects.map(object => ({ ...object, observed: { ...object.observed } })) })) } };
  const diagnostics: SourceDiagnostic[] = [...(summary.diagnostics ?? [])];
  let remaining = MAX_BODY_BYTES;
  for (const located of events) {
    const event = objectRecord(located.event), sources = parseEventSources(namespace(event));
    if (!sources) continue;
    const blocks = textBlocks(event);
    for (const match of sources.matches) {
      if (match.providedBy !== 'buildr' || match.kind === 'capability' || match.completeness === 'none' || !match.contentRefs?.length) continue;
      const item = summary.result.items.find(item => item.id === record.recordId + ':event:' + event.seq + ':' + match.identity);
      if (!item) continue;
      const fragments: string[] = [];
      let valid = true;
      for (const ref of match.contentRefs) {
        const block = objectRecord(blocks[ref.block]);
        if (block.type !== 'text' || typeof block.text !== 'string' || ref.end > block.text.length
          || !validBoundary(block.text, ref.start) || !validBoundary(block.text, ref.end)) { valid = false; break; }
        fragments.push(block.text.slice(ref.start, ref.end));
      }
      const content = fragments.join('\n\n'), bytes = Buffer.byteLength(content);
      if (!valid || bytes > remaining) {
        diagnostics.push({ code: !valid ? 'source-content-reference-invalid' : 'source-content-limit',
          message: !valid ? '当次正文片段引用不可读取，已保存的来源身份仍保留。' : '当次正文超过查看上限，仍可在原记录查看。' });
        continue;
      }
      remaining -= bytes;
      for (const object of item.objects) object.observed = { ...object.observed, content };
    }
  }
  return { ...summary, ...(diagnostics.length ? { diagnostics: [...new Map(diagnostics.map(item => [item.code, item])).values()] } : {}) };
}
