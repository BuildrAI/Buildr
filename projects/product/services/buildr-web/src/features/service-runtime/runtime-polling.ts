type RuntimeSnapshot = { runs?: readonly { status: string }[]; service?: { runs: readonly { status: string }[] } };
export function serviceRuntimePollMs(data: RuntimeSnapshot | null, error?: unknown): number {
  return !data || error || (data.runs ?? data.service?.runs ?? []).some(run => run.status === 'starting') ? 5000 : 30000;
}
