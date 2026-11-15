export function activityPollMs(counts: { running: number; unknown: number; waiting: number } | undefined, error?: unknown): number {
  return !counts || error || counts.running > 0 || counts.unknown > 0 || counts.waiting > 0 ? 5000 : 30000;
}
