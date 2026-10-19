import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
  // Keep original observations. No content, recipe or dependency fingerprint is
  // generated, and no later edit can turn an observed pass into a failure.
  const { stdout, stderr, sourceRecord, candidateProof, artifactRecord, ...summary } = result;
  return { schemaVersion: ROUND_RESULT_SCHEMA, roundId, identity: { stepId: result.id, key: `${roundId}:${result.id}` },
    origin, environment, result: summary };
}

export function createCandidateRoundExecution(plan: any, options: any): any {
  const config = options.round;
  if (!config) return null;
  const roundId = config.roundId;
  let log = readCandidateRound(config.output, roundId);
  const imports = config.imports ? (Array.isArray(config.imports) ? config.imports : [config.imports]) : [];
  const records = new Map<string, any>();
  const key = (record: any) => `${record.identity.stepId}:${record.environment.platform}`;
  for (const input of [...imports, log]) {
    assertCandidateRound(input, roundId);
    for (const record of input.records) records.set(key(record), record);
  }
  const hits = new Map<string, any>();
  for (const step of plan.steps) {
    const record = [...records.values()].find(record => passedRoundRecord(record, roundId, step, plan.runner ?? process.platform));
    if (record) hits.set(step.id, record);
  }
  const steps = plan.steps.map((step: any) => ({ id: step.id, disposition: hits.has(step.id) ? 'reuse' : 'execute',
    reasons: [hits.has(step.id) ? 'passed-in-this-round' : 'failed-or-not-run-in-this-round'], inputScope: 'candidate-round' }));
  let sourceCommit: string | null = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.productRoot, encoding: 'utf8' }).trim(); } catch { /* Diagnostic only. */ }
  const persist = () => { log = { ...log, records: [...records.values()] }; if (config.output) writeCandidateRound(config.output, log); return log; };
  return { hits, explanation: { steps, estimate: { executedCount: steps.length - hits.size, reusedCount: hits.size, remainingWorkMs: 0, dependencyCriticalPathMs: 0 } },
    executeFiles: (step: any, execute: any, context: any) => execute(step, context),
    record(result: any) {
      if (result.disposition === 'reused') return;
      const now = new Date().toISOString();
      const record = roundResult(result, roundId, { kind: process.env.GITHUB_RUN_ID ? 'ci' : 'local',
        runId: options.runId ?? `round-${process.pid}`, sourceCommit, startedAt: result.startedAt ?? now, finishedAt: result.finishedAt ?? now },
      { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node });
      records.set(key(record), record); persist();
    },
    finish: () => persist(), invalidate() { /* Ordinary results are retained. */ } };
}
