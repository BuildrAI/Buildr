/**
 * Reconnect policy after an installed update. The job's reported running
 * version names which process answered; only the document's session token can
 * prove whether this page is a stale bundle left behind by the old process.
 * Pure logic — the hook holds refs and applies these decisions.
 */
export type ReconnectTrigger = 'watch' | 'confirm-current' | 'none';

/** A fresh page can meet an installed job already past the handoff request. */
export function observesInstalledJob(job: { simulated?: boolean | null; installedVersion?: string | null; status?: string | null }): boolean {
  return !job.simulated && Boolean(job.installedVersion) && ['applying', 'partial', 'completed'].includes(job.status || '');
}

/** Terminal job states where a successor may already serve this origin. */
export function reconnectTrigger(job: { simulated?: boolean | null; installedVersion?: string | null; status?: string | null; runningVersion?: string | null; version?: string | null }): ReconnectTrigger {
  if (job.simulated || !job.installedVersion || !['partial', 'completed'].includes(job.status || '')) return 'none';
  return job.runningVersion === job.version ? 'confirm-current' : 'watch';
}
