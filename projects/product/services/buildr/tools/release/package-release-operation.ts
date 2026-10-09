/** Package projections in the existing release operation. Git and package owners remain authoritative. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evaluateReleasePlan, normalizeReleaseTargets } from './release-targets.ts';
import { sameArtifactIdentity } from './package-compatibility.ts';
import { observePublishedPackageArtifact } from './package-artifact-observation.ts';
import { createPackageReleaseContext, createPackagePublicationEvidence, validatePackageReleaseContext, validatePackageOwnerPublication } from './release-package-evidence.ts';
import { runPluginHostedOperation, readHostedPluginCandidate } from './plugin-hosted-release.ts';
import { runHostedReleaseTransaction } from './release-transaction-runner.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';
import { reconcilePublishedReleaseWithDev, closeoutReleaseGitResources } from './release-git-convergence.ts';
import { createReleaseToolRuntime } from './runtime.ts';
import { classifyCandidateFailure } from './candidate-failed-shard-retry.ts';

export async function observePackageCounterparts(dependencies: any = {}): Promise<any> {
  const observe = dependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact;
  const names = ['buildr', 'dsh-plugin'] as const;
  const values = await Promise.allSettled(names.map(name => observe(name, dependencies.observationOptions ?? {})));
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
      catch { continue; } // No legacy proof means only that related compatibility remains unknown.
      if (result.legacyPairEvidence) pairEvidence.push(result.legacyPairEvidence);
      if (result.providerContracts && pair.provider.artifact.origin === 'registry') pair.provider.artifact.verifiedContracts = result.providerContracts;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  return evaluateReleasePlan({ targets, candidates: Object.fromEntries(Object.entries(candidates).map(([key, value]: any) => [key, value.artifact])),
    published: Object.fromEntries(Object.entries(counterparts).map(([key, value]: any) => [key, value.observation])), legacyPairEvidence: pairEvidence });
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
    const prepared = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'prepare', version: targets.versions['dsh-plugin'], repo: options.repo,
      sourceCommit: options.mainCommit, sourceTree: git(['rev-parse', `${options.mainCommit}:projects/product/services/dsh-plugin`], options.repo), peer,
      buildrCandidateRunId: state.candidate.runId, pointer: state.pluginPreparation, ghCommand: options.ghCommand }, {
      ...dependencies.pluginDependencies, execute: scope.execute, onPointer: save,
    });
    effects.push(...(prepared.effects ?? [])); save();
    if (prepared.status !== 'passed') return { status: `plugin-preparation-${prepared.status}`, nextActions: prepared.nextActions ?? [], run: prepared.run };
    const boundPeer = prepared.candidate.buildrPeer ?? prepared.verification.peer;
    if (!boundPeer || !sameArtifactIdentity(boundPeer.artifact ?? boundPeer, peer)) throw new Error('Main-only plugin preparation consumed a different peer artifact.');
    packages['dsh-plugin'] = { artifact: prepared.artifact, candidate: prepared.candidate, prepareRunId: prepared.run.id, prepareRunAttempt: prepared.run.run_attempt, buildrPeer: peer };
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
    values.buildr = { artifact: owned.packageArtifact, bytes: owned.tarballBytes };
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
      || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.head_sha !== context.convergence.mainCommit
      || run.status !== 'completed' || run.run_attempt !== 1 || !Number.isSafeInteger(run.id) || run.id < 1
      || registryArtifact.origin !== 'registry' || !sameArtifactIdentity(owned.artifact, registryArtifact)
      || journal?.schemaVersion !== 'buildr.dsh-plugin-publication/v1' || !['passed', 'blocked'].includes(journal.status)
      || journal.attempted !== true || journal.packageName !== owned.artifact.packageName || journal.version !== owned.artifact.version
      || journal.integrity !== owned.artifact.integrity || journal.sha256 !== owned.artifact.artifactSha256
      || journal.sourceCommit !== context.convergence.mainCommit || journal.sourceTree !== owned.candidate.sourceTree
      || journal.request?.workflowRef !== 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main'
      || journal.request.runId !== run.id || journal.request.runAttempt !== 1) throw new Error('Plugin recovery requires the original attempted journal and exact public bytes.');
}

/** Continue only the first unfinished package in the original safe order. */
export async function continuePackageRelease(options: any, scope: any, dependencies: any = {}): Promise<any> {
  const { state, save, effects, readRun, gh, git } = scope;
  if (!state.context) return { status: 'preparation-required', nextActions: ['先prepare准确选择与各包候选。'] };
  const context = validatePackageReleaseContext(state.context);
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
        const matches = runs.filter((run: any) => run.displayTitle === title && run.headSha === context.convergence.mainCommit);
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
        version: context.targets.versions['dsh-plugin'], sourceCommit: context.convergence.mainCommit, candidateRunId: context.packages['dsh-plugin'].prepareRunId,
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
            if (currentMain !== context.convergence.mainCommit) return { status: 'publication-source-drift', package: name, nextActions: ['准确包已公开，保留原记录；当前main改变，核对原来源的恢复路径。'] };
            Object.assign(pointer, { recoveryRunId: observed.run.id, previousRunIds: [...(pointer.previousRunIds ?? []), observed.run.id],
              recoveryRequested: true, requested: false, runId: null }); save();
            const recovered = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
              version: context.targets.versions[name], sourceCommit: context.convergence.mainCommit, candidateRunId: context.packages[name].prepareRunId,
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
  if (currentMain !== context.convergence.mainCommit) return { status: 'publication-source-drift', nextActions: ['保留原包与请求；当前main与授权来源不同，核对原来源的发布路径。'] };
  const candidates = await candidateBytes(context, state, scope, dependencies);
  const counterparts = await observePackageCounterparts(dependencies);
  const completed = originalOrder.filter((name: string) => state.packagePublications[name]?.status === 'passed');
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
      onDispatchIntent: (intent: any) => { Object.assign(pointer, { requested: true, releaseId: intent.releaseId }); save(); },
      onDispatchObserved: (run: any) => { Object.assign(pointer, { requested: true, runId: run.runId }); save(); },
    });
    if (dispatched.github?.runId) { pointer.requested = true; pointer.runId = dispatched.github.runId; save(); }
  } else dispatched = (dependencies.runPluginHostedOperation ?? runPluginHostedOperation)({ operation: 'publish', authorized: true, repo: state.executionRoot,
    version: context.targets.versions['dsh-plugin'], sourceCommit: context.convergence.mainCommit, candidateRunId: context.packages['dsh-plugin'].prepareRunId,
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
  const doctor = invoke(controller, ['doctor', '--target', scope.workspace, '--json', '--detail', 'compact', ...(options.agent ? ['--agent', options.agent] : [])]);
  effects.push(...(doctor.effects ?? []));
  const ready = doctor.status === 'ready' || (doctor.ok === true && doctor.health?.ready === true);
  state.closeout = { status: ready ? 'passed' : 'blocked', outcomes: { publication: 'passed', taskRegistration: 'completed', cleanup: 'cleaned', activation: ready ? 'ready' : 'blocked' } }; save();
  return { status: ready ? 'passed' : 'published-doctor-blocked', outcomes: state.closeout.outcomes, cleanup, nextActions: ready ? [] : doctor.nextActions ?? ['恢复Doctor对应问题后继续原收尾。'] };
}
