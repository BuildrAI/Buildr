import crypto from 'node:crypto';

export const releasePublishAuthority = Object.freeze({
  provider: 'github-actions',
  repository: 'BuildrAI/Buildr',
  workflow: 'publish.yml',
  environment: 'npm-production',
  allowedActions: Object.freeze(['npm publish']),
});

export const npmTrustedPublisherPermission = 'createPackage';
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

function normalizePublisher(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : null,
    type: typeof value.type === 'string' ? value.type : null,
    repository: typeof value.repository === 'string' ? value.repository : null,
    file: typeof value.file === 'string' ? value.file : null,
    environment: typeof value.environment === 'string' ? value.environment : null,
    permissions: Array.isArray(value.permissions) && value.permissions.every((item) => typeof item === 'string')
      ? [...value.permissions].sort()
      : null,
  };
}

export function normalizeNpmTrustedPublishers(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizePublisher).filter(Boolean);
}

export function expectedNpmTrustedPublisher(authority = releasePublishAuthority) {
  return {
    type: 'github',
    repository: authority.repository,
    file: authority.workflow,
    environment: authority.environment,
    permissions: [npmTrustedPublisherPermission],
  };
}

export function compareNpmTrustedPublishers(publishers, authority = releasePublishAuthority) {
  const expected = expectedNpmTrustedPublisher(authority);
  const matches = normalizeNpmTrustedPublishers(publishers).filter((item) => item.type === expected.type
    && item.repository === expected.repository
    && item.file === expected.file
    && item.environment === expected.environment
    && item.permissions?.length === expected.permissions.length
    && item.permissions.every((value, index) => value === expected.permissions[index]));
  return {
    ok: matches.length === 1 && normalizeNpmTrustedPublishers(publishers).length === 1,
    expected,
    actual: normalizeNpmTrustedPublishers(publishers),
  };
}

export function parseJsonDocuments(source) {
  const text = String(source ?? '').trim();
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [value];
  } catch {
    // npm trust list can emit one pretty-printed JSON document per publisher.
  }
  const documents = [];
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        documents.push(JSON.parse(text.slice(start, index + 1)));
        start = -1;
      }
      if (depth < 0) throw new Error('npm trust list returned malformed JSON.');
    }
  }
  if (quoted || depth !== 0 || documents.length === 0) throw new Error('npm trust list returned malformed JSON.');
  return documents;
}

export function npmSupportsTrustList(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major > 11 || (major === 11 && minor >= 15);
}
