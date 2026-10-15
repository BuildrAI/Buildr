import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import { artifactFromTarball } from '../../../buildr/tools/release/package-artifact-observation.ts';
import type { CompatibilityArtifact, PackageCompatibility } from '../../../buildr/tools/release/package-compatibility.ts';
import { createReleaseCandidate, PLUGIN_PACKAGE, readReleaseCandidate, type SourceSdkIdentity } from '../../tools/release-candidate.ts';
import { archiveTreeIdentity } from '../../tools/verify-all.ts';
import { identity, type PairReport } from '../../tools/verify-buildr-plugin-pair.ts';
import { PLUGIN_PUBLISH_AUTHORITY, publishPluginCandidate, verifyPluginPublishCompatibility, type PublishDependencies } from '../../tools/trusted-publish.ts';

const version = '0.1.0-rc.1', sourceCommit = 'a'.repeat(40), sourceTree = 'b'.repeat(40), workflowSha256 = 'c'.repeat(64);
const now = Date.parse('2026-10-09T12:00:00Z');
const baseContracts = ['buildr.installation-status/v1', 'buildr.web-protocol/v1'];
const compatibility: PackageCompatibility = { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [
  { packageName: '@buildr-ai/buildr', feature: 'entry', required: true, versions: { minInclusive: '0.1.0-rc.38', maxExclusive: '0.2.0-0', includePrerelease: true }, contracts: baseContracts },
  { packageName: '@buildr-ai/buildr', feature: 'sourceCapture', required: false, versions: { minInclusive: '0.1.0-rc.38', maxExclusive: '0.2.0-0', includePrerelease: true }, contracts: ['buildr.agent-asset-source-result/v1'] },
] };
const sourceSdk: SourceSdkIdentity = { baseline: { tag: 'dsh-v0.2.0-rc.2', commit: '639ed015397290b3745d163aafe02ffee4aa3f84', version: '0.2.0-rc.2' }, manifestSha256: 'd'.repeat(64), patchSha256: 'e'.repeat(64), contracts: { rawEventRefs: true } };
const digest = (bytes: Buffer, algorithm = 'sha256', encoding: 'hex' | 'base64' = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
function archive(metadata: Record<string, unknown>): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, content] of [['package/package.json', JSON.stringify(metadata)], ['package/lib/index.js', 'export const fixture = true;\n']]) {
    const header = Buffer.alloc(512), body = Buffer.from(content);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
function peer(peerVersion = '0.1.0-rc.38', declared = true, origin: 'registry' | 'candidate' = 'registry') {
  const bytes = archive({ name: '@buildr-ai/buildr', version: peerVersion, private: false,
    ...(declared ? { buildrCompatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: baseContracts, requires: [] } } : {}) });
  const artifact = artifactFromTarball(bytes, { origin, packageName: '@buildr-ai/buildr', version: peerVersion, integrity: `sha512-${digest(bytes, 'sha512', 'base64')}`, ...(origin === 'candidate' ? { sourceCommit: 'f'.repeat(40) } : {}) });
  return { bytes, artifact };
}
function pair(consumerArtifact: CompatibilityArtifact, providerArtifact: CompatibilityArtifact, optional: 'unsupported' | 'failed' | 'unknown' = 'unsupported'): PairReport {
  const consumer = identity(consumerArtifact), provider = identity(providerArtifact);
  const features = [{ feature: 'entry', required: true, status: 'passed' as const }, { feature: 'sourceCapture', required: false, status: optional }];
  const contracts = baseContracts, diagnostic = null;
  const evidenceSha256 = digest(Buffer.from(JSON.stringify({ consumer, provider, features, contracts, diagnostic })));
  return { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: optional === 'unsupported' ? 'passed' : 'blocked', consumer, provider, features, contracts, diagnostic, evidenceSha256,
    legacyPairEvidence: { schemaVersion: 'buildr.package-pair-evidence/v1', consumer, provider, features, evidenceSha256 },
    ...(providerArtifact.compatibility === null ? { providerContracts: { schemaVersion: 'buildr.package-contract-proof/v1', ...provider, contracts, evidenceSha256 } } : {}) };
}
function fixture(t: TestContext, origin: 'registry' | 'candidate' = 'registry') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'buildr-publish-compatibility-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bytes = archive({ name: PLUGIN_PACKAGE, version, private: false, repository: 'git+https://github.com/BuildrAI/Buildr.git', buildrCompatibility: compatibility,
    buildrDshSourceSdk: { upstream: sourceSdk.baseline, sourceManifestSha256: sourceSdk.manifestSha256, sourcePatchSha256: sourceSdk.patchSha256, compiledContracts: sourceSdk.contracts } });
  const manifest = createReleaseCandidate({ version, sourceCommit, sourceTree, filename: 'plugin.tgz', bytes, sourceSdk, fileCount: 2 });
  const manifestPath = join(root, 'candidate.json'); writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(join(root, manifest.filename), bytes);
  const candidate = readReleaseCandidate(manifestPath);
  const consumer = { ...artifactFromTarball(bytes, { origin: 'candidate', packageName: PLUGIN_PACKAGE, version, integrity: manifest.integrity, sourceCommit }), sourceTree };
  const originalPeer = peer('0.1.0-rc.38', true, origin), verifiedContentSha256 = '1'.repeat(64);
  const report = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', candidateBound: true, sourceCommit, sourceTree, consumer, consumerTreeSha256: archiveTreeIdentity(bytes), peer: originalPeer.artifact,
    pair: pair(consumer, originalPeer.artifact), sourceSdk, checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false,
    verificationSource: { observedCommit: sourceCommit, dirty: false, contentSha256: verifiedContentSha256 }, sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: sourceCommit, testedWorkingTreeDirty: false, verifiedContentSha256, candidateSourceCommit: sourceCommit, candidateSourceTree: sourceTree } };
  const verificationPath = join(root, 'plugin-full-verification.json'); writeFileSync(verificationPath, JSON.stringify(report));
  return { root, manifestPath, manifest, candidate, verificationPath, report };
}
function dependencies(overrides: Partial<PublishDependencies> = {}): PublishDependencies {
  return { env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'BuildrAI/Buildr', GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sourceCommit, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }, now: () => now,
    source: () => ({ sourceCommit, sourceTree, version, workflowSha256, sourceSdk }), authority: async () => ({ status: 'ready', expected: PLUGIN_PUBLISH_AUTHORITY, workflowSha256, npm: { package: PLUGIN_PACKAGE, tokenType: 'oidc', created: new Date(now - 1000).toISOString(), expires: new Date(now + 3600_000).toISOString() } }), registryWait: { attempts: 1, delayMs: 0 }, ...overrides };
}
const options = (f: ReturnType<typeof fixture>) => ({ manifestPath: f.manifestPath, verificationPath: f.verificationPath, version, sourceCommit, output: join(f.root, 'publication.json') });

test('declared candidate requires original prepare evidence before any new npm write', async t => {
  const f = fixture(t); let writes = 0, observations = 0;
  const result = await publishPluginCandidate({ ...options(f), verificationPath: undefined }, dependencies({ registry: async () => ({ published: false }), publish: async () => { writes++; return { status: 0 }; }, observePeer: async () => { observations++; throw new Error('unreachable'); } }));
  assert.equal(result.status, 'blocked'); assert.equal(result.attempted, false); assert.equal(result.code, 'plugin-prepare-verification-required');
  assert.equal(writes, 0); assert.equal(observations, 0);
});
test('original final bytes, SDK, frozen peer, source binding and pair digest cannot be replaced', async t => {
  const f = fixture(t); let observations = 0;
  for (const changed of [
    { consumer: { ...f.report.consumer, artifactSha256: '2'.repeat(64) } },
    { sourceSdk: { ...sourceSdk, contracts: {} } },
    { peer: peer('0.1.0-rc.39').artifact },
    { sourceBinding: { ...f.report.sourceBinding, candidateSourceTree: '2'.repeat(40) } },
    { pair: { ...f.report.pair, evidenceSha256: '2'.repeat(64) } },
  ]) {
    writeFileSync(f.verificationPath, JSON.stringify({ ...f.report, ...changed }));
    await assert.rejects(verifyPluginPublishCompatibility({ candidate: f.candidate, verificationPath: f.verificationPath }, { observePeer: async () => { observations++; throw new Error('unreachable'); } }), /plugin-prepare-verification-invalid/);
  }
  assert.equal(observations, 0);
});
test('post-approval current public bytes are consumed before write while original proof stays unchanged', async t => {
  for (const origin of ['registry', 'candidate'] as const) {
    const f = fixture(t, origin), current = peer('0.1.0-rc.39'), original = readFileSync(f.verificationPath, 'utf8'), events: string[] = [];
    let published = false;
    const result = await publishPluginCandidate({ ...options(f), npmCli: '/fixture/fixed-npm-cli.js' }, dependencies({
      authority: async () => { events.push('authority'); return (await dependencies().authority!(dependencies().source!())); },
      registry: async () => ({ published, ...(published ? { integrity: f.manifest.integrity } : {}) }),
      observePeer: async (name, request) => { events.push('current-public'); assert.equal(name, 'buildr'); assert.equal(request?.version, undefined); return { observation: { status: 'present', artifact: current.artifact }, bytes: current.bytes }; },
      verifyPair: request => { events.push('actual-pair'); assert.equal(request.npmCli, '/fixture/fixed-npm-cli.js'); assert.equal(request.nodeExecutable, process.execPath); assert.equal(request.consumer.artifact.integrity, f.manifest.integrity); assert.deepEqual(readFileSync(request.provider.tarball), current.bytes); assert.deepEqual(readFileSync(request.consumer.tarball), readFileSync(f.candidate.tarball)); return pair(request.consumer.artifact, request.provider.artifact); },
      publish: async () => { events.push('write'); published = true; return { status: 0 }; },
    }));
    assert.equal(result.status, 'passed'); assert.equal(result.action, 'published'); assert.deepEqual(events, ['authority', 'current-public', 'actual-pair', 'write']);
    assert.equal(readFileSync(f.verificationPath, 'utf8'), original);
  }
});
test('a newly public incompatible Buildr blocks the write even if the original prepare pair passed', async t => {
  const f = fixture(t), current = peer('0.2.0'); let writes = 0, pairs = 0;
  const result = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: false }), observePeer: async () => ({ observation: { status: 'present', artifact: current.artifact }, bytes: current.bytes }),
    verifyPair: request => { pairs++; return pair(request.consumer.artifact, request.provider.artifact); }, publish: async () => { writes++; return { status: 0 }; } }));
  assert.equal(result.attempted, false); assert.equal(result.code, 'plugin-current-buildr-incompatible'); assert.equal(writes, 0); assert.equal(pairs, 1);
});
test('legacy current Buildr uses the unique actual pair and optional unsupported remains local', async t => {
  const f = fixture(t), current = peer('0.1.0-rc.38', false); let pairs = 0;
  await verifyPluginPublishCompatibility({ candidate: f.candidate, verificationPath: f.verificationPath }, {
    observePeer: async () => ({ observation: { status: 'present', artifact: current.artifact }, bytes: current.bytes }), verifyPair: request => { pairs++; return pair(request.consumer.artifact, request.provider.artifact); },
  });
  assert.equal(pairs, 1);
});
test('unavailable public observations and failed or unknown actual capabilities never permit write', async t => {
  const f = fixture(t), current = peer(); let writes = 0;
  const publish = async () => { writes++; return { status: 0 }; };
  for (const status of ['absent', 'unknown'] as const) {
    const result = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: false }), observePeer: async () => ({ observation: { status, packageName: '@buildr-ai/buildr' } }), publish }));
    assert.equal(result.attempted, false); assert.equal(result.code, 'plugin-current-buildr-unavailable');
  }
  for (const status of ['failed', 'unknown'] as const) {
    const result = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: false }), observePeer: async () => ({ observation: { status: 'present', artifact: current.artifact }, bytes: current.bytes }), verifyPair: request => pair(request.consumer.artifact, request.provider.artifact, status), publish }));
    assert.equal(result.attempted, false); assert.equal(result.code, 'plugin-current-buildr-incompatible');
  }
  assert.equal(writes, 0);
});
test('matching published fact is reused even if aggregate disappeared or current peer is unknown', async t => {
  const f = fixture(t); rmSync(f.verificationPath); let calls = 0;
  const fail = async () => { calls++; throw new Error('new-write gate must not run'); };
  const result = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: true, integrity: f.manifest.integrity }), observePeer: fail, authority: fail, publish: fail }));
  assert.equal(result.status, 'passed'); assert.equal(result.action, 'reused'); assert.equal(result.publishedObserved, true); assert.equal(calls, 0);
});
test('lost request stays readback-only after aggregate loss; no new authority or pair call', async t => {
  const f = fixture(t), current = peer(); let writes = 0, laterCalls = 0;
  const first = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: false }), observePeer: async () => ({ observation: { status: 'present', artifact: current.artifact }, bytes: current.bytes }), verifyPair: request => pair(request.consumer.artifact, request.provider.artifact), publish: async () => { writes++; throw new Error('lost response'); } }));
  assert.equal(first.attempted, true); assert.equal(first.action, 'readback-required'); rmSync(f.verificationPath);
  const fail = async () => { laterCalls++; throw new Error('new-write path must not run'); };
  const resumed = await publishPluginCandidate(options(f), dependencies({ registry: async () => ({ published: false }), observePeer: fail, authority: fail, publish: fail }));
  assert.equal(resumed.action, 'readback-required'); assert.equal(resumed.attempted, true); assert.deepEqual(resumed.request, first.request); assert.equal(writes, 1); assert.equal(laterCalls, 0);
});
test('removing manifest compatibility cannot disguise a declared archive as legacy', async t => {
  const f = fixture(t); delete (f.candidate.manifest as any).compatibility;
  await assert.rejects(verifyPluginPublishCompatibility({ candidate: f.candidate }, {}), /plugin-candidate-compatibility-drift/);
});
