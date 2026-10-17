import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createCandidateSourceBinding, createCandidateCheckInputReader } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { CANDIDATE_CI_EVIDENCE_SCHEMA } from './release/candidate-ci-contract.ts';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES, verificationSteps, resolveVerificationExecutionProfile } from './registry.ts';
import { candidateDependencyInputsIdentity, validateCandidateArtifactEvidence, validCandidateExecutionEnvironment } from './candidate-artifact-reuse.ts';
import path from 'node:path';

export const CANDIDATE_REPAIR_SCHEMA = 'buildr.candidate-repair-plan/v1';
const digest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const goodResult = (value: any) => value?.status === 'passed' && value.exitCode === 0
  && (value.childExitCode === undefined || value.childExitCode === 0)
  && (value.childOutcome === undefined || value.childOutcome === 'passed')
  && (value.childSignal === undefined || value.childSignal === null)
  && (!value.processCleanup || value.processCleanup.status === 'clean');
const artifactFields = ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest'];
const sameArtifact = (a: any, b: any) => a && b && artifactFields.every(key => a[key] === b[key]);

export function candidateProofDefinition(step: any): any {
  return { ...step, executionProfile: resolveVerificationExecutionProfile('ci-workspace-limited').limits };
}
export function candidateProofDescriptors(): any[] {
  return [
    ...CANDIDATE_CI_SHARDS.map((shard: any) => ({ ...shard, kind: 'shard', steps: shard.stepIds.map((id: string) => verificationSteps.find((step: any) => step.id === id)) })),
    ...CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => ({ ...tuple, kind: 'host-node', requiresArtifact: true,
      steps: [{ id: 'host-node-compatibility', executor: { type: 'node', file: 'test/verification/host-node.ts', args: [tuple.requestedNode] } }] })),
  ];
}

export function validateCandidateRepairRun(run: any, repository: string, expectedId: string | number): void {
  if (!run || String(run.id) !== String(expectedId) || run.repository?.full_name !== repository
    || run.path?.split('@')[0] !== '.github/workflows/verify.yml' || run.event !== 'workflow_dispatch'
    || run.status !== 'completed' || !/^[a-f0-9]{40,64}$/u.test(run.head_sha ?? '')
    || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Candidate repair requires the exact completed controlled source run.');
}

/** Original records remain intact. The plan authorizes a result only after
 * source, recipe, platform, workflow and original package checks all agree. */
export function createCandidateRepairPlan(input: {
  repo: string; repository: string; originalRun: any; artifact: any; verificationSource: string;
  evidence: any[]; registryIdentity: string;
}, options: { descriptors?: any[]; inputIdentity?: (commit: string, step: any) => string;
  artifactEvidence?: any[]; sourceRecords?: any[]; validateSourceRecord?: (record: any, stepId: string, runner: string) => boolean } = {}): any {
  validateCandidateRepairRun(input.originalRun, input.repository, input.originalRun.id);
  const productSource = input.artifact?.sourceCommit;
  if (input.originalRun.head_sha !== productSource) throw new Error('Candidate repair must preserve its original workflow source.');
  const binding = createCandidateSourceBinding(input.repo, productSource, input.verificationSource);
  createCandidateSourceBinding(input.repo, productSource, input.originalRun.head_sha);
  const sharedInputs = options.inputIdentity ? null : createCandidateCheckInputReader(input.repo);
  const inputs = options.inputIdentity ?? sharedInputs!;
  const byId = new Map<string, any>();
  for (const item of input.evidence) {
    if (item?.schemaVersion !== CANDIDATE_CI_EVIDENCE_SCHEMA || byId.has(item.id)) throw new Error('Candidate repair evidence schema or uniqueness differs.');
    if (String(item.workflow?.runId) !== String(input.originalRun.id) || Number(item.workflow?.runAttempt) > input.originalRun.run_attempt
      || !Number.isSafeInteger(Number(item.workflow?.runAttempt)) || Number(item.workflow.runAttempt) < 1
      || item.sourceCommit !== productSource || item.sourceTree !== binding.productTree
      || item.purpose !== 'candidate' || item.rehearsalIdentity) throw new Error('Candidate repair evidence belongs to another source, purpose or run.');
    if (item.verificationSource) {
      const priorBinding = createCandidateSourceBinding(input.repo, productSource, item.verificationSource);
      if (!isDeepStrictEqual(item.sourceBinding, priorBinding)) throw new Error('Candidate repair prior verification source is unbound.');
    }
    if (item.artifact && !sameArtifact(item.artifact, input.artifact)) throw new Error('Candidate repair evidence refers to different package bytes.');
    if (!Array.isArray(item.results) || new Set(item.results.map((result: any) => result.id)).size !== item.results.length) throw new Error('Candidate repair evidence has ambiguous results.');
    byId.set(item.id, item);
  }
  const descriptors = options.descriptors ?? candidateProofDescriptors();
  if ([...byId.keys()].some(id => !descriptors.some(descriptor => descriptor.id === id))) throw new Error('Candidate repair contains an undeclared evidence owner.');
  const checks = descriptors.map(descriptor => {
    const checkInputs = Object.fromEntries(descriptor.steps.map((step: any) => [step.id, inputs(input.verificationSource, candidateProofDefinition(step))]));
    const imported = options.artifactEvidence?.find(item => validateCandidateArtifactEvidence(item, descriptor,
      { sourceCommit: productSource, sourceTree: binding.productTree }, checkInputs, input.artifact,
      { dependencyInputsIdentity: candidateDependencyInputsIdentity(path.join(input.repo, 'projects/product/services/buildr'), input.verificationSource,
        descriptor.preparation ?? (descriptor.kind === 'host-node' ? descriptor.id === 'host-minimum-macos' ? 'publisher' : 'host' : 'base')) }));
    const original = imported ?? byId.get(descriptor.id);
    const platformMatches = original?.kind === descriptor.kind && (descriptor.platformScope?.kind === 'common'
      ? ['macos', 'windows'].includes(original?.runner?.os) : original?.runner?.os === descriptor.runner)
      && (!descriptor.requestedNode || original.requestedNode === descriptor.requestedNode);
    const packageMatches = !descriptor.requiresArtifact && !descriptor.producesArtifact || sameArtifact(original?.artifact, input.artifact);
    const steps = descriptor.steps.map((step: any) => {
      const currentIdentity = inputs(input.verificationSource, candidateProofDefinition(step));
      const localSource = !descriptor.requiresArtifact && !descriptor.producesArtifact
        ? options.sourceRecords?.find(record => record.identity?.stepId === step.id && options.validateSourceRecord?.(record, step.id, descriptor.runner)) : null;
      const result = original?.results?.find((value: any) => value.id === step.id);
      const priorIdentity = original?.checkInputs?.[step.id] ?? null;
      const definition = candidateProofDefinition(step);
      const priorSource = original?.verificationSource ?? productSource;
      // Authenticate the original v2 digest before comparing both immutable
      // snapshots under today's shared input policy. Keep the old record intact.
      const matchingInputs = priorIdentity === currentIdentity || Boolean(sharedInputs && priorIdentity
        && sharedInputs.matches(priorSource, definition, priorIdentity) && inputs(priorSource, definition) === currentIdentity);
      const producer = descriptor.producesArtifact && step.id === 'candidate-tarball';
      const complete = original?.status === 'passed' || original?.cleanupClean === true;
      const freshGit = Boolean(step.reuse?.git);
      const actualHost = descriptor.kind !== 'host-node' || Boolean(validCandidateExecutionEnvironment(original, original?.checkInputs)
        && original.executionEnvironment.preparation === (descriptor.id === 'host-minimum-macos' ? 'publisher' : 'host')
        && original.executionEnvironment.dependencyInputsIdentity === candidateDependencyInputsIdentity(path.join(input.repo, 'projects/product/services/buildr'), input.verificationSource,
          descriptor.id === 'host-minimum-macos' ? 'publisher' : 'host')
        && (descriptor.expectation === 'minimum' ? original.runner.nodeVersion === '24.15.0' : /^24\.\d+\.\d+$/u.test(original.runner.nodeVersion)));
      const reusable = Boolean(localSource) || actualHost && !freshGit && platformMatches && packageMatches && complete && goodResult(result)
        && (producer || matchingInputs);
      const reason = localSource ? 'matching-local-source-proof' : !actualHost ? 'actual-host-environment-required' : freshGit ? 'current-git-state-required' : !original ? 'missing-evidence' : !platformMatches ? 'platform-or-tuple-changed'
        : !packageMatches ? 'artifact-changed' : !complete || !goodResult(result) ? 'prior-check-not-passed'
          : !producer && !matchingInputs ? 'check-inputs-changed' : producer ? 'original-package-preserved' : 'matching-complete-proof';
      const originalResult = localSource ? { ...localSource.result, sourceRecord: localSource } : result?.candidateProof?.originalResult ?? (result ? { ...result, durationMs: result.reusedFrom?.durationMs ?? result.durationMs } : null);
      const origin = localSource ? { ...localSource.origin, runner: localSource.environment } : result?.candidateProof?.origin ?? (result?.sourceRecord ? { ...result.sourceRecord.origin, runner: result.sourceRecord.environment }
        : { runId: String(input.originalRun.id), runAttempt: Number(original?.workflow?.runAttempt),
          verificationSource: original?.verificationSource ?? input.originalRun.head_sha, runner: original?.runner,
          startedAt: original?.startedAt, finishedAt: original?.finishedAt });
      return { id: step.id, disposition: reusable ? 'reuse' : 'execute', reason, inputIdentity: currentIdentity,
        ...(reusable ? { proof: { schemaVersion: 'buildr.candidate-check-proof/v1', id: step.id, evidenceId: descriptor.id,
          origin: imported ? { kind: original.workflow ? 'ci' : 'local', workflow: original.workflow, runner: original.runner,
            verificationSource: original.verificationSource ?? original.sourceCommit, startedAt: original.startedAt, finishedAt: original.finishedAt } : origin,
          adoptedFrom: imported ? { kind: 'imported-artifact' } : { runId: String(input.originalRun.id), runAttempt: Number(original?.workflow?.runAttempt ?? input.originalRun.run_attempt) },
          sourceBindingIdentity: binding.identity, artifact: original?.artifact ?? null, inputIdentity: currentIdentity,
          originalResult } } : {}) };
    });
    if (descriptor.producesArtifact && steps.some((step: any) => step.disposition !== 'reuse')) throw new Error('Candidate repair requires an already verified original package; it never rebuilds.');
    return { id: descriptor.id, kind: descriptor.kind, runner: descriptor.runner, requestedNode: descriptor.requestedNode ?? null,
      requiresArtifact: Boolean(descriptor.requiresArtifact || descriptor.producesArtifact), producesArtifact: Boolean(descriptor.producesArtifact),
      steps, original: original ?? (steps.every((step: any) => step.disposition === 'reuse') ? {
        runner: { platform: steps[0].proof.origin.runner.platform, os: steps[0].proof.origin.runner.platform === 'darwin' ? 'macos' : 'windows',
          arch: steps[0].proof.origin.runner.arch, nodeVersion: steps[0].proof.origin.runner.nodeVersion },
      } : null) };
  });
  const value = { schemaVersion: CANDIDATE_REPAIR_SCHEMA, repository: input.repository, originalRun: input.originalRun,
    sourceBinding: binding, artifact: input.artifact, registryIdentity: input.registryIdentity, checks };
  return { ...value, identity: digest(value) };
}

export function assertCandidateRepairPlan(plan: any, repo: string, registryIdentity: string): void {
  if (plan?.schemaVersion !== CANDIDATE_REPAIR_SCHEMA || plan.registryIdentity !== registryIdentity) throw new Error('Candidate repair plan schema or registry differs.');
  const { identity, ...body } = plan;
  if (identity !== digest(body)) throw new Error('Candidate repair plan integrity differs.');
  const binding = createCandidateSourceBinding(repo, plan.sourceBinding.productSource, plan.sourceBinding.verificationSource);
  if (!isDeepStrictEqual(binding, plan.sourceBinding)) throw new Error('Candidate repair source binding changed.');
  validateCandidateRepairRun(plan.originalRun, plan.repository, plan.originalRun.id);
  const expected = candidateProofDescriptors();
  if (!Array.isArray(plan.checks) || plan.checks.length !== expected.length || new Set(plan.checks.map((check: any) => check.id)).size !== expected.length
    || expected.some(descriptor => {
      const check = plan.checks.find((item: any) => item.id === descriptor.id);
      return !check || check.kind !== descriptor.kind || check.runner !== descriptor.runner
        || !isDeepStrictEqual(check.steps.map((step: any) => step.id), descriptor.steps.map((step: any) => step.id));
    })) throw new Error('Candidate repair plan has incomplete required coverage.');
}

export function reusedCandidateProofResult(proof: any): any {
  return { ...proof.originalResult, durationMs: 0, disposition: 'reused',
    candidateProof: proof, reusedFrom: { origin: proof.origin, durationMs: proof.originalResult.durationMs ?? 0 },
    processCleanup: { status: 'clean', ownership: 'prior-execution' } };
}

export function validateCandidateRepairProof(result: any, evidenceId: string, plan: any): boolean {
  const expected = plan?.checks?.find((check: any) => check.id === evidenceId)?.steps?.find((step: any) => step.id === result?.id);
  return expected?.disposition === 'reuse' && goodResult(result) && isDeepStrictEqual(result.candidateProof, expected.proof);
}

export function candidateRepairShardPlan(plan: any, shardId: string, originalPlan: any): any {
  const selected = plan.checks.find((check: any) => check.id === shardId);
  if (!selected) throw new Error('Candidate repair shard is not declared.');
  const ids = new Set(selected.steps.filter((step: any) => step.disposition === 'execute').map((step: any) => step.id));
  return { ...originalPlan, source: 'candidate-repair', steps: originalPlan.steps.filter((step: any) => ids.has(step.id))
    .map((step: any) => ({ ...step, dependsOn: step.dependsOn.filter((id: string) => ids.has(id)) })) };
}
