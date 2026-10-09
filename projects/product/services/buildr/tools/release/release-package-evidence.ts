/** Derived combinations of existing package owners; never a selection or publication store. */
import { isDeepStrictEqual } from 'node:util';
import { normalizeReleaseTargets, type ReleaseTargets } from './release-targets.ts';
import { parseCompatibilityArtifact, sameArtifactIdentity } from './package-compatibility.ts';
import { releaseContextIdentity, validateReleaseContext } from './release-readiness.ts';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { containsCredentialMaterial } from './release-authority.ts';

export const packageReleaseContextSchema = 'buildr.package-release-context/v1';
export const packagePublicationEvidenceSchema = 'buildr.package-publication-evidence/v1';
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
          || candidate.sourceCommit !== convergence.mainCommit || artifact.sourceCommit !== convergence.mainCommit
          || candidate.sourceTree !== convergence.pluginTree || !sha.test(candidate.sourceTree ?? '')
          || !Number.isSafeInteger(owned.prepareRunId) || owned.prepareRunId < 1 || owned.prepareRunAttempt !== 1) fail('Plugin package requires its own exact main-only preparation.');
      const peer = owned.buildrPeer ? parseCompatibilityArtifact(owned.buildrPeer) : null;
      if (peer && (peer.packageName !== '@buildr-ai/buildr' || (targets.packages.includes('buildr')
          ? !sameArtifactIdentity(peer, input.packages.buildr.artifact) || peer.sourceCommit !== selection.releaseHead
          : peer.origin !== 'registry'))) fail('Plugin preparation peer differs from the selected Candidate or exact registry bytes.');
      packages[name] = { artifact, candidate, prepareRunId: owned.prepareRunId, prepareRunAttempt: owned.prepareRunAttempt,
        ...(peer ? { buildrPeer: peer } : {}) };
    }
  }
  const value: any = { schemaVersion: packageReleaseContextSchema, targets, selection: { ...selection }, convergence: { ...convergence },
    compatibility: input.compatibility, packages, candidate: input.candidate };
  if (containsCredentialMaterial(value)) fail('Package release context cannot contain credentials.');
  return { ...value, identity: releaseContextIdentity(value) };
}

export function validatePackageReleaseContext(value: any): any {
  if (value?.schemaVersion !== packageReleaseContextSchema || !digest.test(value.identity ?? '')) fail('Package release context schema or identity is invalid.');
  const recreated = createPackageReleaseContext(value);
  if (recreated.identity !== value.identity) fail('Package release context identity changed.');
  return recreated;
}

export function validatePackageOwnerPublication(context: any, name: string, publication: any): any {
  const candidate = context.packages[name];
  const artifact = parseCompatibilityArtifact(publication?.registryArtifact);
  const run = publication?.run;
  if (artifact.origin !== 'registry' || !sameArtifactIdentity(candidate.artifact, artifact)) fail('Selected package publication has not been confirmed from the same registry bytes.');
  if (run?.repository?.full_name !== repository || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.head_sha !== context.convergence.mainCommit || run.head_branch !== 'main'
      || !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('Selected package publication run is unknown or mismatched.');
  let ownerEvidence: any;
  if (name === 'buildr') {
    if (run.path?.split('@')[0] !== '.github/workflows/publish.yml') fail('Main publication uses a different owner.');
    ownerEvidence = validateReleaseTransactionEvidence(publication.ownerEvidence);
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
        || ownerEvidence.sourceCommit !== context.convergence.mainCommit || ownerEvidence.sourceTree !== candidate.candidate.sourceTree
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
