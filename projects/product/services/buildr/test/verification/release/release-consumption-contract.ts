import crypto from 'node:crypto';
import { PUBLISH_NPM_VERSION } from '../../../tools/verification/candidate-environment.ts';

// This is the executable coverage contract, shared by Candidate and publication.
// A new check must either name its Candidate evidence or explain its live boundary.
export const RELEASE_CHECKS = Object.freeze([
  { id: 'artifact-browser-core', phase: 'candidate', evidence: ['artifact-browser-macos'], operation: 'browser-core' },
  { id: 'package-contract', phase: 'candidate', evidence: ['core-package-runtime-release-macos'], operation: 'metadata' },
  { id: 'platform-launcher', phase: 'candidate', evidence: ['runtime-macos', 'runtime-windows'], operation: 'platform' },
  { id: 'host-node', phase: 'candidate', evidence: ['host-minimum-macos', 'host-minimum-windows'], operation: 'host' },
  { id: 'publisher-cli', phase: 'candidate', evidence: ['host-minimum-macos'], operation: 'publisher' },
  { id: 'release-lifecycle', phase: 'candidate', evidence: ['release-infrastructure-macos'], operation: 'lifecycle' },
  { id: 'artifact-readback', phase: 'pre-publication', reason: 'Recheck downloaded bytes against the frozen Candidate before mutation.' },
  { id: 'publication-authority', phase: 'protected-authority', reason: 'Real platform approval and OIDC exist only in the protected run.' },
  { id: 'source-convergence', phase: 'protected-authority', reason: 'Git refs and publishing authority can change after Candidate.' },
  { id: 'registry-state', phase: 'protected', reason: 'Official Registry version and dist-tags can change after Candidate.' },
  { id: 'tag-state', phase: 'protected', reason: 'The immutable tag must be created or reused under real publication authorization.' },
  { id: 'github-release-state', phase: 'protected', reason: 'Public Release metadata can change after Candidate.' },
  { id: 'npm-publish', phase: 'protected', reason: 'Publishing the verified bytes requires real Registry authority.' },
  { id: 'registry-readback', phase: 'protected', reason: 'Confirm official bytes and dist-tags after the write or its recovery.' },
  { id: 'github-release-write', phase: 'protected', reason: 'Create missing public notes only after matching npm publication.' },
  { id: 'registry-install', phase: 'post-publication', reason: 'Installation from the official Registry requires published bytes.' },
] as const);

export type ReleaseInitialCheckId = Extract<typeof RELEASE_CHECKS[number], { phase: 'pre-publication' | 'protected-authority' }>['id'];
export type ReleaseEffectCheckId = Extract<typeof RELEASE_CHECKS[number], { phase: 'protected' | 'post-publication' }>['id'];

export const RELEASE_CONSUMER_COMMANDS = Object.freeze({
  'browser-core': { file: 'test/verification/release/browser-candidate.ts', args: ['--selector', 'core'], preparation: 'browser-artifact' },
  platform: { file: 'test/verification/release/package-consumption.ts', args: ['--platform-launcher'], preparation: 'consumer' },
  host: { file: 'test/verification/host-node.ts', args: [], preparation: 'host' },
  registry: { file: 'test/verification/release/package-consumption.ts', args: [], preparation: 'consumer' },
});

const consumptionIdentity = (checks: readonly any[]) => `sha256-${crypto.createHash('sha256').update(JSON.stringify({ checks, commands: RELEASE_CONSUMER_COMMANDS, publisherNpm: PUBLISH_NPM_VERSION })).digest('hex')}`;

export function releaseConsumptionIdentity(): string {
  return consumptionIdentity(RELEASE_CHECKS);
}

export function validateReleaseCheckDefinitions(checks: readonly any[] = RELEASE_CHECKS): void {
  const ids = new Set<string>();
  for (const check of checks) {
    if (!check.id || ids.has(check.id)) throw new Error(`Duplicate or missing release check: ${check.id}`);
    ids.add(check.id);
    if (check.phase === 'candidate') {
      if (!Array.isArray(check.evidence) || !check.evidence.length || !['metadata', 'platform', 'host', 'publisher', 'lifecycle', 'browser-core'].includes(check.operation)) throw new Error(`Release check ${check.id} has no executable Candidate coverage.`);
    } else if (!['pre-publication', 'protected-authority', 'protected', 'post-publication'].includes(check.phase) || !check.reason?.trim()) {
      throw new Error(`Release check ${check.id} has no live-state or authorization boundary.`);
    }
  }
}

export function assertReleaseConsumptionCoverage(aggregate: any, expected: { sourceCommit: string; sourceTree?: string }, artifact: any, _recoveryContext?: any): void {
  validateReleaseCheckDefinitions();
  if (aggregate?.status !== 'passed' || aggregate.sourceCommit !== expected.sourceCommit || (expected.sourceTree && aggregate.sourceTree !== expected.sourceTree)) throw new Error('Release consumption requires a passed Candidate for the exact source.');
  // The aggregate owner validates individual proofs. This consumer checks current
  // coverage and exact bytes; a whole-list digest change is not a missing check.
  // Evidence the maintainer explicitly declared out of scope is reported by the
  // aggregate as `notRun`; only an undeclared gap blocks consumption.
  const present = new Set<string>(aggregate.evidenceIds ?? []);
  const notRun = new Set<string>(aggregate.notRun?.evidenceIds ?? []);
  if (notRun.size > 0 && !aggregate.declaredScope) throw new Error('Candidate reports not-run evidence without the user declaration that authorized it.');
  for (const check of RELEASE_CHECKS) {
    if (!('evidence' in check)) continue;
    const undeclared = check.evidence.filter((id: string) => !present.has(id) && !notRun.has(id));
    if (undeclared.length) throw new Error(`Candidate is missing release check ${check.id}: ${undeclared.join(', ')}.`);
  }
  for (const field of ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest']) {
    if (!artifact || aggregate.artifact?.[field] !== artifact[field]) throw new Error(`Candidate consumption artifact ${field} mismatches.`);
  }
}
