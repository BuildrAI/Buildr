import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSourceRecordRequest, recordedSourcesForEvents, recordedSourceResult } from '../../plugin/src/source-records.ts';
import { recordedSourceSummary } from '../../plugin/src/event-sources.ts';
import type { EventSourceMatch, EventSources, SourceRecordContext, SourceRecordResult } from '../../plugin/src/source-types.ts';
const record: SourceRecordContext = { recordId: 'original-tool', kind: 'tool', eventRefs: [{ sessionId: 's', seq: 10 }], callId: 'c', transient: false };
const located = (event: unknown, sessionId = 's') => ({ sessionId, event });
function method(options: Partial<EventSourceMatch> = {}): EventSourceMatch {
 return { providedBy: 'buildr', kind: 'rule', identity: 'buildr:rule:original', name: 'Captured rule', action: 'read',
  locator: { path: '/captured/AGENTS.md' }, evidence: [{ authority: 'producer-receipt', identity: 'receipt' }],
  observedVersion: { algorithm: 'sha256', digest: 'a'.repeat(64), target: 'content' }, completeness: 'partial', contentRefs: [{ block: 0, start: 0, end: 6, unit: 'utf16' }], ...options };
}
function metadata(matches = [method()], execution?: EventSources['execution']): EventSources {
 return { schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches, ...(execution ? { execution } : {}) };
}
function native(sources: unknown = metadata(), content: readonly unknown[] = [{ type: 'text', text: 'Method' }], data: Record<string, unknown> = {}) {
 return { seq: 10, type: 'tool/result', data: { message: { toolCallId: 'c', isError: false, content }, eventSources: sources, ...data } };
}
function ready(value: SourceRecordResult): Extract<SourceRecordResult, { ready: true }> { if (!value.ready) assert.fail(value.code); return value; }

test('record requests retain exact original addresses and discard client provenance, paths and extra bodies', () => {
 const input = { sessionId: 's', mode: 'content', record: { ...record, eventSources: [{ seq: 10, sources: { ...metadata(), content: 'PRIVATE CLIENT BODY' } }], arbitraryPath: '/private' }, arbitraryPath: '/private' };
 assert.deepEqual(parseSourceRecordRequest(input), { sessionId: 's', mode: 'content', record });
 for (const mode of [undefined, 'marker', 'content']) assert.equal(parseSourceRecordRequest({ sessionId: 's', record, mode }).mode, mode);
});

test('synthetic, duplicate, foreign and oversized record addresses are rejected', () => {
 for (const changes of [
  { eventRefs: [{ sessionId: 's', seq: 1.5 }] }, { eventRefs: [{ sessionId: 'other', seq: 10 }] }, { eventRefs: [{ sessionId: 's', seq: -1 }] },
  { eventRefs: [record.eventRefs[0], record.eventRefs[0]] }, { eventRefs: Array.from({ length: 33 }, (_, seq) => ({ sessionId: 's', seq })) },
  { callId: '/private\0bad' }, { parentCallId: '' }, { rootCallId: 'x'.repeat(4097) }, { kind: 'buildr' }, { transient: 'false' },
 ]) assert.throws(() => parseSourceRecordRequest({ sessionId: 's', record: { ...record, ...changes } }), { code: 'source-invalid-record' });
 assert.throws(() => parseSourceRecordRequest({ sessionId: 's', record, mode: 'current' }), { code: 'source-invalid-record' });
 assert.deepEqual(parseSourceRecordRequest({ sessionId: 's', record: { ...record, transient: true, eventRefs: [] } }).record.eventRefs, []);
});

test('native, user, system, developer and PTC metadata come from their actual persisted namespaces', () => {
 const sources = metadata(), message = { source: { kind: 'agent-instructions', eventSources: sources }, content: [{ type: 'text', text: 'Method' }] };
 for (const event of [native(sources), { seq: 10, type: 'user/message', data: message },
  { seq: 10, type: 'system/message', data: { message } }, { seq: 10, type: 'developer/message', data: { message } },
  { seq: 10, type: 'tool/ptc-dispatch', data: { subCallId: 'c', parentCallId: 'parent', rootCallId: 'root', isError: false, content: message.content, eventSources: sources } },
 ]) {
  const context = event.type === 'tool/ptc-dispatch' ? { ...record, kind: 'subtool' as const, parentCallId: 'parent', rootCallId: 'root' } : record;
  const result = ready(recordedSourceResult(context, [located(event)], true));
  assert.equal(result.marker?.basis, 'recorded-source'); assert.equal(result.result.items[0]?.objects[0]?.observed.content, 'Method'); assert.equal(result.participation?.[0]?.outcome, 'succeeded');
 }
 const wrong = native(); delete (wrong.data as { eventSources?: unknown }).eventSources;
 Object.assign(wrong.data, { meta: { eventSources: sources }, source: { eventSources: sources } });
 assert.deepEqual(ready(recordedSourceResult(record, [located(wrong)], true)).diagnostics?.map(item => item.code), ['source-not-captured']);
});

test('uncollected, unknown, malformed and non-Buildr events are distinct and prose never supplies provenance', () => {
 const absent = native(); delete (absent.data as { eventSources?: unknown }).eventSources;
 for (const item of [
  { event: absent, status: 'unknown', codes: ['source-not-captured'] },
  { event: native({ schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] }), status: 'unknown', codes: [] },
  { event: native({ ...metadata(), content: 'PRIVATE EMBEDDED BODY' }), status: 'unknown', codes: ['source-metadata-invalid'] },
  { event: native(metadata([method({ providedBy: 'workspace', name: 'Buildr AGENTS.md' })])), status: 'not-applicable', codes: [] },
 ]) {
  const value = ready(recordedSourceResult(record, [located(item.event)], true));
  assert.equal(value.marker?.status, item.status); assert.deepEqual(value.diagnostics?.map(item => item.code) ?? [], item.codes); assert.deepEqual(value.result.items, []); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
 }
});

test('source mapping rejects another sequence, session, tool result or child ancestry', () => {
 const otherCall = native(); otherCall.data.message.toolCallId = 'other';
 const child = { ...record, kind: 'subtool' as const, parentCallId: 'parent', rootCallId: 'root' };
 const ptc = { seq: 10, type: 'tool/ptc-dispatch', data: { subCallId: 'c', parentCallId: 'parent', rootCallId: 'root', eventSources: metadata() } };
 for (const [context, event] of [
  [record, located({ ...native(), seq: 11 })], [record, located(native(), 'foreign')], [record, located(otherCall)],
  [child, located({ ...ptc, data: { ...ptc.data, parentCallId: 'other' } })], [child, located({ ...ptc, data: { ...ptc.data, rootCallId: 'other' } })],
 ] as const) assert.throws(() => recordedSourcesForEvents(context, [event]), { code: 'source-event-mismatch' });
});

test('content slices original UTF-16 blocks and excludes surrounding material; marker mode is body-free', () => {
 const prefix = 'PRIVATE USER PREFIX\n', text = 'Buildr method 😀', suffix = '\nPRIVATE USER SUFFIX';
 const match = method({ contentRefs: [{ block: 0, start: prefix.length, end: prefix.length + text.length, unit: 'utf16' }, { block: 2, start: 2, end: 6, unit: 'utf16' }] });
 const original = native(metadata([match]), [{ type: 'text', text: prefix + text + suffix }, { type: 'image', attachment: 'opaque' }, { type: 'text', text: 'xxmoreyy' }]), before = JSON.stringify(original);
 const marker = ready(recordedSourceResult(record, [located(original)], false)), value = ready(recordedSourceResult(record, [located(original)], true));
 assert.equal(marker.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(value.result.items[0]?.objects[0]?.observed.content, text + '\n\nmore');
 assert.equal(JSON.stringify(value).includes('PRIVATE USER'), false); assert.equal(value.result.items[0]?.objects[0]?.current, null); assert.equal(JSON.stringify(original), before);
 assert.deepEqual(marker.marker, value.marker); assert.equal(value.result.schemaVersion, 'buildr.dsh-event-source-result/v1');
});

test('invalid block, range and surrogate boundaries withhold only that method body and preserve other objects', () => {
 for (const ref of [
  { block: 3, start: 0, end: 1, unit: 'utf16' as const }, { block: 1, start: 0, end: 1, unit: 'utf16' as const }, { block: 0, start: 0, end: 6, unit: 'utf16' as const },
  { block: 0, start: 1, end: 2, unit: 'utf16' as const }, { block: 0, start: 2, end: 3, unit: 'utf16' as const },
 ]) {
  const bad = method({ identity: 'bad-ref', contentRefs: [ref] }), good = method({ identity: 'good-ref', contentRefs: [{ block: 0, start: 1, end: 3, unit: 'utf16' }] });
  const value = ready(recordedSourceResult(record, [located(native(metadata([bad, good]), [{ type: 'text', text: 'A😀B' }, { type: 'image', attachment: 'opaque' }]))], true));
  assert.equal(value.marker?.status, 'confirmed'); assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(value.result.items[1]?.objects[0]?.observed.content, '😀');
  assert.deepEqual(value.diagnostics?.map(item => item.code), ['source-content-reference-invalid']);
 }
});

test('capability sources retain necessary targets and failed execution while excluding user result bodies even with refs', () => {
 const capability = method({ kind: 'capability', identity: 'buildr:cli:entry', action: 'call', completeness: 'none', operation: 'task inspect',
  observedVersion: { algorithm: 'sha256', digest: 'b'.repeat(64), target: 'entry' }, targets: [{ kind: 'task', id: 'task-1' }], contentRefs: [{ block: 0, start: 0, end: 12, unit: 'utf16' }] });
 const value = ready(recordedSourceResult(record, [located(native(metadata([capability], { outcome: 'failed', exitCode: 9 }), [{ type: 'text', text: 'PRIVATE USER DOCUMENT' }]))], true));
 assert.equal(value.marker?.status, 'confirmed'); assert.equal(value.participation?.[0]?.outcome, 'failed'); assert.deepEqual(value.participation?.[0]?.targets, [{ kind: 'task', id: 'task-1' }]);
 assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});

test('none completeness never supplies method text even when metadata includes a range, while its recorded source remains', () => {
 for (const kind of ['rule', 'skill'] as const) {
  const match = method({ kind, completeness: 'none', contentRefs: [{ block: 0, start: 0, end: 12, unit: 'utf16' }] });
  const value = ready(recordedSourceResult(record, [located(native(metadata([match]), [{ type: 'text', text: 'PRIVATE USER DOCUMENT' }]))], true));
  assert.equal(value.marker?.status, 'confirmed'); assert.equal(value.result.items[0]?.objects[0]?.capturedCompleteness, 'none');
  assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
 }
});

test('native failure takes priority; nonzero, zero and asynchronous or absent capability execution remain distinct', () => {
 const capability = method({ kind: 'capability', action: 'call', completeness: 'none', contentRefs: [] });
 for (const type of ['tool/result', 'tool/ptc-dispatch']) for (const item of [
  { execution: { outcome: 'succeeded' as const, exitCode: 0 }, failed: true, expected: 'failed' },
  { execution: { outcome: 'failed' as const, exitCode: 9 }, failed: false, expected: 'failed' },
  { execution: { outcome: 'succeeded' as const, exitCode: 0 }, failed: false, expected: 'succeeded' },
  { execution: { outcome: 'unknown' as const }, failed: false, expected: 'unknown' }, { execution: undefined, failed: false, expected: 'unknown' },
 ]) {
  const source = metadata([capability], item.execution), event = type === 'tool/result' ? native(source, [], { message: { toolCallId: 'c', isError: item.failed, content: [] } })
   : { seq: 10, type, data: { subCallId: 'c', isError: item.failed, eventSources: source, content: [] } };
  assert.equal(ready(recordedSourceResult(record, [located(event)], false)).participation?.[0]?.outcome, item.expected);
 }
 const value = ready(recordedSourceResult(record, [located(native(metadata([capability], { outcome: 'succeeded', exitCode: 0 }), [], { error: { code: 'EXECUTOR', message: 'PRIVATE FAILURE' } }))], true));
 assert.equal(value.participation?.[0]?.outcome, 'failed'); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});

test('body budget is shared by a record and an oversized object does not block a small object', () => {
 const large = 'x'.repeat(512 * 1024 + 1), short = 'Small original method';
 const source = metadata([method({ identity: 'large', contentRefs: [{ block: 0, start: 0, end: large.length, unit: 'utf16' }] }), method({ identity: 'small', contentRefs: [{ block: 1, start: 0, end: short.length, unit: 'utf16' }] })]);
 const value = ready(recordedSourceResult(record, [located(native(source, [{ type: 'text', text: large }, { type: 'text', text: short }]))], true));
 assert.equal(value.marker?.status, 'confirmed'); assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(value.result.items[1]?.objects[0]?.observed.content, short); assert.deepEqual(value.diagnostics?.map(item => item.code), ['source-content-limit']);
 const shared = metadata([method({ identity: 'one', contentRefs: [{ block: 0, start: 0, end: 300000, unit: 'utf16' }] }), method({ identity: 'two', contentRefs: [{ block: 0, start: 0, end: 300000, unit: 'utf16' }] })]);
 const limited = ready(recordedSourceResult(record, [located(native(shared, [{ type: 'text', text: large }]))], true));
 assert.equal(limited.result.items[0]?.objects[0]?.observed.content?.length, 300000); assert.equal(limited.result.items[1]?.objects[0]?.observed.content, undefined);
});

test('viewing original fragments leaves the local marker and persisted metadata body-free and unchanged', () => {
 const original=native(), events=[located(original)], captured=recordedSourcesForEvents(record,events);
 const marker=recordedSourceSummary(captured), before=JSON.stringify(original);
 const content=ready(recordedSourceResult(record,events,true)); assert.equal(content.result.items[0]?.objects[0]?.observed.content,'Method');
 assert.equal(ready(marker).result.items[0]?.objects[0]?.observed.content,undefined); assert.equal(recordedSourceSummary(captured),marker);
 assert.equal(JSON.stringify(original),before); assert.equal(ready(recordedSourceResult(record,events,false)).result.items[0]?.objects[0]?.observed.content,undefined);
});

test('canonical original tool-message source owns call identity and cannot be bypassed by a legacy field', () => {
 const original=native(); const message=original.data.message as Record<string,unknown>;
 delete message.toolCallId; message.source={kind:'tool',callId:'c'};
 assert.equal(ready(recordedSourceResult(record,[located(original)],true)).marker?.status,'confirmed');
 assert.throws(()=>recordedSourceResult({...record,callId:'foreign'},[located(original)],true),{code:'source-event-mismatch'});
 message.toolCallId='c'; message.source={kind:'tool',callId:'foreign'};
 assert.throws(()=>recordedSourceResult(record,[located(original)],true),{code:'source-event-mismatch'});
 message.source={kind:'tool'};
 assert.throws(()=>recordedSourceResult(record,[located(original)],true),{code:'source-event-mismatch'});
});
