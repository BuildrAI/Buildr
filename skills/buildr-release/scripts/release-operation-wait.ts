export interface ReleaseWaitOptions {
  action: string; wait?: boolean; waitTimeoutMs?: number; waitIntervalMs?: number;
  [key: string]: unknown;
}
export interface ReleaseOperationObservation {
  status: string; effects?: unknown[]; package?: string; run?: { id?: string | number }; remoteTiming?: unknown;
  [key: string]: unknown;
}
export interface ReleaseWaitDependencies {
  runReleaseOperation?: (options: ReleaseWaitOptions, dependencies: ReleaseWaitDependencies) => Promise<ReleaseOperationObservation>;
  now?: () => number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal;
  onProgress?: (progress: { status: string; package?: string; runId?: string | number; remoteTiming?: unknown; pollWorkMs: number; sleepMs: number }) => void;
}
const WAITING_RELEASE_STATUSES = new Set([
  'candidate-running', 'candidate-dispatch-unconfirmed', 'candidate-retry-unconfirmed',
  'candidate-repair-dispatch-unconfirmed', 'candidate-repair-readback-required', 'main-merge-pending',
  'plugin-preparation-running', 'plugin-preparation-unknown',
  'publication-running', 'publication-dispatch-unconfirmed', 'publication-retry-unconfirmed',
  'publication-readback-required', 'publication-unknown', 'main-merge-readback-required',
]);

/** Continue the same owner state; never infer a new dispatch from a lost response. */
export async function waitForReleaseOperation(options: ReleaseWaitOptions, dependencies: ReleaseWaitDependencies = {}): Promise<ReleaseOperationObservation> {
  const timeoutMs = Number(options.waitTimeoutMs ?? 30 * 60_000), intervalMs = Number(options.waitIntervalMs ?? 30_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12 * 60 * 60_000
    || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000) throw new Error('Release wait timeout or interval is invalid.');
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>(resolve => {
    const signal = dependencies.signal;
    if (signal?.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  }));
  const run = dependencies.runReleaseOperation;
  if (!run) throw new Error('Release wait requires its operation owner.');
  const startedAt = now(), allEffects: unknown[] = [];
  let pollWorkMs = 0, sleepMs = 0;
  let polls = 0, previousPhase: string | null = null, action = options.action;
  let latest: ReleaseOperationObservation | null = null;
  const cancelled = (value: ReleaseOperationObservation) => ({ ...value, effects: allEffects,
    waiting: { status: 'cancelled', polls, durationMs: now() - startedAt, pollWorkMs, sleepMs } });
  for (;;) {
    // In-flight owner work must finish observing its effects. Cancellation at
    // rest never starts another owner action, especially a publication resume.
    if (dependencies.signal?.aborted) {
      if (latest) return cancelled(latest);
      dependencies.signal.throwIfAborted();
    }
    const pollStartedAt = now();
    const value = await run({ ...options, action, detail: 'full' }, dependencies);
    latest = value;
    pollWorkMs += now() - pollStartedAt;
    allEffects.push(...(value.effects ?? [])); polls++;
    const phase = `${value.status}:${value.package ?? ''}:${value.run?.id ?? ''}:${JSON.stringify(value.remoteTiming ?? null)}`;
    if (phase !== previousPhase) { dependencies.onProgress?.({ status: value.status, package: value.package, runId: value.run?.id, remoteTiming: value.remoteTiming, pollWorkMs, sleepMs }); previousPhase = phase; }
    const waiting = options.wait === true && WAITING_RELEASE_STATUSES.has(value.status);
    const durationMs = now() - startedAt;
    if (!waiting || durationMs >= timeoutMs || dependencies.signal?.aborted) return { ...value, effects: allEffects,
      waiting: { status: dependencies.signal?.aborted ? 'cancelled' : waiting ? 'timed-out' : 'settled', polls, durationMs, pollWorkMs, sleepMs } };
    // A public request has already been persisted by the owner. Only resume it.
    if (action === 'publish') action = 'resume';
    const sleepStartedAt = now();
    await sleep(Math.min(intervalMs, timeoutMs - durationMs));
    sleepMs += now() - sleepStartedAt;
  }
}
