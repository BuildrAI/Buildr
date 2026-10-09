import path from 'node:path';

function isFileEvent(data: any): boolean {
  return typeof data?.file === 'string' && typeof data.name === 'string'
    && path.resolve(data.name) === path.resolve(data.file);
}

function safeCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value) ? value : null;
}

export const ARCHIFY_SCENARIO_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'init --name archify-component': 'workspace-init',
  'component list --target': 'component-list',
  'sync codex --target': 'runtime-sync',
  'component install archify': 'component-install',
  'component check archify': 'component-check',
  'project create example': 'project-create',
  'installed renderer': 'installed-renderer',
  'component uninstall archify': 'component-uninstall',
});
const ARCHIFY_COMMAND_ROLES = Object.freeze([
  'workspace-init', 'component-list', 'runtime-sync', 'component-install', 'component-install',
  'runtime-sync', 'component-check', 'project-create', 'installed-renderer', 'runtime-sync',
  'component-uninstall', 'component-uninstall', 'runtime-sync',
]);
const validArchifyTime = (time: unknown): time is number => typeof time === 'number'
  && Number.isInteger(time) && time >= 0 && time <= 300_000;

export function archifyScenarioTimings(value: unknown): any[] {
  if (typeof value !== 'string') return [];
  const records = new Map<number, any>();
  for (const match of value.slice(-65_536).matchAll(/^\[archify-scenario-timing\] ([^\r\n]+)\r?$/gmu)) {
    let input: any;
    try { input = JSON.parse(match[1]); } catch { continue; }
    if (!input || !Number.isInteger(input.step) || input.step < 1 || input.step > 26
      || input.operation !== ARCHIFY_COMMAND_ROLES[Math.floor((input.step - 1) / 2)]
      || input.status !== (input.step % 2 === 1 ? 'started' : 'completed')
      || !validArchifyTime(input.elapsedMs)) continue;
    if (input.status === 'completed' && (!validArchifyTime(input.durationMs) || input.durationMs > input.elapsedMs)) continue;
    records.set(input.step, {
      step: input.step, operation: input.operation, status: input.status, elapsedMs: input.elapsedMs,
      ...(validArchifyTime(input.wrapperElapsedMs) && input.commandTimeoutMs === 60_000
        ? { wrapperElapsedMs: input.wrapperElapsedMs, commandTimeoutMs: 60_000 } : {}),
      ...(input.status === 'completed' ? { durationMs: input.durationMs } : {}),
    });
  }
  return [...records.values()].sort((left, right) => left.step - right.step);
}

export function archifyWrapperTimings(value: unknown): any[] {
  if (typeof value !== 'string') return [];
  let latest: any = null;
  for (const match of value.slice(-65_536).matchAll(/^\[archify-wrapper-timing\] ([^\r\n]+)\r?$/gmu)) {
    let input: any;
    try { input = JSON.parse(match[1]); } catch { continue; }
    if (!input || !validArchifyTime(input.elapsedMs) || input.timeoutMs !== 175_000
      || input.caseTimeoutMs !== 180_000 || !['passed', 'failed', 'timed-out'].includes(input.status)) continue;
    latest = { elapsedMs: input.elapsedMs, timeoutMs: 175_000, caseTimeoutMs: 180_000, status: input.status };
  }
  return latest ? [latest] : [];
}

function archifyFailureContext(error: any, file: string): any {
  if (path.basename(file) !== 'archify-component.test.ts' || error?.cause?.code !== 'ERR_ASSERTION'
    || typeof error.cause.message !== 'string') return {};
  // Child stdout/stderr can contain arbitrary values. Inspect only a bounded
  // tail and reconstruct fixed scenario labels; never emit the error message.
  const message = error.cause.message.slice(-65_536);
  let lastPhase: any = null;
  for (const match of message.matchAll(/^\[archify-scenario\] (\d{1,2}): (start|passed) ([^\r\n]+)\r?$/gmu)) {
    const step = Number(match[1]);
    const operation = Object.hasOwn(ARCHIFY_SCENARIO_LABELS, match[3]) ? ARCHIFY_SCENARIO_LABELS[match[3]] : undefined;
    if (step < 1 || step > 26 || !operation) continue;
    lastPhase = { scope: 'archify', step, status: match[2] === 'start' ? 'started' : 'passed', operation };
  }
  const phaseTimings = archifyScenarioTimings(message);
  const lastTiming = phaseTimings.find(timing => timing.step === lastPhase?.step && timing.operation === lastPhase.operation);
  if (lastTiming) lastPhase = { ...lastPhase, elapsedMs: lastTiming.elapsedMs,
    ...(lastTiming.status === 'completed' ? { durationMs: lastTiming.durationMs } : {}) };
  const childErrorCode = message.match(/^spawnSync [^\r\n]+ (ETIMEDOUT|ENOENT|EACCES|EPERM)\r?$/mu)?.[1] ?? null;
  return lastPhase || childErrorCode || phaseTimings.length
    ? { lastPhase, childErrorCode, ...(phaseTimings.length ? { phaseTimings } : {}) } : {};
}

function failureIdentity(error: any, file: string): any {
  return {
    code: safeCode(error?.code),
    failureType: safeCode(error?.failureType),
    causeCode: safeCode(error?.cause?.code),
    exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
    signal: typeof error?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(error.signal) ? error.signal : null,
    ...archifyFailureContext(error, file),
  };
}

function label(data: any): any {
  return {
    file: path.basename(data.file),
    name: isFileEvent(data) ? path.basename(data.file) : String(data.name).replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 240),
  };
}

/**
 * File completion remains visible when Node buffers a later file's individual test events.
 * Diagnostics never copy assertion values or process output; individual names can still be delayed.
 */
export default async function* integrationProgressReporter(source: any): Promise<any> {
  for await (const event of source) {
    const data = event?.data;
    if (event?.type === 'test:stderr' && typeof data?.file === 'string'
      && path.basename(data.file) === 'archify-component.test.ts') {
      for (const timing of archifyScenarioTimings(data.message)) {
        yield `[buildr-archify-phase-timing] ${JSON.stringify({ file: 'archify-component.test.ts', ...timing })}\n`;
      }
      for (const timing of archifyWrapperTimings(data.message)) {
        yield `[buildr-archify-wrapper-timing] ${JSON.stringify({ file: 'archify-component.test.ts', ...timing })}\n`;
      }
      continue;
    }
    if (typeof data?.file !== 'string' || typeof data.name !== 'string') continue;
    if (event.type === 'test:dequeue' && isFileEvent(data)) {
      yield `[buildr-integration-progress] ${JSON.stringify({ ...label(data), status: 'started' })}\n`;
      continue;
    }
    if (event.type !== 'test:complete' || !Number.isFinite(data.details?.duration_ms)) continue;
    if (!isFileEvent(data) && data.details.passed !== false) continue;
    yield `[buildr-integration-progress] ${JSON.stringify({
      ...label(data),
      status: data.details.passed === true ? 'passed' : 'failed',
      durationMs: Math.round(data.details.duration_ms),
      ...(data.details.passed === false ? { error: failureIdentity(data.details.error, data.file) } : {}),
    })}\n`;
  }
}
