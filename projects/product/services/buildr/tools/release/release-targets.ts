/** Target and compatibility planning only. Package owners retain all publication and recovery effects. */
import {
  MAIN_PACKAGE, PLUGIN_PACKAGE, compatibilityVersion, evaluatePackageCompatibility, parseCompatibilityArtifact,
  type CompatibilityArtifact, type CompatibilityCheck, type CompatibilityDiagnostic, type CompatibilityPackageName, type LegacyPairEvidence,
} from './package-compatibility.ts';

export type ReleasePackage = 'buildr' | 'dsh-plugin';
export const RELEASE_TARGETS_SCHEMA = 'buildr.release-targets/v1';
export interface ReleaseTargets {
  schemaVersion: typeof RELEASE_TARGETS_SCHEMA; packages: ReleasePackage[];
  versions: Partial<Record<ReleasePackage, string>>; selectionId: string;
}
export interface ReleaseTargetOptions { packages?: string | readonly ReleasePackage[]; version?: string; pluginVersion?: string; selectionId?: string }
export type PublishedPackageObservation =
  | { status: 'present'; artifact: CompatibilityArtifact }
  | { status: 'absent' | 'unknown'; packageName: CompatibilityPackageName; diagnostic?: string };
export interface ReleaseCompatibilityPlan {
  schemaVersion: 'buildr.release-compatibility-plan/v1'; status: 'passed' | 'blocked'; targets: ReleaseTargets;
  publicationOrder: ReleasePackage[];
  packages: Partial<Record<ReleasePackage, { status: 'passed' | 'blocked'; diagnostics: CompatibilityDiagnostic[] }>>;
  checks: Array<CompatibilityCheck & { stage: 'independent' | 'new-pair' | 'main-first' | 'plugin-first' }>;
  diagnostics: CompatibilityDiagnostic[];
}
const packageNames = { buildr: MAIN_PACKAGE, 'dsh-plugin': PLUGIN_PACKAGE } as const;
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function selectionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]{0,238}[a-z0-9])?$/.test(value) || value.includes('..') || value.endsWith('.lock')) fail('release-selection-id-invalid');
  return value;
}
export function normalizeReleaseTargets(options: ReleaseTargetOptions): ReleaseTargets {
  const raw = options.packages === undefined ? ['buildr'] : typeof options.packages === 'string' ? options.packages.split(',') : [...options.packages];
  if (raw.length < 1 || raw.length > 2 || new Set(raw).size !== raw.length || raw.some(value => value !== 'buildr' && value !== 'dsh-plugin')) fail('release-packages-invalid');
  const packages = (['buildr', 'dsh-plugin'] as ReleasePackage[]).filter(value => raw.includes(value));
  const versions: ReleaseTargets['versions'] = {};
  if (packages.includes('buildr')) versions.buildr = compatibilityVersion(options.version);
  else if (options.version !== undefined) fail('main-version-without-main-target');
  if (packages.includes('dsh-plugin')) versions['dsh-plugin'] = compatibilityVersion(options.pluginVersion);
  else if (options.pluginVersion !== undefined) fail('plugin-version-without-plugin-target');
  if (Object.values(versions).some(value => /[A-Z+]/.test(value))) fail('release-version-not-task-safe');
  // Keep the existing main selection namespace exactly; new targets never share it implicitly.
  const derived = packages.length === 2 ? `buildr-${versions.buildr}_dsh-plugin-${versions['dsh-plugin']}`
    : packages[0] === 'buildr' ? versions.buildr! : `dsh-plugin-${versions['dsh-plugin']}`;
  return { schemaVersion: RELEASE_TARGETS_SCHEMA, packages, versions, selectionId: selectionId(options.selectionId ?? derived) };
}
function normalizedTargets(value: ReleaseTargets): ReleaseTargets {
  if (value.schemaVersion !== RELEASE_TARGETS_SCHEMA) fail('release-targets-schema-invalid');
  return normalizeReleaseTargets({ packages: value.packages, version: value.versions.buildr, pluginVersion: value.versions['dsh-plugin'], selectionId: value.selectionId });
}
function diag(code: string, packageName?: CompatibilityPackageName): CompatibilityDiagnostic { return { code, ...(packageName ? { packageName } : {}) }; }
function observed(value: PublishedPackageObservation | undefined, key: ReleasePackage): PublishedPackageObservation {
  if (!value) return { status: 'unknown', packageName: packageNames[key] };
  if (value.status === 'present') {
    const artifact = parseCompatibilityArtifact(value.artifact);
    if (artifact.origin !== 'registry' || artifact.packageName !== packageNames[key]) fail('published-counterpart-identity-invalid');
    return { status: 'present', artifact };
  }
  if (!['absent', 'unknown'].includes(value.status) || value.packageName !== packageNames[key]) fail('published-counterpart-observation-invalid');
  return { status: value.status, packageName: value.packageName, ...(value.diagnostic ? { diagnostic: value.diagnostic } : {}) };
}
export function evaluateReleasePlan(options: {
  targets: ReleaseTargets; candidates: Partial<Record<ReleasePackage, CompatibilityArtifact>>;
  published: Partial<Record<ReleasePackage, PublishedPackageObservation>>; legacyPairEvidence?: LegacyPairEvidence[];
}): ReleaseCompatibilityPlan {
  const targets = normalizedTargets(options.targets), packages: ReleaseCompatibilityPlan['packages'] = {}, checks: ReleaseCompatibilityPlan['checks'] = [];
  const diagnostics: CompatibilityDiagnostic[] = [], candidates: Partial<Record<ReleasePackage, CompatibilityArtifact>> = {};
  const block = (key: ReleasePackage, value: CompatibilityDiagnostic[]) => {
    packages[key] = { status: 'blocked', diagnostics: [...(packages[key]?.diagnostics ?? []), ...value] }; diagnostics.push(...value);
  };
  for (const key of targets.packages) {
    packages[key] = { status: 'passed', diagnostics: [] };
    try {
      const artifact = parseCompatibilityArtifact(options.candidates[key]);
      if (artifact.origin !== 'candidate' || artifact.packageName !== packageNames[key] || artifact.version !== targets.versions[key]) fail('release-candidate-target-drift');
      if (artifact.compatibility === null) fail('release-candidate-declaration-required');
      candidates[key] = artifact;
    } catch (error) { block(key, [diag(error instanceof Error ? error.message : 'release-candidate-invalid', packageNames[key])]); }
  }
  const observation = (key: ReleasePackage): PublishedPackageObservation => {
    try { return observed(options.published[key], key); }
    catch { return { status: 'unknown', packageName: packageNames[key], diagnostic: 'published-counterpart-identity-invalid' }; }
  };
  const check = (consumer: CompatibilityArtifact, provider: CompatibilityArtifact, stage: ReleaseCompatibilityPlan['checks'][number]['stage']): CompatibilityCheck => {
    let result: CompatibilityCheck;
    try { result = evaluatePackageCompatibility(consumer, provider, { legacyPairEvidence: options.legacyPairEvidence }); }
    catch (error) {
      const identity = ({ packageName, version, integrity, artifactSha256 }: CompatibilityArtifact) => ({ packageName, version, integrity, artifactSha256 });
      const failure = diag(error instanceof Error ? error.message : 'package-compatibility-check-invalid', provider.packageName);
      result = { status: 'blocked', prospective: consumer.origin === 'candidate' || provider.origin === 'candidate', consumer: identity(consumer), provider: identity(provider),
        features: [{ feature: 'entry', required: true, status: 'unknown', diagnostics: [failure] }], diagnostics: [failure] };
    }
    checks.push({ ...result, stage }); return result;
  };
  let publicationOrder: ReleasePackage[] = [];
  if (targets.packages.length === 1) {
    const key = targets.packages[0], own = candidates[key];
    if (own) {
      const other = observation(key === 'buildr' ? 'dsh-plugin' : 'buildr');
      if (key === 'buildr' && other.status === 'absent') diagnostics.push(diag('published-plugin-absent-main-independent', PLUGIN_PACKAGE));
      else if (other.status !== 'present') block(key, [diag(other.status === 'unknown' ? 'published-counterpart-unknown' : 'published-main-absent', key === 'buildr' ? PLUGIN_PACKAGE : MAIN_PACKAGE)]);
      else {
        const result = key === 'buildr' ? check(other.artifact, own, 'independent') : check(own, other.artifact, 'independent');
        if (result.status === 'blocked') block(key, result.diagnostics);
        else { packages[key]!.diagnostics.push(...result.diagnostics); diagnostics.push(...result.diagnostics); }
      }
      if (packages[key]!.status === 'passed') publicationOrder = [key];
    }
  } else if (candidates.buildr && candidates['dsh-plugin']) {
    const main = candidates.buildr, plugin = candidates['dsh-plugin'];
    const combination = check(plugin, main, 'new-pair');
    if (combination.status === 'blocked') block('dsh-plugin', combination.diagnostics);
    else {
      diagnostics.push(...combination.diagnostics);
      const oldPlugin = observation('dsh-plugin'), oldMain = observation('buildr');
      if (oldPlugin.status === 'absent') diagnostics.push(diag('published-plugin-absent-main-independent', PLUGIN_PACKAGE));
      const mainFirst = oldPlugin.status === 'absent' || (oldPlugin.status === 'present' && check(oldPlugin.artifact, main, 'main-first').status === 'passed');
      const pluginFirst = oldMain.status === 'present' && check(plugin, oldMain.artifact, 'plugin-first').status === 'passed';
      if (mainFirst) publicationOrder = ['buildr', 'dsh-plugin'];
      else if (pluginFirst) publicationOrder = ['dsh-plugin', 'buildr'];
      else {
        const reasons = [diag('joint-release-no-safe-intermediate-state')];
        if (oldPlugin.status === 'unknown') reasons.push(diag('published-counterpart-unknown', PLUGIN_PACKAGE));
        if (oldMain.status === 'unknown') reasons.push(diag('published-counterpart-unknown', MAIN_PACKAGE));
        block('buildr', reasons); block('dsh-plugin', reasons);
      }
    }
  }
  return { schemaVersion: 'buildr.release-compatibility-plan/v1', status: targets.packages.every(key => packages[key]?.status === 'passed') && publicationOrder.length === targets.packages.length ? 'passed' : 'blocked',
    targets, publicationOrder, packages, checks, diagnostics };
}
