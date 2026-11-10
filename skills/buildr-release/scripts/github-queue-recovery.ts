import { releasePublishAuthority } from './release-authority.ts';

const repository = releasePublishAuthority.repository;
const workflows = new Set(['.github/workflows/verify.yml', '.github/workflows/verify-package.yml', '.github/workflows/publish.yml', '.github/workflows/publish-dsh-plugin.yml']);

export function releaseQueuePolicy(options: any = {}): any {
  const timeoutSeconds = Number(options.queueTimeoutSeconds ?? 600);
  const maxRedispatches = Number(options.maxQueueRedispatches ?? 2);
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1
    || !Number.isSafeInteger(maxRedispatches) || maxRedispatches < 0 || maxRedispatches > 20) {
    throw new Error('Invalid release queue timeout or redispatch budget.');
  }
  return { timeoutSeconds, maxRedispatches };
}

function jobStarted(job: any): boolean {
  return Boolean(job?.started_at) || Boolean(job?.steps?.some((step: any) => step?.started_at));
}

/**
 * Recover only a workflow_dispatch run that never started work before its
 * queue deadline. The original frozen dispatch arguments and the cancelled-run
 * audit are retained; a lost response is never replayed as success.
 */
export function recoverQueuedRelease(pointer: any, options: any, dependencies: any): any {
  const { timeoutSeconds, maxRedispatches } = releaseQueuePolicy(options);
  const { gh, save } = dependencies;
  if (!pointer || pointer.evidence || pointer.status === 'passed') return null;

  const redispatch = () => {
    const pending = pointer.queueRedispatch;
    const run = pending.run;
    const args = pointer.dispatchArgs;
    if (!Array.isArray(args)) throw Object.assign(new Error('Original frozen dispatch inputs are unavailable; cancelled pointer was cleared.'), { code: 'release-queue-frozen-inputs-missing' });
    const refIndex = args.indexOf('--ref');
    const repoIndex = args.indexOf('--repo');
    const ref = refIndex >= 0 ? args[refIndex + 1] : null;
    if (args[0] !== 'workflow' || args[1] !== 'run' || args[2] !== run.path.split('@')[0] || repoIndex < 0
      || args[repoIndex + 1] !== repository || ref !== run.head_branch || !workflows.has(args[2])) {
      throw new Error('Frozen dispatch differs from the queued workflow.');
    }
    const source = JSON.parse(gh(['api', `repos/${repository}/commits/${encodeURIComponent(ref)}`]));
    if (source.sha !== run.head_sha) throw Object.assign(new Error('Frozen dispatch ref moved; cancelled pointer remains cleared.'), { code: 'release-queue-source-drift' });
    if ((pointer.queueHistory ?? []).filter((entry: any) => entry.redispatchRequested).length >= maxRedispatches) {
      throw Object.assign(new Error('Release queue redispatch budget exhausted; cancelled pointer cleared.'), { code: 'release-queue-retry-limit' });
    }
    const entry = pointer.queueHistory[pending.historyIndex];
    pointer.requested = true;
    pointer.dispatchRequested = true;
    entry.redispatchRequested = true;
    entry.dispatchState = 'unknown';
    delete pointer.queueRedispatch;
    save(); // Persist intent before the request. A lost response is never replayed.
    gh(args);
    entry.dispatchState = 'accepted';
    save();
    const runs = JSON.parse(gh(['run', 'list', '--repo', repository, '--workflow', args[2], '--branch', ref, '--event', 'workflow_dispatch',
      '--limit', '100', '--json', 'databaseId,headSha,displayTitle,status,conclusion']));
    const previous = new Set(pointer.previousRunIds ?? []);
    const matches = runs.filter((value: any) => value.headSha === run.head_sha && value.displayTitle === run.display_title && !previous.has(value.databaseId));
    if (matches.length === 1) {
      pointer.runId = matches[0].databaseId;
      pointer.previousRunIds = [...previous];
      save();
    }
    return { status: 'redispatched', previousRunId: run.id, audit: entry,
      ...(pointer.runId ? { run: { ...matches[0], id: pointer.runId } } : {}) };
  };

  if (pointer.queueRedispatch && !pointer.runId && !pointer.requested) return redispatch();
  if (!pointer.runId) return null;
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${pointer.runId}`]));
  if (run.id !== pointer.runId) {
    if (!pointer.dispatchArgs) return null; // Legacy readback stays with its original owner.
    throw new Error('Queue recovery run identity mismatch.');
  }
  // Incomplete or foreign observations belong to the normal failure/readback
  // owner. Only act when the run clearly belongs to this dispatch.
  if (run.repository && run.repository.full_name !== repository) return null;
  if (run.event && run.event !== 'workflow_dispatch') return null;
  if (run.path && !workflows.has(run.path.split('@')[0])) return null;
  if (run.status === 'completed' && run.conclusion !== 'cancelled') return null;

  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`]));
  if (!Array.isArray(pages) || !pages.every((page: any) => Array.isArray(page.jobs))) throw new Error('Queue job observation is incomplete.');
  const jobs = pages.flatMap((page: any) => page.jobs);
  const now = dependencies.now?.() ?? Date.now();
  const queued = jobs.find((job: any) => ['queued', 'pending', 'waiting', 'requested'].includes(job.status)
    && !jobStarted(job) && now - Date.parse(job.created_at ?? run.created_at) >= timeoutSeconds * 1000);
  const runQueued = ['queued', 'requested', 'pending'].includes(run.status) && jobs.length === 0
    && now - Date.parse(run.created_at) >= timeoutSeconds * 1000;
  const alreadyCancelled = run.status === 'completed' && run.conclusion === 'cancelled';
  const started = jobs.some(jobStarted);
  if (!queued && !runQueued && !alreadyCancelled && !pointer.queueCancellation) return null;
  // A cancelled run that had actions executing is a real cancellation, not a
  // queue timeout. Leave it to the normal failure/observation owner.
  if (alreadyCancelled && started) return null;
  if (!alreadyCancelled && !pointer.dispatchArgs) throw Object.assign(new Error('Queue recovery requires the original frozen dispatch inputs.'), { code: 'release-queue-frozen-inputs-missing' });
  if (!alreadyCancelled && !pointer.queueCancellation) {
    pointer.queueCancellation = { runId: run.id, reason: 'not-started-before-queue-deadline', jobId: queued?.id ?? null, timeoutSeconds, observedAt: new Date(now).toISOString() };
    save();
    gh(['run', 'cancel', String(run.id), '--repo', repository]);
  }
  const terminal = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${run.id}`]));
  if (terminal.id !== run.id || terminal.run_attempt !== run.run_attempt || terminal.head_sha !== run.head_sha) {
    throw new Error('Cancellation observation changed run identity or attempt.');
  }
  if (terminal.status !== 'completed' || terminal.conclusion !== 'cancelled') return { status: 'cancellation-pending', run: terminal };
  const history = pointer.queueHistory ??= [];
  const entry: any = { ...pointer.queueCancellation, runId: run.id, reason: pointer.queueCancellation?.reason ?? 'confirmed-cancelled-run',
    basis: { status: terminal.status, conclusion: terminal.conclusion, runAttempt: terminal.run_attempt },
    cleared: ['runId', 'journal', 'retryRequested', 'dispatchRequested', 'requested', 'awaitingLocalArtifact', 'runAttempt', 'dispatch', 'dispatchDiagnostic'],
    observedAt: new Date(now).toISOString() };
  history.push(entry);
  pointer.previousRunIds = [...new Set([...(pointer.previousRunIds ?? []), run.id])];
  pointer.runId = null;
  for (const field of ['journal', 'retryRequested', 'awaitingLocalArtifact', 'runAttempt', 'dispatch', 'dispatchDiagnostic', 'queueCancellation']) delete pointer[field];
  pointer.dispatchRejected = false;
  pointer.requested = false;
  pointer.dispatchRequested = false;
  pointer.queueRedispatch = { run: { id: run.id, path: run.path, head_branch: run.head_branch, head_sha: run.head_sha, display_title: run.display_title }, historyIndex: history.length - 1 };
  save(); // Durable cleanup and continuation precede every replacement request.
  return redispatch();
}
