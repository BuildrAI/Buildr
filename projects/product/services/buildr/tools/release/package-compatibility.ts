/** Pure compatibility decisions. Callers obtain identities from validated tar bytes and real observations. */
import { compareVersions, parseSemver } from '../../src/modules/installation/domain/release-version.ts';

export const MAIN_PACKAGE = '@buildr-ai/buildr';
export const PLUGIN_PACKAGE = '@buildr-ai/buildr-dsh-plugin';
export type CompatibilityPackageName = typeof MAIN_PACKAGE | typeof PLUGIN_PACKAGE;
export const PACKAGE_COMPATIBILITY_SCHEMA = 'buildr.package-compatibility/v1';
export interface VersionEndpoints { minInclusive: string; maxExclusive: string; includePrerelease: boolean }
export interface CompatibilityRequirement {
  packageName: CompatibilityPackageName; feature: string; required: boolean; versions: VersionEndpoints; contracts: string[];
}
export interface PackageCompatibility {
  schemaVersion: typeof PACKAGE_COMPATIBILITY_SCHEMA; provides: string[]; requires: CompatibilityRequirement[];
}
export interface ArtifactIdentity { packageName: CompatibilityPackageName; version: string; integrity: string; artifactSha256: string }
export interface ArtifactContractProof extends ArtifactIdentity {
  schemaVersion: 'buildr.package-contract-proof/v1'; contracts: string[]; evidenceSha256: string;
}
export interface CompatibilityArtifact extends ArtifactIdentity {
  origin: 'registry' | 'candidate'; compatibility: PackageCompatibility | null;
  sourceCommit?: string; sourceTree?: string; verifiedContracts?: ArtifactContractProof;
}
export interface LegacyPairEvidence {
  schemaVersion: 'buildr.package-pair-evidence/v1'; consumer: ArtifactIdentity; provider: ArtifactIdentity;
  features: Array<{ feature: string; required: boolean; status: 'passed' | 'unsupported' | 'failed' | 'unknown' }>;
  evidenceSha256: string;
}
export interface CompatibilityDiagnostic { code: string; feature?: string; packageName?: CompatibilityPackageName }
export interface FeatureCompatibility {
  feature: string; required: boolean; status: 'supported' | 'unsupported' | 'failed' | 'unknown';
  diagnostics: CompatibilityDiagnostic[];
}
export interface CompatibilityCheck {
  status: 'passed' | 'blocked'; prospective: boolean; consumer: ArtifactIdentity; provider: ArtifactIdentity;
  features: FeatureCompatibility[]; diagnostics: CompatibilityDiagnostic[];
}
const sha256 = /^[a-f0-9]{64}$/;
const gitIdentity = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const featureName = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;
const contractName = /^buildr\.[a-z0-9.-]+\/v[1-9][0-9]*$/;
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('package-compatibility-object-required');
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) fail('package-compatibility-unexpected-field');
}
function packageName(value: unknown): CompatibilityPackageName {
  if (value !== MAIN_PACKAGE && value !== PLUGIN_PACKAGE) fail('package-compatibility-package-invalid');
  return value;
}
/** Strict package versions, retaining the exact identity while reusing the existing SemVer parser. */
export function compatibilityVersion(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[0-9]/.test(value) || value.trim() !== value) fail('package-compatibility-version-invalid');
  const parsed = parseSemver(value);
  if (!parsed || parsed.version !== value.split('+')[0] || parsed.core.some((part: number) => !Number.isSafeInteger(part))) fail('package-compatibility-version-invalid');
  return value;
}
/** ASCII and arbitrary-size numeric prerelease identifiers avoid locale/Number ordering errors. */
export function compareCompatibilityVersions(left: string, right: string): number {
  const a = parseSemver(compatibilityVersion(left))!, b = parseSemver(compatibilityVersion(right))!;
  const core = compareVersions(a.core.join('.'), b.core.join('.'));
  if (core !== 0) return Math.sign(core);
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const l: string | undefined = a.prerelease[index], r: string | undefined = b.prerelease[index];
    if (l === undefined || r === undefined) return l === r ? 0 : l === undefined ? -1 : 1;
    if (l === r) continue;
    const ln = /^\d+$/.test(l), rn = /^\d+$/.test(r);
    if (ln && rn) return BigInt(l) < BigInt(r) ? -1 : 1;
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return 0;
}
function contracts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 128 || value.some(item => typeof item !== 'string' || !contractName.test(item))) fail('package-compatibility-contract-invalid');
  if (new Set(value).size !== value.length) fail('package-compatibility-contract-duplicate');
  return [...value].sort();
}
function endpoints(value: unknown): VersionEndpoints {
  const input = record(value); onlyKeys(input, ['minInclusive', 'maxExclusive', 'includePrerelease']);
  const minInclusive = compatibilityVersion(input.minInclusive), maxExclusive = compatibilityVersion(input.maxExclusive);
  if (typeof input.includePrerelease !== 'boolean' || compareCompatibilityVersions(minInclusive, maxExclusive) >= 0) fail('package-compatibility-version-endpoints-invalid');
  return { minInclusive, maxExclusive, includePrerelease: input.includePrerelease };
}
export function satisfiesVersionEndpoints(version: string, policy: VersionEndpoints): boolean {
  const parsed = parseSemver(compatibilityVersion(version))!, bounds = endpoints(policy);
  return (bounds.includePrerelease || parsed.prerelease.length === 0)
    && compareCompatibilityVersions(version, bounds.minInclusive) >= 0 && compareCompatibilityVersions(version, bounds.maxExclusive) < 0;
}
export function parsePackageCompatibility(value: unknown): PackageCompatibility {
  const input = record(value); onlyKeys(input, ['schemaVersion', 'provides', 'requires']);
  if (input.schemaVersion !== PACKAGE_COMPATIBILITY_SCHEMA || !Array.isArray(input.requires) || input.requires.length > 32) fail('package-compatibility-schema-invalid');
  const requires = input.requires.map(value => {
    const requirement = record(value); onlyKeys(requirement, ['packageName', 'feature', 'required', 'versions', 'contracts']);
    if (typeof requirement.feature !== 'string' || !featureName.test(requirement.feature) || typeof requirement.required !== 'boolean') fail('package-compatibility-requirement-invalid');
    const list = contracts(requirement.contracts); if (list.length === 0) fail('package-compatibility-required-contracts-empty');
    return { packageName: packageName(requirement.packageName), feature: requirement.feature, required: requirement.required, versions: endpoints(requirement.versions), contracts: list };
  });
  if (new Set(requires.map(item => `${item.packageName}:${item.feature}`)).size !== requires.length) fail('package-compatibility-requirement-duplicate');
  requires.sort((a, b) => `${a.packageName}:${a.feature}`.localeCompare(`${b.packageName}:${b.feature}`));
  return { schemaVersion: PACKAGE_COMPATIBILITY_SCHEMA, provides: contracts(input.provides), requires };
}
function artifactIdentity(value: unknown): ArtifactIdentity {
  const input = record(value), integrity = input.integrity;
  if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) fail('package-compatibility-integrity-invalid');
  const decoded = Buffer.from(integrity.slice(7), 'base64');
  if (decoded.length !== 64 || decoded.toString('base64') !== integrity.slice(7) || typeof input.artifactSha256 !== 'string' || !sha256.test(input.artifactSha256)) fail('package-compatibility-artifact-digest-invalid');
  return { packageName: packageName(input.packageName), version: compatibilityVersion(input.version), integrity, artifactSha256: input.artifactSha256 };
}
export function sameArtifactIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
  return ['packageName', 'version', 'integrity', 'artifactSha256'].every(key => left[key as keyof ArtifactIdentity] === right[key as keyof ArtifactIdentity]);
}
export function parseCompatibilityArtifact(value: unknown): CompatibilityArtifact {
  const input = record(value), identity = artifactIdentity(input);
  if (input.origin !== 'registry' && input.origin !== 'candidate') fail('package-compatibility-origin-invalid');
  if (input.compatibility === undefined) fail('package-compatibility-declaration-observation-required');
  const compatibility = input.compatibility === null ? null : parsePackageCompatibility(input.compatibility);
  if (compatibility?.requires.some(item => item.packageName === identity.packageName)) fail('package-compatibility-self-dependency');
  if (identity.packageName === MAIN_PACKAGE && compatibility?.requires.some(item => item.required && item.packageName === PLUGIN_PACKAGE)) fail('main-package-must-run-without-plugin');
  if (input.origin === 'candidate' && (typeof input.sourceCommit !== 'string' || !gitIdentity.test(input.sourceCommit))) fail('package-compatibility-candidate-source-required');
  for (const key of ['sourceCommit', 'sourceTree']) if (input[key] !== undefined && (typeof input[key] !== 'string' || !gitIdentity.test(input[key]))) fail('package-compatibility-source-invalid');
  const result: CompatibilityArtifact = { ...identity, origin: input.origin, compatibility };
  if (input.sourceCommit !== undefined) result.sourceCommit = input.sourceCommit as string;
  if (input.sourceTree !== undefined) result.sourceTree = input.sourceTree as string;
  if (input.verifiedContracts !== undefined) {
    const proof = record(input.verifiedContracts);
    if (input.origin !== 'registry' || compatibility !== null || proof.schemaVersion !== 'buildr.package-contract-proof/v1' || typeof proof.evidenceSha256 !== 'string' || !sha256.test(proof.evidenceSha256)) fail('package-compatibility-legacy-proof-invalid');
    const proofIdentity = artifactIdentity(proof);
    if (!sameArtifactIdentity(identity, proofIdentity)) fail('package-compatibility-legacy-proof-drift');
    result.verifiedContracts = { ...proofIdentity, schemaVersion: 'buildr.package-contract-proof/v1', contracts: contracts(proof.contracts), evidenceSha256: proof.evidenceSha256 };
  }
  return result;
}
export function parseLegacyPairEvidence(value: unknown): LegacyPairEvidence {
  const input = record(value);
  if (input.schemaVersion !== 'buildr.package-pair-evidence/v1' || typeof input.evidenceSha256 !== 'string' || !sha256.test(input.evidenceSha256) || !Array.isArray(input.features) || input.features.length > 32) fail('package-compatibility-pair-proof-invalid');
  const features = input.features.map(value => {
    const item = record(value);
    if (typeof item.feature !== 'string' || !featureName.test(item.feature) || typeof item.required !== 'boolean' || !['passed', 'unsupported', 'failed', 'unknown'].includes(String(item.status))) fail('package-compatibility-pair-feature-invalid');
    return { feature: item.feature, required: item.required, status: item.status as LegacyPairEvidence['features'][number]['status'] };
  });
  if (new Set(features.map(item => item.feature)).size !== features.length || !features.some(item => item.feature === 'entry' && item.required)) fail('package-compatibility-pair-entry-proof-required');
  return { schemaVersion: 'buildr.package-pair-evidence/v1', consumer: artifactIdentity(input.consumer), provider: artifactIdentity(input.provider), features, evidenceSha256: input.evidenceSha256 };
}
function diagnostic(code: string, feature?: string, name?: CompatibilityPackageName): CompatibilityDiagnostic {
  return { code, ...(feature ? { feature } : {}), ...(name ? { packageName: name } : {}) };
}
/** No registry lookup, test execution or publication here: adapters supply byte-bound evidence. */
export function evaluatePackageCompatibility(
  consumerValue: CompatibilityArtifact, providerValue: CompatibilityArtifact, options: { legacyPairEvidence?: LegacyPairEvidence[] } = {},
): CompatibilityCheck {
  const consumer = parseCompatibilityArtifact(consumerValue), provider = parseCompatibilityArtifact(providerValue);
  if (consumer.packageName === provider.packageName) fail('package-compatibility-counterpart-required');
  const pair = (options.legacyPairEvidence ?? []).map(parseLegacyPairEvidence).find(value => sameArtifactIdentity(value.consumer, consumer) && sameArtifactIdentity(value.provider, provider));
  let features: FeatureCompatibility[];
  if (consumer.compatibility === null) {
    if (consumer.origin === 'candidate' || !pair) features = [{ feature: 'entry', required: true, status: 'unknown', diagnostics: [diagnostic('legacy-consumer-pair-proof-required', 'entry', consumer.packageName)] }];
    else features = pair.features.map(item => ({ feature: item.feature, required: item.required, status: item.status === 'passed' ? 'supported' : item.status,
      diagnostics: item.status === 'passed' ? [] : [diagnostic(`legacy-feature-${item.status}`, item.feature, provider.packageName)] }));
  } else {
    const provided = provider.compatibility?.provides ?? provider.verifiedContracts?.contracts;
    features = consumer.compatibility.requires.filter(item => item.packageName === provider.packageName).map(item => {
      let status: FeatureCompatibility['status'] = 'supported', code: string | undefined;
      if (!satisfiesVersionEndpoints(provider.version, item.versions)) { status = 'unsupported'; code = 'counterpart-version-unsupported'; }
      else if (provided === undefined) { status = 'unknown'; code = 'counterpart-contracts-unknown'; }
      else if (!item.contracts.every(contract => provided.includes(contract))) { status = 'unsupported'; code = 'counterpart-contracts-unavailable'; }
      const observed = pair?.features.find(proof => proof.feature === item.feature);
      if (provider.compatibility === null && observed && satisfiesVersionEndpoints(provider.version, item.versions)) {
        status = observed.status === 'passed' ? 'supported' : observed.status;
        code = observed.status === 'passed' ? undefined : `legacy-feature-${observed.status}`;
      }
      // A real failed call is never reclassified as optional capability absence.
      if (observed?.status === 'failed' || observed?.status === 'unknown') { status = observed.status; code = `counterpart-consumption-${status}`; }
      return { feature: item.feature, required: item.required, status, diagnostics: code ? [diagnostic(code, item.feature, provider.packageName)] : [] };
    });
    if (consumer.packageName === PLUGIN_PACKAGE && !features.some(item => item.feature === 'entry' && item.required)) features.push({ feature: 'entry', required: true, status: 'unknown', diagnostics: [diagnostic('plugin-entry-contract-required', 'entry', provider.packageName)] });
  }
  const blocked = features.some(item => (item.required && item.status !== 'supported') || item.status === 'failed'
    || item.diagnostics.some(value => value.code === 'counterpart-consumption-unknown' || value.code === 'legacy-feature-unknown'));
  // Missing optional declarations are known absence; unobserved required/actual consumption remains unknown.
  return { status: blocked ? 'blocked' : 'passed', prospective: consumer.origin === 'candidate' || provider.origin === 'candidate', consumer: artifactIdentity(consumer), provider: artifactIdentity(provider), features,
    diagnostics: features.flatMap(item => item.diagnostics) };
}
