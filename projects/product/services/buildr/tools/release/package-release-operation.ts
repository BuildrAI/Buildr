/** Package projections in the existing release operation. Git and package owners remain authoritative. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evaluateReleasePlan, normalizeReleaseTargets } from './release-targets.ts';
import { sameArtifactIdentity } from './package-compatibility.ts';
import { observePublishedPackageArtifact } from './package-artifact-observation.ts';
import { createPackageReleaseContext, createPackagePublicationEvidence, validatePackageReleaseContext, validatePackageOwnerPublication, packageExecutionCommit, pluginExecutorRecoverySchema, assertUnattemptedPluginPublication } from './release-package-evidence.ts';
import { runPluginHostedOperation, readHostedPluginCandidate, reconcilePluginPreparationPointer } from './plugin-hosted-release.ts';
import { runHostedReleaseTransaction } from './release-transaction-runner.ts';
import { inspectHostedReleaseTransaction, validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { createReleaseContext, releaseContextIdentity } from './release-readiness.ts';
import { assertReleaseExecutorRecoveryEvidence, createReleaseExecutorRecovery, releaseExecutionCommit, assertReleaseExecutorSource } from './release-executor-recovery.ts';
import { observeUnpublishedRelease } from './release-observation.ts';
import { inspectReleaseTag } from './release-tag-ensure.ts';
import { reconcilePublishedReleaseWithDev, closeoutReleaseGitResources } from './release-git-convergence.ts';
import { createReleaseToolRuntime } from './runtime.ts';
import { classifyCandidateFailure } from './candidate-failed-shard-retry.ts';
import { pairExecutionDiagnostic } from './package-pair-diagnostics.ts';

export async function observePackageCounterparts(dependencies: any = {}, packageOptions: any = {}): Promise<any> {
  const observe = dependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact;
  const names = ['buildr', 'dsh-plugin'] as const;
  const values = await Promise.allSettled(names.map(name => observe(name, { ...dependencies.observationOptions, ...packageOptions[name] })));
  return Object.fromEntries(values.map((value, index) => [names[index], value.status === 'fulfilled' ? value.value
    : { observation: { status: 'unknown', packageName: names[index] === 'buildr' ? '@buildr-ai/buildr' : '@buildr-ai/buildr-dsh-plugin', diagnostic: 'Official counterpart observation failed.' } }]));
}

/** Only actual consumption may fill a legacy declaration gap. */
export async function evaluateObservedPackagePlan(targets: any, candidates: any, counterparts: any, dependencies: any = {}): Promise<any> {
  const proof = dependencies.verifyBuildrPluginPair ?? (async (input: any) => {
    const { verifyBuildrPluginPair } = await import('../../../dsh-plugin/tools/verify-buildr-plugin-pair.ts');
    return verifyBuildrPluginPair(input);
  });
  const pairEvidence: any[] = [];
  const pairDiagnostics: any[] = [];
  const identity = ({ packageName, version, integrity, artifactSha256 }: any) => ({ packageName, version, integrity, artifactSha256 });
  const pairs: any[] = [];
  const add = (consumer: any, provider: any) => {
    if (consumer?.artifact && provider?.artifact && (!consumer.artifact.compatibility || !provider.artifact.compatibility)
        && consumer.bytes && provider.bytes && !pairs.some(pair => sameArtifactIdentity(pair.consumer.artifact, consumer.artifact) && sameArtifactIdentity(pair.provider.artifact, provider.artifact))) pairs.push({ consumer, provider });
  };
  const publicMain = counterparts.buildr?.observation?.status === 'present' ? { artifact: counterparts.buildr.observation.artifact, bytes: counterparts.buildr.bytes } : null;
  const publicPlugin = counterparts['dsh-plugin']?.observation?.status === 'present' ? { artifact: counterparts['dsh-plugin'].observation.artifact, bytes: counterparts['dsh-plugin'].bytes } : null;
  if (targets.packages.includes('buildr')) add(publicPlugin, candidates.buildr);
  if (targets.packages.includes('dsh-plugin')) add(candidates['dsh-plugin'], publicMain);
  if (targets.packages.length === 2) add(candidates['dsh-plugin'], candidates.buildr);
  for (const pair of pairs) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-pair-'));
    try {
      const consumer = path.join(root, 'consumer.tgz'), provider = path.join(root, 'provider.tgz');
      fs.writeFileSync(consumer, pair.consumer.bytes, { mode: 0o600 }); fs.writeFileSync(provider, pair.provider.bytes, { mode: 0o600 });
      let result: any;
      try { result = await proof({ consumer: { artifact: pair.consumer.artifact, tarball: consumer }, provider: { artifact: pair.provider.artifact, tarball: provider },
        nodeExecutable: process.execPath, ...(dependencies.npmCli ? { npmCli: dependencies.npmCli } : {}) }); }
      catch (error) {
        pairDiagnostics.push({ consumer: identity(pair.consumer.artifact), provider: identity(pair.provider.artifact),
          ...pairExecutionDiagnostic('pair-verification', 'pair-verification-error', error) });
        continue; // No legacy proof means only that related compatibility remains unknown.
      }
      if (result.status === 'blocked') pairDiagnostics.push({ consumer: identity(pair.consumer.artifact), provider: identity(pair.provider.artifact),
        ...pairExecutionDiagnostic(result.execution?.stage ?? 'pair-consumption', result.execution?.code ?? result.diagnostic ?? 'pair-consumption-failed', result.execution) });
      if (result.legacyPairEvidence) pairEvidence.push(result.legacyPairEvidence);
      if (result.providerContracts && pair.provider.artifact.origin === 'registry') pair.provider.artifact.verifiedContracts = result.providerContracts;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  const plan = evaluateReleasePlan({ targets, candidates: Object.fromEntries(Object.entries(candidates).map(([key, value]: any) => [key, value.artifact])),
    published: Object.fromEntries(Object.entries(counterparts).map(([key, value]: any) => [key, value.observation])), legacyPairEvidence: pairEvidence });
  return { ...plan, ...(plan.status === 'blocked' && pairDiagnostics.length ? { pairDiagnostics } : {}) };
}

export async function preparePackageRelease(options: any, scope: any, dependencies: any = {}): Promise<any> {
  const { state, save, effects, git } = scope;
  const targets = state.targets;
  const packages: any = {};
  const candidates: any = {};
  const devCommit = state.context?.selection?.releaseHead === options.selection.releaseHead ? state.context.convergence.devCommit : git(['rev-parse', 'origin/dev'], options.repo);
  if (targets.packages.includes('buildr')) {
    if (!options.candidateEvidence?.packageArtifact) throw new Error('Main Candidate byte-bound compatibility metadata is missing.');
    const transaction = { repo: options.repo, canonicalWorkspace: scope.workspace, version: targets.versions.buildr, selectionId: targets.selectionId, targets,
      sourceCommit: options.mainCommit, remoteMain: 'origin/main', candidateBase: options.selection.releaseHead, candidateTree: options.selection.releaseTree,
      releaseTask: `release-${targets.selectionId}`, supportTasks: state.supportTasks, candidateRunId: state.candidate.runId, devCommit };
    const ready = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...transaction, action: 'readiness' }, {
      ...dependencies.transactionDependencies, candidateEvidence: options.candidateEvidence,
    });
    effects.push(...(ready.effects ?? []));
    if (ready.status !== 'ready') return { status: 'readiness-blocked', nextActions: ready.nextActions ?? [], ownerResult: ready };
    state.transactions ??= {}; state.transactions.buildr = { ...transaction, releaseContext: ready.context };
    packages.buildr = { artifact: options.candidateEvidence.packageArtifact, ownerContext: ready.context };
    candidates.buildr = { artifact: packages.buildr.artifact, bytes: options.candidateEvidence.tarballBytes };
  }
  if (targets.packages.includes('dsh-plugin')) {
    const peer = targets.packages.includes('buildr') ? candidates.buildr?.artifact : state.preparationPeer;
    if (!peer) return { status: 'peer-observation-blocked', nextActions: ['核对准确公开主包对端；不借同版本开发源码代替。'] };
    state.pluginPreparation ??= {};
    const request = { operation: 'prepare', version: targets.versions['dsh-plugin'], repo: options.repo,
      sourceCommit: options.mainCommit, sourceTree: git(['rev-parse', `${options.mainCommit}:projects/product/services/dsh-plugin`], options.repo), peer,
      sourceCandidateRunId: state.candidate.runId, candidateSourceCommit: options.selection.releaseHead, selectionIdentity: options.selection.selectionIdentity,
      buildrCandidateRunId: state.candidate.runId, pointer: state.pluginPreparation, ghCommand: options.ghCommand };
    const replacement = reconcilePluginPreparationPointer({ ...request, allowReplacement: !state.publicationAuthorization && !state.publication
      && !state.publicationEvidence && !Object.values(state.packagePublications ?? {}).some((value: any) => value.requested || value.runId || value.evidence) }, {
      ...dependencies.pluginDependencies, execute: scope.execute,
    });
    if (replacement.previousPointer) {
      state.pluginPreparationHistory ??= [];
      state.pluginPreparationHistory.push({ pointer: replacement.previousPointer, failure: replacement.failure });
      state.pluginPreparation = replacement.pointer;
      effects.push(...replacement.effects); save();
    }
    const prepared = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ ...request, pointer: state.pluginPreparation }, {
      ...dependencies.pluginDependencies, execute: scope.execute, onPointer: save,
    });
    effects.push(...(prepared.effects ?? [])); save();
    if (prepared.status !== 'passed') return { status: `plugin-preparation-${prepared.status}`, nextActions: prepared.nextActions ?? [], run: prepared.run };
    const boundPeer = prepared.candidate.buildrPeer ?? prepared.verification.peer;
    if (!boundPeer || !sameArtifactIdentity(boundPeer.artifact ?? boundPeer, peer)) throw new Error('Main-only plugin preparation consumed a different peer artifact.');
    packages['dsh-plugin'] = { artifact: prepared.artifact, candidate: prepared.candidate, prepareRunId: prepared.run.id, prepareRunAttempt: prepared.run.run_attempt, buildrPeer: peer,
      ...(prepared.adoption ? { adoption: prepared.adoption } : {}) };
    candidates['dsh-plugin'] = { artifact: prepared.artifact, bytes: prepared.tarballBytes };
  }
  const counterparts = await observePackageCounterparts(dependencies);
  const compatibility = await evaluateObservedPackagePlan(targets, candidates, counterparts, dependencies);
  state.compatibility = compatibility; save();
  if (compatibility.status !== 'passed') return { status: 'compatibility-blocked', compatibility, nextActions: ['保留已成立源码交付事实；修复对应兼容缺口再准备公开发布。'] };
  const context = createPackageReleaseContext({ targets, selection: {
    selectionId: targets.selectionId, version: targets.versions.buildr ?? null, targets, identity: options.selection.selectionIdentity, status: options.selection.status,
    releaseHead: options.selection.releaseHead, releaseTree: options.selection.releaseTree, generation: options.selection.generation,
  }, convergence: { mainCommit: options.mainCommit, mainTree: git(['rev-parse', `${options.mainCommit}^{tree}`], options.repo),
    devCommit, mergeParents: git(['rev-list', '--parents', '-n', '1', options.mainCommit], options.repo).split(/\s/u).slice(1),
    ...(targets.packages.includes('dsh-plugin') ? { pluginTree: git(['rev-parse', `${options.mainCommit}:projects/product/services/dsh-plugin`], options.repo) } : {}) },
    packages, compatibility, candidate: { runId: state.candidate.runId, sourceCommit: state.candidate.sourceCommit, branch: state.candidate.branch } });
  if (state.context && state.context.identity !== context.identity && Object.values(state.packagePublications ?? {}).some((value: any) => value.requested)) throw new Error('A requested package publication owns its frozen context; targets, bytes and order cannot change.');
  state.context = context; state.packagePublications ??= {}; save();
  return { status: 'awaiting-publication-authorization', context, compatibility, nextActions: ['对展示的准确包版本、原字节和顺序明确授权后调用publish --authorized。'] };
}

async function candidateBytes(context: any, state: any, scope: any, dependencies: any): Promise<any> {
  const values: any = {};
  if (context.targets.packages.includes('buildr')) {
    const owned = (dependencies.readCandidateEvidence)(state.candidate.runId);
    if (!owned.packageArtifact || !sameArtifactIdentity(owned.packageArtifact, context.packages.buildr.artifact)) throw new Error('Frozen main Candidate bytes changed.');
    values.buildr = { artifact: owned.packageArtifact, bytes: owned.tarballBytes, candidateEvidence: owned };
  }
  if (context.targets.packages.includes('dsh-plugin')) {
    const owned = (dependencies.readHostedPluginCandidate ?? readHostedPluginCandidate)({ repo: state.transactions?.buildr?.repo ?? state.executionRoot, runId: context.packages['dsh-plugin'].prepareRunId,
      version: context.targets.versions['dsh-plugin'], sourceCommit: context.convergence.mainCommit, sourceTree: context.convergence.pluginTree, peer: context.packages['dsh-plugin'].buildrPeer, ghCommand: scope.ghCommand }, { ...dependencies.pluginDependencies, execute: scope.execute });
    if (!sameArtifactIdentity(owned.artifact, context.packages['dsh-plugin'].artifact)) throw new Error('Frozen plugin Candidate bytes changed.');
    values['dsh-plugin'] = { artifact: owned.artifact, bytes: owned.tarballBytes };
  }
  return values;
}

export function validatePluginRecovery(context: any, observed: any, registryArtifact: any): void {
  const owned = context.packages['dsh-plugin'], journal = observed.journal, run = observed.run;
  if (run?.repository?.full_name !== 'BuildrAI/Buildr' || run.path?.split('@')[0] !== '.github/workflows/publish-dsh-plugin.yml'
      || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.head_sha !== packageExecutionCommit(context, 'dsh-plugin')
      || run.status !== 'completed' || run.run_attempt !== 1 || !Number.isSafeInteger(run.id) || run.id < 1
      || registryArtifact.origin !== 'registry' || !sameArtifactIdentity(owned.artifact, registryArtifact)
      || journal?.schemaVersion !== 'buildr.dsh-plugin-publication/v1' || !['passed', 'blocked'].includes(journal.status)
      || journal.attempted !== true || journal.packageName !== owned.artifact.packageName || journal.version !== owned.artifact.version
      || journal.integrity !== owned.artifact.integrity || journal.sha256 !== owned.artifact.artifactSha256
      || journal.sourceCommit !== owned.artifact.sourceCommit || journal.sourceTree !== owned.candidate.sourceTree
      || journal.request?.workflowRef !== 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main'
      || journal.request.runId !== run.id || journal.request.runAttempt !== 1) throw new Error('Plugin recovery requires the original attempted journal and exact public bytes.');
}

/** A replacement executor continues the original bytes only after the previous request is fully observed. */
async function recoverMainPublication(options: any, context: any, scope: any, dependencies: any): Promise<any> {
  const { state, git, readRun, save, effects } = scope;
  const pointer = state.packagePublications?.buildr, owner = context.packages.buildr?.ownerContext;
  const blocked = (message: string) => ({ status: 'publication-recovery-blocked', nextActions: [message] });
  if (options.action !== 'resume' || options.authorized !== true) return { status: 'authorization-required', nextActions: ['明确授权同版本、原包和原顺序的执行器恢复，再resume --recover-publication --authorized。'] };
  if (owner?.executorRecovery) {
    const previous = state.publicationRecoveryHistory?.at(-1);
    if (!previous || previous.context?.identity !== state.publicationAuthorization?.previousContextIdentity
      || previous.context?.packages?.buildr?.ownerContext?.identity !== owner.executorRecovery.originalContextIdentity
      || state.publicationAuthorization?.contextIdentity !== context.identity || state.publicationAuthorization?.recoveryAuthorized !== true
      || pointer?.contextIdentity !== context.identity) return blocked('恢复请求缺少准确原历史与本次授权，不创建另一请求。');
    assertReleaseExecutorRecoveryEvidence(owner, previous.evidence, previous.run);
    return { status: 'ready', context };
  }
  if (!owner || !pointer?.requested || !Number.isSafeInteger(pointer.runId) || pointer.runId < 1
    || pointer.status === 'passed' || pointer.evidence || state.publicationEvidence
    || pointer.contextIdentity !== context.identity || state.publicationAuthorization?.contextIdentity !== context.identity
    || Object.entries(state.packagePublications ?? {}).some(([name, value]: any) => name !== 'buildr' && (value.requested || value.runId || value.evidence))) {
    return blocked('仅能恢复准确授权上下文中首个尚未发布的主包请求；保留原请求与历史。');
  }
  const run = readRun(pointer.runId);
  const matches = (value: any) => value?.id === pointer.runId && value.repository?.full_name === 'BuildrAI/Buildr'
    && value.path?.split('@')[0] === '.github/workflows/publish.yml' && value.event === 'workflow_dispatch'
    && value.head_branch === 'main' && value.head_sha === owner.convergence.mainCommit
    && value.status === 'completed' && value.conclusion === 'failure' && Number.isSafeInteger(value.run_attempt) && value.run_attempt >= 2;
  if (!matches(run)) return blocked('原主包请求尚未确认至少两次尝试后的终态失败，不替换指针。');
  const inspected = await (dependencies.inspectHostedReleaseTransaction ?? inspectHostedReleaseTransaction)({ runId: pointer.runId,
    repository: 'BuildrAI/Buildr', ghCommand: options.ghCommand }, dependencies.evidenceDependencies);
  const evidence = validateReleaseTransactionEvidence(inspected.evidence);
  if (inspected.status !== 'failed' || evidence.status !== 'failed' || evidence.context.identity !== owner.identity
    || evidence.publish.runId !== run.id || evidence.publish.runAttempt !== run.run_attempt || evidence.publish.headSha !== run.head_sha
    || evidence.release.registryPublished !== false || evidence.release.registryObservation !== 'absent' || evidence.release.registryIntegrity !== null
    || evidence.release.githubRelease !== null || evidence.release.tag !== `v${context.targets.versions.buildr}`
    || evidence.release.tagCommit !== owner.convergence.mainCommit
    || (evidence.attempt.effects ?? []).some((effect: any) => !['local-tag-created', 'local-tag-reused', 'remote-tag-pushed', 'tag-reused'].includes(effect.type)
      || effect.state !== 'confirmed')) return blocked('缺少原运行最新匹配的失败记录，或存在未确认的发布副作用；保留原请求。');
  const publicState = await (dependencies.observeUnpublishedRelease ?? observeUnpublishedRelease)(context.targets.versions.buildr,
    { token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN, ...dependencies.observationOptions });
  if (publicState.facts?.npm?.state !== 'absent' || publicState.facts?.githubRelease?.state !== 'absent'
    || !Array.isArray(publicState.activeRuns) || publicState.activeRuns.length !== 0) return blocked('当前官方版本、GitHub Release或活动发布运行未确认安全，不派发恢复。');
  const repo = state.transactions?.buildr?.repo ?? state.executionRoot ?? scope.workspace;
  const tag = (dependencies.inspectReleaseTag ?? inspectReleaseTag)({ repo, tag: evidence.release.tag, sourceCommit: owner.convergence.mainCommit }, { execute: scope.execute });
  if (tag.status !== 'ready' || tag.action !== 'reuse' || tag.observed?.targetCommit !== owner.convergence.mainCommit) return blocked('现有标签未精确指向原主包来源，不移动或重建标签。');
  const candidates = await candidateBytes(context, state, scope, dependencies);
  git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main', 'refs/heads/dev:refs/remotes/origin/dev']);
  const executionCommit = git(['rev-parse', 'origin/main']);
  const executorRecovery = createReleaseExecutorRecovery(owner, { repo, sourceCommit: executionCommit, previousEvidence: evidence }, { execute: scope.execute });
  const { schemaVersion: _schema, identity: _identity, ...projection } = owner;
  const newOwner = createReleaseContext({ ...projection, executorRecovery });
  const replacement = createPackageReleaseContext({ ...context, packages: { ...context.packages, buildr: { ...context.packages.buildr, ownerContext: newOwner } } });
  const transaction = { ...state.transactions.buildr, repo, sourceCommit: executionCommit, remoteMain: 'origin/main', version: context.targets.versions.buildr,
    candidateBase: context.selection.releaseHead, candidateTree: context.selection.releaseTree, releaseContext: newOwner };
  const ready = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...transaction, action: 'readiness' },
    { ...dependencies.transactionDependencies, candidateEvidence: candidates.buildr.candidateEvidence });
  if (ready.status !== 'ready' || ready.context?.identity !== newOwner.identity) return blocked('新执行器的原包就绪核验未通过；保留原请求。');
  const latest = readRun(pointer.runId);
  if (!matches(latest) || latest.run_attempt !== run.run_attempt || git(['rev-parse', 'origin/main']) !== executionCommit) return blocked('恢复核验期间原运行或main发生变化，保留原请求并重新读取。');
  state.publicationRecoveryHistory ??= [];
  state.publicationRecoveryHistory.push({ package: 'buildr', context: structuredClone(context), transaction: structuredClone(state.transactions.buildr),
    authorization: structuredClone(state.publicationAuthorization), pointer: structuredClone(pointer), run: structuredClone(run), evidence });
  state.context = replacement;
  state.transactions.buildr = transaction;
  state.publicationAuthorization = { ...state.publicationAuthorization, contextIdentity: replacement.identity, recoveryAuthorized: true,
    previousContextIdentity: context.identity };
  state.packagePublications.buildr = { contextIdentity: replacement.identity, requested: false, runId: null };
  for (const [name, value] of Object.entries(state.packagePublications) as Array<[string, any]>) {
    if (name !== 'buildr' && !value.requested && !value.runId && !value.evidence) value.contextIdentity = replacement.identity;
  }
  effects.push({ type: 'publication-executor-recovery-bound', previousRunId: run.id, previousRunAttempt: run.run_attempt,
    originalContextIdentity: context.identity, contextIdentity: replacement.identity, sourceCommit: executionCommit });
  save();
  return { status: 'ready', context: replacement, candidates };
}

/** Replace only the first, explicitly unattempted plugin request; successful main ownership stays intact. */
async function recoverPluginPublication(options: any, context: any, scope: any, dependencies: any): Promise<any> {
  const { state, git, readRun, gh, save, effects } = scope;
  const blocked = (message: string) => ({ status: 'publication-recovery-blocked', nextActions: [message] });
  if (options.action !== 'resume' || options.authorized !== true) return { status: 'authorization-required', nextActions: ['明确授权原插件包的执行器恢复，再resume --recover-publication --authorized。'] };
  const owned = context.packages['dsh-plugin'], pointer = state.packagePublications?.['dsh-plugin'];
  if (!owned || (state.publicationEvidence && !owned.executorRecovery) || state.publicationAuthorization?.contextIdentity !== context.identity
    || !pointer || pointer.contextIdentity !== context.identity || (pointer.status === 'passed' && !owned.executorRecovery)) return blocked('插件恢复缺少原请求或准确授权。');
  if (context.packages.buildr) {
    const main = state.packagePublications?.buildr;
    if (main?.status !== 'passed' || main.contextIdentity !== context.identity || !main.evidence) return blocked('保留主包原身份；只有已验证完成的主包才能接续插件恢复。');
    validatePackageOwnerPublication(context, 'buildr', main.evidence);
  }
  if (owned.executorRecovery) {
    const previous = state.pluginPublicationRecoveryHistory?.at(-1), recovery = owned.executorRecovery;
    if (!previous || previous.context?.identity !== recovery.originalContextIdentity || state.publicationAuthorization.pluginRecoveryAuthorized !== true
      || previous.pointer?.runId !== recovery.previousRunId || releaseContextIdentity(previous.journal) !== recovery.previousJournalIdentity) return blocked('插件恢复历史不完整，不创建另一请求。');
    assertUnattemptedPluginPublication(previous.context.packages['dsh-plugin'], previous, packageExecutionCommit(previous.context, 'dsh-plugin'));
    return { status: 'ready', context };
  }
  if (!pointer.requested || !Number.isSafeInteger(pointer.runId) || pointer.runId < 1 || pointer.evidence) return blocked('原插件请求未知或已取得发布证据，保留原指针。');
  const originalExecution = packageExecutionCommit(context, 'dsh-plugin');
  const observed = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
    version: owned.artifact.version, sourceCommit: originalExecution, originalSourceCommit: context.convergence.mainCommit,
    candidateRunId: owned.prepareRunId, pointer: structuredClone(pointer), ghCommand: options.ghCommand }, { ...dependencies.pluginDependencies, execute: scope.execute });
  if (observed.status !== 'blocked') return blocked('原插件运行或日志未知，不替换原请求。');
  assertUnattemptedPluginPublication(owned, observed, originalExecution);
  const exact = await (dependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact)('dsh-plugin', { ...dependencies.observationOptions, version: owned.artifact.version });
  if (exact.observation?.status !== 'absent') return blocked('插件准确版本并非官方确认缺失，保留原请求。');
  const history = JSON.parse(gh(['api', 'repos/BuildrAI/Buildr/actions/workflows/publish-dsh-plugin.yml/runs?event=workflow_dispatch&branch=main&per_page=100']));
  if (!Array.isArray(history.workflow_runs) || !Number.isSafeInteger(history.total_count) || history.total_count !== history.workflow_runs.length
    || history.workflow_runs.some((run: any) => run.display_title === `DSH publish ${owned.artifact.version}` && run.status !== 'completed')) return blocked('插件发布活动历史未知或仍有未结束请求，不替换原指针。');
  const candidates = await candidateBytes(context, state, scope, dependencies);
  git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main', 'refs/heads/dev:refs/remotes/origin/dev']);
  const sourceCommit = git(['rev-parse', 'origin/main']), repo = state.executionRoot;
  if (sourceCommit === originalExecution) return blocked('尚无新的受保护插件执行器修复，不重复原请求。');
  assertReleaseExecutorSource({ repo, originalCommit: context.convergence.mainCommit, executionCommit: sourceCommit }, { execute: scope.execute });
  const actual = assertReleaseExecutorSource({ repo, originalCommit: originalExecution, executionCommit: sourceCommit }, { execute: scope.execute });
  const workflow = scope.execute('git', ['show', `${sourceCommit}:.github/workflows/publish-dsh-plugin.yml`], { cwd: repo, encoding: 'utf8', timeout: 30_000 });
  if (workflow.status !== 0 || typeof workflow.stdout !== 'string') return blocked('新插件执行器工作流不可读取。');
  const executorRecovery = { schemaVersion: pluginExecutorRecoverySchema, sourceCommit, sourceTree: actual.sourceTree,
    workflowDigest: `sha256-${crypto.createHash('sha256').update(workflow.stdout).digest('hex')}`, originalContextIdentity: context.identity,
    previousRunId: observed.run.id, previousRunAttempt: observed.run.run_attempt, previousJournalIdentity: releaseContextIdentity(observed.journal) };
  const replacement = createPackageReleaseContext({ ...context, packages: { ...context.packages, 'dsh-plugin': { ...owned, executorRecovery } } });
  const latest = readRun(pointer.runId);
  assertUnattemptedPluginPublication(owned, { run: latest, journal: observed.journal }, originalExecution);
  if (git(['rev-parse', 'origin/main']) !== sourceCommit) return blocked('插件恢复核验期间main发生变化，保留原请求。');
  state.pluginPublicationRecoveryHistory ??= [];
  state.pluginPublicationRecoveryHistory.push({ context: structuredClone(context), authorization: structuredClone(state.publicationAuthorization),
    pointer: structuredClone(pointer), run: structuredClone(observed.run), journal: structuredClone(observed.journal) });
  state.context = replacement;
  state.publicationAuthorization = { ...state.publicationAuthorization, contextIdentity: replacement.identity, pluginRecoveryAuthorized: true };
  for (const name of context.targets.packages) {
    if (name !== 'dsh-plugin') state.packagePublications[name].contextIdentity = replacement.identity;
  }
  state.packagePublications['dsh-plugin'] = { contextIdentity: replacement.identity, requested: false, runId: null, previousRunIds: [observed.run.id] };
  effects.push({ type: 'plugin-publication-executor-recovery-bound', previousRunId: observed.run.id, originalContextIdentity: context.identity,
    contextIdentity: replacement.identity, sourceCommit });
  save();
  return { status: 'ready', context: replacement, candidates };
}

/** Continue only the first unfinished package in the original safe order. */
export async function continuePackageRelease(options: any, scope: any, dependencies: any = {}): Promise<any> {
  const { state, save, effects, readRun, gh, git } = scope;
  if (!state.context) return { status: 'preparation-required', nextActions: ['先prepare准确选择与各包候选。'] };
  let context = validatePackageReleaseContext(state.context);
  let recoveredCandidates: any;
  if (options.recoverPublication === true) {
    const pluginOnly = context.packages['dsh-plugin'] && (!context.packages.buildr || state.packagePublications?.buildr?.status === 'passed');
    const recovered = await (pluginOnly ? recoverPluginPublication : recoverMainPublication)(options, context, scope, dependencies);
    if (recovered.status !== 'ready') return recovered;
    context = recovered.context;
    recoveredCandidates = recovered.candidates;
  }
  state.packagePublications ??= {};
  const originalOrder = context.compatibility.publicationOrder;
  for (const name of originalOrder) {
    const pointer = state.packagePublications[name];
    if (!pointer?.requested) break;
    if (pointer.contextIdentity !== context.identity || state.publicationAuthorization?.contextIdentity !== context.identity) throw new Error('Package publication pointer or authorization belongs to a different frozen context.');
    let result: any;
    if (name === 'buildr') {
      if (!pointer.runId) {
        const title = `Release ${context.targets.versions.buildr} (${pointer.releaseId || context.packages.buildr.ownerContext.identity.slice(7, 31)})`;
        const runs = JSON.parse(gh(['run', 'list', '--repo', 'BuildrAI/Buildr', '--workflow', 'publish.yml', '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,displayTitle,headSha']));
        const matches = runs.filter((run: any) => run.displayTitle === title && run.headSha === releaseExecutionCommit(context.packages.buildr.ownerContext));
        if (matches.length > 1) return { status: 'publication-dispatch-ambiguous', package: name, nextActions: ['多个运行匹配原主包请求；保留原指针，核对准确运行身份，不再次派发。'] };
        const found = matches[0];
        if (!found) return { status: 'publication-dispatch-unconfirmed', nextActions: ['回读原主包请求，不再次派发。'] };
        pointer.runId = found.databaseId; save();
      }
      const run = readRun(pointer.runId);
      if (run.status !== 'completed') return { status: 'publication-running', package: name, run, nextActions: ['等待原受保护运行，不重复派发。'] };
      if (run.conclusion !== 'success') {
        if (pointer.retryRequested && Number(run.run_attempt) < 2) return { status: 'publication-retry-unconfirmed', package: name, run };
        const failure = classifyCandidateFailure(gh(['run', 'view', String(run.id), '--repo', 'BuildrAI/Buildr', '--log-failed']));
        if (failure !== 'transient' || Number(run.run_attempt) >= 2) return { status: 'diagnosis-required', package: name, run, nextActions: ['保留已成立公开事实，诊断原主包发布步骤。'] };
        pointer.retryRequested = true; save();
        const effect = { type: 'publication-failed-jobs-rerun', package: name, runId: run.id, previousAttempt: run.run_attempt, state: 'unknown' };
        effects.push(effect); gh(['run', 'rerun', String(run.id), '--failed', '--repo', 'BuildrAI/Buildr']); effect.state = 'confirmed';
        return { status: 'publication-running', package: name, run };
      }
      const observed = await (dependencies.inspectHostedReleaseTransaction ?? inspectHostedReleaseTransaction)({ runId: pointer.runId, repository: 'BuildrAI/Buildr', ghCommand: options.ghCommand }, dependencies.evidenceDependencies);
      if (observed.status !== 'passed' || !observed.evidence) return { status: 'publication-readback-required', package: name, nextActions: observed.nextActions ?? [] };
      result = { run, ownerEvidence: observed.evidence };
    } else {
      const observed = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
        version: context.targets.versions['dsh-plugin'], sourceCommit: packageExecutionCommit(context, 'dsh-plugin'),
        originalSourceCommit: context.convergence.mainCommit, candidateRunId: context.packages['dsh-plugin'].prepareRunId,
        pointer, ghCommand: options.ghCommand }, { ...dependencies.pluginDependencies, execute: scope.execute, onPointer: save });
      effects.push(...(observed.effects ?? [])); save();
      if (observed.status !== 'passed') {
        // Recover a terminal owner journal through a new bound request. The
        // owner's previous attempted=true journal suppresses npm publication.
        // Unknown journals or missing/conflicting public bytes never resend.
        if (observed.status === 'blocked' && observed.run?.status === 'completed' && observed.journal && !pointer.recoveryRequested) {
          const exact = await (dependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact)(name, { ...dependencies.observationOptions,
            version: context.targets.versions[name], expectedIntegrity: context.packages[name].artifact.integrity });
          if (exact.observation.status === 'present') {
            validatePluginRecovery(context, observed, exact.observation.artifact);
            await candidateBytes(context, state, scope, dependencies);
            const currentMain = git(['rev-parse', 'origin/main']);
            if (currentMain !== packageExecutionCommit(context, 'dsh-plugin')) return { status: 'publication-source-drift', package: name, nextActions: ['准确包已公开，保留原记录；当前main改变，核对原来源的恢复路径。'] };
            Object.assign(pointer, { recoveryRunId: observed.run.id, previousRunIds: [...(pointer.previousRunIds ?? []), observed.run.id],
              recoveryRequested: true, requested: false, runId: null }); save();
            const recovered = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
              version: context.targets.versions[name], sourceCommit: packageExecutionCommit(context, 'dsh-plugin'),
              originalSourceCommit: context.convergence.mainCommit, candidateRunId: context.packages[name].prepareRunId,
              pointer, ghCommand: options.ghCommand }, { ...dependencies.pluginDependencies, execute: scope.execute, onPointer: save });
            effects.push(...(recovered.effects ?? [])); save();
            return { status: recovered.status === 'passed' ? 'publication-readback-required' : `publication-${recovered.status}`, package: name,
              run: recovered.run, nextActions: recovered.nextActions ?? ['继续回读原包恢复请求；不重复npm发布。'] };
          }
        }
        return { status: `publication-${observed.status}`, package: name, run: observed.run, nextActions: observed.nextActions ?? [] };
      }
      result = { run: observed.run, ownerEvidence: observed.journal, ...(pointer.recoveryRunId ? { recoveryRunId: pointer.recoveryRunId } : {}) };
    }
    const exact = await (dependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact)(name, { ...dependencies.observationOptions,
      version: context.targets.versions[name], expectedIntegrity: context.packages[name].artifact.integrity });
    if (exact.observation.status !== 'present') return { status: 'publication-readback-required', package: name, publicState: exact.observation, nextActions: ['核对原请求的准确公开字节，不重发已可能成立的包。'] };
    pointer.evidence = validatePackageOwnerPublication(context, name, { ...result, registryArtifact: exact.observation.artifact });
    pointer.status = 'passed'; save();
  }
  const next = originalOrder.find((name: string) => state.packagePublications[name]?.status !== 'passed');
  if (!next) {
    const evidence = createPackagePublicationEvidence({ context, publications: Object.fromEntries(originalOrder.map((name: string) => [name, state.packagePublications[name].evidence])) });
    state.publicationEvidence = evidence; save();
    return closeoutPackageRelease({ ...options, context, evidence }, scope, dependencies);
  }
  if (options.action === 'publish' && options.authorized !== true) return { status: 'authorization-required', nextActions: ['对准确版本与内容明确授权后publish --authorized。'] };
  if (options.action === 'resume' && !state.publicationAuthorization) return { status: 'authorization-required', nextActions: ['原操作尚未取得公开发布授权。'] };
  git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main', 'refs/heads/dev:refs/remotes/origin/dev']);
  const currentMain = git(['rev-parse', 'origin/main']);
  if (currentMain !== packageExecutionCommit(context, next)) return { status: 'publication-source-drift', nextActions: ['保留原包与请求；当前main与授权来源不同，核对原来源的发布路径。'] };
  const candidates = recoveredCandidates ?? await candidateBytes(context, state, scope, dependencies);
  const completed = originalOrder.filter((name: string) => state.packagePublications[name]?.status === 'passed');
  const peerVersion = context.packages['dsh-plugin']?.buildrPeer?.version;
  const counterpartOptions = completed.includes('buildr') && peerVersion ? { buildr: { distTag: peerVersion.includes('-') ? 'next' : 'latest' } } : {};
  const counterparts = await observePackageCounterparts(dependencies, counterpartOptions);
  const planTargets = completed.length ? normalizeReleaseTargets({ packages: next, version: next === 'buildr' ? context.targets.versions.buildr : undefined,
    pluginVersion: next === 'dsh-plugin' ? context.targets.versions['dsh-plugin'] : undefined, selectionId: context.targets.selectionId }) : context.targets;
  const plan = await evaluateObservedPackagePlan(planTargets, candidates, counterparts, dependencies);
  if (plan.status !== 'passed' || (!completed.length && !isDeepStrictEqual(plan.publicationOrder, originalOrder))) return { status: 'compatibility-blocked', compatibility: plan,
    nextActions: ['当前对端或安全顺序改变；保留已成立事实并修复相关兼容缺口，不静默换序。'] };
  state.publicationAuthorization ??= { contextIdentity: context.identity, cleanupPolicy: 'delete-owned-release-branches/v2' };
  if (state.publicationAuthorization.contextIdentity !== context.identity) throw new Error('Publication authorization belongs to different targets, bytes or order.');
  const pointer = state.packagePublications[next] ??= { contextIdentity: context.identity, requested: false, runId: null };
  save();
  let dispatched: any;
  if (next === 'buildr') {
    dispatched = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...state.transactions.buildr, action: 'dispatch', publicationAuthorized: true,
      dispatchPreviouslyRequested: pointer.requested }, { ...dependencies.transactionDependencies,
      ...(candidates.buildr?.candidateEvidence ? { candidateEvidence: candidates.buildr.candidateEvidence } : {}),
      onDispatchIntent: (intent: any) => { Object.assign(pointer, { requested: true, releaseId: intent.releaseId }); save(); },
      onDispatchObserved: (run: any) => { Object.assign(pointer, { requested: true, runId: run.runId }); save(); },
    });
    if (dispatched.github?.runId) { pointer.requested = true; pointer.runId = dispatched.github.runId; save(); }
  } else dispatched = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
    version: context.targets.versions['dsh-plugin'], sourceCommit: packageExecutionCommit(context, 'dsh-plugin'),
    originalSourceCommit: context.convergence.mainCommit, candidateRunId: context.packages['dsh-plugin'].prepareRunId,
    pointer, ghCommand: options.ghCommand }, { ...dependencies.pluginDependencies, execute: scope.execute, onPointer: save });
  effects.push(...(dispatched.effects ?? [])); save();
  return { status: dispatched.status === 'passed' ? 'publication-readback-required' : `publication-${dispatched.status}`, package: next, run: dispatched.run,
    nextActions: dispatched.nextActions?.length ? dispatched.nextActions : ['继续resume回读该包公开原字节，再推进原顺序的下一包。'] };
}

async function closeoutPackageRelease(options: any, scope: any, dependencies: any): Promise<any> {
  const { state, effects, save } = scope;
  const reconciliation = (dependencies.reconcilePublishedReleaseWithDev ?? reconcilePublishedReleaseWithDev)({ repo: scope.workspace, publicationEvidence: options.evidence, inspectDriftedReleaseForCleanup: true }, { execute: scope.execute });
  effects.push(...(reconciliation.effects ?? []));
  if (reconciliation.status !== 'passed') return { status: 'published-dev-reconciliation-blocked', outcomes: { publication: 'passed' }, ownerResult: reconciliation, nextActions: reconciliation.nextActions };
  const cleanup = (dependencies.closeoutReleaseGitResources ?? closeoutReleaseGitResources)({ repo: scope.workspace, version: state.targets.versions.buildr ?? null,
    selectionId: state.targets.selectionId, targets: state.targets, generation: options.context.selection.generation, expectedCommit: options.context.selection.releaseHead,
    publicationEvidence: options.evidence, authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
    authorizeRemoteDelete: state.publicationAuthorization?.contextIdentity === options.context.identity, cleanupPolicy: state.publicationAuthorization?.cleanupPolicy,
    ghCommand: options.ghCommand }, { execute: scope.execute });
  effects.push(...(cleanup.effects ?? []));
  if (cleanup.status !== 'passed') return { status: 'published-cleanup-blocked', outcomes: { publication: 'passed' }, cleanup, nextActions: cleanup.nextActions };
  const runtime = dependencies.runtime ?? createReleaseToolRuntime();
  const taskId = `release-${state.targets.selectionId}`;
  const controller = dependencies.resolveRetainedController(scope.workspace);
  const invoke = dependencies.invokeRetainedController;
  let task = runtime.inspectTask(scope.workspace, taskId);
  if (task.record.status === 'active') {
    const completed = invoke(controller, ['task', 'complete', taskId, '--summary', '所选包原字节发布、开发来源与共享引用收尾已完成。', '--expected-record', task.recordDigest, '--target', scope.workspace, '--json']);
    effects.push(...(completed.effects ?? [])); task = runtime.inspectTask(scope.workspace, taskId);
  }
  if (task.record.status !== 'completed') return { status: 'published-registration-blocked', outcomes: { publication: 'passed', cleanup: 'passed' }, nextActions: ['恢复准确发布任务登记，保留公开事实。'] };
  const worktree = invoke(controller, ['worktree', 'cleanup', taskId, '--expected-source', `workspace=${options.context.selection.releaseHead}`,
    '--delivered-ref', `workspace=${options.context.convergence.mainCommit}`, '--target', scope.workspace, '--json']);
  effects.push(...(worktree.effects ?? []));
  if (worktree.status !== 'cleaned') return { status: 'published-worktree-cleanup-blocked', outcomes: { publication: 'passed', taskRegistration: 'completed' }, cleanup, nextActions: worktree.nextActions };
  if (dependencies.selfBootstrapCloseout) {
    const result = await dependencies.selfBootstrapCloseout({ workspace: scope.workspace, context: options.context, evidence: options.evidence });
    effects.push(...(result.effects ?? []));
    const passed = result.status === 'passed' || result.status === 'not-applicable';
    state.closeout = { status: passed ? 'passed' : 'blocked', outcomes: { publication: 'passed', taskRegistration: 'completed', cleanup: 'cleaned',
      activation: result.status === 'not-applicable' ? 'not-applicable' : passed ? 'ready' : 'blocked' } }; save();
    return { status: passed ? 'passed' : 'published-self-bootstrap-blocked', outcomes: state.closeout.outcomes, cleanup,
      selfBootstrapCloseout: result, nextActions: passed ? [] : result.nextActions ?? ['接续唯一自举执行器的实际收尾结果。'] };
  }
  const doctor = invoke(controller, ['doctor', '--target', scope.workspace, '--json', '--detail', 'compact', ...(options.agent ? ['--agent', options.agent] : [])]);
  effects.push(...(doctor.effects ?? []));
  const ready = doctor.status === 'ready' || (doctor.ok === true && doctor.health?.ready === true);
  state.closeout = { status: ready ? 'passed' : 'blocked', outcomes: { publication: 'passed', taskRegistration: 'completed', cleanup: 'cleaned', activation: ready ? 'ready' : 'blocked' } }; save();
  return { status: ready ? 'passed' : 'published-doctor-blocked', outcomes: state.closeout.outcomes, cleanup, nextActions: ready ? [] : doctor.nextActions ?? ['恢复Doctor对应问题后继续原收尾。'] };
}
