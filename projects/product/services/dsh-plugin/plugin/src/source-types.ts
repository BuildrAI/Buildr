/** JSON asset-query and recorded event-source contracts. */
export interface EventSourceContentRef {
  readonly block: number; readonly start: number; readonly end: number; readonly unit: 'utf16';
}
export interface EventSourceMatch {
  readonly providedBy: string;
  readonly kind: 'rule' | 'skill' | 'capability';
  readonly identity: string;
  readonly name: string;
  readonly locator?: { readonly path?: string; readonly entry?: string; readonly workspaceId?: string; readonly scope?: string };
  readonly observedVersion?: { readonly algorithm: 'sha1' | 'sha256'; readonly digest: string; readonly target: 'file' | 'content' | 'entry' };
  readonly evidence: readonly { readonly authority: string; readonly identity: string; readonly digest?: string }[];
  readonly action?: 'load' | 'read' | 'replace' | 'remove' | 'call';
  readonly operation?: string;
  readonly targets?: readonly SourceParticipationTarget[];
  readonly contentRefs?: readonly EventSourceContentRef[];
  readonly completeness: 'complete' | 'partial' | 'none';
}
export interface EventSources {
  readonly schemaVersion: 'dsh.event-sources/v1';
  readonly status: 'confirmed' | 'unknown' | 'not-applicable';
  readonly matches: readonly EventSourceMatch[];
  readonly mixed?: boolean;
  readonly execution?: { readonly outcome: 'succeeded' | 'failed' | 'unknown'; readonly exitCode?: number };
  readonly diagnostics?: readonly { readonly code: string }[];
}
/** Wire codecs carry strings; process input/output parsers require sha256- plus exactly 64 lowercase hex digits. */
export type SourceDigest = string;
export interface SourceLocator { path?: string; resourceBase?: string; provider?: string; adapterId?: string }
export interface SourceObservation {
  id: string;
  type: 'file' | 'skill' | 'task-brief' | 'task-material' | 'capability';
  locator?: SourceLocator;
  observedContent?: string;
  observedDigest?: SourceDigest;
  taskId?: string;
  materialId?: string;
  capabilityId?: string;
  version?: number;
}
export interface SourceObservations {
  schemaVersion: 'buildr.agent-asset-source-observations/v1';
  scope?: string;
  mode?: 'metadata' | 'content';
  observations: SourceObservation[];
}
export interface SourceDiagnostic { code: string; message: string }
export interface SourceObject {
  identity: string;
  kind: 'rule' | 'skill' | 'task-brief' | 'task-material' | 'capability';
  scope: string;
  workspaceId: string;
  providedBy: 'buildr' | 'workspace' | 'openspec' | 'external' | 'unknown';
  managedBy: 'buildr' | null;
  /** Captured human-readable identity, independent of current file names. */
  name?: string;
  capturedVersion?: EventSourceMatch['observedVersion'];
  capturedCompleteness?: EventSourceMatch['completeness'];
  selector: Record<string, string | number>;
  current: { content: string; digest: SourceDigest } | null;
  observed: { content?: string; digest?: SourceDigest };
  historical: 'matched-current' | 'different' | 'unknown' | 'recorded';
  evidence: { authority: string; locator: string; digest?: SourceDigest }[];
  selection?: { startOffset: number; endOffset: number; unit: 'utf16' };
}
export interface SourceQueryItem {
  id: string;
  status: 'detected' | 'unknown' | 'conflict' | 'error';
  objects: SourceObject[];
  diagnostic: SourceDiagnostic | null;
  mixed?: boolean;
}
export interface SourceQueryResult {
  schemaVersion: 'buildr.agent-asset-source-result/v1';
  workspace: { id: string; scope: string };
  items: SourceQueryItem[];
  effects: [];
}
/** Derived solely from immutable DSH event metadata and optional original content slices. */
export interface RecordedSourceViewResult {
  schemaVersion: 'buildr.dsh-event-source-result/v1';
  workspace: { id: string; scope: string };
  items: SourceQueryItem[];
  effects: [];
}
/** Exact event addresses permitted at the Remote boundary; no client provenance travels as authority. */
export interface SourceRecordAddress {
  readonly recordId: string;
  readonly kind: 'system' | 'user' | 'context' | 'compacted' | 'message' | 'tool' | 'subtool';
  readonly eventRefs: readonly { readonly sessionId: string; readonly seq: number }[];
  readonly callId?: string;
  readonly parentCallId?: string;
  readonly rootCallId?: string;
  readonly transient: boolean;
}
/** Loaded metadata stays local and is independently validated before presentation. */
export interface SourceRecordContext extends SourceRecordAddress {
  /** Small provenance already returned by the original loaded-record projection. Never includes bodies. */
  readonly eventSources?: readonly { readonly seq: number; readonly sources: unknown; readonly outcome?: SourceParticipationOutcome }[];
}
export interface SourceRecordRequest {
  readonly sessionId: string;
  readonly record: SourceRecordAddress;
  /** Marker reads exclude bodies; explicit content reads slice only original event text. */
  readonly mode?: 'marker' | 'content';
}
/** One source dimension shared by the original trajectory and its Buildr-filtered view. */
export interface SourceRecordMarker {
  readonly status: 'confirmed' | 'unknown' | 'not-applicable';
  /** Current object association never claims the historical provider or content version. */
  readonly basis?: 'bound-buildr-entry' | 'current-buildr-object' | 'recorded-source';
  readonly objectIdentities?: readonly string[];
}
/** Actions and ownership captured in the original DSH event. */
export type SourceParticipationKind = 'rule-load' | 'skill-load' | 'content-read' | 'capability-call';
export type SourceParticipationOutcome = 'succeeded' | 'failed' | 'unknown';
export interface SourceParticipationTarget {
  kind: 'task' | 'material' | 'file' | 'capability';
  id: string;
  title?: string;
}
export interface SourceParticipation {
  kind: SourceParticipationKind;
  title: string;
  outcome: SourceParticipationOutcome;
  /** Actual process fact captured by the same original event, never decoded from output text. */
  exitCode?: number;
  source?: 'bound-buildr-entry' | 'unconfirmed' | 'recorded';
  eventRefs: SourceRecordContext['eventRefs'];
  observationIds?: string[];
  action?: 'load' | 'replace' | 'remove' | 'read' | 'call';
  operation?: string;
  observedVersion?: { algorithm: 'sha1' | 'sha256'; digest: string; target?: 'file' | 'content' | 'entry' };
  targets?: SourceParticipationTarget[];
}
export type SourceRecordResult =
  | { ready: false; code: string; message: string; readonly marker?: SourceRecordMarker; readonly participation?: readonly SourceParticipation[] }
  | { ready: true; recordId: string; result: SourceQueryResult | RecordedSourceViewResult; readonly marker?: SourceRecordMarker; readonly diagnostics?: readonly SourceDiagnostic[]; readonly participation?: readonly SourceParticipation[] };
