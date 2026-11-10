import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { localPackagePlatform, validatePackageHandoff, isCandidateVerificationWorkflow, assertPublishedPackageData, LOCAL_PACKAGE_MODEL } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { localPackageVerificationScope } from '../../../../../../skills/buildr-release/scripts/local-package-preparation.ts';
import { assertReleaseConsumptionCoverage, RELEASE_CHECKS } from '../../test/verification/release/release-consumption-contract.ts';
import { createLocalArtifactPlan } from '../verification/artifact.ts';
import { selectLocalPackageShards, planCandidateSourceReuse } from '../verification/candidate-source-reuse.ts';
import { CANDIDATE_CI_SHARDS, verificationSteps } from '../verification/registry.ts';
import { LOCAL_PLATFORM_POLICY } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { localPackageCoverage } from '../verification/local-package-coverage.ts';
import { packageSmokePlan, assertPackageSmokeHealth } from '../verification/release/package-smoke.ts';

const sign = (body: any) => ({ ...body, identity: `sha256-${createHash('sha256').update(JSON.stringify(body)).digest('hex')}` });
const handoff = () => sign({
  schemaVersion: 'buildr.local-package-handoff/v1', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
  localRunner: 'macos', remoteRunner: 'windows', artifactSha256: 'c'.repeat(64), verificationScope: null, plugin: null,
  files: ['candidate-package/package.tgz', 'candidate-package/release-artifact.json', 'candidate-package/npm-pack.json', 'source-verification.json', 'artifact-verification.json'].map(path => ({
    path, size: 1, sha256: path.endsWith('.tgz') ? 'c'.repeat(64) : 'd'.repeat(64), chunks: [{ name: `chunks/${'e'.repeat(64)}`, size: 1, sha256: 'e'.repeat(64) }],
  })),
});

test('local package platform selection is symmetric and does not invent Linux coverage', () => {
  assert.deepEqual(localPackagePlatform('darwin'), { local: 'macos', remote: 'windows', runner: 'windows-2025' });
  assert.deepEqual(localPackagePlatform('win32'), { local: 'windows', remote: 'macos', runner: 'macos-15' });
  assert.throws(() => localPackagePlatform('linux'), /supports macOS and Windows/);
});

test('complete local source proofs leave no remote source suite on either system', () => {
  for (const local of ['macos', 'windows']) {
    const shards = selectLocalPackageShards(CANDIDATE_CI_SHARDS, verificationSteps, local);
    const source = shards.filter(shard => !shard.requiresArtifact);
    assert.ok(source.length > 0);
    assert.ok(!shards.some(shard => shard.producesArtifact));
    assert.ok(!source.some(shard => shard.id === `platform-boundaries-${local === 'macos' ? 'windows' : 'macos'}`));
    const records = source.flatMap(shard => shard.stepIds.map((stepId: string) => ({
      schemaVersion: 'buildr.verification-source-result/v1', identity: { key: `sha256-${'f'.repeat(64)}`, stepId },
    })));
    const plan = planCandidateSourceReuse(shards, { schemaVersion: 'buildr.verification-source-bundle/v1', records }, () => true);
    assert.deepEqual(plan.sourceShards, []);
    const absent = planCandidateSourceReuse(shards, { schemaVersion: 'buildr.verification-source-bundle/v1', records: [] }, () => false);
    assert.ok(absent.sourceShards.length > 0, 'missing local source proofs cannot be declared complete');
    const remote = local === 'macos' ? 'win32' : 'darwin';
    assert.deepEqual(createLocalArtifactPlan(remote, { scope: 'platform' }).nodes.map((node: any) => node.id),
      [`runtime-${local === 'macos' ? 'windows' : 'macos'}`, `host-minimum-${local === 'macos' ? 'windows' : 'macos'}`]);
  }
});

test('frozen verification scope reaches local artifact and minimum Node selection', () => {
  const scope = localPackageVerificationScope({ excludedBoundaries: ['E2E', 'Static', 'Integration', 'Unit'], scopeStatement: '本轮不执行验证' });
  assert.equal(createLocalArtifactPlan('darwin', { verificationScope: scope }).nodes.length, 0);
  assert.equal(createLocalArtifactPlan('win32', { verificationScope: scope }).nodes.length, 0);
  assert.equal(localPackageVerificationScope({}, scope), scope);
  assert.throws(() => localPackageVerificationScope({ excludedBoundaries: ['E2E'], scopeStatement: '另一个范围' }, scope), /scope is frozen/);
});

test('handoff only accepts exact data identities and cannot silently change platform or scope', () => {
  const value = handoff();
  assert.equal(validatePackageHandoff(value), value);
  assert.throws(() => validatePackageHandoff({ ...value, localRunner: 'windows' }), /identity/);
  const { identity: _, ...body } = value;
  assert.throws(() => validatePackageHandoff(sign({ ...body, remoteRunner: 'macos' })), /identity/);
  assert.throws(() => validatePackageHandoff(sign({ ...body, files: [...body.files, body.files[0]] })), /duplicate/);
  assert.throws(() => validatePackageHandoff(sign({ ...body, files: [{ ...body.files[0], path: '../outside' }, ...body.files.slice(1)] })), /file/);
  for (const statement of [`npm_${'a'.repeat(24)}`, `ghp_${'b'.repeat(30)}`, 'Bearer private-secret-value']) {
    assert.throws(() => validatePackageHandoff(sign({ ...body, verificationScope: { statement } })), /credentials/);
  }
});

test('publication consumes the frozen local original instead of requiring a hosted producer', () => {
  const value = handoff();
  const artifact = { sourceCommit: value.sourceCommit, filename: 'package.tgz', size: 1, sha256: value.artifactSha256,
    integrity: 'sha512-YQ==', applicationPayloadDigest: `sha256-${'f'.repeat(64)}` };
  const aggregate = { executionModel: LOCAL_PACKAGE_MODEL, status: 'passed', sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree, packageHandoff: value, artifact,
    evidenceIds: [...new Set(RELEASE_CHECKS.flatMap(check => 'evidence' in check ? [...check.evidence] : []))] };
  assert.doesNotThrow(() => assertReleaseConsumptionCoverage(aggregate, value, artifact));
  assert.throws(() => assertReleaseConsumptionCoverage(aggregate, value, { ...artifact, sha256: '1'.repeat(64) }), /frozen contract/);
  assert.throws(() => assertReleaseConsumptionCoverage({ ...aggregate, declaredScope: { identity: 'changed' } }, value, artifact), /frozen contract/);
  assert.throws(() => assertReleaseConsumptionCoverage({ ...aggregate, evidenceIds: [] }, value, artifact), /missing release check/);
});

test('candidate consumers accept both controlled models but not arbitrary workflows', () => {
  assert.equal(isCandidateVerificationWorkflow('.github/workflows/verify.yml'), true);
  assert.equal(isCandidateVerificationWorkflow('.github/workflows/verify-package.yml'), true);
  assert.equal(isCandidateVerificationWorkflow('.github/workflows/untrusted.yml'), false);
});

test('temporary data is deletable only when the exact source and npm bytes are preserved', () => {
  const value = handoff();
  assert.doesNotThrow(() => assertPublishedPackageData(value, value.sourceCommit, value.artifactSha256));
  assert.throws(() => assertPublishedPackageData(value, '0'.repeat(40), value.artifactSha256), /preserved/);
  assert.throws(() => assertPublishedPackageData(value, value.sourceCommit, '0'.repeat(64)), /preserved/);
});

test('new frozen platform policy makes only the opposite system optional, never local or common coverage', () => {
  const original = handoff();
  const { identity: _, ...body } = original;
  const value = sign({ ...body, platformPolicy: LOCAL_PLATFORM_POLICY });
  const hosts = [{ id: 'host-minimum-macos', runner: 'macos' }, { id: 'host-minimum-windows', runner: 'windows' }];
  const selected = selectLocalPackageShards(CANDIDATE_CI_SHARDS, verificationSteps, 'macos');
  const coverage = localPackageCoverage(value, selected, hosts);
  assert.deepEqual(coverage.platformVerification.optionalEvidenceIds, ['host-minimum-windows', 'runtime-windows']);
  assert.equal(coverage.platformVerification.status, 'not-verified');
  assert.ok(coverage.shards.some((item: any) => item.id === 'runtime-macos'));
  assert.ok(!coverage.shards.some((item: any) => item.id === 'runtime-windows'));
  assert.ok(coverage.shards.some((item: any) => item.platformScope.kind === 'common'));
  assert.deepEqual(coverage.hostNodeTuples, [hosts[0]]);
  assert.deepEqual(localPackageCoverage(original, selected, hosts).hostNodeTuples, hosts, 'old candidates remain strict');
  assert.throws(() => localPackageCoverage({ ...value, platformPolicy: undefined }, [], []), /identity/);
  assert.throws(() => validatePackageHandoff(sign({ ...body, platformPolicy: 'ignore-all-failures' })), /identity/);
  const windows = sign({ ...body, localRunner: 'windows', remoteRunner: 'macos', platformPolicy: LOCAL_PLATFORM_POLICY });
  assert.deepEqual(localPackageCoverage(windows, [], hosts).platformVerification.optionalEvidenceIds, ['host-minimum-macos', 'runtime-macos']);
});

test('publication consumes new policy but refuses forged optional coverage and missing local evidence', () => {
  const { identity: _, ...body } = handoff();
  const value = sign({ ...body, platformPolicy: LOCAL_PLATFORM_POLICY });
  const platformVerification = localPackageCoverage(value, [], []).platformVerification;
  const artifact = { sourceCommit: value.sourceCommit, filename: 'package.tgz', size: 1, sha256: value.artifactSha256,
    integrity: 'sha512-YQ==', applicationPayloadDigest: `sha256-${'f'.repeat(64)}` };
  const aggregate = { executionModel: LOCAL_PACKAGE_MODEL, status: 'passed', sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree, packageHandoff: value, artifact, platformVerification,
    evidenceIds: [...new Set(RELEASE_CHECKS.flatMap(check => 'evidence' in check ? [...check.evidence] : []))]
      .filter(id => !platformVerification.optionalEvidenceIds.includes(id)) };
  assert.doesNotThrow(() => assertReleaseConsumptionCoverage(aggregate, value, artifact));
  assert.throws(() => assertReleaseConsumptionCoverage({ ...aggregate, platformVerification: { ...platformVerification, status: 'passed' } }, value, artifact), /frozen local package policy/);
  assert.throws(() => assertReleaseConsumptionCoverage({ ...aggregate, evidenceIds: aggregate.evidenceIds.filter(id => id !== 'runtime-macos') }, value, artifact), /missing release check/);
  assert.throws(() => assertReleaseConsumptionCoverage({ ...aggregate, status: 'failed' }, value, artifact), /passed Candidate/);
});

test('independent smoke has one install and one Web, cannot accept the wrong runtime or package identity', () => {
  assert.deepEqual(packageSmokePlan(), ['original-bytes', 'install', 'cli-help', 'cli-identity', 'web-health', 'owned-process-cleanup']);
  const expected = { pid: 123, payloadDigest: 'frozen', installationIdentity: 'owned' };
  const health = { schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: 123, productIdentity: {
    channel: 'npm', applicationPayloadDigest: 'frozen', installationIdentity: 'owned', runtime: { role: 'host', version: '24.15.0' },
  } };
  assert.doesNotThrow(() => assertPackageSmokeHealth(health, expected));
  for (const changed of [{ pid: 124 }, { status: 'starting' }, { productIdentity: { ...health.productIdentity, runtime: { role: 'host', version: '24.21.0' } } }]) {
    assert.throws(() => assertPackageSmokeHealth({ ...health, ...changed }, expected));
  }
});
