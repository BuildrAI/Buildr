import { performance } from 'node:perf_hooks';

let sequence = 0;
/** Test-only phase evidence; never records prompts, credentials or absolute paths. */
export function phase<T>(name: string, operation: () => T): T {
  const start = performance.now(), id = ++sequence;
  const visible = name !== 'interaction' || process.env.BUILDR_TEST_PHASE_TIMING === '1';
  const report = (status: string) => {
    if (!visible) return;
    process.stderr.write(`[agent-test-phase] ${JSON.stringify({ pid: process.pid, id, phase: name, status,
      durationMs: Math.round(performance.now() - start), rssBytes: process.memoryUsage().rss })}\n`);
  };
  if (name !== 'interaction') report('started');
  try {
    const value = operation();
    if (value && typeof (value as any).then === 'function') {
      return (value as any).then((result: unknown) => { report('passed'); return result; }, (error: unknown) => { report('failed'); throw error; });
    }
    report('passed'); return value;
  } catch (error) { report('failed'); throw error; }
}
