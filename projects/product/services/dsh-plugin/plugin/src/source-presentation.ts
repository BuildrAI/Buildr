/** Pure presentation identities and diagnostic copy; no ownership parsing. */
import type { SourceObject, SourceQueryResult, RecordedSourceViewResult, SourceRecordResult, SourceParticipation } from './source-types.ts';
import type { BuildrKey } from './locales.ts';
export interface PresentedSourceObject { key: string; object: SourceObject }
const objectsByResult = new WeakMap<SourceQueryResult | RecordedSourceViewResult, PresentedSourceObject[]>();

/** Localized result wording describes the recorded action, never its adoption or business value. */
export function sourceOutcomeKey(item: Pick<SourceParticipation, 'kind' | 'action' | 'outcome'> | undefined): BuildrKey {
  if (item?.outcome === undefined || item.outcome === 'unknown') return 'sourceOutcomeUnknown';
  if (item.kind === 'capability-call') return item.outcome === 'failed' ? 'sourceExecutionFailed' : 'sourceExecutionSucceeded';
  if (item.outcome === 'failed') return 'sourceActionFailed';
  if (item.action === 'remove') return 'sourceRemovedOutcome';
  if (item.action === 'replace') return 'sourceReplacedOutcome';
  return item.kind === 'content-read' ? 'sourceReadOutcome' : 'sourceLoadedOutcome';
}
/** User materials are operation targets, never Buildr method content. */
export function isBuildrMethod(object: SourceObject): boolean {
  return (object.kind === 'rule' || object.kind === 'skill' || object.kind === 'capability')
    && object.providedBy === 'buildr';
}
/** All three views use the recorded source mark, never current ownership or viewer inference. */
export function isBuildrRecord(value: SourceRecordResult): boolean {
  return value.marker?.status === 'confirmed' && value.marker.basis === 'recorded-source';
}
/** Names remain readable while complete identities stay available as evidence. */
export function sourceObjectName(object: SourceObject): string {
  if (object.name) return object.name;
  const selector = object.selector;
  if (object.kind === 'rule' && (selector.managedBlock === 'buildr:required' || object.identity.endsWith(':managed-block:buildr:required'))) return 'Buildr 核心规则';
  const name = selector.skill ?? selector.skillId ?? selector.ruleId ?? selector.rule ?? selector.capabilityId ?? selector.capability ?? selector.name;
  if (typeof name === 'string' && name.length > 0) return name;
  const file = selector.path ?? selector.file;
  if (typeof file === 'string') return file.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
  return object.identity.split(':').slice(-2).join(' · ');
}
function ordered(value: Record<string,string|number>): [string,string|number][] { return Object.entries(value).sort(([left],[right])=>left.localeCompare(right)); }
/** Keep different observations separate, combining only equal content, identity and fragment facts.
 * @param result One authoritative result for the selected record.
 * @returns Stable presentation selectors with the union of repeated evidence.
 */
export function sourceObjects(result: SourceQueryResult | RecordedSourceViewResult): PresentedSourceObject[] {
  const cached = objectsByResult.get(result);
  if (cached !== undefined) return cached;
  const byKey=new Map<string,PresentedSourceObject>();
  for(const item of result.items)for(const object of item.objects){
    const key=JSON.stringify([object.identity,object.kind,object.workspaceId,object.scope,ordered(object.selector),object.providedBy,object.managedBy,
      object.name??null,object.capturedVersion===undefined?null:[object.capturedVersion.algorithm,object.capturedVersion.digest,object.capturedVersion.target],object.capturedCompleteness??null,object.current?.digest??null,object.current?.content??null,object.observed.digest??null,object.observed.content??null,object.historical,
      object.selection===undefined?null:[object.selection.startOffset,object.selection.endOffset,object.selection.unit]]);
    const existing=byKey.get(key);
    if(existing===undefined){byKey.set(key,{key,object:{...object,evidence:[...object.evidence]}});continue;}
    const seen=new Set(existing.object.evidence.map(evidence=>JSON.stringify([evidence.authority,evidence.locator,evidence.digest??null])));
    for(const evidence of object.evidence){const id=JSON.stringify([evidence.authority,evidence.locator,evidence.digest??null]);if(!seen.has(id)){existing.object.evidence.push(evidence);seen.add(id);}}
  }
  const objects = [...byKey.values()];
  objectsByResult.set(result, objects);
  return objects;
}
/** Select localized distinctions for missing evidence, failed reads and supported history limits. */
export function sourceDiagnosticKey(code:string):BuildrKey {
  if (/^source_[a-z_]+_conflict$/.test(code)) return 'sourceEvidenceConflict';
  switch(code){
    case 'source-not-captured':return 'sourceNotCaptured';
    case 'source-metadata-invalid':return 'sourceMetadataInvalid';
    case 'source-capture-unknown':return 'sourceUnknown';
    case 'source-content-unavailable':return 'sourceContentUnavailable';
    case 'source_user_material_excluded':return 'sourceNotApplicable';
    case 'source_not_proven':return 'sourceNotProven';
    case 'source_input_conflict':case 'source_task_conflict':case 'source_workspace_conflict':return 'sourceEvidenceConflict';
    case 'source-not-applicable':return 'sourceNotApplicable';
    case 'source-query-conflict':return 'sourceEvidenceConflict';
    case 'source-no-durable-record':case 'source-no-durable-event':return 'sourceTransient';
    case 'source-skill-locator-missing':case 'skill-locator-missing':return 'sourceSkillEvidenceMissing';
    case 'source-locator-missing':return 'sourceEvidenceMissing';
    case 'source-locator-base-missing':return 'sourceLocatorBaseMissing';
    case 'source-history-unproven':case 'history-unproven':return 'sourceHistoricalUnknown';
    case 'source-tool-failed':return 'sourceReadNotSucceeded';
    case 'source-event-mismatch':case 'source-call-mismatch':case 'source-record-mismatch':return 'sourceEvidenceConflict';
    case 'source-observation-limit':return 'sourceEvidenceLimited';
    default:return 'sourceUnavailable';
  }
}
export type SourceDiagnosticGroup = 'none' | 'pending' | 'evidence' | 'error';
/** Absence of source assets is not a read failure; unknown failures remain visible. */
export function sourceDiagnosticGroup(code: string): SourceDiagnosticGroup {
  if (/^source_[a-z_]+_conflict$/.test(code)) return 'evidence';
  switch (code) {
    case 'source-not-captured': return 'none';
    case 'source-metadata-invalid': case 'source-capture-unknown': return 'evidence';
    case 'source_user_material_excluded': return 'none';
    case 'source_not_proven': return 'none';
    case 'source_input_conflict':case 'source_task_conflict':case 'source_workspace_conflict':return 'evidence';
    case 'source-not-applicable': return 'none';
    case 'source-no-durable-record': case 'source-no-durable-event': return 'pending';
    case 'source-skill-locator-missing': case 'skill-locator-missing':
    case 'source-locator-missing': case 'source-locator-base-missing':
    case 'source-history-unproven': case 'history-unproven': case 'source-observation-limit': return 'evidence';
    default: return 'error';
  }
}
export interface PresentedSourceDiagnostic { code: string; group: 'evidence' | 'error' }
/** Collect sanitized, distinct diagnostic codes without exposing messages or record identities.
 * @param value One authoritative record result, including partial successful results.
 * @returns Evidence limitations and actual errors; no-source and transient records are omitted.
 */
export function sourceResultDiagnostics(value: SourceRecordResult): PresentedSourceDiagnostic[] {
  const codes = value.ready ? [...(value.diagnostics ?? []).map(diagnostic => diagnostic.code),
    ...value.result.items.flatMap(item => {
      const codes = item.diagnostic === null ? [] : [item.diagnostic.code];
      if (item.diagnostic === null || sourceDiagnosticGroup(item.diagnostic.code) !== 'error') {
        if (item.status === 'error') codes.push('source-query-failed');
        if (item.status === 'conflict') codes.push('source-query-conflict');
      }
      return codes;
    })] : [value.code];
  return [...new Set(codes)].flatMap(code => {
    const group = sourceDiagnosticGroup(code);
    return group === 'evidence' || group === 'error' ? [{ code, group }] : [];
  });
}
