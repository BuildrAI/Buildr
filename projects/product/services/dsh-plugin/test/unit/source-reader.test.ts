import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceReader as bareReader, sourceRecordKey } from '../../plugin/src/source-reader.ts';
import type { SourceRecordResult } from '../../plugin/src/source-types.ts';
import type { SourceReaderOptions } from '../../plugin/src/source-reader.ts';
import { record, sources, withBody } from '../support/recorded-sources.ts';
const readerFor = (query: Parameters<typeof bareReader>[0], options?: SourceReaderOptions) => { const reader = bareReader(query, options); reader.subscribe(() => {}); return reader; };
const deferred = <T>() => Promise.withResolvers<T>();

test('1000 loaded records derive all marks locally without a Host call or any body', async () => {
 let calls = 0; const reader = readerFor(async () => { calls++; throw Error('No automatic RPC'); });
 const records = Array.from({ length: 1000 }, (_, i) => i % 10 === 0 ? record(i + 1, 'record-' + i) : record(i + 1, 'record-' + i, undefined));
 // Explicit undefined means an uncaptured record in this assay.
 for (let i = 0; i < records.length; i++) if (i % 10 !== 0) delete (records[i] as { eventSources?: unknown }).eventSources;
 reader.ensureWindow(records); await Promise.resolve(); assert.equal(calls, 0);
 assert.equal(Object.values(reader.getSnapshot().records).filter(state => state.value.marker?.status === 'confirmed').length, 100);
 assert.equal(JSON.stringify(reader.getSnapshot()).includes('Recorded body'), false);
 const snapshot = reader.getSnapshot(); reader.ensureWindow(records.map(r => ({ ...r }))); assert.equal(reader.getSnapshot(), snapshot); assert.equal(calls, 0); reader.dispose();
});
test('three source entrances deduplicate one explicit content read and reuse its cache', async () => {
 const gate = deferred<SourceRecordResult>(); let calls = 0; const reader = readerFor(async () => { calls++; return gate.promise; }), item = record();
 reader.ensureWindow([item]); const one = reader.ensure(item), two = reader.ensure(item), three = reader.ensure(item); assert.equal(one, two); assert.equal(one, three); await Promise.resolve(); assert.equal(calls, 1);
 gate.resolve(withBody(item)); await one; await reader.ensure(item); assert.equal(calls, 1); assert.equal(reader.getSnapshot().records[item.recordId]?.mode, 'content'); reader.dispose();
});
test('uncaptured, unknown and non-Buildr metadata never trigger a fallback even on selection or refresh', async () => {
 let calls = 0; const reader = readerFor(async r => { calls++; return withBody(r); });
 const uncaptured = record(1, 'uncaptured'); delete (uncaptured as { eventSources?: unknown }).eventSources;
 const unknown = record(2, 'unknown', { schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] });
 const other = record(3, 'other', sources('User method', { providedBy: 'workspace' }));
 reader.ensureWindow([uncaptured, unknown, other]); for (const r of [uncaptured, unknown, other]) { await reader.ensure(r); await reader.refresh(r); }
 assert.equal(calls, 0); assert.equal(reader.getSnapshot().records.uncaptured?.value.marker?.status, 'unknown'); assert.equal(reader.getSnapshot().records.other?.value.marker?.status, 'not-applicable'); reader.dispose();
});
test('explicit selections are serial and the most recent pending selection gets priority', async () => {
 const calls: string[] = [], pending = new Map<string, ReturnType<typeof deferred<SourceRecordResult>>>();
 const reader = readerFor(async r => { calls.push(r.recordId); const gate = deferred<SourceRecordResult>(); pending.set(r.recordId, gate); return gate.promise; });
 const one = record(1, 'one'), two = record(2, 'two'), three = record(3, 'three'); reader.ensureWindow([one, two, three]);
 const a = reader.ensure(one), b = reader.ensure(two), c = reader.ensure(three); await Promise.resolve(); assert.deepEqual(calls, ['one']);
 pending.get('one')!.resolve(withBody(one)); await a; await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['one', 'three']);
 pending.get('three')!.resolve(withBody(three)); await c; await new Promise(resolve => setImmediate(resolve)); pending.get('two')!.resolve(withBody(two)); await b; assert.deepEqual(calls, ['one', 'three', 'two']); reader.dispose();
});
test('a metadata revision clears cached text without an automatic read', async () => {
 let calls = 0; const reader = readerFor(async r => { calls++; return withBody(r, 'Old body'); }), old = record(); await reader.ensure(old);
 const changed = { ...old, eventSources: [{ seq: 3, sources: sources('New captured method'), outcome: 'succeeded' as const }] };
 assert.notEqual(sourceRecordKey(changed), sourceRecordKey(old)); reader.ensureWindow([changed]); assert.equal(calls, 1); assert.equal(reader.getSnapshot().records[old.recordId]?.mode, 'marker'); assert.equal(JSON.stringify(reader.getSnapshot()).includes('Old body'), false);
 await reader.ensure(changed); assert.equal(calls, 2); reader.dispose();
});
test('late old-revision replies cannot replace a newer local mark or body', async () => {
 const gate = deferred<SourceRecordResult>(); let calls = 0; const reader = readerFor(async r => ++calls === 1 ? gate.promise : withBody(r, 'New body'));
 const old = record(), changed = record(4); const a = reader.ensure(old); await Promise.resolve(); reader.ensureWindow([changed]); const b = reader.ensure(changed);
 gate.resolve(withBody(old, 'Stale body')); await a; await b; assert.equal(JSON.stringify(reader.getSnapshot()).includes('Stale body'), false); assert.equal(JSON.stringify(reader.getSnapshot()).includes('New body'), true); reader.dispose();
});
test('content failures preserve the original recorded mark and identity and require explicit retry', async () => {
 for (const code of ['source-timeout', 'source-remote-unmounted', 'source-record-mismatch', 'source-event-mismatch']) {
  let calls = 0; const reader = readerFor(async () => { calls++; return { ready: false, code, message: 'Private failure', marker: { status: 'unknown' } }; }), item = record();
  reader.ensureWindow([item]); await reader.ensure(item); const state = reader.getSnapshot().records[item.recordId]!;
  assert.equal(state.value.marker?.basis, 'recorded-source'); assert.equal(state.value.marker?.status, 'confirmed'); assert.equal(state.contentFailed, true);
  assert.equal(JSON.stringify(state).includes('Private failure'), false); reader.ensureWindow([item]); assert.equal(calls, 1); await reader.refresh(item); assert.equal(calls, 2); reader.dispose();
 }
});
test('refresh retains already obtained original text while queued and loading', async () => {
 const gate = deferred<SourceRecordResult>(); let calls = 0; const item = record(); const reader = readerFor(async () => ++calls === 1 ? withBody(item, 'Obtained body') : gate.promise);
 await reader.ensure(item); const refresh = reader.refresh(item); assert.equal(JSON.stringify(reader.getSnapshot()).includes('Obtained body'), true); gate.resolve(withBody(item, 'Fresh read of original body')); await refresh; assert.equal(reader.getSnapshot().records[item.recordId]?.contentFailed, undefined); reader.dispose();
});
test('a legacy current-source or unknown content response cannot replace a locally recorded source', async () => {
 for (const kind of ['legacy', 'unknown'] as const) {
  const item = record(), body = withBody(item, 'Untrusted current text'); if (!body.ready) throw Error('ready');
  const response: SourceRecordResult = kind === 'legacy' ? { ...body, result: { ...body.result, schemaVersion: 'buildr.agent-asset-source-result/v1' }, marker: { status: 'confirmed', basis: 'current-buildr-object' } } : { ...body, marker: { status: 'unknown' } };
  const reader = readerFor(async () => response); reader.ensureWindow([item]); await reader.ensure(item);
  const state = reader.getSnapshot().records[item.recordId]!; assert.equal(state.value.marker?.basis, 'recorded-source'); assert.equal(state.contentFailed, true);
  assert.equal(JSON.stringify(state).includes('Untrusted current text'), false); reader.dispose();
 }
});
test('window withdrawal settles obsolete queued content and drops old cache entries', async () => {
 const gate = deferred<SourceRecordResult>(), calls: string[] = []; const one = record(1, 'one'), two = record(2, 'two'); const reader = readerFor(async r => { calls.push(r.recordId); return gate.promise; });
 reader.ensureWindow([one, two]); const a = reader.ensure(one), b = reader.ensure(two); await Promise.resolve(); reader.ensureWindow([]); await b; gate.resolve(withBody(one)); await a; assert.deepEqual(calls, ['one']); assert.deepEqual(reader.getSnapshot().records, {}); reader.dispose();
});
test('last consumer release clears bodies and prevents an in-flight response from restoring them', async () => {
 const gate = deferred<SourceRecordResult>(); let calls = 0; const reader = bareReader(async () => { calls++; return gate.promise; }), off = reader.subscribe(() => {}), one = record(1, 'one'), two = record(2, 'two');
 const a = reader.ensure(one), b = reader.ensure(two); await Promise.resolve(); off(); await Promise.resolve(); await b; gate.resolve(withBody(one)); await a; assert.deepEqual(reader.getSnapshot().records, {}); assert.equal(calls, 1); reader.dispose();
});
test('same-commit consumer handoff retains the original content cache and no default RPC starts', async () => {
 let calls = 0; const item = record(); const reader = bareReader(async r => { calls++; return withBody(r); }); const off = reader.subscribe(() => {}); await reader.ensure(item); const snapshot = reader.getSnapshot(); off(); const next = reader.subscribe(() => {}); await Promise.resolve(); reader.ensureWindow([item]); assert.equal(reader.getSnapshot(), snapshot); await reader.ensure(item); assert.equal(calls, 1); next(); reader.dispose();
});
test('disposal ignores late replies and settles queued reads without starting them', async () => {
 const gate = deferred<SourceRecordResult>(); let calls = 0; const reader = readerFor(async () => { calls++; return gate.promise; }), one = record(1, 'one'), two = record(2, 'two'); const a = reader.ensure(one), b = reader.ensure(two); await Promise.resolve(); reader.dispose(); await b; gate.resolve(withBody(one)); await a; assert.equal(calls, 1); assert.deepEqual(reader.getSnapshot().records, {});
});

test('none-body capabilities and missing fragments settle locally even on refresh and do not evict bodies', async () => {
 let calls = 0; const body = record(1, 'body'), reader = readerFor(async r => { calls++; return withBody(r, 'BODY_A'); }, { maxCachedBodyRecords: 1 });
 const none = Array.from({ length: 50 }, (_, index) => record(index+2, 'cap-'+index, sources('Capability', { kind: 'capability', action: 'call', completeness: 'none' })));
 const missing = record(99, 'missing', sources('No retained fragment', { contentRefs: [] }));
 reader.ensureWindow([body, ...none, missing]); await reader.ensure(body);
 for (const item of [...none, missing]) { await reader.ensure(item); await reader.refresh(item); assert.equal(reader.getSnapshot().records[item.recordId]?.mode, 'content'); }
 assert.equal(calls, 1); assert.equal(JSON.stringify(reader.getSnapshot().records.body).includes('BODY_A'), true);
 await reader.ensure(body); assert.equal(calls, 1); reader.dispose();
});
test('body entry LRU eviction keeps local source metadata and honors cached selection recency', async () => {
 const calls: string[] = [], reader = readerFor(async item => { calls.push(item.recordId); return withBody(item, 'BODY_'+item.recordId); }, { maxCachedBodyRecords: 2 });
 const one = record(1, 'one'), two = record(2, 'two'), three = record(3, 'three'); reader.ensureWindow([one, two, three]);
 await reader.ensure(one); await reader.ensure(two); await reader.ensure(one); await reader.ensure(three);
 assert.deepEqual(calls, ['one', 'two', 'three']); const state = reader.getSnapshot().records.two!;
 assert.equal(state.mode, 'marker'); assert.equal(state.value.marker?.status, 'confirmed'); assert.equal(JSON.stringify(state).includes('BODY_two'), false);
 await reader.ensure(one); assert.equal(calls.length, 3); await reader.ensure(two); assert.equal(calls.length, 4); reader.dispose();
});
test('total retained body budget evicts older bodies independently of the entry count limit', async () => {
 const reader = readerFor(async item => withBody(item, '12345678'), { maxCachedBodyRecords: 10, maxCachedBodyBytes: 32 });
 const records = [record(1, 'one'), record(2, 'two'), record(3, 'three')]; reader.ensureWindow(records);
 for (const item of records) await reader.ensure(item);
 const states = reader.getSnapshot().records;
 assert.equal(states.one?.mode, 'marker'); assert.equal(states.two?.mode, 'content'); assert.equal(states.three?.mode, 'content');
 assert.equal(JSON.stringify(states.one).includes('12345678'), false); assert.equal(JSON.stringify(states.three).includes('12345678'), true); reader.dispose();
});
test('a late older queued read cannot evict the current selection under the body budget', async () => {
 const gates = new Map<string, ReturnType<typeof deferred<SourceRecordResult>>>();
 const reader = readerFor(async r => { const gate = deferred<SourceRecordResult>(); gates.set(r.recordId, gate); return gate.promise; }, { maxCachedBodyRecords: 1 });
 const one = record(1, 'one'), two = record(2, 'two'), three = record(3, 'three'); reader.ensureWindow([one, two, three]);
 const a=reader.ensure(one), b=reader.ensure(two), c=reader.ensure(three); await Promise.resolve();
 gates.get('one')!.resolve(withBody(one,'BODY_one')); await a; await new Promise(resolve=>setImmediate(resolve));
 gates.get('three')!.resolve(withBody(three,'BODY_three')); await c; await new Promise(resolve=>setImmediate(resolve));
 gates.get('two')!.resolve(withBody(two,'BODY_two')); await b;
 assert.equal(JSON.stringify(reader.getSnapshot().records.three).includes('BODY_three'), true); assert.equal(JSON.stringify(reader.getSnapshot().records.two).includes('BODY_two'), false); reader.dispose();
});
test('an over-budget response is not retained and cannot erase the captured source identity', async () => {
 const reader=readerFor(async item=>withBody(item,'BODY_TOO_LARGE'),{maxCachedBodyBytes:4}), item=record(); await reader.ensure(item);
 const state=reader.getSnapshot().records[item.recordId]!; assert.equal(state.value.marker?.status,'confirmed'); assert.equal(state.contentFailed,true);
 assert.equal(JSON.stringify(state).includes('BODY_TOO_LARGE'),false); if(!state.value.ready)assert.fail('metadata remains ready'); assert.deepEqual(state.value.diagnostics?.map(d=>d.code),['source-content-limit']); reader.dispose();
});

test('more than 32 saved none-body events keep a known local marker without a bounded body request', async () => {
 let calls=0; const reader=readerFor(async()=>{calls++;throw Error('No original read for none');});
 const base=record(), eventRefs=Array.from({length:33},(_,seq)=>({...base.eventRefs[0]!,seq}));
 const item={...base,eventRefs,eventSources:eventRefs.map(ref=>({seq:ref.seq,sources:sources('Saved capability',{kind:'capability',action:'call',completeness:'none',contentRefs:[]}),outcome:'succeeded' as const}))};
 reader.ensureWindow([item]); await reader.ensure(item); await reader.refresh(item);
 assert.equal(calls,0); assert.equal(reader.getSnapshot().records[item.recordId]?.value.marker?.status,'confirmed'); reader.dispose();
});
