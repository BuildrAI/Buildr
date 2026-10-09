import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIN_PACKAGE, PLUGIN_PACKAGE, compareCompatibilityVersions, compatibilityVersion, evaluatePackageCompatibility,
  parseCompatibilityArtifact, parsePackageCompatibility, satisfiesVersionEndpoints,
  type CompatibilityArtifact, type LegacyPairEvidence, type PackageCompatibility,
} from '../../tools/release/package-compatibility.ts';

import { mainCompatibilityFixture, pluginCompatibilityFixture } from '../helpers/package-compatibility-fixtures.ts';

const mainContracts = parsePackageCompatibility(mainCompatibilityFixture);
const pluginContracts = parsePackageCompatibility(pluginCompatibilityFixture);
const sri = (byte: number) => 'sha512-' + Buffer.alloc(64, byte).toString('base64');
function artifact(name: typeof MAIN_PACKAGE | typeof PLUGIN_PACKAGE, origin: 'registry' | 'candidate', compatibility: PackageCompatibility | null): CompatibilityArtifact {
  return { origin, packageName: name, version: name === MAIN_PACKAGE ? '0.1.0-rc.38' : '0.1.0-rc.1', integrity: sri(name === MAIN_PACKAGE ? 1 : 2), artifactSha256: (name === MAIN_PACKAGE ? '1' : '2').repeat(64), compatibility,
    ...(origin === 'candidate' ? { sourceCommit: 'a'.repeat(40) } : {}) };
}
function pair(consumer: CompatibilityArtifact, provider: CompatibilityArtifact): LegacyPairEvidence {
  return { schemaVersion: 'buildr.package-pair-evidence/v1', consumer, provider, evidenceSha256: '3'.repeat(64), features: [{ feature: 'entry', required: true, status: 'passed' }, { feature: 'sourceCapture', required: false, status: 'unsupported' }] };
}
test('strict SemVer identities reject coercion, whitespace, leading v/zeros and unsafe core numbers', () => {
  for (const value of ['v0.1.0', ' 0.1.0', '0.1.00', '0.1.0-rc.01', '9007199254740992.0.0', '0.1', 1, undefined]) assert.throws(() => compatibilityVersion(value), /version-invalid/);
  assert.equal(compatibilityVersion('0.1.0-rc.38+frozen'), '0.1.0-rc.38+frozen');
});
test('endpoint comparisons preserve SemVer prerelease ASCII/numeric order and ignore build metadata priority', () => {
  assert.equal(compareCompatibilityVersions('0.1.0-B', '0.1.0-a'), -1);
  assert.equal(compareCompatibilityVersions('0.1.0-9007199254740992', '0.1.0-9007199254740993'), -1);
  assert.equal(compareCompatibilityVersions('0.1.0-rc.9', '0.1.0-rc.10'), -1);
  assert.equal(compareCompatibilityVersions('0.1.0-rc.38+one', '0.1.0-rc.38+two'), 0);
  const bounds = { minInclusive: '0.1.0-rc.38', maxExclusive: '0.2.0-0', includePrerelease: true };
  assert.equal(satisfiesVersionEndpoints('0.1.0-rc.38', bounds), true);
  assert.equal(satisfiesVersionEndpoints('0.1.0-rc.37', bounds), false);
  assert.equal(satisfiesVersionEndpoints('0.2.0-rc.1', bounds), false);
  assert.equal(satisfiesVersionEndpoints('0.1.0-rc.38', { ...bounds, includePrerelease: false }), false);
  assert.equal(satisfiesVersionEndpoints('0.1.0', { ...bounds, includePrerelease: false }), true);
});
test('malformed endpoint policies and duplicate public claims fail closed', () => {
  const changed = structuredClone(pluginContracts); changed.requires[0].versions.maxExclusive = changed.requires[0].versions.minInclusive;
  assert.throws(() => parsePackageCompatibility(changed), /endpoints-invalid/);
  assert.throws(() => parsePackageCompatibility({ ...mainContracts, provides: [mainContracts.provides[0], mainContracts.provides[0]] }), /contract-duplicate/);
});
test('new/new combinations are prospective; both required and file-source optional capabilities are independently reported', () => {
  const consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts), provider = artifact(MAIN_PACKAGE, 'candidate', mainContracts);
  const result = evaluatePackageCompatibility(consumer, provider);
  assert.equal(result.status, 'passed'); assert.equal(result.prospective, true);
  assert.deepEqual(result.features.map(item => [item.feature, item.status]), [['entry', 'supported'], ['sourceCapture', 'supported']]);
});
test('public rc38 with no declaration is not upgraded by same-version candidate metadata', () => {
  const consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts);
  const currentSource = artifact(MAIN_PACKAGE, 'candidate', mainContracts), originalPublic = artifact(MAIN_PACKAGE, 'registry', null);
  assert.equal(evaluatePackageCompatibility(consumer, currentSource).status, 'passed');
  assert.equal(evaluatePackageCompatibility(consumer, originalPublic).status, 'blocked');
  assert.equal(evaluatePackageCompatibility(consumer, originalPublic).features.find(item => item.feature === 'entry')?.status, 'unknown');
});
test('same-public-artifact contract proof confirms entry only and leaves optional file source unavailable', () => {
  const provider = artifact(MAIN_PACKAGE, 'registry', null), consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts);
  provider.verifiedContracts = { ...provider, schemaVersion: 'buildr.package-contract-proof/v1', evidenceSha256: '4'.repeat(64), contracts: ['buildr.installation-status/v1', 'buildr.web-protocol/v1'] };
  const result = evaluatePackageCompatibility(consumer, provider);
  assert.equal(result.status, 'passed'); assert.equal(result.features.find(item => item.feature === 'sourceCapture')?.status, 'unsupported');
  assert.equal(result.features.find(item => item.feature === 'entry')?.status, 'supported');
  assert.throws(() => parseCompatibilityArtifact({ ...provider, artifactSha256: '9'.repeat(64) }), /legacy-proof-drift/);
  assert.throws(() => parseCompatibilityArtifact({ ...provider, integrity: sri(9) }), /legacy-proof-drift/);
});
test('exact pair consumption can replace legacy provider or consumer declarations, but cannot migrate proof across bytes', () => {
  const consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts), provider = artifact(MAIN_PACKAGE, 'registry', null);
  const evidence = pair(consumer, provider);
  assert.equal(evaluatePackageCompatibility(consumer, provider, { legacyPairEvidence: [evidence] }).status, 'passed');
  assert.equal(evaluatePackageCompatibility(consumer, { ...provider, integrity: sri(7) }, { legacyPairEvidence: [evidence] }).status, 'blocked');
  const oldPlugin = artifact(PLUGIN_PACKAGE, 'registry', null), newMain = artifact(MAIN_PACKAGE, 'candidate', mainContracts);
  assert.equal(evaluatePackageCompatibility(oldPlugin, newMain).status, 'blocked');
  assert.equal(evaluatePackageCompatibility(oldPlugin, newMain, { legacyPairEvidence: [pair(oldPlugin, newMain)] }).status, 'passed');
});
test('optional absence stays local; failed/unknown actual calls never become absence', () => {
  const consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts), provider = artifact(MAIN_PACKAGE, 'registry', { ...mainContracts, provides: ['buildr.installation-status/v1', 'buildr.web-protocol/v1'] });
  assert.equal(evaluatePackageCompatibility(consumer, provider).status, 'passed');
  for (const status of ['failed', 'unknown'] as const) {
    const evidence = pair(consumer, provider); evidence.features[1].status = status;
    const result = evaluatePackageCompatibility(consumer, provider, { legacyPairEvidence: [evidence] });
    assert.equal(result.status, 'blocked'); assert.equal(result.features[1].status, status);
  }
  const missingEntry = { ...provider, compatibility: { ...mainContracts, provides: ['buildr.web-protocol/v1'] } };
  assert.equal(evaluatePackageCompatibility(consumer, missingEntry).status, 'blocked');
});
test('legacy pass cannot replace an explicit new declaration omission or an unsupported required version', () => {
  const consumer = artifact(PLUGIN_PACKAGE, 'candidate', pluginContracts), provider = artifact(MAIN_PACKAGE, 'registry', { ...mainContracts, provides: [] });
  assert.equal(evaluatePackageCompatibility(consumer, provider, { legacyPairEvidence: [pair(consumer, provider)] }).status, 'blocked');
  const legacy = { ...provider, compatibility: null, version: '0.1.0-rc.37' };
  assert.equal(evaluatePackageCompatibility(consumer, legacy, { legacyPairEvidence: [pair(consumer, legacy)] }).status, 'blocked');
});
test('candidate/published evidence needs byte identity and source; main cannot acquire a mandatory plugin dependency', () => {
  const candidate = artifact(MAIN_PACKAGE, 'candidate', mainContracts);
  assert.throws(() => parseCompatibilityArtifact({ ...candidate, sourceCommit: undefined }), /candidate-source-required/);
  assert.throws(() => parseCompatibilityArtifact({ ...candidate, integrity: 'sha512-ZmFrZQ==' }), /artifact-digest-invalid/);
  assert.throws(() => parseCompatibilityArtifact({ ...candidate, compatibility: { ...mainContracts, requires: [{ ...pluginContracts.requires[0], packageName: PLUGIN_PACKAGE }] } }), /main-package-must-run-without-plugin/);
});
