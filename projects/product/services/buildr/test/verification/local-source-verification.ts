import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceVerificationPlan } from './source.ts';
import { encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { assertCandidateRound, passedRoundRecord, readCandidateRound } from './candidate-round.ts';
import { verificationStepOwnership, VERIFICATION_GOVERNED_REPOSITORY_INPUTS } from './ownership.ts';
import { matchesInput } from './planner.ts';

const BUILDR_PREFIX = 'projects/product/services/buildr/';
const PRODUCT_PREFIX = 'projects/product/';
const RELEASE_SKILLS_PREFIX = 'skills/buildr-release/';

function sourceHead(repo: string): string | null {
  try { return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim() || null; }
  catch { return null; }
}

function changedSourcePaths(repo: string, from: string, to: string): string[] | null {
  try {
    return execFileSync('git', ['-C', repo, 'diff', '--name-only', from, to, '--', BUILDR_PREFIX, PRODUCT_PREFIX, RELEASE_SKILLS_PREFIX, ...VERIFICATION_GOVERNED_REPOSITORY_INPUTS], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
      .split(/\r?\n/u).filter(Boolean);
  } catch { return null; }
}

/** Mirrors the changed-path conventions consumed by the verification planner. */
function normalizedProductPath(value: string): string | null {
  if (value.startsWith(BUILDR_PREFIX)) return value.slice(BUILDR_PREFIX.length);
  if (value.startsWith(PRODUCT_PREFIX)) return value.slice(PRODUCT_PREFIX.length);
  if (value.startsWith(RELEASE_SKILLS_PREFIX)) return value;
  if (VERIFICATION_GOVERNED_REPOSITORY_INPUTS.includes(value)) return value;
  return null;
}

function stepAffectedBy(step: any, changed: string[]): boolean | null {
  let inputs: string[];
  try { inputs = [...verificationStepOwnership(step.id.startsWith('dsh-plugin:') ? 'dsh-plugin' : step.id, step.executor).inputs]; }
  catch { return null; }
  return changed.some(value => {
    const productPath = normalizedProductPath(value);
    return productPath !== null && inputs.some((pattern: string) => matchesInput(productPath, pattern));
  });
}

/** Candidate readiness reads this round's ordinary results, without a global
 * cache or content, recipe and dependency fingerprints. */
export async function prepareLocalSourceVerification(options: {
  repo: string; sourceFile?: string; base?: string; platform?: string; env?: NodeJS.ProcessEnv; packages?: string[]; roundId: string;
}, dependencies: any = {}): Promise<any> {
  const plan = (dependencies.createSourcePlan ?? createSourceVerificationPlan)(options.platform ?? process.platform);
  const buildrRequired = options.packages?.includes('buildr') ?? true;
  const pluginRequired = options.packages?.includes('dsh-plugin') ?? false;
  const log = (dependencies.readRound ?? readCandidateRound)(options.sourceFile, options.roundId);
  assertCandidateRound(log, options.roundId);
  const required = [...(buildrRequired ? plan.steps : []), ...(pluginRequired ? [{ id: 'dsh-plugin:unit', platformScope: { kind: 'common' } }] : [])];
  const head = (dependencies.sourceHead ?? sourceHead)(options.repo);
  const readChangedPaths = dependencies.changedPaths ?? changedSourcePaths;
  const changedBySource = new Map<string, string[] | null>();
  const changedSince = (source: string) => {
    if (!changedBySource.has(source)) changedBySource.set(source, readChangedPaths(options.repo, source, head!));
    return changedBySource.get(source)!;
  };
  const invalidatedStepIds: string[] = [];
  const missingStepIds = required.filter((step: any) => {
    const record = log.records.find((entry: any) => passedRoundRecord(entry, options.roundId, step, plan.runner));
    if (!record) return true;
    const recordedSource = record.origin?.sourceCommit;
    if (!head || !recordedSource || recordedSource === head) return false;
    const changed = changedSince(recordedSource);
    if (changed === null) { invalidatedStepIds.push(step.id); return true; }
    const affected = stepAffectedBy(step, changed);
    if (affected === null || affected) { invalidatedStepIds.push(step.id); return true; }
    return false;
  }).map((step: any) => step.id);
  const invalidated = [...new Set(invalidatedStepIds)].sort();
  if (buildrRequired && plan.status !== 'ready') return { status: 'local-verification-required', missingStepIds, invalidatedStepIds: invalidated, diagnostic: plan.diagnostic, nextActions: ['在声明支持的本机平台执行。'] };
  const productRoot = path.join(options.repo, 'projects/product/services/buildr');
  return { status: missingStepIds.length ? 'local-verification-required' : 'ready', runner: plan.runner,
    roundId: options.roundId, missingStepIds, invalidatedStepIds: invalidated, recordCount: log.records.length, verificationBase: options.base ?? null,
    verificationPlan: { steps: required.map((step: any) => ({ id: step.id, disposition: missingStepIds.includes(step.id) ? 'execute' : 'reuse',
      reasons: [missingStepIds.includes(step.id) ? (invalidated.includes(step.id) ? 'source-inputs-changed' : 'failed-or-not-run-in-this-round') : 'passed-in-this-round'] })) },
    ...(missingStepIds.length ? {} : { transport: encodeCandidateSourceImport(log) }),
    nextActions: missingStepIds.length ? [
      `在 ${productRoot} 执行 tools/development/run-development-npm run test:source -- --round ${options.roundId}${options.base ? ` --base ${options.base}` : ''}${options.sourceFile ? ` --output ${options.sourceFile}` : ''}${invalidated.length ? ` --invalidate ${invalidated.join(',')}` : ''}；同轮只补失败及未执行项。插件使用同一 --round 和 --output 运行 tools/verify-source.ts${invalidated.includes('dsh-plugin:unit') ? ' --invalidate dsh-plugin:unit' : ''}。`,
      ...(invalidated.length ? [`源码自记录后发生变化，仅需重跑受影响步骤：${invalidated.join(', ')}。`] : []),
    ] : [] };
}
