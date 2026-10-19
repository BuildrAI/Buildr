import path from 'node:path';
import { createSourceVerificationPlan } from './source.ts';
import { encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { assertCandidateRound, passedRoundRecord, readCandidateRound } from './candidate-round.ts';

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
  const missingStepIds = required.filter((step: any) => !log.records.some((record: any) => passedRoundRecord(record, options.roundId, step, plan.runner))).map((step: any) => step.id);
  if (buildrRequired && plan.status !== 'ready') return { status: 'local-verification-required', missingStepIds, diagnostic: plan.diagnostic, nextActions: ['在声明支持的本机平台执行。'] };
  const productRoot = path.join(options.repo, 'projects/product/services/buildr');
  return { status: missingStepIds.length ? 'local-verification-required' : 'ready', runner: plan.runner,
    roundId: options.roundId, missingStepIds, recordCount: log.records.length, verificationBase: options.base ?? null,
    verificationPlan: { steps: required.map((step: any) => ({ id: step.id, disposition: missingStepIds.includes(step.id) ? 'execute' : 'reuse',
      reasons: [missingStepIds.includes(step.id) ? 'failed-or-not-run-in-this-round' : 'passed-in-this-round'] })) },
    ...(missingStepIds.length ? {} : { transport: encodeCandidateSourceImport(log) }),
    nextActions: missingStepIds.length ? [`在 ${productRoot} 执行 tools/development/run-development-npm run test:source -- --round ${options.roundId}${options.base ? ` --base ${options.base}` : ''}${options.sourceFile ? ` --output ${options.sourceFile}` : ''}；同轮只补失败及未执行项。插件使用同一 --round 和 --output 运行 tools/verify-source.ts。`] : [] };
}
