import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const VERIFICATION_PHASE_TIMING_PREFIX = '[buildr-verification-phase]';

export function createVerificationPhaseRecorder(scope, options = {}) {
  const now = options.now ?? Date.now;
  const environment = options.env ?? process.env;
  const evidenceOutput = options.evidenceOutput ?? environment.BUILDR_VERIFICATION_PHASE_OUTPUT;
  const persistEvidence = options.persistEvidence === true;
  const phases = [];

  const serialize = (phase) => `${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({ scope, ...phase })}\n`;
  const appendEvidence = (output) => {
    if (!output || !evidenceOutput) return;
    fs.mkdirSync(path.dirname(path.resolve(evidenceOutput)), { recursive: true });
    fs.appendFileSync(path.resolve(evidenceOutput), output, 'utf8');
  };

  const record = (id, startedAtMs, finishedAtMs, status = 'passed') => {
    const phase = {
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

  const run = async (id, operation) => {
    const startedAtMs = now();
    try {
      const result = await operation();
      record(id, startedAtMs, now(), 'passed');
      return result;
    } catch (error) {
      record(id, startedAtMs, now(), 'failed');
      throw error;
    }
  };

  const emit = (...args) => {
    const stream = args.length > 0 ? args[0] : process.stdout;
    const output = phases.map(serialize).join('');
    if (output) stream?.write(output);
    if (!persistEvidence && args.length === 0) appendEvidence(output);
  };

  return { phases, record, run, emit };
}

export function parseVerificationPhaseTimings(output) {
  return String(output ?? '').split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith(`${VERIFICATION_PHASE_TIMING_PREFIX} `)) return [];
    try {
      const phase = JSON.parse(line.slice(VERIFICATION_PHASE_TIMING_PREFIX.length + 1));
      if (!phase || typeof phase.scope !== 'string' || typeof phase.id !== 'string'
        || !['passed', 'failed', 'retained'].includes(phase.status)
        || !Number.isFinite(phase.durationMs) || phase.durationMs < 0) return [];
      return [phase];
    } catch {
      return [];
    }
  });
}

export function isRetainableHarnessCleanupError(error, platform = process.platform) {
  return platform === 'win32' && ['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error?.code);
}

export function cleanupVerificationHarnessRoot(root, options = {}) {
  const removeRoot = options.removeRoot ?? ((target) => fs.rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const platform = options.platform ?? process.platform;
  const warn = options.warn ?? console.warn;
  const isRetainable = options.isRetainable ?? ((error) => isRetainableHarnessCleanupError(error, platform));
  try {
    removeRoot(root);
    return { status: 'cleaned', root };
  } catch (error) {
    if (!isRetainable(error)) throw error;
    warn(`Buildr verification retained temporary root ${root}: ${error.code ?? error.message}`);
    return { status: 'retained', root, error };
  }
}
