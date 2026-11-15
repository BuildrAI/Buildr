/** Optional observations attached to original inputs/tools, never a second execution log. */
export type ParticipationKind = 'instruction' | 'rule' | 'skill-catalog' | 'skill' | 'capability' | 'cli' | 'script';
export type ParticipationOutcome = 'pending' | 'succeeded' | 'failed' | 'unknown';
export interface ParticipationMeasure {
  utf8Bytes: number;
  utf16Units: number;
  boundary: 'native-observed' | 'stored-visible' | 'submitted';
  completeness: 'complete' | 'partial' | 'unknown';
  /** Completeness of the upstream source, distinct from the text actually received. */
  upstreamCompleteness?: 'complete' | 'partial' | 'unknown';
}
export interface ParticipationSource {
  identity: string;
  name: string;
  kind: ParticipationKind;
  providedBy: 'buildr' | 'workspace' | 'external' | 'unknown';
  status: 'confirmed' | 'candidate' | 'unknown';
  managedBy?: 'buildr' | null;
  contentScope?: 'whole' | 'fragment';
  locator?: string;
  observedVersion?: string;
  offeredVersion?: string;
}
export interface ParticipationMatch extends ParticipationSource {
  action: 'available' | 'submitted' | 'requested' | 'observed';
  input?: ParticipationMeasure;
  output?: ParticipationMeasure;
}
export interface ParticipationObservation {
  version: 1;
  parserVersion: 1;
  matches: ParticipationMatch[];
  input?: ParticipationMeasure;
  output?: ParticipationMeasure;
  outcome: ParticipationOutcome;
  exitCode?: number;
  coverage: 'complete' | 'partial';
  gaps: string[];
}
export interface ParticipationInput {
  version: 1;
  submittedAt: string;
  segments: ParticipationMatch[];
  available: ParticipationSource[];
  coverage: 'complete' | 'partial';
  gaps: string[];
  context?: { id: string; inherited: boolean };
}
export interface ParticipationFact extends ParticipationMatch {
  repeated?: boolean;
  conversationId: string;
  runId: string;
  participantId: string;
  generation?: string;
  provider?: string;
  model?: string;
  startedAt: string;
  evidence: { entryId?: string; entryRevision?: string; inputId?: string };
  outcome: ParticipationOutcome;
}
export interface ParticipationView {
  schemaVersion: 'buildr.agent-participation/v1';
  contextConfiguration: 'new' | 'inherited' | 'unknown';
  contextUsage?: {usedTokens?:number;usedRatio?:number;windowTokens?:number};
  runStatus?: string;
  workspaceId: string;
  conversationId: string;
  runId: string;
  revision: string;
  coverage: 'complete' | 'partial' | 'not-collected';
  gaps: string[];
  items: ParticipationFact[];
  nextCursor?: string;
}
export interface ParticipationSummaryInput {
  from?: string;
  to?: string;
  provider?: string;
  model?: string;
  kind?: ParticipationKind;
  identity?: string;
  version?: string;
  cursor?: string;
  limit?: number;
}
export interface ParticipationSummaryRow {
  identity: string;
  name: string;
  kind: ParticipationKind;
  providedBy: ParticipationSource['providedBy'];
  managedBy: 'buildr' | null;
  status: ParticipationSource['status'];
  version: string | null;
  versionBasis: 'observed' | 'offered' | 'unknown';
  runs: number;
  availableRuns: number;
  requestedAvailableRuns: number;
  observableUseRatio: number | null;
  submitted: number;
  requested: number;
  observed: number;
  succeeded: number;
  failed: number;
  pending: number;
  unknown: number;
  failureRatio: number | null;
  repeatedRequests: number | null;
  inputBytes: number;
  outputBytes: number;
  partialMeasures: number;
  unknownMeasures: number;
  evidence: Array<{ conversationId: string; runId: string; entryId?: string; entryRevision?: string }>;
}
export interface ParticipationSummary {
  schemaVersion: 'buildr.agent-participation-summary/v1';
  workspaceId: string;
  revision: string;
  range: { from: string; to: string };
  coverage: 'complete' | 'partial' | 'not-collected';
  runs: number;
  collectedRuns: number;
  gaps: string[];
  rows: ParticipationSummaryRow[];
  nextCursor?: string;
}
export interface ParticipationSourceRequest {
  ref: { sourceId: string; id: string };
  observations: Array<{ id: string; kind: ParticipationKind; path?: string; name?: string }>;
  discover?: boolean;
  provider?: string;
}
export interface ParticipationSourceResult {
  version: 1;
  sources: Array<ParticipationSource & { observationId?: string }>;
  coverage: 'complete' | 'partial';
  gaps: string[];
}
