import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEventSources, recordedSourceHasContent, recordedSourceKey, recordedSourceSummary } from '../../plugin/src/event-sources.ts';
import type { EventSourceMatch, EventSources, SourceRecordContext, SourceRecordResult } from '../../plugin/src/source-types.ts';
const method: EventSourceMatch = { providedBy: 'buildr', kind: 'rule', identity: 'buildr:rule:captured', name: 'Captured core rule', action: 'load', locator: { workspaceId: 'then', scope: '.', path: '/then/AGENTS.md' },
 evidence: [{ authority: 'actual-producer', identity: 'receipt' }], observedVersion: { algorithm: 'sha256', digest: 'a'.repeat(64), target: 'content' }, completeness: 'partial', contentRefs: [{ block: 0, start: 10, end: 20, unit: 'utf16' }] };
const sources = (changes: Partial<EventSources> = {}): EventSources => ({ schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches: [structuredClone(method)], ...changes });
const record: SourceRecordContext = { recordId: 'original-context', kind: 'context', transient: false, eventRefs: [{ sessionId: 's', seq: 3 }, { sessionId: 's', seq: 4 }] };
function ready(value: SourceRecordResult): Extract<SourceRecordResult, { ready: true }> { if (!value.ready) assert.fail(value.code); return value; }

test('source metadata preserves independent provider, identity, locator, version target, refs and execution without body fields', () => {
 const input = sources({ mixed: true, execution: { outcome: 'failed', exitCode: 9 } });
 const parsed = parseEventSources(input); assert.deepEqual(parsed, input); assert.notEqual(parsed, input); assert.notEqual(parsed?.matches[0], input.matches[0]);
 assert.equal(parseEventSources({ schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [], diagnostics: [{ code: 'capture-unavailable' }] })?.status, 'unknown');
 assert.equal(parseEventSources({ schemaVersion: 'dsh.event-sources/v1', status: 'not-applicable', matches: [] })?.status, 'not-applicable');
});

test('malformed, future, body-bearing and contradictory metadata cannot become a source mark', () => {
 const invalid: unknown[] = [null, [], 'buildr', { ...sources(), schemaVersion: 'dsh.event-sources/v2' }, { ...sources(), content: 'PRIVATE USER BODY' },
  { ...sources(), matches: [] }, { ...sources(), status: 'unknown' }, { ...sources(), status: 'not-applicable' }, { ...sources(), mixed: 'yes' },
  ...[
   { providedBy: '' }, { kind: 'user-material' }, { identity: 'invalid\0id' }, { name: '' }, { evidence: [] }, { action: 'adopted' }, { completeness: undefined },
   { locator: { path: '/then/AGENTS.md', providerBody: 'PRIVATE' } }, { targets: [{ kind: 'task', id: 'task-1', body: 'PRIVATE' }] },
   { observedVersion: { algorithm: 'sha256', digest: 'sha256-' + 'a'.repeat(64), target: 'content' } },
   { observedVersion: { algorithm: 'sha1', digest: 'a'.repeat(40), target: 'model-request' } },
   { contentRefs: [{ block: 0, start: 2, end: 1, unit: 'utf16' }] }, { contentRefs: [{ block: 0, start: 0, end: 1, unit: 'utf8' }] },
   { contentRefs: [{ block: 0, start: 0.5, end: 1, unit: 'utf16' }] }, { body: 'PRIVATE' },
  ].map(changes => ({ ...sources(), matches: [{ ...method, ...changes }] })),
  { ...sources(), execution: { outcome: 'succeeded', exitCode: 9 } }, { ...sources(), execution: { outcome: 'done', exitCode: 0 } }, { ...sources(), execution: { outcome: 'unknown', exitCode: 0.5 } },
 ];
 for (const input of invalid) assert.equal(parseEventSources(input), undefined, JSON.stringify(input));
 const cyclic: Record<string, unknown> = { ...sources() }; cyclic.matches = [cyclic]; assert.equal(parseEventSources(cyclic), undefined);
});

test('per-event match and byte limits bound local decoding while malformed envelopes remain invalid', () => {
 assert.equal(parseEventSources(sources({ matches: Array.from({ length: 33 }, () => method) })), undefined);
 const large = { ...method, identity: 'x'.repeat(4096), locator: { path: 'x'.repeat(4096) }, evidence: [{ authority: 'producer', identity: 'x'.repeat(4096) }] };
 assert.equal(parseEventSources(sources({ matches: Array.from({ length: 8 }, () => large) })), undefined);
 const value = ready(recordedSourceSummary({ ...record, eventSources: 'invalid' as unknown as SourceRecordContext['eventSources'] })); assert.equal(value.marker?.status, 'unknown'); assert.deepEqual(value.diagnostics?.map(item => item.code), ['source-metadata-invalid']);
});

test('missing, unknown, invalid, ordinary provider and confirmed Buildr states remain distinct without name inference', () => {
 const missing = ready(recordedSourceSummary(record)); assert.equal(missing.marker?.status, 'unknown'); assert.deepEqual(missing.diagnostics?.map(item => item.code), ['source-not-captured']);
 const unknown = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: { schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] } }] })); assert.equal(unknown.marker?.status, 'unknown'); assert.equal(unknown.diagnostics, undefined);
 const invalid = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: { ...sources(), content: 'PRIVATE' } }] })); assert.equal(invalid.marker?.status, 'unknown'); assert.deepEqual(invalid.diagnostics?.map(item => item.code), ['source-metadata-invalid']);
 const ordinary = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, providedBy: 'workspace', name: 'Buildr AGENTS.md' }] }) }] })); assert.equal(ordinary.marker?.status, 'not-applicable'); assert.deepEqual(ordinary.result.items, []);
 const confirmed = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources(), outcome: 'failed' }] })); assert.equal(confirmed.marker?.basis, 'recorded-source'); assert.equal(confirmed.participation?.[0]?.outcome, 'failed'); assert.equal(confirmed.result.items[0]?.objects[0]?.current, null); assert.equal(confirmed.result.items[0]?.objects[0]?.observed.content, undefined); assert.equal(confirmed.result.items[0]?.objects[0]?.historical, 'recorded');
});

test('one invalid envelope does not erase another recorded source and repeated diagnostics are deduplicated', () => {
 const value = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources(), outcome: 'succeeded' }, { seq: 999, sources: sources() }, { seq: 4, sources: { schemaVersion: 'future' } }] }));
 assert.equal(value.marker?.status, 'confirmed'); assert.equal(value.result.items.length, 1); assert.deepEqual(value.diagnostics?.map(item => item.code), ['source-metadata-invalid']);
 const duplicate = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources() }, { seq: 3, sources: sources() }] })); assert.equal(duplicate.result.items.length, 1); assert.deepEqual(duplicate.diagnostics?.map(item => item.code), ['source-metadata-invalid']);
});

test('mixed objects retain only Buildr identities and necessary refs without changing the original DSH type', () => {
 const value = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources({ mixed: true, matches: [method, { ...method, providedBy: 'external', identity: 'external:rule', name: 'User rule' }, { ...method, kind: 'skill', identity: 'buildr:skill:captured', name: 'Recorded skill', action: 'read' }] }), outcome: 'succeeded' }] }));
 assert.deepEqual(value.marker?.objectIdentities, ['buildr:rule:captured', 'buildr:skill:captured']); assert.equal(value.result.items.length, 2); assert.equal(value.result.items.every(item => item.mixed), true); assert.equal(value.participation?.[1]?.kind, 'content-read');
 assert.equal(JSON.stringify(value).includes('User rule'), false); assert.equal(record.kind, 'context'); assert.deepEqual(value.participation?.[0]?.eventRefs, [{ sessionId: 's', seq: 3 }]);
});

test('file and entry versions never become delivered content digests, and missing actions stay absent', () => {
 for (const target of ['file', 'content', 'entry'] as const) {
  const version = { algorithm: 'sha256' as const, digest: 'a'.repeat(64), target };
  const value = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, observedVersion: version, action: undefined, completeness: 'none', contentRefs: [] }] }) }] }));
  const object = value.result.items[0]?.objects[0]; assert.deepEqual(object?.capturedVersion, version); assert.equal(object?.observed.digest, target === 'content' ? 'sha256-' + 'a'.repeat(64) : undefined); assert.equal(object?.capturedCompleteness, 'none'); assert.equal(value.participation, undefined);
 }
 const sha1 = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, observedVersion: { algorithm: 'sha1', digest: 'b'.repeat(40), target: 'file' } }] }) }] })); assert.equal(sha1.result.items[0]?.objects[0]?.observed.digest, undefined);
});

test('immutable record revisions serialize once and share a body-free metadata projection', () => {
 let serialized = 0;
 const entries = [{ seq: 3, sources: sources(), outcome: 'succeeded' as const }];
 Object.defineProperty(entries, 'toJSON', { value: () => { serialized++; return [...entries]; } });
 const item = { ...record, eventSources: entries };
 const key = recordedSourceKey(item), first = recordedSourceSummary(item);
 for (let index = 0; index < 20; index++) { assert.equal(recordedSourceKey(item), key); assert.equal(recordedSourceSummary(item), first); }
 assert.equal(serialized, 0, 'Raw envelope serializer is never invoked'); assert.equal(JSON.stringify(first).includes('contentRefs'), false);
 const changed = { ...item, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, name: 'New method' }] }) }] };
 assert.notEqual(recordedSourceKey(changed), key); assert.notEqual(recordedSourceSummary(changed), first);
});

test('only valid Buildr rule or skill nonempty references require a content request', () => {
 for (const change of [{ kind: 'capability' as const }, { completeness: 'none' as const }, { contentRefs: [] },
  { providedBy: 'workspace' }, { contentRefs: [{ block: 0, start: 10, end: 10, unit: 'utf16' as const }] }]) {
  assert.equal(recordedSourceHasContent({ ...record, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, ...change }] }) }] }), false);
 }
 for (const kind of ['rule', 'skill'] as const) assert.equal(recordedSourceHasContent({ ...record, eventSources: [{ seq: 3, sources: sources({ matches: [{ ...method, kind }] }) }] }), true);
});

test('participation preserves same-event actual exit codes independently of failure precedence', () => {
 for (const exitCode of [0, 9, -1]) {
  const value = ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, outcome: 'failed', sources: sources({ execution: { outcome: exitCode === 0 ? 'succeeded' : 'failed', exitCode } }) }] }));
  assert.equal(value.participation?.[0]?.exitCode, exitCode); assert.equal(value.participation?.[0]?.outcome, 'failed');
 }
 assert.equal(ready(recordedSourceSummary({ ...record, eventSources: [{ seq: 3, sources: sources() }] })).participation?.[0]?.exitCode, undefined);
});

test('invalid metadata bodies never enter cached revision keys, including giant nested extras', () => {
 for (const invalid of [
  { ...sources(), content: 'PRIVATE_BODY_'+ 'x'.repeat(2*1024*1024) },
  { ...sources(), matches: [{ ...method, extra: 'PRIVATE_NESTED_'+ 'x'.repeat(2*1024*1024) }] },
  { ...sources(), execution: { outcome: 'failed', exitCode: 9, output: 'PRIVATE_EXECUTION' } },
 ]) {
  const item = { ...record, eventSources: [{ seq: 3, sources: invalid }] };
  const key = recordedSourceKey(item), value = ready(recordedSourceSummary(item));
  assert.equal(key.includes('PRIVATE'), false); assert.ok(key.length < 300);
  assert.equal(value.marker?.status, 'unknown'); assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
 }
 let accessed = 0;
 const nested = { ...method };
 Object.defineProperty(nested, 'body', { enumerable: true, get() { accessed++; throw Error('Must not read rejected body'); } });
 const item = { ...record, eventSources: [{ seq: 3, sources: { ...sources(), matches: [nested] } }] };
 assert.equal(recordedSourceKey(item).includes('Must not'), false); assert.equal(recordedSourceHasContent(item), false); assert.equal(accessed, 0);
});

test('an aggregate of more than 32 valid captured events keeps its known marker', () => {
 const refs=Array.from({length:33},(_,seq)=>({sessionId:'s',seq}));
 const item={...record,eventRefs:refs,eventSources:refs.map(ref=>({seq:ref.seq,sources:sources({matches:[{...method,completeness:'none',contentRefs:[]}]}),outcome:'succeeded' as const}))};
 const value=ready(recordedSourceSummary(item)); assert.equal(value.marker?.status,'confirmed'); assert.equal(value.result.items.length,33); assert.equal(recordedSourceHasContent(item),false);
});
