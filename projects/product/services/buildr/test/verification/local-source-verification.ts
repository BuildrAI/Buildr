import path from 'node:path';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';
import { createSourceVerificationPlan } from './source.ts';
import { assertSourceBundle, encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { collectVerificationReuseBundle, collectVerificationReuseSnapshot, createVerificationReuseStore, inspectVerificationReusePlan, readVerificationReuseBundle, validateVerificationReuseRecord } from './verification-reuse.ts';

// This owner checks local source readiness before spending a remote Candidate.
// Final package, other platforms and publishing remain separate owners.
export async function prepareLocalSourceVerification(options: {
  repo: string; sourceFile?: string; platform?: string; env?: NodeJS.ProcessEnv; packages?: string[];
}, dependencies: any = {}): Promise<any> {
  const sourceEnv = enforceOfflineVerification({ ...(options.env ?? process.env) });
  const buildrRequired = options.packages?.includes('buildr') ?? true;
  const pluginRequired = options.packages?.includes('dsh-plugin') ?? false;
  const productRoot = path.join(options.repo, 'projects/product/services/buildr');
  const projectRoot = path.join(options.repo, 'projects/product');
  const plan = (dependencies.createSourcePlan ?? createSourceVerificationPlan)(options.platform ?? process.platform);
  if (buildrRequired && plan.status !== 'ready') return { status: 'local-verification-required', missingStepIds: [], diagnostic: plan.diagnostic, nextActions: ['在声明支持的本机平台准备源码验证。'] };
  const snapshot = !buildrRequired || dependencies.collectBundle ? undefined : collectVerificationReuseSnapshot({ productRoot, projectRoot, env: sourceEnv });
  let bundle = options.sourceFile ? readVerificationReuseBundle(path.resolve(options.sourceFile))
    : buildrRequired ? (dependencies.collectBundle ?? collectVerificationReuseBundle)({ productRoot, projectRoot, snapshot, env: sourceEnv })
      : { schemaVersion: 'buildr.verification-source-bundle/v1', records: [] };
  assertSourceBundle(bundle);
  const validate = dependencies.validateRecord ?? validateVerificationReuseRecord;
  const store = buildrRequired && !dependencies.collectBundle ? createVerificationReuseStore({ productRoot, projectRoot, snapshot, env: sourceEnv }) : null;
  const isCurrent = dependencies.isCurrent ?? ((record: any) => store?.isCurrent(record) ?? true);
  const providedBundle = bundle;
  bundle = { schemaVersion: 'buildr.verification-source-bundle/v1', records: buildrRequired
    ? bundle.records.filter((record: any) => isCurrent(record) && validate(record, { productRoot, projectRoot, snapshot, stepId: record.identity.stepId })) : [] };
  const required = (buildrRequired ? plan.steps : []).filter((step: any) => Boolean(step.reuse));
  const missingStepIds = required.filter((step: any) => !bundle.records.some((record: any) => record.identity.stepId === step.id
    && validate(record, { productRoot, projectRoot, snapshot, stepId: step.id,
      ...(step.platformScope?.kind === 'common' ? {} : { runner: plan.runner }) }))).map((step: any) => step.id);
  if (pluginRequired) {
    const pluginOwner = await import(new URL('../../../dsh-plugin/tools/verify-all.ts', import.meta.url).href);
    const collector = dependencies.collectPluginBundle ?? pluginOwner.collectPluginSourceVerificationBundle;
    const plugin = await collector({ repo: options.repo, env: options.env, imports: providedBundle });
    assertSourceBundle(plugin);
    bundle = { schemaVersion: 'buildr.verification-source-bundle/v1', records: [...bundle.records.filter((record: any) => !record.identity.stepId.startsWith('dsh-plugin:')), ...plugin.records] };
    for (const id of pluginOwner.PLUGIN_SOURCE_PHASE_IDS) if (!plugin.records.some((record: any) => record.identity.stepId === id)) missingStepIds.push(id);
  }
  const nextActions = missingStepIds.length ? [
    ...(missingStepIds.some((id: string) => !id.startsWith('dsh-plugin:')) ? [`在 ${productRoot} 执行 tools/development/run-development-npm run test:source；仅补齐失效或缺失结果，再继续同一 prepare。`] : []),
    ...(missingStepIds.some((id: string) => id.startsWith('dsh-plugin:')) ? ['在该冻结源码的 dsh-plugin 服务运行 verify-all.ts，显式消费固定 SDK 与真实 Buildr 对端，再继续同一 prepare。'] : []),
  ] : [];
  return {
    status: missingStepIds.length ? 'local-verification-required' : 'ready',
    runner: plan.runner, missingStepIds, recordCount: bundle.records.length,
    ...(snapshot ? { verificationPlan: inspectVerificationReusePlan(plan, { productRoot, projectRoot, snapshot, env: sourceEnv, imports: [bundle] }) } : {}),
    ...(missingStepIds.length ? {} : { transport: encodeCandidateSourceImport(bundle) }), nextActions,
  };
}
