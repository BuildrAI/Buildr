import { verificationInputApplicability } from './result-applicability.ts';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectVerificationReuseSnapshot, createVerificationReuseIdentity, verificationFileSteps, verificationFileObservations } from './verification-reuse.ts';

export const ROUND_SCHEMA = 'buildr.candidate-round-log/v1';
export const ROUND_RESULT_SCHEMA = 'buildr.candidate-round-result/v1';
export const emptyCandidateRound = (roundId: string): any => ({ schemaVersion: ROUND_SCHEMA, roundId, records: [] });

export function assertCandidateRound(log: any, roundId?: string): void {
  if (log?.schemaVersion !== ROUND_SCHEMA || typeof log.roundId !== 'string' || !log.roundId || log.roundId.length > 160
    || roundId !== undefined && log.roundId !== roundId || !Array.isArray(log.records) || log.records.length > 512) throw new Error('Candidate round log belongs to another round or is invalid.');
  for (const record of log.records) if (record?.schemaVersion !== ROUND_RESULT_SCHEMA || record.roundId !== log.roundId
    || typeof record.identity?.stepId !== 'string' || !record.result || record.result.id !== record.identity.stepId
    || !record.origin?.runId || !record.environment?.platform) throw new Error('Candidate round result is invalid.');
}

export function readCandidateRound(filename: string | undefined, roundId: string): any {
  if (!filename || !fs.existsSync(filename)) return emptyCandidateRound(roundId);
  const log = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assertCandidateRound(log, roundId); return log;
}

export function writeCandidateRound(filename: string, log: any): void {
  assertCandidateRound(log); fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(log, null, 2)}\n`); fs.renameSync(temporary, filename);
}

export function passedRoundRecord(record: any, roundId: string, step: any, runner?: string): boolean {
  const platform = runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner;
  return record?.schemaVersion === ROUND_RESULT_SCHEMA && record.roundId === roundId && record.identity?.stepId === step.id
    && record.result?.status === 'passed' && record.result.exitCode === 0
    && (step.platformScope?.kind === 'common' ? ['darwin', 'win32'].includes(record.environment?.platform)
      : record.environment?.platform === (platform ?? process.platform));
}

export function roundResult(result: any, roundId: string, origin: any, environment: any): any {
  // Keep original observations. File recovery carries its own applicable input
  // identities; it never rewrites the original source or successful execution.
  const { stdout, stderr, sourceRecord, candidateProof, artifactRecord, roundFileCoverage, ...summary } = result;
  return { schemaVersion: ROUND_RESULT_SCHEMA, roundId, identity: { stepId: result.id, key: `${roundId}:${result.id}` },
    origin, environment, result: summary };
}

export function createCandidateRoundExecution(plan: any, options: any, dependencies: any = {}): any {
  const config = options.round;
  if (!config) return null;
  const roundId = config.roundId;
  const invalidStepIds = new Set<string>(config.invalidStepIds ?? []);
  let log = readCandidateRound(config.output, roundId);
  const imports = config.imports ? (Array.isArray(config.imports) ? config.imports : [config.imports]) : [];
  const records = new Map<string, any>();
  const key = (record: any) => `${record.identity.stepId}:${record.environment.platform}`;
  for (const input of [...imports, log]) {
    assertCandidateRound(input, roundId);
    for (const record of input.records) records.set(key(record), record);
  }
  const filesByCheck = new Map<string, any[]>(plan.steps.map((step: any) => [step.id,
    step.executor ? verificationFileSteps(step, options.productRoot) : []]));
  const files = [...filesByCheck.values()].flat();
  const observedSteps = [...plan.steps.filter((step: any) => step.reuse), ...files];
  const observe = () => {
    if (!observedSteps.length) return null;
    try { return (dependencies.collectSnapshot ?? collectVerificationReuseSnapshot)({ ...options, steps: observedSteps }); }
    catch { return null; } // An unknown input is a miss, never a success.
  };
  // A planning pass with no prior input proof cannot reuse anything. Avoid a
  // complete observation until the real execution freezes its inputs.
  const before = options.inspectOnly && ![...records.values()].some(record => record.result?.inputIdentity || record.result?.roundFiles?.length) ? null : observe();
  const fileKey = (step: any, snapshot: any) => snapshot ? createVerificationReuseIdentity(step, snapshot)?.key : null;
  const priorFiles = new Map<string, any>();
  const hits = new Map<string, any>();
  for (const step of plan.steps) {
    if (invalidStepIds.has(step.id) || options.force === true) continue;
    const record = records.get(`${step.id}:${process.platform}`)
      ?? [...records.values()].find(record => passedRoundRecord(record, roundId, step, plan.runner ?? process.platform));
    const members = filesByCheck.get(step.id) ?? [];
    for (const file of members) {
      const matches = record?.result?.roundFiles?.filter((item: any) => item.file === file.executor.files[0]) ?? [];
      const prior = matches.length === 1 ? matches[0] : null;
      const inputKey = fileKey(file, before);
      if (inputKey && prior?.inputKey === inputKey && prior.status === 'passed' && prior.cleanup === 'clean'
        && prior.environment?.platform === process.platform && prior.environment?.arch === process.arch
        && prior.environment?.nodeVersion === process.versions.node && prior.origin?.runId) priorFiles.set(file.id, prior);
    }
    const currentIdentity = before && step.reuse ? createVerificationReuseIdentity(step, before) : null;
    const applicable = !step.reuse || verificationInputApplicability(record?.result?.inputIdentity, currentIdentity).applicable;
    if (applicable && passedRoundRecord(record, roundId, step, plan.runner ?? process.platform)
      && (!record.result.roundFiles || members.length > 0 && members.every(file => priorFiles.has(file.id))
        && record.result.roundFiles.length === members.length)) hits.set(step.id, record);
  }
  const steps = plan.steps.map((step: any) => ({ id: step.id, disposition: hits.has(step.id) ? 'reuse' : 'execute',
    reasons: [hits.has(step.id) ? 'passed-in-this-round' : invalidStepIds.has(step.id) ? 'source-inputs-changed' : 'failed-or-not-run-in-this-round'], inputScope: 'candidate-round' }));
  let sourceCommit: string | null = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.productRoot, encoding: 'utf8' }).trim(); } catch { /* Diagnostic only. */ }
  const persist = () => { log = { ...log, records: [...records.values()] }; if (config.output) writeCandidateRound(config.output, log); return log; };
  return { hits, explanation: { steps, estimate: { executedCount: steps.length - hits.size, reusedCount: hits.size, remainingWorkMs: 0, dependencyCriticalPathMs: 0 } },
    async executeFiles(step: any, execute: any, context: any) {
      const members = filesByCheck.get(step.id) ?? [];
      if (!members.length) return execute(step, context);
      const missing = members.filter(file => !priorFiles.has(file.id));
      options.stream?.write(`[candidate-round] ${step.id}: files execute=${missing.length} reuse=${members.length - missing.length} total=${members.length}\n`);
      const result = missing.length ? await execute({ ...step, executor: { ...step.executor,
        files: missing.flatMap(file => file.executor.files) } }, context)
        : { status: 'passed', exitCode: 0, durationMs: 0, stdout: '', stderr: '', childSignal: null,
          processCleanup: { status: 'clean' } };
      const observations = verificationFileObservations(result.stderr);
      const coverage = members.map(file => ({ step: file, prior: priorFiles.get(file.id),
        observation: missing.includes(file) ? observations.get(file.executor.files[0]) : undefined }));
      // A subset child pass is insufficient when it did not attest every member.
      const complete = coverage.every(file => file.prior || file.observation?.status === 'passed');
      if (result.status === 'passed' && !complete) Object.assign(result, { status: 'failed', exitCode: 1,
        failureCode: 'candidate-file-coverage-incomplete' });
      return { ...result, roundFileCoverage: coverage, executedFiles: missing.length,
        reusedFiles: members.length - missing.length, totalFiles: members.length };
    },
    record() { /* Persist after input stability and context cleanup are known. */ },
    finish(results: any[], cleanupClean: boolean) {
      const after = observe();
      for (const result of results) {
        if (result.disposition === 'reused') {
          const step = plan.steps.find((step: any) => step.id === result.id);
          const prior = hits.get(result.id);
          const current = after && step?.reuse ? createVerificationReuseIdentity(step, after) : null;
          if (step?.reuse && !verificationInputApplicability(prior?.result?.inputIdentity, current).applicable) {
            Object.assign(result, { status: 'failed', exitCode: 1, failureCode: 'candidate-reused-input-drift' });
          }
          continue;
        }
        const now = new Date().toISOString();
        const environment = { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node };
        const origin = { kind: process.env.GITHUB_RUN_ID ? 'ci' : 'local', runId: options.runId ?? `round-${process.pid}`,
          sourceCommit, startedAt: result.startedAt ?? now, finishedAt: result.finishedAt ?? now };
        const coverage = result.roundFileCoverage;
        if (coverage) {
          const clean = cleanupClean && !options.signal?.aborted && result.processCleanup?.status === 'clean' && result.childSignal === null;
          result.roundFiles = coverage.flatMap((file: any) => {
            const inputKey = fileKey(file.step, before);
            if (!inputKey || inputKey !== fileKey(file.step, after)) return [];
            if (file.prior) return [file.prior];
            return clean && file.observation?.status === 'passed' ? [{ file: file.step.executor.files[0], inputKey,
              status: 'passed', cleanup: 'clean', durationMs: file.observation.durationMs, origin, environment }] : [];
          });
          if (result.status === 'passed' && result.roundFiles.length !== coverage.length) Object.assign(result,
            { status: 'failed', exitCode: 1, failureCode: 'candidate-file-input-drift-or-cleanup' });
          delete result.roundFileCoverage;
        }
        const step = plan.steps.find((step: any) => step.id === result.id);
        if (step?.reuse) {
          const inputIdentity = before && createVerificationReuseIdentity(step, before);
          const finalIdentity = after && createVerificationReuseIdentity(step, after);
          if (cleanupClean && verificationInputApplicability(inputIdentity, finalIdentity).applicable) {
            result.inputIdentity = inputIdentity; result.inputEnvironment = before.environment;
          } else { delete result.inputIdentity; delete result.inputEnvironment; }
        }
        const record = roundResult(result, roundId, origin, environment);
        records.set(key(record), record);
      }
      return persist();
    },
    invalidate() { /* No new observations have been persisted before cleanup. */ } };
}
