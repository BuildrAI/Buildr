import fs from 'node:fs';
import path from 'node:path';

/** Persisted per-runner step durations observed in closed Candidate runs.
 * A step whose observed duration approaches its declared timeout tends to
 * survive locally yet die remotely where queueing and shared workers inflate
 * it. Recording real durations once, at evidence readback, lets the next
 * dispatch warn before paying for a doomed remote run. */

export interface StepTimingObservation {
  readonly runner: string;
  readonly durationMs: number;
  readonly runId: number;
  readonly observedAt: string;
}

type TimingStore = Record<string, Record<string, StepTimingObservation[]>>;

const MAX_OBSERVATIONS = 12;

export function timingsFilePath(buildrServiceRoot: string): string {
  return path.join(buildrServiceRoot, 'build', 'verification', 'candidate-step-timings.json');
}

export function readStepTimings(buildrServiceRoot: string): TimingStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(timingsFilePath(buildrServiceRoot), 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.schemaVersion === 'buildr.candidate-step-timings/v1' ? parsed.steps ?? {} : {};
  } catch {
    return {};
  }
}

function writeStepTimings(buildrServiceRoot: string, steps: TimingStore): void {
  const file = timingsFilePath(buildrServiceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 'buildr.candidate-step-timings/v1', steps }, null, 2)}\n`);
}

function pushObservation(bucket: StepTimingObservation[], observation: StepTimingObservation): StepTimingObservation[] {
  const merged = [...bucket.filter(item => !(item.runId === observation.runId && Math.abs(item.durationMs - observation.durationMs) < 1)), observation];
  merged.sort((left, right) => right.durationMs - left.durationMs);
  return merged.slice(0, MAX_OBSERVATIONS).sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

/** Record per-step durations from a closed Candidate aggregate. Accepts the
 * aggregate's timing.checks entries; reused results contribute their
 * original duration, tagged to the runner that produced it. */
export function recordCandidateStepTimings(buildrServiceRoot: string, aggregate: any, runId: number): number {
  const checks = aggregate?.timing?.checks;
  if (!Array.isArray(checks) || !Number.isSafeInteger(runId)) return 0;
  const observedAt = aggregate.workflow?.runId ? new Date().toISOString() : new Date().toISOString();
  const store = readStepTimings(buildrServiceRoot);
  let recorded = 0;
  const push = (stepId: string, durationMs: number, runner: string) => {
    if (!stepId || !Number.isSafeInteger(durationMs) || durationMs <= 0 || !runner) return;
    store[stepId] ??= {};
    store[stepId][runner] = pushObservation(store[stepId][runner] ?? [], { runner, durationMs, runId, observedAt });
    recorded += 1;
  };
  for (const check of checks) {
    // A check id carries its runner suffix (`...-macos`, `...-windows`); the
    // workflow object only names the job. Reused results keep the runner that
    // produced the reused evidence, not the shard that adopted it.
    const shardRunner = (typeof check?.id === 'string' && check.id.match(/-([a-z]+)$/)?.[1]) || null;
    const runner = check?.runner?.os ?? check?.workflow?.runner?.os ?? shardRunner;
    const results = Array.isArray(check?.results) ? check.results : [];
    for (const result of results) {
      if (result?.status !== 'passed') continue;
      const duration = Number.isSafeInteger(result?.durationMs) && result.durationMs > 0
        ? result.durationMs
        : result?.reusedFrom?.durationMs;
      const resultRunner = result?.reusedFrom?.origin?.runner?.os ?? runner;
      push(result?.id, duration, resultRunner);
      // A single volatile phase (a fresh package install racing shared CI
      // networking) can blow a step whose own total stays well under the
      // threshold; record phases under a compound key so the lint below can
      // warn on phase dominance before it fails remotely.
      const phases = result?.disposition === 'reused' ? result?.originPhases ?? [] : result?.phases ?? [];
      for (const phase of phases) {
        if (typeof phase?.id === 'string' && Number.isSafeInteger(phase?.durationMs) && phase.durationMs > 0) {
          push(`${result?.id}::${phase.id}`, phase.durationMs, resultRunner);
        }
      }
    }
  }
  if (recorded > 0) writeStepTimings(buildrServiceRoot, store);
  return recorded;
}

export interface TimeoutWarning {
  readonly stepId: string;
  readonly runner: string;
  readonly timeoutMs: number;
  readonly maxObservedMs: number;
  readonly ratio: number;
}

/** Compare declared step timeouts against recorded remote durations. A step
 * is only warned for a runner where it has actually been observed; unobserved
 * platform steps stay silent instead of guessing. */
export function lintCandidateStepTimeouts(buildrServiceRoot: string, steps: any[], threshold = 0.8): TimeoutWarning[] {
  const store = readStepTimings(buildrServiceRoot);
  const warnings: TimeoutWarning[] = [];
  for (const step of steps) {
    const timeoutMs = step?.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) continue;
    for (const [stepId, thresholdRatio] of [[step.id, threshold], [`${step.id}::package-installation`, 0.5]] as const) {
      const observations = store[stepId];
      if (!observations) continue;
      for (const [runner, entries] of Object.entries(observations)) {
        const maxObserved = Math.max(...(entries as StepTimingObservation[]).map(item => item.durationMs));
        // Fresh package installs swing hardest across shared CI runners; a
        // phase already half the step budget leaves no room for that swing.
        if (maxObserved > timeoutMs * thresholdRatio) warnings.push({ stepId, runner, timeoutMs, maxObservedMs: maxObserved, ratio: Math.round((maxObserved / timeoutMs) * 100) / 100 });
      }
    }
  }
  return warnings;
}
