import crypto from 'node:crypto';

export const releasePackageName: any = '@buildr-ai/buildr';
export const releaseWorkflowPath: any = '.github/workflows/publish.yml';
export const releaseAuthorityProbeSchema: any = 'buildr.release-authority-oidc-probe/v1';
export const releaseAuthorityPreflightSchema: any = 'buildr.release-authority-preflight/v3';
export const npmOidcAudience: any = 'npm:registry.npmjs.org';
export const npmRegistryOrigin: any = 'https://registry.npmjs.org';

export const releasePublishAuthority: any = Object.freeze({
  provider: 'github-actions',
  repository: 'BuildrAI/Buildr',
  workflow: 'publish.yml',
  environment: 'npm-production',
  allowedActions: Object.freeze(['npm publish']),
});

export const releaseAuthorityEvidenceMaxAgeMs: any = 15 * 60 * 1000;

export function sha256(value: any): any  {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function samePublishAuthority(actual: any, expected: any = releasePublishAuthority): any  {
  return actual?.provider === expected.provider
    && actual?.repository === expected.repository
    && actual?.workflow === expected.workflow
    && actual?.environment === expected.environment
    && Array.isArray(actual?.allowedActions)
    && actual.allowedActions.length === expected.allowedActions.length
    && actual.allowedActions.every((value: any, index: any) => value === expected.allowedActions[index]);
}

export function releaseAuthorityProbeArtifactName(runId: any, runAttempt: any): any  {
  return `release-authority-probe-${runId}-${runAttempt}`;
}

export function containsCredentialMaterial(value: any): any  {
  if (typeof value === 'string') return /(?:^|\W)npm_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value);
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]: any) => /^(?:token|idToken|accessToken|authorization)$/i.test(key) || containsCredentialMaterial(child));
}
