/** Derived combinations of existing package owners; never a selection or publication store. */
import { isDeepStrictEqual } from 'node:util';
import { normalizeReleaseTargets, type ReleaseTargets } from './release-targets.ts';
import { parseCompatibilityArtifact, sameArtifactIdentity } from './package-compatibility.ts';
import { releaseContextIdentity, validateReleaseContext } from './release-readiness.ts';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { releaseExecutionCommit } from './release-executor-recovery.ts';
import { containsCredentialMaterial } from './release-authority.ts';
import { assertPluginCandidateAdoption } from './dsh-plugin/candidate-adoption.ts';

export const packageReleaseContextSchema = 'buildr.package-release-context/v1';
export const packagePublicationEvidenceSchema = 'buildr.package-publication-evidence/v1';
export const pluginExecutorRecoverySchema = 'buildr.plugin-executor-recovery/v1';
const sha = /^[a-f0-9]{40}$/u;
const digest = /^sha256-[a-f0-9]{64}$/u;
const repository = 'BuildrAI/Buildr';

function fail(message: string): never { throw new Error(message); }
function exactTargets(value: ReleaseTargets): ReleaseTargets {
  const targets = normalizeReleaseTargets({ packages: value?.packages, version: value?.versions?.buildr, pluginVersion: value?.versions?.['dsh-plugin'], selectionId: value?.selectionId });
  if (!isDeepStrictEqual(value, targets)) fail('Package release targets are not canonical.');
  return targets;
}

export function createPackageReleaseContext(input: any): any {
  const targets = exactTargets(input.targets);
  const selection = input.selection;
  const convergence = input.convergence;
  if (selection?.selectionId !== targets.selectionId || selection.version !== (targets.versions.buildr ?? null) || !isDeepStrictEqual(selection.targets, targets)
      || selection.status !== 'frozen' || !digest.test(selection.identity ?? '')
      || !sha.test(selection.releaseHead ?? '') || !sha.test(selection.releaseTree ?? '')
      || !Number.isSafeInteger(selection.generation) || selection.generation < 0) fail('Package release requires the matching frozen selection.');
  if (!sha.test(convergence?.mainCommit ?? '') || convergence.mainTree !== selection.releaseTree
      || !sha.test(convergence?.devCommit ?? '') || !Array.isArray(convergence.mergeParents)
      || convergence.mergeParents.length !== 2 || convergence.mergeParents[1] !== selection.releaseHead) fail('Package release requires the protected tree-equivalent main merge.');
  if (input.compatibility?.status !== 'passed' || !isDeepStrictEqual(input.compatibility.targets, targets)
      || !Array.isArray(input.compatibility.publicationOrder)
      || input.compatibility.publicationOrder.length !== targets.packages.length
      || new Set(input.compatibility.publicationOrder).size !== targets.packages.length
      || input.compatibility.publicationOrder.some((value: any) => !targets.packages.includes(value))) fail('Package release requires one safe publication order for the exact targets.');
  const packages: Record<string, any> = {};
  for (const name of targets.packages) {
    const owned = input.packages?.[name];
    const artifact = parseCompatibilityArtifact(owned?.artifact);
    if (artifact.origin !== 'candidate' || artifact.version !== targets.versions[name]
        || artifact.packageName !== (name === 'buildr' ? '@buildr-ai/buildr' : '@buildr-ai/buildr-dsh-plugin')) fail('Package release candidate differs from the selected target.');
    if (name === 'buildr') {
      const ownerContext = validateReleaseContext(owned.ownerContext);
      if (ownerContext.selection?.selectionId !== targets.selectionId || !isDeepStrictEqual(ownerContext.selection.targets, targets)
          || ownerContext.selection.identity !== selection.identity || ownerContext.release.version !== artifact.version
          || ownerContext.selection.releaseHead !== selection.releaseHead || ownerContext.selection.releaseTree !== selection.releaseTree
          || ownerContext.selection.generation !== selection.generation || ownerContext.selection.status !== 'frozen'
          || artifact.sourceCommit !== selection.releaseHead
          || ownerContext.release.sourceCommit !== selection.releaseHead || ownerContext.convergence.mainCommit !== convergence.mainCommit
          || ownerContext.artifact.integrity !== artifact.integrity || ownerContext.artifact.sha256 !== artifact.artifactSha256) fail('Main package owner context differs from the shared selection and bytes.');
      packages[name] = { artifact, ownerContext };
    } else {
      const candidate = owned.candidate;
      if (candidate?.schemaVersion !== 'buildr.dsh-plugin-release-candidate/v1' || candidate.packageName !== artifact.packageName
          || candidate.version !== artifact.version || candidate.integrity !== artifact.integrity || candidate.sha256 !== artifact.artifactSha256
          || candidate.sourceCommit !== artifact.sourceCommit || (!owned.adoption && candidate.sourceCommit !== convergence.mainCommit)
          || candidate.sourceTree !== convergence.pluginTree || !sha.test(candidate.sourceTree ?? '')
          || !Number.isSafeInteger(owned.prepareRunId) || owned.prepareRunId < 1 || owned.prepareRunAttempt !== 1) fail('Plugin package requires its own exact main-only preparation.');
      if (owned.adoption) {
        assertPluginCandidateAdoption(owned.adoption, candidate, { commit: convergence.mainCommit, tree: convergence.mainTree, parents: convergence.mergeParents, serviceTree: convergence.pluginTree });
        if (owned.adoption.source.commit !== selection.releaseHead || owned.adoption.source.selectionIdentity !== selection.identity
          || owned.adoption.source.runId !== input.candidate?.runId) fail('Plugin Candidate adoption differs from shared selection.');
      }
      const peer = owned.buildrPeer ? parseCompatibilityArtifact(owned.buildrPeer) : null;
      if (peer && (peer.packageName !== '@buildr-ai/buildr' || (targets.packages.includes('buildr')
          ? !sameArtifactIdentity(peer, input.packages.buildr.artifact) || peer.sourceCommit !== selection.releaseHead
          : peer.origin !== 'registry'))) fail('Plugin preparation peer differs from the selected Candidate or exact registry bytes.');
      packages[name] = { artifact, candidate, prepareRunId: owned.prepareRunId, prepareRunAttempt: owned.prepareRunAttempt,
        ...(peer ? { buildrPeer: peer } : {}), ...(owned.adoption ? { adoption: owned.adoption } : {}),
        ...(Object.hasOwn(owned, 'executorRecovery') ? { executorRecovery: owned.executorRecovery } : {}) };
    }
  }
  const value: any = { schemaVersion: packageReleaseContextSchema, targets, selection: { ...selection }, convergence: { ...convergence },
    compatibility: input.compatibility, packages, candidate: input.candidate };
  const recovery = packages['dsh-plugin']?.executorRecovery;
  if (Object.hasOwn(packages['dsh-plugin'] ?? {}, 'executorRecovery')) {
    const proofField = Object.hasOwn(recovery ?? {}, 'previousJournalIdentity') ? 'previousJournalIdentity' : 'previousNoWriteEvidenceIdentity';
    const fields = ['schemaVersion', 'sourceCommit', 'sourceTree', 'workflowDigest', 'originalContextIdentity', 'previousRunId', 'previousRunAttempt', proofField];
    if (!recovery || Object.keys(recovery).length !== fields.length || fields.some(key => !Object.hasOwn(recovery, key))
      || recovery.schemaVersion !== pluginExecutorRecoverySchema || !sha.test(recovery.sourceCommit ?? '') || !sha.test(recovery.sourceTree ?? '')
      || !digest.test(recovery.workflowDigest ?? '') || !digest.test(recovery.originalContextIdentity ?? '') || !digest.test(recovery[proofField] ?? '')
      || !Number.isSafeInteger(recovery.previousRunId) || recovery.previousRunId < 1 || recovery.previousRunAttempt !== 1
      || recovery.sourceCommit === (packages.buildr ? releaseExecutionCommit(packages.buildr.ownerContext) : convergence.mainCommit)) fail('Plugin executor recovery identity is invalid.');
    const original = structuredClone(value); delete original.packages['dsh-plugin'].executorRecovery;
    if (releaseContextIdentity(original) !== recovery.originalContextIdentity) fail('Plugin executor recovery changed the original package context.');
  }
  if (containsCredentialMaterial(value)) fail('Package release context cannot contain credentials.');
  return { ...value, identity: releaseContextIdentity(value) };
}

export function validatePackageReleaseContext(value: any): any {
  if (value?.schemaVersion !== packageReleaseContextSchema || !digest.test(value.identity ?? '')) fail('Package release context schema or identity is invalid.');
  const recreated = createPackageReleaseContext(value);
  if (recreated.identity !== value.identity) fail('Package release context identity changed.');
  return recreated;
}

/** The main owner remains unchanged when only the plugin publisher is repaired. */
export function packageExecutionCommit(context: any, name: string): string {
  if (name === 'dsh-plugin' && context.packages[name]?.executorRecovery) return context.packages[name].executorRecovery.sourceCommit;
  return context.packages.buildr ? releaseExecutionCommit(context.packages.buildr.ownerContext) : context.convergence.mainCommit;
}

/** Only the observed pre-upload OIDC refusal can authorize a replacement plugin request. */
export function assertUnattemptedPluginPublication(owned: any, observed: any, executionCommit: string): void {
  const { run, journal } = observed;
  if (run?.repository?.full_name !== repository || run.path?.split('@')[0] !== '.github/workflows/publish-dsh-plugin.yml'
    || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.head_sha !== executionCommit
    || run.status !== 'completed' || run.conclusion !== 'failure' || run.run_attempt !== 1 || !Number.isSafeInteger(run.id) || run.id < 1
    || journal?.schemaVersion !== 'buildr.dsh-plugin-publication/v1' || journal.status !== 'blocked' || journal.action !== 'blocked'
    || journal.code !== 'plugin-oidc-authority-mismatch' || journal.attempted !== false || journal.publishedObserved !== false || journal.registry !== 'absent'
    || journal.packageName !== owned.artifact.packageName || journal.version !== owned.artifact.version
    || journal.integrity !== owned.artifact.integrity || journal.sha256 !== owned.artifact.artifactSha256
    || journal.sourceCommit !== owned.artifact.sourceCommit || journal.sourceTree !== owned.candidate.sourceTree
    || journal.request?.workflowRef !== `${repository}/.github/workflows/publish-dsh-plugin.yml@refs/heads/main`
    || journal.request.runId !== run.id || journal.request.runAttempt !== 1 || containsCredentialMaterial(journal)) fail('Plugin executor recovery requires the exact unattempted OIDC failure journal.');
}

export function validatePackageOwnerPublication(context: any, name: string, publication: any): any {
  const candidate = context.packages[name];
  const artifact = parseCompatibilityArtifact(publication?.registryArtifact);
  const run = publication?.run;
  const recoveredOwner = name === 'buildr' ? validateReleaseTransactionEvidence(publication?.ownerEvidence) : null;
  const executionCommit = recoveredOwner ? releaseExecutionCommit(recoveredOwner.context) : packageExecutionCommit(context, name);
  if (artifact.origin !== 'registry' || !sameArtifactIdentity(candidate.artifact, artifact)) fail('Selected package publication has not been confirmed from the same registry bytes.');
  if (run?.repository?.full_name !== repository || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.head_sha !== executionCommit || run.head_branch !== 'main'
      || !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('Selected package publication run is unknown or mismatched.');
  let ownerEvidence: any;
  if (name === 'buildr') {
    if (run.path?.split('@')[0] !== '.github/workflows/publish.yml') fail('Main publication uses a different owner.');
    ownerEvidence = recoveredOwner;
    if (ownerEvidence.status !== 'passed' || ownerEvidence.context.identity !== candidate.ownerContext.identity
        || ownerEvidence.release.registryPublished !== true || ownerEvidence.release.registrySmoke !== 'passed'
        || !ownerEvidence.release.githubRelease || ownerEvidence.release.tag !== `v${artifact.version}`
        || ownerEvidence.release.tagCommit !== context.convergence.mainCommit
        || ownerEvidence.release.registryIntegrity !== artifact.integrity || ownerEvidence.publish.repository !== repository
        || ownerEvidence.publish.workflow !== '.github/workflows/publish.yml' || ownerEvidence.publish.headSha !== run.head_sha
        || Number(ownerEvidence.publish.runId) !== run.id || Number(ownerEvidence.publish.runAttempt) !== run.run_attempt) fail('Main publication is incomplete or belongs to a different context.');
  } else {
    ownerEvidence = publication.ownerEvidence;
    if (run.path?.split('@')[0] !== '.github/workflows/publish-dsh-plugin.yml' || run.run_attempt !== 1
        || ownerEvidence?.schemaVersion !== 'buildr.dsh-plugin-publication/v1' || ownerEvidence.status !== 'passed'
        || ownerEvidence.registry !== 'present' || ownerEvidence.publishedObserved !== true
        || ownerEvidence.packageName !== artifact.packageName || ownerEvidence.version !== artifact.version
        || ownerEvidence.integrity !== artifact.integrity || ownerEvidence.sha256 !== artifact.artifactSha256
        || ownerEvidence.sourceCommit !== candidate.artifact.sourceCommit || ownerEvidence.sourceTree !== candidate.candidate.sourceTree
        || ownerEvidence.request?.workflowRef !== `${repository}/.github/workflows/publish-dsh-plugin.yml@refs/heads/main`
        || ownerEvidence.request.runAttempt !== 1
        || !Number.isSafeInteger(ownerEvidence.request.runId) || ownerEvidence.request.runId < 1
        || (publication.recoveryRunId !== undefined && (!Number.isSafeInteger(publication.recoveryRunId) || publication.recoveryRunId < 1))
        || (ownerEvidence.request.runId !== run.id && ownerEvidence.request.runId !== publication.recoveryRunId)) fail('Plugin publication journal is incomplete or belongs to different bytes.');
  }
  return { registryArtifact: artifact, run: { id: run.id, repository: { full_name: run.repository.full_name }, path: run.path, event: run.event, head_branch: run.head_branch, head_sha: run.head_sha, status: run.status, conclusion: run.conclusion, run_attempt: run.run_attempt }, ownerEvidence, ...(publication.recoveryRunId ? { recoveryRunId: publication.recoveryRunId } : {}) };
}

/** A successful workflow alone is insufficient: owner evidence and exact registry bytes are required. */
export function createPackagePublicationEvidence(input: any): any {
  const context = validatePackageReleaseContext(input.context);
  const publications: Record<string, any> = {};
  for (const name of context.targets.packages) {
    const publication = input.publications?.[name];
    publications[name] = validatePackageOwnerPublication(context, name, publication);
  }
  const value = { schemaVersion: packagePublicationEvidenceSchema, status: 'passed', context, publications };
  if (containsCredentialMaterial(value)) fail('Package publication evidence cannot contain credentials.');
  return { ...value, identity: releaseContextIdentity(value) };
}

export function validatePackagePublicationEvidence(value: any): any {
  if (value?.schemaVersion !== packagePublicationEvidenceSchema || value.status !== 'passed' || !digest.test(value.identity ?? '')) fail('Package publication evidence schema, status or identity is invalid.');
  const recreated = createPackagePublicationEvidence(value);
  if (recreated.identity !== value.identity) fail('Package publication evidence identity changed.');
  return recreated;
}
