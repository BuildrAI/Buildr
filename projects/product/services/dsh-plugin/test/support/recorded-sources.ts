/** Controlled persisted provenance fixtures. They never query files or installations. */
import type { TrajectoryRecordContext } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { EventSources, EventSourceMatch, SourceRecordResult } from '../../plugin/src/source-types.ts';
import { recordedSourceSummary } from '../../plugin/src/event-sources.ts';
export function sources(name = 'Recorded Buildr method', options: Partial<EventSourceMatch> = {}): EventSources {
 return { schemaVersion: 'dsh.event-sources/v1', status: 'confirmed', matches: [{ providedBy: 'buildr', kind: 'rule', identity: 'buildr:rule:' + name, name,
  locator: { workspaceId: 'captured-workspace', scope: '.', path: '/captured/AGENTS.md' }, action: 'load',
  observedVersion: { algorithm: 'sha256', digest: 'a'.repeat(64), target: 'content' }, evidence: [{ authority: 'producer-capture', identity: 'captured-receipt' }],
  completeness: 'complete', contentRefs: [{ block: 0, start: 0, end: 13, unit: 'utf16' }], ...options }] };
}
export function record(seq = 3, id = 'tool-call', metadata: EventSources | undefined = sources()): TrajectoryRecordContext {
 return { recordId: id as TrajectoryRecordContext['recordId'], kind: 'tool', callId: 'call-' + id, transient: false,
  eventRefs: [{ sessionId: 'session-one' as TrajectoryRecordContext['eventRefs'][number]['sessionId'], seq }],
  ...(metadata === undefined ? {} : { eventSources: [{ seq, sources: metadata, outcome: 'succeeded' }] }) };
}
export function withBody(record: TrajectoryRecordContext, text = 'Recorded body'): SourceRecordResult {
 const value = recordedSourceSummary(record); if (!value.ready) throw Error('recorded fixture must be ready');
 return { ...value, result: { ...value.result, items: value.result.items.map(item => ({ ...item,
  objects: item.objects.map(object => ({ ...object, observed: object.kind === 'capability' ? object.observed : { ...object.observed, content: text } })) })) } };
}
