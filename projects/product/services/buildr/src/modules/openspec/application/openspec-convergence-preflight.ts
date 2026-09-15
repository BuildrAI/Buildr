import { convergenceDigest, type ConvergenceBlocker, type ExecutableIdentity } from './convergence-model.ts';
import type { ConvergenceContext } from './openspec-converge.ts';
export type ActiveChangeObservation = { change: string; status: string; deltaDigest: string | null; diagnosticCode: string | null };
export function runOpenSpecConvergencePreflight({ context, executableIdentity, activeConflicts = [], activeChanges = [], startedAt = Date.now(), commandCountOffset = 0 }: {
  context: ConvergenceContext; executableIdentity: ExecutableIdentity; activeConflicts?: ConvergenceBlocker[];
  activeChanges?: ActiveChangeObservation[]; startedAt?: number; commandCountOffset?: number;
}) {
  const observations = [...activeChanges].sort((a, b) => a.change.localeCompare(b.change));
  return { change: context.change, project: context.project, status: activeConflicts.length ? 'blocked' : 'ready',
    readinessIdentity: convergenceDigest({ change: context.change, delta: context.delta.hash, executableIdentity, observations }),
    executableIdentity, activeChanges: observations, blockers: activeConflicts, effects: [],
    durationMs: Date.now() - startedAt, commandCount: commandCountOffset,
    nextActions: activeConflicts.length ? ['处理本次相关规范冲突后重试。'] : ['按已授权范围继续；只同步不归档，归档时重新观察当前输入。'] };
}
