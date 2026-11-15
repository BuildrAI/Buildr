import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isCompatibleProgram,
  isStrictManifestVersion,
   isSupportedProgramPlatform,
  nativeProgramPolicies,
  nativeProgramPolicy,
  resolveManifestPlatform,
  type ManifestPlatform,
  type NativeProgramPolicy,
} from './program-policy.ts';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_NPM_METADATA_BYTES = 128 * 1024;

export interface ManifestRelease {
  version: string;
  url: string;
  sha512: string;
  source: string;
  platform: ManifestPlatform;
}

export class ManifestReleaseIncompatibleError extends Error {
  readonly version: string;
  constructor(version: string) {
    super('agent_release_incompatible');
    this.name = 'ManifestReleaseIncompatibleError';
    this.version = version;
  }
}

export interface ProgramReleaseLookupOptions {
  policies?: Readonly<Record<string, NativeProgramPolicy>>;
  platform?: NodeJS.Platform;
  arch?: string;
  fetchImpl?: typeof fetch;
}

export function isAllowedHttpsUrl(candidate: URL, allowedHosts: readonly string[]): boolean {
  if (candidate.protocol !== 'https:') return false;
  if (candidate.username !== '' || candidate.password !== '') return false;
  const hostname = candidate.hostname.toLowerCase();
  const host = candidate.host.toLowerCase();
  if (candidate.port === '') return allowedHosts.some(allowed => allowed.toLowerCase() === hostname);
  return allowedHosts.some(allowed => allowed.toLowerCase() === host);
}

/** Manual HTTPS redirect loop: validates protocol, absence of userinfo, and host allowlist on every hop. */
export async function fetchCheckedHttps(
  initialUrl: string | URL,
  allowedHosts: readonly string[],
  signal: AbortSignal,
  options: {
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    maxRedirects?: number;
    errorPrefix?: 'agent_release' | 'agent_install';
  } = {},
): Promise<{ response: Response; finalUrl: URL }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? 5;
  const prefix = options.errorPrefix ?? 'agent_release';
  let currentUrl: URL;
  try {
    currentUrl = typeof initialUrl === 'string' ? new URL(initialUrl) : new URL(initialUrl.toString());
  } catch {
    throw new Error(`${prefix}_redirect_disallowed`);
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    signal.throwIfAborted();
    if (!isAllowedHttpsUrl(currentUrl, allowedHosts)) {
      throw new Error(`${prefix}_redirect_disallowed`);
    }
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        signal,
        redirect: 'manual',
        headers: options.headers,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error(`${prefix}_unavailable`);
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      if (!REDIRECT_STATUSES.has(response.status)) {
        throw new Error(`${prefix}_redirect_disallowed`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`${prefix}_redirect_disallowed`);
      }
      if (hop >= maxRedirects) {
        throw new Error(`${prefix}_redirect_exceeded`);
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw new Error(`${prefix}_redirect_disallowed`);
      }
      continue;
    }

    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`${prefix}_unavailable`);
    }
    return { response, finalUrl: currentUrl };
  }

  throw new Error(`${prefix}_redirect_exceeded`);
}

async function readBoundedText(response: Response, maxBytes: number, tooLargeCode: string): Promise<string> {
  const reader = response.body!.getReader();
  let bytes = 0;
  let body = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error(tooLargeCode);
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Read and validate a vendor release manifest with per-hop redirect checks, 64 KiB cap, and strict SemVer/SHA-512 checks. */
export async function readManifestRelease(
  provider: string,
  signal: AbortSignal,
  options: ProgramReleaseLookupOptions = {},
): Promise<ManifestRelease> {
  const policies = options.policies ?? nativeProgramPolicies;
  const policy = nativeProgramPolicy(provider, policies);
  if (policy.distribution.kind !== 'manifest') {
    throw new Error('agent_release_invalid');
  }
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const manifestPlatform = resolveManifestPlatform(platform, arch);
  if (!manifestPlatform || !isSupportedProgramPlatform(policy, platform, arch)) {
    throw new Error('agent_release_platform_unsupported');
  }

  const initialUrl = policy.distribution.manifest(manifestPlatform);
  const { response } = await fetchCheckedHttps(
    initialUrl,
    policy.distribution.manifestAllowedHosts,
    AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    {
      fetchImpl: options.fetchImpl,
      headers: { accept: 'application/json' },
      maxRedirects: 5,
      errorPrefix: 'agent_release',
    },
  );

  let raw: string;
  try {
    raw = await readBoundedText(response, MAX_MANIFEST_BYTES, 'agent_release_too_large');
  } catch (error) {
    if (error instanceof Error && error.message === 'agent_release_too_large') throw error;
    signal.throwIfAborted();
    throw new Error('agent_release_invalid');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('agent_release_invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('agent_release_invalid');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.version !== 'string' || !isStrictManifestVersion(record.version)) {
    throw new Error('agent_release_invalid');
  }
  if (typeof record.sha512 !== 'string' || !/^[0-9a-fA-F]{128}$/.test(record.sha512)) {
    throw new Error('agent_release_invalid');
  }
  if (typeof record.url !== 'string' || record.url.length === 0 || record.url.length > 4096) {
    throw new Error('agent_release_invalid');
  }
  let archiveUrl: URL;
  try {
    archiveUrl = new URL(record.url);
  } catch {
    throw new Error('agent_release_invalid');
  }
  if (!isAllowedHttpsUrl(archiveUrl, policy.distribution.archiveAllowedHosts)) {
    throw new Error('agent_release_redirect_disallowed');
  }
  if (!isCompatibleProgram(provider, record.version, policies)) {
    throw new ManifestReleaseIncompatibleError(record.version);
  }

  return {
    version: record.version,
    url: archiveUrl.toString(),
    sha512: record.sha512.toLowerCase(),
    source: initialUrl.toString(),
    platform: manifestPlatform,
  };
}

/** Read only the fixed vendor registry or manifest endpoint; never run an upstream update command or downgrade. */
export async function readProgramLatestRelease(
  provider: string,
  signal: AbortSignal,
  options: ProgramReleaseLookupOptions = {},
): Promise<{ latestVersion: string; source: string; manifest?: ManifestRelease }> {
  const policies = options.policies ?? nativeProgramPolicies;
  const policy = nativeProgramPolicy(provider, policies);
  if (policy.distribution.kind === 'manifest') {
    const manifest = await readManifestRelease(provider, signal, options);
    return { latestVersion: manifest.version, source: manifest.source, manifest };
  }

  const packageName = policy.distribution.package.replace(/@[^@]+$/, '');
  const source = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(source, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    redirect: 'error',
    headers: { accept: 'application/json' },
  });
  if (!response.ok || !response.body) throw new Error('agent_release_unavailable');
  const body = await readBoundedText(response, MAX_NPM_METADATA_BYTES, 'agent_release_too_large');
  const metadata = JSON.parse(body);
  if (metadata.name !== packageName || typeof metadata.version !== 'string' || metadata.version.length > 100) {
    throw new Error('agent_release_invalid');
  }
  return { latestVersion: metadata.version, source };
}

/** Read the official default release and, for `versionDisplay: 'package'` policies, the bound package version. */
export async function readProgramRelease(
  provider: string,
  executable: string,
  signal: AbortSignal,
  options: ProgramReleaseLookupOptions = {},
): Promise<{ latestVersion: string; currentReleaseVersion?: string; source: string }> {
  const policies = options.policies ?? nativeProgramPolicies;
  const policy = nativeProgramPolicy(provider, policies);
  const release = await readProgramLatestRelease(provider, signal, options);
  let currentReleaseVersion: string | undefined;
  if (policy.distribution.kind === 'npm' && policy.versionDisplay === 'package') {
    const packageName = policy.distribution.package.replace(/@[^@]+$/, '');
    let directory = path.dirname(await fs.realpath(executable));
    for (let depth = 0; depth < 6; depth++, directory = path.dirname(directory)) {
      signal.throwIfAborted();
      try {
        const file = path.join(directory, 'package.json');
        if ((await fs.stat(file)).size > MAX_NPM_METADATA_BYTES) continue;
        const installed = JSON.parse(await fs.readFile(file, 'utf8'));
        if (installed.name === packageName && typeof installed.version === 'string' && installed.version.length <= 100) {
          currentReleaseVersion = installed.version;
          break;
        }
      } catch { /* A standalone program need not have package metadata. */ }
    }
  }
  return { latestVersion: release.latestVersion, source: release.source, currentReleaseVersion };
}
