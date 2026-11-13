import { antigravityProgramPolicy } from './antigravity/program.ts';
import { claudeProgramPolicy } from './claude/program.ts';
import { codexProgramPolicy } from './codex/program.ts';
import { dshProgramPolicy } from './dsh/program.ts';
import { qoderProgramPolicy } from './qoder/program.ts';
import { qoderCnProgramPolicy } from './qoder-cn/program.ts';

export type ManifestPlatform = 'darwin_arm64' | 'darwin_amd64' | 'linux_amd64' | 'linux_arm64' | 'windows_amd64';

export type ProgramDistribution =
  | {
      kind: 'npm';
      package: string;
      entry: string;
      installEnv?: Readonly<Record<string, string>>;
      allowIndependentBinaryVersion?: boolean;
    }
  | {
      kind: 'manifest';
      manifest(platform: ManifestPlatform): URL;
      manifestAllowedHosts: readonly string[];
      archiveAllowedHosts: readonly string[];
      digest: 'sha512';
      payload: {
        'tar.gz'?: { member: string };
        binary?: true;
      };
      entry: string;
    };

export interface NativeProgramPolicy {
  id: string;
  major: number;
  minVersion?: readonly [number, number, number];
  bindingSeries: string;
  compatibility: string;
  version: string;
  package: string;
  entry: string;
  names: readonly string[];
  url: string;
  label: string;
  guidance: string;
  distribution: ProgramDistribution;
  versionDisplay: 'program' | 'package';
  managedOnly?: boolean;
  prepareConnectionConfig?(configRoot: string): Promise<void> | void;
  supportedPlatform?(platform: NodeJS.Platform, arch: string): boolean;
}

/** Version admission, legacy fallback metadata and stable persisted binding namespaces.
 * New managed installs resolve the official upstream release (`latest` or vendor manifest);
 * pinned versions are never used to downgrade or prevent newer compatible releases. */
const builtinPolicies = [
  antigravityProgramPolicy,
  claudeProgramPolicy,
  codexProgramPolicy,
  dshProgramPolicy,
  qoderProgramPolicy,
  qoderCnProgramPolicy,
] as const;

export const nativeProgramPolicies: Readonly<Record<string, NativeProgramPolicy>> = Object.freeze(
  Object.fromEntries(builtinPolicies.map(policy => [policy.id, policy])),
);

export function nativeProgramPolicy(provider: string, policies: Readonly<Record<string, NativeProgramPolicy>> = nativeProgramPolicies): NativeProgramPolicy {
  if (!Object.hasOwn(policies, provider)) throw new Error('agent_program_provider_unsupported');
  return policies[provider]!;
}

export function resolveManifestPlatform(platform: NodeJS.Platform = process.platform, arch: string = process.arch): ManifestPlatform | undefined {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin_arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin_amd64';
  if (platform === 'linux' && arch === 'x64') return 'linux_amd64';
  if (platform === 'linux' && arch === 'arm64') return 'linux_arm64';
  if (platform === 'win32' && arch === 'x64') return 'windows_amd64';
  return undefined;
}

export function isSupportedProgramPlatform(
  policy: NativeProgramPolicy,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): boolean {
  if (policy.supportedPlatform) return policy.supportedPlatform(platform, arch);
  if (policy.distribution.kind === 'manifest') return resolveManifestPlatform(platform, arch) !== undefined;
  return ['darwin', 'linux', 'win32'].includes(platform) && ['arm64', 'x64'].includes(arch);
}

export function isCompatibleProgram(
  provider: string,
  version: string,
  policies: Readonly<Record<string, NativeProgramPolicy>> = nativeProgramPolicies,
): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/.exec(version);
  if (!match || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return false;
  const policy = nativeProgramPolicy(provider, policies);
  if (match[1] !== String(policy.major)) return false;
  if (policy.minVersion) {
    const [, minMinor, minPatch] = policy.minVersion;
    const minor = Number(match[2]), patch = Number(match[3]);
    if (minor < minMinor || (minor === minMinor && patch < minPatch)) return false;
  }
  return true;
}

export function isProgramReleaseVersion(version: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(version);
  return Boolean(match && !match[4]?.split('.').some(part => /^0\d+$/.test(part)));
}

/** Strict SemVer for manifest releases: <=64 chars, only [0-9A-Za-z.-], no build metadata or path separators. */
export function isStrictManifestVersion(version: string): boolean {
  if (version.length === 0 || version.length > 64 || !/^[0-9A-Za-z.-]+$/.test(version)) return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  return Boolean(match && !match[4]?.split('.').some(part => /^0\d+$/.test(part)));
}
