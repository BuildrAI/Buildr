/** Pure decoding of provenance already recorded by DSH. No filesystem, process or RPC access. */
import type { EventSources, EventSourceMatch, SourceDiagnostic, SourceObject, SourceParticipation,
  SourceRecordContext, SourceRecordResult, RecordedSourceViewResult } from './source-types.ts';

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_MATCHES = 32;
const own = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const text = (value: unknown, max = 4096): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && !/[\u0000-\u001f]/.test(value);
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

interface RecordMetadataCache {
  readonly recordId: string; readonly kind: SourceRecordContext['kind']; readonly transient: boolean;
  readonly callId: string | undefined; readonly parentCallId: string | undefined; readonly rootCallId: string | undefined;
  readonly refs: SourceRecordContext['eventRefs']; readonly sources: SourceRecordContext['eventSources'];
  readonly key: string;
  readonly entries: readonly { readonly seq: number; readonly sources: EventSources; readonly outcome: SourceParticipation['outcome'] | undefined }[];
  readonly entryState: 'uncollected' | 'valid' | 'invalid';
  readonly invalidEntries: boolean;
  summary?: SourceRecordResult;
  hasContent: boolean;
}
// Loaded SDK record contexts and their nested metadata are immutable snapshots. New metadata
// produces a new context/array; weak ownership lets an unloaded window be collected.
const recordMetadata = new WeakMap<SourceRecordContext, RecordMetadataCache>();
function metadataFor(record: SourceRecordContext): RecordMetadataCache {
  const prior = recordMetadata.get(record);
  if (prior && prior.recordId === record.recordId && prior.kind === record.kind && prior.transient === record.transient
    && prior.callId === record.callId && prior.parentCallId === record.parentCallId && prior.rootCallId === record.rootCallId
    && prior.refs === record.eventRefs && prior.sources === record.eventSources) return prior;
  const entries: RecordMetadataCache['entries'][number][] = [], safeKey: unknown[] = [];
  const rawEntries = record.eventSources;
  const entryState = rawEntries === undefined || Array.isArray(rawEntries) && rawEntries.length === 0 ? 'uncollected'
    : !Array.isArray(rawEntries) ? 'invalid' : 'valid';
  let invalidEntries = false;
  if (entryState === 'valid') {
    const seen = new Set<number>();
    const allowedSeqs = new Set<number>();
    for (const ref of record.eventRefs) allowedSeqs.add(ref.seq);
    for (const item of rawEntries!) {
      const raw = own(item), seq = raw && integer(raw.seq) ? raw.seq : undefined;
      const outcome = raw && ['succeeded', 'failed', 'unknown'].includes(String(raw.outcome)) ? raw.outcome as SourceParticipation['outcome'] : undefined;
      const sources = raw && seq !== undefined && !seen.has(seq) && allowedSeqs.has(seq)
        && (raw.outcome === undefined || outcome !== undefined) ? parseEventSources(raw.sources) : undefined;
      if (!sources || seq === undefined) {
        invalidEntries = true; safeKey.push(['invalid', seq ?? null, outcome ?? null]); continue;
      }
      seen.add(seq); entries.push({ seq, sources, outcome }); safeKey.push([seq, sources, outcome ?? null]);
    }
  }
  const value: RecordMetadataCache = { recordId: record.recordId, kind: record.kind, transient: record.transient,
    callId: record.callId, parentCallId: record.parentCallId, rootCallId: record.rootCallId,
    refs: record.eventRefs, sources: record.eventSources, hasContent: false, entries, entryState, invalidEntries,
    key: JSON.stringify([record.recordId, record.kind, record.transient, record.callId ?? null,
      record.parentCallId ?? null, record.rootCallId ?? null, record.eventRefs.map(ref => [ref.sessionId, ref.seq]), entryState, safeKey]) };
  recordMetadata.set(record, value);
  return value;
}
/** Cache identity uses the original record and metadata revision, excluding any fetched body. */
export function recordedSourceKey(record: SourceRecordContext): string { return metadataFor(record).key; }
/** Only recorded Buildr rule/skill fragments require an original content read. */
export function recordedSourceHasContent(record: SourceRecordContext): boolean {
  recordedSourceSummary(record);
  return metadataFor(record).hasContent;
}

/** Reject malformed or body-bearing metadata instead of treating it as a current-source lookup request. */
export function parseEventSources(value: unknown): EventSources | undefined {
  try {
    const data = own(value);
    if (!data || !keys(data, ['schemaVersion', 'status', 'matches', 'mixed', 'execution', 'diagnostics'])
      || data.schemaVersion !== 'dsh.event-sources/v1' || !['confirmed', 'unknown', 'not-applicable'].includes(String(data.status))
      || !Array.isArray(data.matches) || data.matches.length > MAX_MATCHES
      || (data.mixed !== undefined && typeof data.mixed !== 'boolean')) return undefined;
    const matches: EventSourceMatch[] = [];
    for (const raw of data.matches) {
      const match = own(raw);
      if (!match || !keys(match, ['providedBy', 'kind', 'identity', 'name', 'locator', 'observedVersion', 'evidence', 'action', 'operation', 'targets', 'contentRefs', 'completeness'])
        || !text(match.providedBy, 128) || !['rule', 'skill', 'capability'].includes(String(match.kind))
        || !text(match.identity) || !text(match.name, 512) || !Array.isArray(match.evidence)
        || match.evidence.length < 1 || match.evidence.length > 32) return undefined;
      if (match.locator !== undefined) {
        const locator = own(match.locator);
        if (!locator || !keys(locator, ['path', 'entry', 'workspaceId', 'scope'])
          || !Object.values(locator).every(value => text(value))) return undefined;
      }
      if (match.observedVersion !== undefined) {
        const version = own(match.observedVersion);
        if (!version || !keys(version, ['algorithm', 'digest', 'target'])
          || !['sha1', 'sha256'].includes(String(version.algorithm))
          || typeof version.digest !== 'string'
          || !(version.algorithm === 'sha256' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{40}$/).test(version.digest)
          || !['file', 'content', 'entry'].includes(String(version.target))) return undefined;
      }
      if (!match.evidence.every(raw => {
        const evidence = own(raw);
        return evidence && keys(evidence, ['authority', 'identity', 'digest']) && text(evidence.authority, 256)
          && text(evidence.identity) && (evidence.digest === undefined || text(evidence.digest, 256));
      })) return undefined;
      if (match.action !== undefined && !['load', 'read', 'replace', 'remove', 'call'].includes(String(match.action))) return undefined;
      if (match.operation !== undefined && !text(match.operation, 512)) return undefined;
      if (!['complete', 'partial', 'none'].includes(String(match.completeness))) return undefined;
      if (match.contentRefs !== undefined && (!Array.isArray(match.contentRefs) || match.contentRefs.length > 32
        || !match.contentRefs.every(raw => {
          const ref = own(raw);
          return ref && keys(ref, ['block', 'start', 'end', 'unit']) && integer(ref.block) && integer(ref.start)
            && integer(ref.end) && ref.end >= ref.start && ref.unit === 'utf16';
        }))) return undefined;
      if (match.targets !== undefined && (!Array.isArray(match.targets) || match.targets.length > 32
        || !match.targets.every(raw => {
          const target = own(raw);
          return target && keys(target, ['kind', 'id', 'title']) && ['task', 'material', 'file', 'capability'].includes(String(target.kind))
            && text(target.id) && (target.title === undefined || text(target.title, 512));
        }))) return undefined;
      matches.push(match as unknown as EventSourceMatch);
    }
    if (data.status === 'confirmed' ? matches.length === 0 : matches.length !== 0) return undefined;
    if (data.execution !== undefined) {
      const execution = own(data.execution);
      if (!execution || !keys(execution, ['outcome', 'exitCode'])
        || !['succeeded', 'failed', 'unknown'].includes(String(execution.outcome))
        || (execution.exitCode !== undefined && !Number.isSafeInteger(execution.exitCode))
        || (typeof execution.exitCode === 'number' && execution.exitCode !== 0 && execution.outcome === 'succeeded')) return undefined;
    }
    if (data.diagnostics !== undefined && (!Array.isArray(data.diagnostics) || data.diagnostics.length > 32
      || !data.diagnostics.every(raw => {
        const diagnostic = own(raw);
        return diagnostic && keys(diagnostic, ['code']) && text(diagnostic.code, 128);
      }))) return undefined;
    // Validate every nested namespace before sizing or copying; rejected extra body fields
    // never enter a serialized revision key, byte counter or cloned metadata object.
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_METADATA_BYTES) return undefined;
    return { schemaVersion: 'dsh.event-sources/v1', status: data.status as EventSources['status'], matches: structuredClone(matches),
      ...(data.mixed === undefined ? {} : { mixed: data.mixed as boolean }),
      ...(data.execution === undefined ? {} : { execution: structuredClone(data.execution) as NonNullable<EventSources['execution']> }),
      ...(data.diagnostics === undefined ? {} : { diagnostics: structuredClone(data.diagnostics) as { code: string }[] }) };
  } catch { return undefined; }
}

export function recordedSourceObject(match: EventSourceMatch, content?: string): SourceObject {
  return {
    identity: match.identity, name: match.name, kind: match.kind, providedBy: 'buildr', managedBy: null,
    ...(match.observedVersion ? { capturedVersion: match.observedVersion } : {}),
    capturedCompleteness: match.completeness,
    workspaceId: match.locator?.workspaceId ?? '', scope: match.locator?.scope ?? '',
    selector: { title: match.name, ...(match.locator?.path ? { relativePath: match.locator.path } : {}),
      ...(match.locator?.entry ? { entry: match.locator.entry } : {}) },
    current: null,
    observed: { ...(match.observedVersion?.algorithm === 'sha256' && match.observedVersion.target === 'content'
      ? { digest: `sha256-${match.observedVersion.digest}` } : {}), ...(content === undefined ? {} : { content }) },
    historical: 'recorded',
    evidence: match.evidence.map(evidence => ({ authority: evidence.authority, locator: evidence.identity,
      ...(evidence.digest === undefined ? {} : { digest: evidence.digest }) })),
  };
}

function participation(record: SourceRecordContext, seq: number, match: EventSourceMatch, outcome: SourceParticipation['outcome'], exitCode?: number): SourceParticipation | undefined {
  if (match.action === undefined) return undefined;
  const kind = match.kind === 'capability' ? 'capability-call' : match.action === 'read' ? 'content-read'
    : match.kind === 'skill' ? 'skill-load' : 'rule-load';
  return { kind, title: match.name, action: match.action, source: 'recorded', outcome,
    ...(exitCode === undefined ? {} : { exitCode }),
    eventRefs: [{ sessionId: record.eventRefs.find(ref => ref.seq === seq)?.sessionId ?? '', seq }],
    observationIds: [match.identity], ...(match.operation ? { operation: match.operation } : {}),
    ...(match.targets ? { targets: [...match.targets] } : match.locator?.path ? { targets: [{ kind: 'file', id: match.locator.path }] } : {}),
    ...(match.observedVersion ? { observedVersion: match.observedVersion } : {}) };
}

/** Marker projection is local and body-free. Missing fields are uncollected, never a request to reverse-query. */
export function recordedSourceSummary(record: SourceRecordContext): SourceRecordResult {
  const cache = metadataFor(record);
  if (cache.summary !== undefined) return cache.summary;
  const diagnostics: SourceDiagnostic[] = [];
  const result: RecordedSourceViewResult = { schemaVersion: 'buildr.dsh-event-source-result/v1', workspace: { id: '', scope: '' }, items: [], effects: [] };
  const actions: SourceParticipation[] = [];
  const entries = cache.entries;
  let unknown = false;
  if (cache.entryState === 'uncollected') {
    diagnostics.push({ code: 'source-not-captured', message: '此记录未采集当次来源；未反查当前文件。' });
    unknown = true;
  } else if (cache.entryState === 'invalid') {
    diagnostics.push({ code: 'source-metadata-invalid', message: '当次来源字段无效，原记录仍可查看。' }); unknown = true;
  } else {
    if (cache.invalidEntries) { diagnostics.push({ code: 'source-metadata-invalid', message: '当次来源与原事件引用不一致，原记录仍可查看。' }); unknown = true; }
    for (const entry of entries) {
      const { sources } = entry;
      if (sources.status === 'unknown') unknown = true;
      for (const diagnostic of sources.diagnostics ?? []) diagnostics.push({ code: diagnostic.code, message: '当次来源存在未确认信息；未按当前文件补证。' });
      const matches = sources.matches.filter(match => match.providedBy === 'buildr');
      for (const match of matches) {
        if (match.kind !== 'capability' && match.completeness !== 'none'
          && match.contentRefs?.some(ref => ref.end > ref.start)) cache.hasContent = true;
        const object = recordedSourceObject(match);
        result.items.push({ id: `${record.recordId}:event:${entry.seq}:${match.identity}`, status: 'detected', objects: [object], diagnostic: null,
          ...(sources.mixed ? { mixed: true } : {}) });
        const action = participation(record, entry.seq, match, entry.outcome ?? 'unknown', sources.execution?.exitCode);
        if (action) actions.push(action);
      }
    }
  }
  const objectIdentities = [...new Set(result.items.flatMap(item => item.objects.map(object => object.identity)))];
  const marker = objectIdentities.length ? { status: 'confirmed' as const, basis: 'recorded-source' as const, objectIdentities }
    : { status: unknown ? 'unknown' as const : 'not-applicable' as const };
  const uniqueDiagnostics = [...new Map(diagnostics.map(item => [item.code, item])).values()];
  const summary: SourceRecordResult = { ready: true, recordId: record.recordId, result, marker,
    ...(uniqueDiagnostics.length ? { diagnostics: uniqueDiagnostics } : {}), ...(actions.length ? { participation: actions } : {}) };
  cache.summary = summary;
  return summary;
}
