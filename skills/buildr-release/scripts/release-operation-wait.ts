import { spawn } from 'node:child_process';
import { releasePublishAuthority } from './release-authority.ts';
import { releaseQueuePolicy } from './github-queue-recovery.ts';

export interface ReleaseWaitOptions {
  action: string; wait?: boolean; waitTimeoutMs?: number; waitIntervalMs?: number;
  [key: string]: unknown;
}
export interface ReleaseOperationObservation {
  status: string; effects?: unknown[]; package?: string; run?: { id?: string | number }; remoteTiming?: unknown;
  [key: string]: unknown;
}
export interface ReleaseRunWatch {
  runId: string | number; timeoutMs: number; intervalSeconds: number; ghCommand: string; cwd?: string; signal?: AbortSignal;
}
export interface ReleaseRunWatchResult {
  status: 'completed' | 'timed-out' | 'cancelled' | 'failed'; exitCode?: number | null; message?: string;
}
export interface ReleaseWaitDependencies {
  watchRun?: (request: ReleaseRunWatch) => Promise<ReleaseRunWatchResult>;
  runReleaseOperation?: (options: ReleaseWaitOptions, dependencies: ReleaseWaitDependencies) => Promise<ReleaseOperationObservation>;
  now?: () => number; signal?: AbortSignal;
  onProgress?: (progress: { status: string; package?: string; runId?: string | number; remoteTiming?: unknown; pollWorkMs: number; sleepMs: number }) => void;
}
const WAITING_RELEASE_STATUSES = new Set([
  'candidate-running', 'candidate-dispatch-unconfirmed', 'candidate-retry-unconfirmed',
  'candidate-repair-dispatch-unconfirmed', 'candidate-repair-readback-required', 'main-merge-pending',
  'plugin-preparation-running', 'plugin-preparation-unknown',
  'publication-running', 'publication-dispatch-unconfirmed', 'publication-retry-unconfirmed',
  'publication-readback-required', 'publication-unknown', 'main-merge-readback-required',
]);

/** Wait on one native command; cancellation only stops the local watcher, never the remote run. */
export async function watchReleaseRun(request: ReleaseRunWatch): Promise<ReleaseRunWatchResult> {
  if (!/^[1-9][0-9]*$/u.test(String(request.runId)) || !Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1
      || !Number.isSafeInteger(request.intervalSeconds) || request.intervalSeconds < 1) throw new Error('Invalid GitHub run watch identity or budget.');
  if (request.signal?.aborted) return { status: 'cancelled' };
  return new Promise(resolve => {
    const child = spawn(request.ghCommand, ['run', 'watch', String(request.runId), '--repo', releasePublishAuthority.repository,
      '--exit-status', '--interval', String(request.intervalSeconds)], { cwd: request.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false, aborted = false;
    let error: Error | undefined;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      child.kill('SIGTERM');
      forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 5_000);
    };
    const abort = () => { aborted = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, request.timeoutMs);
    // Keep stdout available for the caller's structured result.
    child.stdout?.on('data', chunk => process.stderr.write(chunk));
    child.stderr?.on('data', chunk => process.stderr.write(chunk));
    child.on('error', value => { error = value; });
    child.on('close', code => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      request.signal?.removeEventListener('abort', abort);
      resolve({ status: aborted ? 'cancelled' : timedOut ? 'timed-out' : error ? 'failed' : 'completed', exitCode: code,
        ...(error ? { message: error.message } : {}) });
    });
    request.signal?.addEventListener('abort', abort, { once: true });
    if (request.signal?.aborted) abort();
  });
}

/** Continue the same owner state; never infer a new dispatch from a lost response. */
export async function waitForReleaseOperation(options: ReleaseWaitOptions, dependencies: ReleaseWaitDependencies = {}): Promise<ReleaseOperationObservation> {
  const timeoutMs = Number(options.waitTimeoutMs ?? 30 * 60_000), intervalMs = Number(options.waitIntervalMs ?? 30_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12 * 60 * 60_000
    || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000) throw new Error('Release wait timeout or interval is invalid.');
  const now = dependencies.now ?? Date.now;
  const run = dependencies.runReleaseOperation;
  if (!run) throw new Error('Release wait requires its operation owner.');
  const startedAt = now(), allEffects: unknown[] = [];
  let pollWorkMs = 0, sleepMs = 0;
  let completedWatchRun: string | number | undefined;
  let watchMs = 0;
  let polls = 0, previousPhase: string | null = null, action = options.action;
  let latest: ReleaseOperationObservation | null = null;
  const cancelled = (value: ReleaseOperationObservation) => ({ ...value, effects: allEffects,
    waiting: { status: 'cancelled', polls, durationMs: now() - startedAt, pollWorkMs, sleepMs, watchMs } });
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
      waiting: { status: dependencies.signal?.aborted ? 'cancelled' : waiting ? 'timed-out' : 'settled', polls, durationMs, pollWorkMs, sleepMs, watchMs } };
    // A public request has already been persisted by the owner. Only resume it.
    if (action === 'publish') action = 'resume';
    // A missing dispatch identity is a readback gap, not permission to poll or dispatch again.
    const record = value as Record<string, any>;
    const runId = value.run?.id ?? (value.status.startsWith('publication-')
      ? record.packagePublications?.[value.package ?? '']?.runId ?? record.publication?.runId
      : !/main-merge|dispatch-unconfirmed|readback-required/u.test(value.status) ? record.candidate?.runId : undefined);
    const finish = (status: string, diagnostic?: unknown) => ({ ...value, effects: allEffects,
      waiting: { status, polls, durationMs: now() - startedAt, pollWorkMs, sleepMs, watchMs }, ...(diagnostic ? { diagnostic } : {}) });
    if (!runId) return finish('readback-required');
    if (completedWatchRun === runId) return finish('readback-required', { code: 'release-watch-readback-required', message: 'Watch finished but terminal owner evidence is not yet available.' });
    const watch = dependencies.watchRun ?? watchReleaseRun;
    const watchStartedAt = now();
    // Periodic command deadlines allow queue recovery and local artifact handoff; gh owns status polling.
    // Publication runs can wait on a protected environment. Return to the
    // owner within the poll interval so it can approve the pending deployment;
    // using the full queue budget would leave the run waiting for minutes.
    const budget = Math.min(timeoutMs - durationMs, releaseQueuePolicy(options).timeoutSeconds * 1000,
      value.status === 'candidate-running' || value.status === 'publication-running' ? intervalMs : Infinity);
    const watched = await watch({ runId, timeoutMs: budget, intervalSeconds: Math.max(1, Math.ceil(intervalMs / 1000)),
      ghCommand: String(options.ghCommand ?? 'gh'), cwd: typeof options.workspace === 'string' ? options.workspace : undefined, signal: dependencies.signal });
    watchMs += now() - watchStartedAt;
    if (dependencies.signal?.aborted || watched.status === 'cancelled') return cancelled(value);
    if (watched.status === 'failed') return finish('watch-failed', { code: 'release-watch-failed', message: watched.message });
    completedWatchRun = watched.status === 'completed' ? runId : undefined;
  }
}
