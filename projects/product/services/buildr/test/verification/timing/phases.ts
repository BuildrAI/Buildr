import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const VERIFICATION_PHASE_TIMING_PREFIX: any = '[buildr-verification-phase]';

export function createVerificationPhaseRecorder(scope: any, options: any = {}): any  {
  const now: any = options.now ?? Date.now;
  const environment: any = options.env ?? process.env;
  const evidenceOutput: any = options.evidenceOutput ?? environment.BUILDR_VERIFICATION_PHASE_OUTPUT;
  const persistEvidence: any = options.persistEvidence === true;
  const phases: any[] = [];

  const serialize: any = (phase: any) => `${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({ scope, ...phase })}\n`;
  const appendEvidence: any = (output: any) => {
    if (!output || !evidenceOutput) return;
    fs.mkdirSync(path.dirname(path.resolve(evidenceOutput)), { recursive: true });
    fs.appendFileSync(path.resolve(evidenceOutput), output, 'utf8');
  };

  const record: any = (id: any, startedAtMs: any, finishedAtMs: any, status: any = 'passed') => {
    const phase: any = {
      id,
      status,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
    };
    phases.push(phase);
    if (persistEvidence) appendEvidence(serialize(phase));
    return phase;
  };

  const run: any = async (id: any, operation: any) => {
    const startedAtMs: any = now();
    try {
      const result: any = await operation();
      record(id, startedAtMs, now(), 'passed');
      return result;
    } catch (error: any) {
      record(id, startedAtMs, now(), 'failed');
      throw error;
    }
  };

  const emit: any = (...args: any[]) => {
    const stream: any = args.length > 0 ? args[0] : process.stdout;
    const output: any = phases.map(serialize).join('');
    if (output) stream?.write(output);
    if (!persistEvidence && args.length === 0) appendEvidence(output);
  };

  return { phases, record, run, emit };
}

export function parseVerificationPhaseTimings(output: any): any  {
  return String(output ?? '').split(/\r?\n/u).flatMap((line: any) => {
    if (!line.startsWith(`${VERIFICATION_PHASE_TIMING_PREFIX} `)) return [];
    try {
      const phase: any = JSON.parse(line.slice(VERIFICATION_PHASE_TIMING_PREFIX.length + 1));
      if (!phase || typeof phase.scope !== 'string' || typeof phase.id !== 'string'
        || !['passed', 'failed', 'retained'].includes(phase.status)
        || !Number.isFinite(phase.durationMs) || phase.durationMs < 0) return [];
      return [phase];
    } catch {
      return [];
    }
  });
}

export function isRetainableHarnessCleanupError(error: any, platform: any = process.platform): any  {
  return platform === 'win32' && ['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error?.code);
}

export function cleanupVerificationHarnessRoot(root: any, options: any = {}): any  {
  const removeRoot: any = options.removeRoot ?? ((target: any) => fs.rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const platform: any = options.platform ?? process.platform;
  const warn: any = options.warn ?? console.warn;
  const isRetainable: any = options.isRetainable ?? ((error: any) => isRetainableHarnessCleanupError(error, platform));
  try {
    removeRoot(root);
    return { status: 'cleaned', root };
  } catch (error: any) {
    if (!isRetainable(error)) throw error;
    warn(`Buildr verification retained temporary root ${root}: ${error.code ?? error.message}`);
    return { status: 'retained', root, error };
  }
}
