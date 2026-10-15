import assert from 'node:assert/strict';
import test from 'node:test';
import { readObservedSourceEvents, sourceRecord } from '../../plugin/source-gateway.ts';
import type { SourceEventObservation, SourceGatewayDependencies } from '../../plugin/source-gateway.ts';
import type { EventSources, SourceRecordRequest, SourceRecordResult } from '../../plugin/src/source-types.ts';
const request: SourceRecordRequest = { sessionId: 's', record: { recordId: 'original-c', kind: 'tool', eventRefs: [{ sessionId: 's', seq: 2 }], callId: 'c', transient: false } };
const sources: EventSources = { schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches: [{ providedBy: 'buildr', kind: 'rule', identity: 'buildr:rule:event', name: 'Event rule', action: 'read',
 evidence: [{ authority: 'original-producer', identity: 'receipt' }], locator: { path: '/captured/AGENTS.md' }, completeness: 'partial', contentRefs: [{ block: 0, start: 8, end: 14, unit: 'utf16' }] }] };
const event = (seq = 2, metadata: unknown = sources) => ({ type: 'tool/result', seq, data: { message: { toolCallId: 'c', isError: false, content: [{ type: 'text', text: 'PRIVATE Method PRIVATE' }] }, eventSources: metadata } });
const reply = (target = event()) => ({ session: { id: 's' }, events: [target] });
function ready(value: SourceRecordResult): Extract<SourceRecordResult, { ready: true }> { if (!value.ready) assert.fail(value.code); return value; }
const code = (value: SourceRecordResult) => { if (value.ready) assert.fail('Expected read failure'); return value.code; };

test('one exact batch supplies authority; client metadata, neighbors and current source operations are ignored', async () => {
 const addresses: unknown[] = [];
 const deps = { readEvents: async (address: unknown, signal: AbortSignal) => { addresses.push(address); assert.equal(signal.aborted, false); return { ...reply(), before: [{ content: 'PRIVATE NEIGHBOR' }] }; },
  querySources: () => assert.fail('No current source query'), readFile: () => assert.fail('No current file'), runInput: () => assert.fail('No source process') };
 const value = ready(await sourceRecord({ ...request, record: { ...request.record, eventSources: [{ seq: 2, sources: { ...sources, content: 'PRIVATE CLIENT BODY' } }] } }, deps));
 assert.deepEqual(addresses, [{ sessionId: 's', seqs: [2] }]); assert.equal(value.result.items[0]?.objects[0]?.observed.content, 'Method'); assert.equal(value.marker?.basis, 'recorded-source'); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});
test('marker mode agrees with content provenance and remains body-free', async () => {
 let reads = 0; const deps: SourceGatewayDependencies = { readEvents: async () => { reads++; return reply(); } };
 const marker = ready(await sourceRecord({ ...request, mode: 'marker' }, deps)), content = ready(await sourceRecord({ ...request, mode: 'content' }, deps));
 assert.deepEqual(marker.marker, content.marker); assert.equal(marker.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(content.result.items[0]?.objects[0]?.observed.content, 'Method'); assert.equal(reads, 2);
});
test('absent, malformed, unknown and ordinary metadata retain capture states without fallback', async () => {
 for (const item of [{ metadata: undefined, status: 'unknown', code: 'source-not-captured' }, { metadata: { ...sources, content: 'PRIVATE' }, status: 'unknown', code: 'source-metadata-invalid' },
  { metadata: { schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] }, status: 'unknown' }, { metadata: { schemaVersion: 'dsh.event-sources/v1', status: 'not-applicable', matches: [] }, status: 'not-applicable' }]) {
  const original = event(); if (item.metadata === undefined) delete (original.data as { eventSources?: unknown }).eventSources; else original.data.eventSources = item.metadata;
  const value = ready(await sourceRecord(request, { readEvents: async () => reply(original) }));
  assert.equal(value.marker?.status, item.status); assert.deepEqual(value.diagnostics?.map(item => item.code) ?? [], item.code ? [item.code] : []); assert.deepEqual(value.result.items, []);
 }
});
test('foreign, duplicate, synthetic and over-limit addresses fail before access', async () => {
 for (const changes of [{ eventRefs: [{ sessionId: 's', seq: 2.5 }] }, { eventRefs: [{ sessionId: 'other', seq: 2 }] }, { eventRefs: [request.record.eventRefs[0], request.record.eventRefs[0]] },
  { eventRefs: Array.from({ length: 33 }, (_, seq) => ({ sessionId: 's', seq })) }, { callId: 'bad\0id' }]) assert.equal(code(await sourceRecord({ ...request, record: { ...request.record, ...changes } }, { readEvents: () => assert.fail('No invalid query') })), 'source-invalid-record');
 for (const changes of [{ transient: true }, { eventRefs: [] }]) assert.equal(code(await sourceRecord({ ...request, record: { ...request.record, ...changes } }, { readEvents: () => assert.fail('No durable address') })), 'source-no-durable-record');
 assert.equal(code(await sourceRecord(request, {})), 'source-reader-unavailable');
});
test('the exact session, event set, type, call and child ancestry are enforced', async () => {
 const wrongCall = event(); wrongCall.data.message.toolCallId = 'other';
 for (const value of [{ ...reply(), session: { id: 'other' } }, reply(event(3)), { ...reply(), events: [] }, { ...reply(), events: [event(), event()] }, { ...reply(), events: [{ ...event(), type: null }] }, reply(wrongCall)]) assert.equal(code(await sourceRecord(request, { readEvents: async () => value })), 'source-event-mismatch');
 const child = { ...request, record: { ...request.record, kind: 'subtool' as const, parentCallId: 'parent', rootCallId: 'root' } };
 assert.equal(code(await sourceRecord(child, { readEvents: async () => ({ session: { id: 's' }, events: [{ seq: 2, type: 'tool/ptc-dispatch', data: { subCallId: 'c', parentCallId: 'foreign', rootCallId: 'root', eventSources: sources } }] }) })), 'source-event-mismatch');
});
test('multiple refs use one batch and preserve requested ordering without current call path inference', async () => {
 let reads = 0; const addressed = { ...request, record: { ...request.record, eventRefs: [{ sessionId: 's', seq: 1 }, { sessionId: 's', seq: 2 }] } };
 const value = ready(await sourceRecord(addressed, { readEvents: async address => { reads++; assert.deepEqual(address, { sessionId: 's', seqs: [1, 2] });
  return { session: { id: 's' }, events: [event(), { seq: 1, type: 'tool/call', data: { callId: 'c', name: 'read', arguments: '{"file_path":"/different/current.md"}' } }] }; } }));
 assert.equal(reads, 1); assert.equal(value.participation?.[0]?.eventRefs[0]?.seq, 2); assert.equal(value.result.items[0]?.objects[0]?.selector.relativePath, '/captured/AGENTS.md'); assert.equal(JSON.stringify(value).includes('/different'), false);
});
test('failed capabilities preserve actual execution and exit code while excluding private result text', async () => {
 const capability: EventSources = { ...sources, execution: { outcome: 'failed', exitCode: 9 }, matches: [{ ...sources.matches[0]!, kind: 'capability', action: 'call', operation: 'task inspect', targets: [{ kind: 'task', id: 'task-1' }], completeness: 'none' }] };
 const value = ready(await sourceRecord(request, { readEvents: async () => reply(event(2, capability)) }));
 assert.equal(value.participation?.[0]?.outcome, 'failed'); assert.equal(value.participation?.[0]?.exitCode, 9); assert.deepEqual(value.participation?.[0]?.targets, [{ kind: 'task', id: 'task-1' }]); assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
});
test('invalid content refs retain identity and source evidence', async () => {
 const bad = { ...sources, matches: [{ ...sources.matches[0]!, contentRefs: [{ block: 0, start: 8, end: 999, unit: 'utf16' as const }] }] };
 const value = ready(await sourceRecord(request, { readEvents: async () => reply(event(2, bad)) }));
 assert.equal(value.marker?.basis, 'recorded-source'); assert.equal(value.result.items[0]?.objects[0]?.observed.content, undefined); assert.deepEqual(value.diagnostics?.map(item => item.code), ['source-content-reference-invalid']);
});
test('timeouts, private errors, invalid bounds and cancellation are isolated from later reads', async () => {
 for (const timeoutMs of [0, 1.5, 120001]) assert.equal(code(await sourceRecord(request, { timeoutMs, readEvents: () => assert.fail('Invalid timeout') })), 'source-invalid-input');
 const pending = Promise.withResolvers<unknown>(); assert.equal(code(await sourceRecord(request, { timeoutMs: 10, readEvents: async () => pending.promise })), 'source-timeout'); pending.resolve(reply());
 const failed = await sourceRecord(request, { readEvents: async () => { throw Error('PRIVATE READER FAILURE'); } }); assert.equal(code(failed), 'source-unavailable'); assert.equal(JSON.stringify(failed).includes('PRIVATE'), false);
 const controller = new AbortController(); controller.abort(); assert.equal(code(await sourceRecord(request, { signal: controller.signal, readEvents: () => assert.fail('Cancelled before query') })), 'source-cancelled');
 assert.equal(ready(await sourceRecord(request, { readEvents: async () => reply() })).result.items[0]?.objects[0]?.observed.content, 'Method');
});
test('one original observation materializes once, clones only selected events, and releases', async () => {
 let reads = 0, materialized = 0, disposed = 0; const originals = [event(0), event(1), event()];
 const value = await readObservedSourceEvents({ sessionId: 's', seqs: [2, 0] }, new AbortController().signal, async (id, options) => {
  reads++; assert.equal(id, 's'); assert.equal(options.projectionMode, 'none'); return { header: { id }, get events() { materialized++; return originals; }, [Symbol.dispose]() { disposed++; } };
 }) as { events: typeof originals };
 assert.equal(reads, 1); assert.equal(materialized, 1); assert.equal(disposed, 1); assert.deepEqual(value.events.map(item => item.seq), [2, 0]); assert.notEqual(value.events[0], originals[2]);
 value.events[0]!.data.message.content[0]!.text = 'Changed clone'; assert.equal(originals[2]!.data.message.content[0]!.text, 'PRIVATE Method PRIVATE');
});
test('materialization and target validation failures still release the original observation', async () => {
 for (const kind of ['wrong-session', 'missing-target', 'getter-error'] as const) {
  let disposed = 0; await assert.rejects(readObservedSourceEvents({ sessionId: 's', seqs: [2] }, new AbortController().signal, async () => ({ header: { id: kind === 'wrong-session' ? 'other' : 's' },
   get events() { if (kind === 'getter-error') throw Error('PRIVATE'); return []; }, [Symbol.dispose]() { disposed++; } }))); assert.equal(disposed, 1);
 }
});
test('cancellation at the resolved-acquisition microtask boundary releases the delivered lease', async () => {
 const controller = new AbortController(); let disposed = 0, accessed = 0;
 const cut: SourceEventObservation = { header: { id: 's' }, get events() { accessed++; return [event(0), event(1), event()]; }, [Symbol.dispose]() { disposed++; } };
 const operation = sourceRecord(request, { signal: controller.signal, readEvents: (address, signal) => readObservedSourceEvents(address, signal, () => Promise.resolve(cut)) });
 controller.abort(); assert.equal(code(await operation), 'source-cancelled'); await Promise.resolve(); assert.equal(disposed, 1); assert.equal(accessed, 0);
});
test('leases acquired after an outer deadline or cancellation release without materializing history', async () => {
 for (const reason of ['timeout', 'caller'] as const) {
  const controller = new AbortController(), delivered = Promise.withResolvers<SourceEventObservation>(), started = Promise.withResolvers<void>(); let disposed = 0, accessed = 0;
  const operation = sourceRecord(request, { signal: controller.signal, timeoutMs: 10, readEvents: (address, signal) => readObservedSourceEvents(address, signal, () => { started.resolve(); return delivered.promise; }) });
  await started.promise; if (reason === 'caller') controller.abort(); assert.equal(code(await operation), reason === 'caller' ? 'source-cancelled' : 'source-timeout');
  delivered.resolve({ header: { id: 's' }, get events() { accessed++; return []; }, [Symbol.dispose]() { disposed++; } }); await new Promise(resolve => setImmediate(resolve)); assert.equal(disposed, 1); assert.equal(accessed, 0);
 }
});
