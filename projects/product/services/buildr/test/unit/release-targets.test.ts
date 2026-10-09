import assert from 'node:assert/strict';
import test from 'node:test';
import { MAIN_PACKAGE, PLUGIN_PACKAGE, parsePackageCompatibility, type CompatibilityArtifact, type PackageCompatibility } from '../../tools/release/package-compatibility.ts';
import { evaluateReleasePlan, normalizeReleaseTargets, type PublishedPackageObservation } from '../../tools/release/release-targets.ts';

import { mainCompatibilityFixture, pluginCompatibilityFixture } from '../helpers/package-compatibility-fixtures.ts';

const mainContracts = parsePackageCompatibility(mainCompatibilityFixture);
const pluginContracts = parsePackageCompatibility(pluginCompatibilityFixture);
function artifact(name: typeof MAIN_PACKAGE | typeof PLUGIN_PACKAGE, version: string, origin: 'registry' | 'candidate', compatibility: PackageCompatibility | null = name === MAIN_PACKAGE ? mainContracts : pluginContracts): CompatibilityArtifact {
  return { packageName: name, version, origin, compatibility, integrity: 'sha512-' + Buffer.alloc(64, name === MAIN_PACKAGE ? 1 : 2).toString('base64'), artifactSha256: (name === MAIN_PACKAGE ? '1' : '2').repeat(64),
    ...(origin === 'candidate' ? { sourceCommit: 'a'.repeat(40) } : {}) };
}
const present = (value: CompatibilityArtifact): PublishedPackageObservation => ({ status: 'present', artifact: value });
const absent = (packageName: typeof MAIN_PACKAGE | typeof PLUGIN_PACKAGE): PublishedPackageObservation => ({ status: 'absent', packageName });
const main = artifact(MAIN_PACKAGE, '0.1.0-rc.40', 'candidate');
const plugin = artifact(PLUGIN_PACKAGE, '0.1.0-rc.2', 'candidate');
const targets = normalizeReleaseTargets({ packages: 'buildr,dsh-plugin', version: main.version, pluginVersion: plugin.version });
function joint(published: Parameters<typeof evaluateReleasePlan>[0]['published'], newPlugin = plugin) {
  return evaluateReleasePlan({ targets, candidates: { buildr: main, 'dsh-plugin': newPlugin }, published });
}
test('three targets use independent versions and namespaces, preserving the legacy main selection identity', () => {
  const version = '0.1.0-rc.38';
  const m = normalizeReleaseTargets({ version }), p = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: version });
  const both = normalizeReleaseTargets({ packages: 'dsh-plugin,buildr', version, pluginVersion: version });
  assert.equal(m.selectionId, version); assert.equal(p.selectionId, 'dsh-plugin-' + version);
  assert.equal(new Set([m.selectionId, p.selectionId, both.selectionId]).size, 3);
  assert.deepEqual(both.packages, ['buildr', 'dsh-plugin']);
  assert.deepEqual(targets.versions, { buildr: '0.1.0-rc.40', 'dsh-plugin': '0.1.0-rc.2' });
});
test('invalid selection IDs and versions targeting the wrong package are rejected', () => {
  for (const selectionId of ['../main', 'unsafe/name', 'bad..id', 'bad.lock', 'bad\n', 'Upper', 'bad+id', 'bad-']) assert.throws(() => normalizeReleaseTargets({ version: main.version, selectionId }), /selection-id-invalid/);
  assert.throws(() => normalizeReleaseTargets({ version: '0.1.0-rc.38+metadata' }), /version-not-task-safe/);
  assert.throws(() => normalizeReleaseTargets({ packages: 'dsh-plugin', version: main.version, pluginVersion: plugin.version }), /main-version-without-main/);
  assert.throws(() => normalizeReleaseTargets({ version: main.version, pluginVersion: plugin.version }), /plugin-version-without-plugin/);
  assert.throws(() => normalizeReleaseTargets({ packages: 'buildr,buildr', version: main.version }), /packages-invalid/);
  assert.throws(() => normalizeReleaseTargets({ packages: 'buildr,dsh-plugin', version: main.version }), /version-invalid/);
});
test('main alone checks the public plugin and explicitly allows proven absence without inventing existence', () => {
  const only = normalizeReleaseTargets({ version: main.version });
  const result = evaluateReleasePlan({ targets: only, candidates: { buildr: main }, published: { 'dsh-plugin': absent(PLUGIN_PACKAGE) } });
  assert.equal(result.status, 'passed'); assert.deepEqual(result.publicationOrder, ['buildr']); assert.deepEqual(result.checks, []);
  assert.ok(result.diagnostics.some(item => item.code === 'published-plugin-absent-main-independent'));
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { buildr: main }, published: {} }).status, 'blocked');
  const oldPlugin = artifact(PLUGIN_PACKAGE, '0.1.0-rc.1', 'registry');
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { buildr: main }, published: { 'dsh-plugin': present(oldPlugin) } }).status, 'passed');
});
test('plugin alone needs the actual published main, never its same-version source candidate', () => {
  const only = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: plugin.version });
  const registry = artifact(MAIN_PACKAGE, '0.1.0-rc.38', 'registry');
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { 'dsh-plugin': plugin }, published: { buildr: present(registry) } }).status, 'passed');
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { 'dsh-plugin': plugin }, published: { buildr: present({ ...registry, origin: 'candidate', sourceCommit: 'a'.repeat(40) }) } }).status, 'blocked');
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { 'dsh-plugin': plugin }, published: { buildr: absent(MAIN_PACKAGE) } }).status, 'blocked');
  assert.equal(evaluateReleasePlan({ targets: only, candidates: { 'dsh-plugin': plugin }, published: { buildr: present({ ...registry, compatibility: null }) } }).status, 'blocked');
});
test('joint chooses main first when old/new and new/new combinations are safe', () => {
  const result = joint({ buildr: present(artifact(MAIN_PACKAGE, '0.1.0-rc.38', 'registry')), 'dsh-plugin': present(artifact(PLUGIN_PACKAGE, '0.1.0-rc.1', 'registry')) });
  assert.equal(result.status, 'passed'); assert.deepEqual(result.publicationOrder, ['buildr', 'dsh-plugin']);
  assert.ok(result.checks.find(item => item.stage === 'new-pair')?.prospective);
  assert.ok(result.checks.some(item => item.stage === 'main-first' && item.status === 'passed'));
});
test('joint chooses plugin first when old plugin rejects new main but new plugin supports old main', () => {
  const old = structuredClone(pluginContracts); old.requires[0].versions.maxExclusive = main.version;
  const result = joint({ buildr: present(artifact(MAIN_PACKAGE, '0.1.0-rc.38', 'registry')), 'dsh-plugin': present(artifact(PLUGIN_PACKAGE, '0.1.0-rc.1', 'registry', old)) });
  assert.equal(result.status, 'passed'); assert.deepEqual(result.publicationOrder, ['dsh-plugin', 'buildr']);
});
test('new/new compatibility cannot authorize either order when both intermediate states fail', () => {
  const old = structuredClone(pluginContracts); old.requires[0].versions.maxExclusive = main.version;
  const future = structuredClone(pluginContracts); future.requires[0].versions.minInclusive = main.version;
  const result = joint({ buildr: present(artifact(MAIN_PACKAGE, '0.1.0-rc.38', 'registry')), 'dsh-plugin': present(artifact(PLUGIN_PACKAGE, '0.1.0-rc.1', 'registry', old)) }, { ...plugin, compatibility: future });
  assert.equal(result.checks.find(item => item.stage === 'new-pair')?.status, 'passed');
  assert.equal(result.status, 'blocked'); assert.deepEqual(result.publicationOrder, []);
  assert.ok(result.diagnostics.some(item => item.code === 'joint-release-no-safe-intermediate-state'));
});
test('absence and unknown remain distinct; a genuinely safe alternative order is allowed', () => {
  const noPlugin = joint({ buildr: { status: 'unknown', packageName: MAIN_PACKAGE }, 'dsh-plugin': absent(PLUGIN_PACKAGE) });
  assert.equal(noPlugin.status, 'passed'); assert.deepEqual(noPlugin.publicationOrder, ['buildr', 'dsh-plugin']);
  assert.equal(joint({}).status, 'blocked');
  const unknownOldPlugin = joint({ buildr: present(artifact(MAIN_PACKAGE, '0.1.0-rc.38', 'registry')), 'dsh-plugin': { status: 'unknown', packageName: PLUGIN_PACKAGE } });
  assert.equal(unknownOldPlugin.status, 'passed'); assert.deepEqual(unknownOldPlugin.publicationOrder, ['dsh-plugin', 'buildr']);
});
test('candidate target drift blocks only that candidate and cannot produce a publication order', () => {
  const result = evaluateReleasePlan({ targets, candidates: { buildr: { ...main, version: '0.1.0-rc.41' }, 'dsh-plugin': plugin }, published: {} });
  assert.equal(result.status, 'blocked'); assert.equal(result.packages.buildr?.status, 'blocked'); assert.equal(result.packages['dsh-plugin']?.status, 'passed');
  assert.deepEqual(result.publicationOrder, []); assert.ok(result.diagnostics.some(item => item.code === 'release-candidate-target-drift'));
});
test('invalid legacy proof produces a local blocked check instead of aborting unrelated candidate preparation', () => {
  const result = evaluateReleasePlan({ targets, candidates: { buildr: main, 'dsh-plugin': plugin }, published: {}, legacyPairEvidence: [true as any] });
  assert.equal(result.status, 'blocked'); assert.equal(result.packages.buildr?.status, 'passed'); assert.equal(result.packages['dsh-plugin']?.status, 'blocked');
  assert.deepEqual(result.publicationOrder, []); assert.ok(result.diagnostics.some(item => item.code === 'package-compatibility-object-required'));
});
