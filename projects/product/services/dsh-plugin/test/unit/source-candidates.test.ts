import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import { discoverSourceCandidates, sourceCandidateIndex } from '../../plugin/src/source-candidates.ts';
import { recordedSourceSummary } from '../../plugin/src/event-sources.ts';
import { record, sources } from '../support/recorded-sources.ts';
function snapshot(records: TrajectorySnapshot['recordContexts'], eventNodes: TrajectorySnapshot['eventNodes'] = []): TrajectorySnapshot {
 return { recordContexts: records, eventNodes, eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [] };
}
test('Buildr discovery comes exclusively from original captured metadata and retains readable identities', () => {
 const item = record(5, 'recorded', sources('task-review', { kind: 'skill', action: 'load' })); const values = discoverSourceCandidates(snapshot([item]));
 assert.equal(values.length, 1); assert.equal(values[0]?.title, 'task-review'); assert.equal(values[0]?.kind, 'skill-load'); assert.equal(recordedSourceSummary(item).marker?.basis, 'recorded-source');
});
test('familiar paths, skill names and result text do not invite a reverse query for uncaptured events', () => {
 const item = record(); delete (item as { eventSources?: unknown }).eventSources;
 const tool = { kind: 'tool-result' as const, seq: 3, time: 1000, callId: item.callId!, call: { name: 'skill', argsRaw: '{"name":"buildr-task-review"}' }, callTime: 900, content: [{ type: 'text' as const, text: 'Buildr /fixture/SKILL.md' }], isError: false, meta: { path: '/fixture/Buildr/AGENTS.md', offset: 1, totalLines: 1, lines: [{ number: 1, text: 'Buildr' }] }, subCalls: [] };
 assert.deepEqual(discoverSourceCandidates(snapshot([item], [tool])), []); assert.equal(recordedSourceSummary(item).marker?.status, 'unknown');
});
test('unknown metadata is distinct from missing metadata and never confirms Buildr', () => {
 const item = record(1, 'unknown', { schemaVersion: 'dsh.event-sources/v1', status: 'unknown', matches: [] });
 assert.equal(sourceCandidateIndex(snapshot([item])).has(item.recordId), true); assert.equal(recordedSourceSummary(item).marker?.status, 'unknown');
 const notApplicable = record(2, 'ordinary', { schemaVersion: 'dsh.event-sources/v1', status: 'not-applicable', matches: [] }); assert.equal(recordedSourceSummary(notApplicable).marker?.status, 'not-applicable');
});
test('a recorded non-Buildr provider does not inherit Buildr from a managed or familiar identity', () => {
 const item = record(1, 'workspace-rule', sources('Buildr named user rule', { providedBy: 'workspace' })); assert.equal(recordedSourceSummary(item).marker?.status, 'not-applicable');
});
test('source metadata with another event address, a future schema or embedded body remains unconfirmed', () => {
 const item = record(); const wrongRef = { ...item, eventSources: [{ ...item.eventSources![0]!, seq: 999 }] }; assert.equal(recordedSourceSummary(wrongRef).marker?.status, 'unknown');
 const future = { ...item, eventSources: [{ seq: 3, sources: { ...sources(), schemaVersion: 'dsh.event-sources/v2' } as never }] }; assert.equal(recordedSourceSummary(future).marker?.status, 'unknown');
 const body = { ...item, eventSources: [{ seq: 3, sources: { ...sources(), content: 'User material must not be duplicated' } as never }] }; assert.equal(recordedSourceSummary(body).marker?.status, 'unknown');
});
test('source indexes reuse immutable loaded snapshots and keep original record order', () => {
 const first = record(1, 'first'), second = record(2, 'second'), current = snapshot([second, first]);
 const values = discoverSourceCandidates(current); assert.equal(discoverSourceCandidates(current), values); assert.equal(sourceCandidateIndex(current).get(second.recordId), values[0]); assert.deepEqual(values.map(value => value.record.recordId), ['second', 'first']);
});
test('a captured identity without an action is discoverable without inventing a read or load', () => {
 const values = discoverSourceCandidates(snapshot([record(1, 'catalog', sources('Recorded catalog', { action: undefined, completeness: 'none', contentRefs: [] }))]));
 assert.equal(values[0]?.kind, undefined); assert.equal(values[0]?.title, 'Recorded catalog'); assert.deepEqual(values[0]?.locators, ['/captured/AGENTS.md']);
});
