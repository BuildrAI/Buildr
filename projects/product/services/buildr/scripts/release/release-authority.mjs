import crypto from 'node:crypto';

export const releasePackageName = '@buildr-ai/buildr';
export const releaseWorkflowPath = '.github/workflows/publish.yml';
export const releaseAuthorityProbeSchema = 'buildr.release-authority-oidc-probe/v1';
export const releaseAuthorityPreflightSchema = 'buildr.release-authority-preflight/v2';
export const npmOidcAudience = 'npm:registry.npmjs.org';
export const npmRegistryOrigin = 'https://registry.npmjs.org';

export const releasePublishAuthority = Object.freeze({
  provider: 'github-actions',
  repository: 'BuildrAI/Buildr',
  workflow: 'publish.yml',
  environment: 'npm-production',
  allowedActions: Object.freeze(['npm publish']),
});

export const releaseAuthorityEvidenceMaxAgeMs = 15 * 60 * 1000;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function samePublishAuthority(actual, expected = releasePublishAuthority) {
  return actual?.provider === expected.provider
    && actual?.repository === expected.repository
    && actual?.workflow === expected.workflow
    && actual?.environment === expected.environment
    && Array.isArray(actual?.allowedActions)
    && actual.allowedActions.length === expected.allowedActions.length
    && actual.allowedActions.every((value, index) => value === expected.allowedActions[index]);
}

export function releaseAuthorityProbeArtifactName(runId, runAttempt) {
  return `release-authority-probe-${runId}-${runAttempt}`;
}
