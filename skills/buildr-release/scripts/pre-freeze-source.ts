import fs from 'node:fs';
import path from 'node:path';
import { importFrozenVerificationModule } from './frozen-verification-modules.ts';

export async function verifySourceBeforeFreeze(input: {
  repo: string; workspace: string; roundId: string; base: string; head: string; options: any; scope?: any;
}, dependencies: any = {}) {
  const { repo, workspace, roundId, base, head, options, scope } = input;
  const platform = dependencies.platform ?? process.platform;
  const [
    { createSourceVerificationPlan },
    { prepareLocalSourceVerification },
    { changedVerificationSourcePaths, verificationStepAffectedBy },
    { readCandidateRound },
    { runVerificationStep },
  ] = await Promise.all([
    importFrozenVerificationModule(repo, 'source.ts', () => import('../../../projects/product/services/buildr/test/verification/source.ts')),
    importFrozenVerificationModule(repo, 'local-source-verification.ts', () => import('../../../projects/product/services/buildr/test/verification/local-source-verification.ts')),
    importFrozenVerificationModule(repo, 'source-change-applicability.ts', () => import('../../../projects/product/services/buildr/test/verification/source-change-applicability.ts')),
    importFrozenVerificationModule(repo, 'candidate-round.ts', () => import('../../../projects/product/services/buildr/test/verification/candidate-round.ts')),
    importFrozenVerificationModule(repo, 'timing/parallel-runner.ts', () => import('../../../projects/product/services/buildr/test/verification/timing/parallel-runner.ts')),
  ]);
  const plan = createSourceVerificationPlan(platform);
  if (plan.status !== 'ready') return { status: 'local-verification-required', diagnostic: plan.diagnostic,
    nextActions: ['在声明支持的本机平台执行冻结前源码检查。'] };
  const changed = changedVerificationSourcePaths(repo, base, head);
  const selected = options.selectedChecks?.length ? new Set<string>(options.selectedChecks) : null;
  const excludedBoundaries = new Set(scope?.excludedBoundaries ?? options.excludedBoundaries ?? []);
  const excludedSteps = new Set(scope?.excludedStepIds ?? []);
  const selectedStepIds = plan.steps.filter((step: any) => !excludedSteps.has(step.id)
    && !excludedBoundaries.has(step.testing?.executionBoundary) && (!selected || selected.has(step.id))
    && (changed === null || verificationStepAffectedBy(step, changed) !== false)).map((step: any) => step.id);
  if (!selectedStepIds.length) return { status: 'ready' };
  const sourceFile = path.resolve(workspace, options.sourceVerification
    ?? `projects/product/services/buildr/build/verification/candidate-rounds/${roundId}.json`);
  const observe = () => (dependencies.prepareSource ?? prepareLocalSourceVerification)({
    repo, sourceFile, roundId, base, platform, packages: ['buildr'], selectedStepIds, transport: 'file',
  });
  const before = await observe();
  if (before.status === 'ready') return before;
  const cwd = path.join(repo, 'projects/product/services/buildr');
  const args = ['test/verification/source.ts', '--base', base, '--round', roundId, '--output', sourceFile,
    '--selected', selectedStepIds.join(',')];
  if (fs.existsSync(sourceFile) && readCandidateRound(sourceFile, roundId).records.length > 0) args.push('--resume');
  const execution = await (dependencies.runStep ?? runVerificationStep)({
    name: 'pre-freeze-source', command: process.execPath, args, cwd, timeoutMs: 30 * 60_000,
  }, { signal: dependencies.signal, onStderr: (chunk: string) => process.stderr.write(chunk) });
  if (execution.status === 'passed') return observe();
  if (execution.stdout) process.stderr.write(execution.stdout);
  return { ...before, status: 'local-verification-required', diagnostic: {
    code: execution.failureCode ?? 'pre-freeze-source-failed', message: '冻结前受影响的源码检查未通过。修复后继续同一候选。' } };
}
