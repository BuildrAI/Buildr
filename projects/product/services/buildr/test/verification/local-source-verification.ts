import { pluginSourcePhaseFiles, pluginSourcePhaseStep } from '../../../dsh-plugin/tools/source-phase-definition.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createSourceVerificationPlan, pinSourceVerificationBase, selectSourceVerificationSubset } from './source.ts';
import { encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { assertCandidateRound, createCandidateRoundExecution, passedRoundRecord, readCandidateRound } from './candidate-round.ts';
import { verificationSteps } from './registry.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';

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
  const productRoot = path.join(options.repo, 'projects/product/services/buildr');
  const selectedStepIds = new Set<string>(options.selectedStepIds ?? []);
  if (buildrRequired && selectedStepIds.size > 0) {
    for (const step of selectSourceVerificationSubset(plan, [...selectedStepIds]).steps) selectedStepIds.add(step.id);
  }
  const outOfScopeStepIds = required.filter(step => selectedStepIds.size && !selectedStepIds.has(step.id)).map(step => step.id);
  const retainedStepIds = outOfScopeStepIds.filter(id => log.records.some((record: any) =>
    passedRoundRecord(record, options.roundId, required.find(step => step.id === id), plan.runner)));
  const applicable = required.filter(step => !outOfScopeStepIds.includes(step.id));
  const environment = enforceOfflineVerification({ ...(options.env ?? process.env) });
  const env = buildrRequired && (options.base || applicable.some(step => step.reuse?.git === 'comparison'))
    ? pinSourceVerificationBase(productRoot, environment, options.base) : environment;
  const assessment = createCandidateRoundExecution({ ...plan, steps: applicable }, {
    productRoot, env, inspectOnly: true, round: { strictInputs: true, roundId: options.roundId, imports: log,
      resume: log.records.length === 0 && !!options.sourceFile && fs.existsSync(options.sourceFile),
      allowFullRerun: outOfScopeStepIds.length > 0 },
  }, dependencies);
  const decisions = new Map<string, any>(assessment.explanation.steps.map((step: any) => [step.id, step]));
  const steps = required.map(step => decisions.get(step.id) ?? { id: step.id, disposition: 'not-run', reasons: ['declared-out-of-scope'] });
  const missingStepIds = steps.filter(step => step.disposition === 'execute').map(step => step.id);
  const causes = new Map<string, any>(steps.filter(step => step.disposition === 'execute'
    && !step.reasons.includes('failed-or-not-run-in-this-round')).map(step => [step.id, step]));
  const invalidated = [...causes.keys()].sort();
  if (buildrRequired && plan.status !== 'ready') return { status: 'local-verification-required', missingStepIds, invalidatedStepIds: invalidated, diagnostic: plan.diagnostic, nextActions: ['在声明支持的本机平台执行。'] };
  const fullRerun = assessment.fullRerun;
  const fileCounts = assessment.explanation.steps.reduce((counts: { execute: number; reuse: number }, step: any) => ({
    execute: counts.execute + (step.files?.execute ?? 0), reuse: counts.reuse + (step.files?.reuse ?? 0),
  }), { execute: 0, reuse: 0 });
  const byInput = new Map<string, string[]>(), byReason = new Map<string, string[]>();
  const add = (groups: Map<string, string[]>, key: string, id: string) => {
    const ids = groups.get(key) ?? []; ids.push(id); groups.set(key, ids);
  };
  for (const [id, cause] of causes) {
    for (const input of cause.changedInputs ?? []) add(byInput, input, id);
    for (const reason of cause.reasons) add(byReason, reason, id);
  }
  return { status: missingStepIds.length ? 'local-verification-required' : 'ready', runner: plan.runner,
    roundId: options.roundId, missingStepIds, invalidatedStepIds: invalidated, recordCount: log.records.length, verificationBase: options.base ?? null,
    ...(selectedStepIds.size > 0 ? { selectedStepIds: [...selectedStepIds].sort(), retainedStepIds: [...new Set(retainedStepIds)].sort(), outOfScopeStepIds: [...new Set(outOfScopeStepIds)].sort() } : {}),
    ...(fullRerun ? { diagnostic: { code: 'candidate-full-rerun-required', message: '补验需全量，未启动测试；先核对原记录和执行环境。' } } : {}),
    verificationPlan: { steps, fullRerun, fileCounts, counts: { execute: missingStepIds.length, reuse: steps.length - missingStepIds.length - outOfScopeStepIds.length, notRun: outOfScopeStepIds.length },
      invalidationsByInput: [...byInput].sort(([a], [b]) => a.localeCompare(b)).map(([input, checkIds]) => ({ input, checkIds, scope: checkIds.length > 1 ? 'shared' : 'single' })),
      invalidationsByReason: [...byReason].sort(([a], [b]) => a.localeCompare(b)).map(([reason, checkIds]) => ({ reason, checkIds })),
    },
    ...(missingStepIds.length ? {} : { transport: encodeCandidateSourceImport(log) }),
    nextActions: fullRerun ? ['补验需全量，未启动测试。请先核对分组原因、原记录和执行环境；确需全量时显式确认。'] : missingStepIds.length ? [
      ...(missingStepIds.some((id: string) => id !== 'dsh-plugin:unit') ? [
        `在 ${productRoot} 执行 tools/development/run-development-node test/verification/source.ts --round ${options.roundId}${options.base ? ` --base ${options.base}` : ''}${options.sourceFile ? ` --output ${options.sourceFile}` : ''}${options.sourceFile && log.records.some((record: any) => record.identity.stepId !== 'dsh-plugin:unit') ? ' --resume' : ''}${selectedStepIds.size > 0 ? ` --selected ${[...selectedStepIds].sort().join(',')}` : ''}；按有效证据补验。`,
      ] : []),
      ...(missingStepIds.includes('dsh-plugin:unit') ? [
        `插件使用同一 --round ${options.roundId}${options.sourceFile ? ` --output ${options.sourceFile}` : ''} 运行 tools/verify-source.ts。`,
      ] : []),
      ...(outOfScopeStepIds.length ? [`用户声明不执行的检查不计入本轮：${[...new Set(outOfScopeStepIds)].sort().join(', ')}。`] : []),
    ] : [] };
}
