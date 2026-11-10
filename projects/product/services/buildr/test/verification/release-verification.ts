import fs from 'node:fs';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES, verificationSteps } from './registry.ts';
import { encodeCandidateSourceImport } from './candidate-source-reuse.ts';
import { encodeCandidateArtifactImport, readCandidateArtifactImports } from './candidate-artifact-reuse.ts';

/** Release consumes coverage and transport, never the registry's layout. */
export function releaseVerificationCoverage(): { source: string[]; artifact: string[] } {
  return {
    source: CANDIDATE_CI_SHARDS.filter((item: any) => !item.requiresArtifact && !item.producesArtifact).map((item: any) => item.id),
    artifact: [...CANDIDATE_CI_SHARDS.filter((item: any) => item.requiresArtifact || item.producesArtifact), ...CANDIDATE_CI_HOST_NODE_TUPLES].map((item: any) => item.id),
  };
}
export function releaseVerificationTransport(kind: 'source' | 'artifact', file: string): string {
  return kind === 'source' ? encodeCandidateSourceImport(JSON.parse(fs.readFileSync(file, 'utf8')))
    : encodeCandidateArtifactImport(readCandidateArtifactImports(file));
}
export { prepareLocalSourceVerification } from './local-source-verification.ts';
export { createReleaseCandidatePlan, assertPluginSourceAggregate } from './release/verify-pr-candidate.ts';
export { assertReleaseConsumptionCoverage } from './release/release-consumption-contract.ts';

/** Timeout diagnostics receive only their required fields, not the registry. */
export function releaseVerificationTimeouts(): Array<{ id: string; timeoutMs: number }> {
  return verificationSteps.map((step: any) => ({ id: step.id, timeoutMs: step.timeoutMs }));
}
