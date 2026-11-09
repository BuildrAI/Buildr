import { pluginSourcePhaseFiles, pluginSourcePhaseStep } from '../../../dsh-plugin/tools/source-phase-definition.ts';
import { collectVerificationReuseSnapshot, createVerificationReuseIdentity } from './verification-reuse.ts';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceVerificationPlan } from './source.ts';
import { encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { assertCandidateRound, passedRoundRecord, readCandidateRound } from './candidate-round.ts';
import { verificationSteps } from './registry.ts';
import { createChangedVerificationSourcePathsReader, verificationStepAffectedBy, verificationInputApplicabilityForSourceChange } from './source-change-applicability.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';

function sourceHead(repo: string): string | null {
  try { return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim() || null; }
  catch { return null; }
}

/** Candidate readiness reads this round's ordinary results, without a global
 * cache or content, recipe and dependency fingerprints. */
export async function prepareLocalSourceVerification(options: {
  repo: string; sourceFile?: string; base?: string; platform?: string; env?: NodeJS.ProcessEnv; packages?: string[]; roundId: string;
  selectedStepIds?: string[];
}, dependencies: any = {}): Promise<any> {
  const plan = (dependencies.createSourcePlan ?? createSourceVerificationPlan)(options.platform ?? process.platform);
  const buildrRequired = options.packages?.includes('buildr') ?? true;
  const pluginRequired = options.packages?.includes('dsh-plugin') ?? false;
  const log = (dependencies.readRound ?? readCandidateRound)(options.sourceFile, options.roundId);
  assertCandidateRound(log, options.roundId);
  const pluginUnit = verificationSteps.find((step: any) => step.id === 'plugin-unit');
  if (pluginRequired && !pluginUnit) throw new Error('The DSH plugin Unit check is not registered.');
  // The release round retains its existing phase identity while consuming the
  // single Service-owned check's actual inputs and execution declaration.
  const required = [...(buildrRequired ? plan.steps : []), ...(pluginRequired ? [(dependencies.pluginUnitStep ?? (() => {
    const pluginRoot = path.join(options.repo, 'projects/product/services/dsh-plugin');
    const definition = pluginSourcePhaseStep('unit', pluginSourcePhaseFiles('unit', pluginRoot), options.env);
    return { ...definition, inputs: pluginUnit.inputs, inputExclusions: pluginUnit.inputExclusions, executor: { ...definition.executor, cwd: pluginRoot }, platformScope: { kind: 'common' } };
  }))()] : [])];
  const head = (dependencies.sourceHead ?? sourceHead)(options.repo);
  const readChangedPaths = dependencies.changedPaths ?? createChangedVerificationSourcePathsReader(options.repo);
  const changedBySource = new Map<string, string[] | null>();
  const changedSince = (source: string) => {
    if (!changedBySource.has(source)) changedBySource.set(source, readChangedPaths(source, head!));
    return changedBySource.get(source)!;
  };
  let snapshot: any;
  // The source runner executes under the offline verification policy. Reuse
  // checks must observe the same environment or the run-mode variable alone
  // would invalidate every previously passed check.
  const snapshotEnv: NodeJS.ProcessEnv = enforceOfflineVerification({ ...(options.env ?? process.env) });
  const inputsFor = (step: any) => {
    if (dependencies.inputsFor) return dependencies.inputsFor(step);
    try {
      snapshot ??= collectVerificationReuseSnapshot({ productRoot: path.join(options.repo, 'projects/product/services/buildr'), steps: required, env: snapshotEnv });
      return createVerificationReuseIdentity(step, snapshot);
    } catch { return null; }
  };
  const invalidatedStepIds: string[] = [];
  const retainedStepIds: string[] = [];
  const outOfScopeStepIds: string[] = [];
  const selectedStepIds = new Set<string>(options.selectedStepIds ?? []);
  const missingStepIds = required.filter((step: any) => {
    if (selectedStepIds.size > 0 && !selectedStepIds.has(step.id)) {
      outOfScopeStepIds.push(step.id);
      if (log.records.some((entry: any) => passedRoundRecord(entry, options.roundId, step, plan.runner))) retainedStepIds.push(step.id);
      return false;
    }
    const record = log.records.find((entry: any) => passedRoundRecord(entry, options.roundId, step, plan.runner));
    if (!record) return true;
    const recordedSource = record.origin?.sourceCommit;
    const changed = head && recordedSource && recordedSource !== head ? changedSince(recordedSource) : undefined;
    const affected = changed === undefined ? undefined : changed === null ? null : verificationStepAffectedBy(step, changed);
    if (affected === null || affected === true) {
      invalidatedStepIds.push(step.id); return true;
    }
    if (step.reuse && !verificationInputApplicabilityForSourceChange(record.result?.inputIdentity, inputsFor(step), affected).applicable) {
      invalidatedStepIds.push(step.id); return true;
    }
    return false;
  }).map((step: any) => step.id);
  const invalidated = [...new Set(invalidatedStepIds)].sort();
  if (buildrRequired && plan.status !== 'ready') return { status: 'local-verification-required', missingStepIds, invalidatedStepIds: invalidated, diagnostic: plan.diagnostic, nextActions: ['在声明支持的本机平台执行。'] };
  const productRoot = path.join(options.repo, 'projects/product/services/buildr');
  return { status: missingStepIds.length ? 'local-verification-required' : 'ready', runner: plan.runner,
    roundId: options.roundId, missingStepIds, invalidatedStepIds: invalidated, recordCount: log.records.length, verificationBase: options.base ?? null,
    ...(selectedStepIds.size > 0 ? { selectedStepIds: [...selectedStepIds].sort(), retainedStepIds: [...new Set(retainedStepIds)].sort(), outOfScopeStepIds: [...new Set(outOfScopeStepIds)].sort() } : {}),
    verificationPlan: { steps: required.map((step: any) => ({ id: step.id, disposition: missingStepIds.includes(step.id) ? 'execute' : outOfScopeStepIds.includes(step.id) ? 'not-run' : 'reuse',
      reasons: [missingStepIds.includes(step.id) ? (invalidated.includes(step.id) ? 'source-inputs-changed' : selectedStepIds.size > 0 ? 'user-selected-execution' : 'failed-or-not-run-in-this-round')
        : outOfScopeStepIds.includes(step.id) ? 'declared-out-of-scope'
          : retainedStepIds.includes(step.id) ? 'retained-by-user-instruction' : 'passed-in-this-round'] })) },
    ...(missingStepIds.length ? {} : { transport: encodeCandidateSourceImport(log) }),
    nextActions: missingStepIds.length ? [
      `在 ${productRoot} 执行 tools/development/run-development-node test/verification/source.ts --round ${options.roundId}${options.base ? ` --base ${options.base}` : ''}${options.sourceFile ? ` --output ${options.sourceFile}` : ''}${invalidated.length ? ` --invalidate ${invalidated.join(',')}` : ''}${selectedStepIds.size > 0 ? ` --selected ${[...selectedStepIds].sort().join(',')}` : ''}；同轮只补失败及未执行项。插件使用同一 --round 和 --output 运行 tools/verify-source.ts${invalidated.includes('dsh-plugin:unit') ? ' --invalidate dsh-plugin:unit' : ''}。`,
      ...(invalidated.length ? [`源码自记录后发生变化，仅需重跑受影响步骤：${invalidated.join(', ')}。`] : []),
      ...(selectedStepIds.size > 0 ? [`本轮按用户指定范围验收：${[...selectedStepIds].sort().join(', ')}。`] : []),
      ...(outOfScopeStepIds.length ? [`用户声明不执行的检查不计入本轮：${[...new Set(outOfScopeStepIds)].sort().join(', ')}。`] : []),
    ] : [] };
}
