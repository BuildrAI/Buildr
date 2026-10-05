/** Recorded source metadata is the only discovery input; names and paths never classify ownership. */
import type { TrajectoryRecordContext, TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { SourceParticipationKind, SourceParticipationOutcome } from './source-types.ts';
import { recordedSourceSummary } from './event-sources.ts';
import { sourceObjectName } from './source-presentation.ts';
export interface SourceCandidate { readonly record: TrajectoryRecordContext; readonly kind?: SourceParticipationKind; readonly title: string; readonly outcome: SourceParticipationOutcome; readonly locators: readonly string[]; readonly time?: number }
const candidatesBySnapshot = new WeakMap<TrajectorySnapshot, { candidates: readonly SourceCandidate[]; index: ReadonlyMap<string, SourceCandidate> }>();
export function sourceCandidateIndex(trajectory: TrajectorySnapshot): ReadonlyMap<string, SourceCandidate> {
  discoverSourceCandidates(trajectory); return candidatesBySnapshot.get(trajectory)!.index;
}
/** Enumerate producer metadata in the loaded window, without calling the Host or reading the current filesystem. */
export function discoverSourceCandidates(trajectory: TrajectorySnapshot): readonly SourceCandidate[] {
  const cached = candidatesBySnapshot.get(trajectory); if (cached !== undefined) return cached.candidates;
  const candidates = (trajectory.recordContexts ?? []).flatMap(record => {
    if (!record.eventSources?.length) return [];
    const value = recordedSourceSummary(record), action = value.participation?.[0];
    const time = trajectory.eventNodes.find(node => record.eventRefs.some(ref => ref.seq === node.seq))?.time;
    return [{ record, ...(action ? { kind: action.kind } : {}), title: action?.title ?? (value.ready ? value.result.items.flatMap(item => item.objects.map(sourceObjectName)).join(' · ') : ''), outcome: action?.outcome ?? 'unknown' as const,
      locators: value.ready ? value.result.items.flatMap(item => item.objects.flatMap(object => typeof object.selector.relativePath === 'string' ? [object.selector.relativePath] : [])) : [],
      ...(time === undefined ? {} : { time }) }];
  });
  candidatesBySnapshot.set(trajectory, { candidates, index: new Map(candidates.map(candidate => [candidate.record.recordId, candidate])) }); return candidates;
}
