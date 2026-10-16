import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import test, { type TestContext } from 'node:test';
import { artifactFromTarball } from '../../../../../../skills/buildr-release/scripts/package-artifact-observation.ts';
import type { CompatibilityArtifact } from '../../../../../../skills/buildr-release/scripts/package-compatibility.ts';
import { createPluginCandidateAdoption } from '../../../../../../skills/buildr-release/scripts/dsh-plugin/candidate-adoption.ts';
import { hash } from '../../tools/buildr-peer.ts';
import { createReleaseCandidate, PLUGIN_SERVICE_PATH, readReleaseCandidate, SOURCE_SDK_MANIFEST, sourceSdkIdentityFromFiles } from '../../../../../../skills/buildr-release/scripts/dsh-plugin/release-candidate.ts';
import { pluginCandidateMain } from '../../../../../../skills/buildr-release/scripts/dsh-plugin/release-workflow.ts';
import { publishPluginCandidate } from '../../../../../../skills/buildr-release/scripts/dsh-plugin/trusted-publish.ts';
import { archiveTreeIdentity } from '../../tools/verify-all.ts';
import { identity } from '../../tools/verify-buildr-plugin-pair.ts';

const serviceRoot = resolve(import.meta.dirname, '../..');
const patchPath = 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch';
const version = '0.1.0-rc.2';
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function archive(metadata: unknown): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, content] of [['package/package.json', JSON.stringify(metadata)], ['package/lib/index.js', 'export default class Host {}\n']]) {
    const body = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136); header.fill(32, 148, 156);
    header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function fixture(t: TestContext) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'buildr-plugin-release-git-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const service = join(repo, PLUGIN_SERVICE_PATH), artifacts = join(repo, 'artifacts');
  const write = (name: string, bytes: Buffer | string) => { const target = join(repo, name); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  const patch = readFileSync(join(serviceRoot, patchPath)), sdkManifest = readFileSync(join(serviceRoot, SOURCE_SDK_MANIFEST));
  assert.ok(patch.length > 1024 * 1024, 'the actual pinned SDK patch crosses the former child-process output limit');
  assert.equal(patch.at(-1), 10, 'the committed patch retains its final newline');
  write(`${PLUGIN_SERVICE_PATH}/${patchPath}`, patch);
  write(`${PLUGIN_SERVICE_PATH}/${SOURCE_SDK_MANIFEST}`, sdkManifest);
  write(`${PLUGIN_SERVICE_PATH}/package.json`, JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin-source', private: true, version }));
  const workflow = 'name: Fixture plugin publisher\n', verifyWorkflow = 'name: Fixture verification\n';
  write('.github/workflows/publish-dsh-plugin.yml', workflow); write('.github/workflows/verify.yml', verifyWorkflow);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const author = ['-c', 'user.name=Release fixture', '-c', 'user.email=release@example.invalid'];
  git(['init', '--quiet', '--initial-branch=main']); git(['add', '.']); git([...author, 'commit', '--quiet', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  git(['checkout', '--quiet', '-b', 'frozen-source']); git([...author, 'commit', '--quiet', '--allow-empty', '-m', 'frozen source']);
  const sourceCommit = git(['rev-parse', 'HEAD']), sourceTree = git(['rev-parse', 'HEAD^{tree}']);
  git(['checkout', '--quiet', 'main']); git([...author, 'merge', '--quiet', '--no-ff', '-m', 'protected inclusion', 'frozen-source']);
  const main = pluginCandidateMain(git(['rev-parse', 'HEAD']), args => git(args));
  assert.deepEqual(main.parents, [base, sourceCommit]); assert.equal(main.tree, sourceTree);
  const sourceSdk = sourceSdkIdentityFromFiles(sdkManifest, patch), contracts = ['buildr.installation-status/v1', 'buildr.web-protocol/v1'];
  const compatibility = { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [{ packageName: '@buildr-ai/buildr', feature: 'entry', required: true, versions: { minInclusive: '0.1.0-rc.1', maxExclusive: '1.0.0', includePrerelease: true }, contracts }] };
  const bytes = archive({ name: '@buildr-ai/buildr-dsh-plugin', version, repository: 'https://github.com/BuildrAI/Buildr', buildrCompatibility: compatibility,
    buildrDshSourceSdk: { upstream: sourceSdk.baseline, sourceManifestSha256: sourceSdk.manifestSha256, sourcePatchSha256: sourceSdk.patchSha256, compiledContracts: sourceSdk.contracts } });
  const manifest = createReleaseCandidate({ version, sourceCommit, sourceTree: main.serviceTree, filename: 'plugin.tgz', bytes, sourceSdk, fileCount: 2 });
  mkdirSync(artifacts); const manifestPath = join(artifacts, 'candidate.json');
  writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(join(artifacts, manifest.filename), bytes);
  const consumer = { ...artifactFromTarball(bytes, { origin: 'candidate', packageName: manifest.packageName, version, integrity: manifest.integrity, sourceCommit }), sourceTree: main.serviceTree };
  const peer: CompatibilityArtifact = { packageName: '@buildr-ai/buildr', origin: 'registry', version: '0.1.0-rc.38', integrity: `sha512-${createHash('sha512').update('provider').digest('base64')}`, artifactSha256: 'c'.repeat(64), compatibility: null };
  const c = identity(consumer), p = identity(peer), features = [{ feature: 'entry', required: true, status: 'passed' }], diagnostic = null;
  const evidenceSha256 = hash(Buffer.from(JSON.stringify({ consumer: c, provider: p, features, contracts, diagnostic })));
  const pair = { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: 'passed', consumer: c, provider: p, features, contracts, diagnostic, evidenceSha256,
    legacyPairEvidence: { schemaVersion: 'buildr.package-pair-evidence/v1', consumer: c, provider: p, features, evidenceSha256 },
    providerContracts: { schemaVersion: 'buildr.package-contract-proof/v1', ...p, contracts, evidenceSha256 } };
  const verifiedContentSha256 = 'e'.repeat(64);
  const report = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', candidateBound: true, sourceCommit, sourceTree: main.serviceTree,
    consumer, consumerTreeSha256: archiveTreeIdentity(bytes), peer, pair, sourceSdk,
    verificationSource: { observedCommit: sourceCommit, dirty: false, contentSha256: verifiedContentSha256 },
    sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: sourceCommit, testedWorkingTreeDirty: false, verifiedContentSha256, candidateSourceCommit: sourceCommit, candidateSourceTree: main.serviceTree },
    checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
  const selection = { id: 'fixture', packages: ['dsh-plugin'], versions: { 'dsh-plugin': version }, baseline: base, main: base, identity: `sha256-${'2'.repeat(64)}` };
  const aggregate = { schemaVersion: 'buildr.dsh-plugin-source-ci-aggregate/v1', status: 'passed', purpose: 'source-admission', repository: 'BuildrAI/Buildr', sourceCommit, sourceTree, serviceTree: main.serviceTree,
    selection, requirements: { buildr: false, plugin: true }, changedPaths: [], workflow: { path: '.github/workflows/verify.yml', sha256: digest(verifyWorkflow), runId: '41', runAttempt: 1 },
    candidate: { artifactName: `plugin-candidate-v${version}`, ...manifest }, verification: report, checks: [{ id: 'plugin-full', status: 'passed' }, { id: 'plugin-candidate-bytes', status: 'passed' }] };
  const input = { operation: 'prepare', version, sourceCandidateRunId: '41', sourceCommit, selectionIdentity: selection.identity, buildrPeer: { origin: 'registry', version: peer.version, integrity: peer.integrity } };
  const run = { id: 41, workflow_id: 7, path: '.github/workflows/verify.yml', repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: sourceCommit, status: 'completed', conclusion: 'success', run_attempt: 1 };
  const snapshots = { workflow: { id: 7, path: '.github/workflows/verify.yml' }, run };
  const data = { main, input, aggregate, snapshots };
  writeFileSync(join(artifacts, 'data.json'), JSON.stringify(data));
  const aggregatePath = join(artifacts, 'aggregate.json'); writeFileSync(aggregatePath, JSON.stringify(aggregate));
  const verificationPath = join(artifacts, 'verification.json'); writeFileSync(verificationPath, JSON.stringify(report));
  const adoption = createPluginCandidateAdoption({ source: { runId: 41, runAttempt: 1, commit: sourceCommit, tree: sourceTree, serviceTree: main.serviceTree, selectionIdentity: selection.identity, workflowSha256: digest(verifyWorkflow) }, main, candidate: manifest });
  const adoptionPath = join(artifacts, 'adoption.json'); writeFileSync(adoptionPath, JSON.stringify(adoption));
  return { repo, service, artifacts, main, sourceSdk, manifest, manifestPath, aggregatePath, verificationPath, adoptionPath, data };
}

test('default source adoption reads the actual large committed SDK patch without changing its byte identity', t => {
  const f = fixture(t), runner = join(f.artifacts, 'default-adoption.mjs');
  writeFileSync(runner, `import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySourceCandidateAdoption } from ${JSON.stringify(pathToFileURL(join(serviceRoot, '../../../../skills/buildr-release/scripts/dsh-plugin/release-workflow.ts')).href)};
import { readReleaseCandidate } from ${JSON.stringify(pathToFileURL(join(serviceRoot, '../../../../skills/buildr-release/scripts/dsh-plugin/release-candidate.ts')).href)};
const data = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
try {
  const result = await verifySourceCandidateAdoption(data.input, data.main, readReleaseCandidate(fileURLToPath(new URL('./candidate.json', import.meta.url))), data.aggregate,
    async path => path.endsWith('/workflows/verify.yml') ? data.snapshots.workflow : data.snapshots.run);
  process.stdout.write(JSON.stringify(result));
} catch (error) { process.stderr.write(String(error.code || error.message)); process.exitCode = 1; }\n`);
  const result = JSON.parse(execFileSync(process.execPath, [runner], { cwd: f.service, encoding: 'utf8', timeout: 10_000 }));
  assert.deepEqual(result.candidate, f.manifest); assert.deepEqual(result.main, f.main);
  assert.equal(result.candidate.sourceSdk.patchSha256, f.sourceSdk.patchSha256);
});

test('adopt-candidate CLI reads the real large Git blob and still rejects a different source selection', t => {
  const f = fixture(t), preload = join(f.artifacts, 'github-snapshots.mjs'), output = join(f.artifacts, 'cli-adoption.json');
  writeFileSync(preload, `import fs from 'node:fs';
const { snapshots } = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
globalThis.fetch = async url => {
  if (url === 'https://api.github.com/repos/BuildrAI/Buildr/actions/workflows/verify.yml') return Response.json(snapshots.workflow);
  if (url === 'https://api.github.com/repos/BuildrAI/Buildr/actions/runs/41') return Response.json(snapshots.run);
  throw new Error('Unexpected external request');
};\n`);
  const env = { ...process.env, GITHUB_REPOSITORY: 'BuildrAI/Buildr', GITHUB_SERVER_URL: 'https://github.com', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', GITHUB_SHA: f.main.commit, GITHUB_RUN_ID: '50', GITHUB_RUN_ATTEMPT: '1',
    PLUGIN_OPERATION: 'prepare', PLUGIN_VERSION: version, PLUGIN_CANDIDATE_RUN_ID: '', PLUGIN_RECOVERY_RUN_ID: '', PLUGIN_SOURCE_CANDIDATE_RUN_ID: '41',
    PLUGIN_SOURCE_COMMIT: f.data.input.sourceCommit, PLUGIN_SELECTION_IDENTITY: f.data.input.selectionIdentity, PLUGIN_BUILDR_PEER_ORIGIN: 'registry',
    PLUGIN_BUILDR_PEER_VERSION: f.data.input.buildrPeer.version, PLUGIN_BUILDR_PEER_INTEGRITY: f.data.input.buildrPeer.integrity, PLUGIN_BUILDR_CANDIDATE_RUN_ID: '', GH_TOKEN: 'fixture-read-access', GITHUB_OUTPUT: '' };
  const args = ['--import', pathToFileURL(preload).href, join(serviceRoot, '../../../../skills/buildr-release/scripts/dsh-plugin/release-workflow.ts'), 'adopt-candidate', '--candidate', f.manifestPath, '--aggregate', f.aggregatePath, '--output', output];
  const result = spawnSync(process.execPath, args, { cwd: f.service, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).candidate, f.manifest);
  assert.deepEqual(JSON.parse(readFileSync(join(f.artifacts, 'plugin-full-verification.json'), 'utf8')), f.data.aggregate.verification);
  const refusedOutput = join(f.artifacts, 'refused.json');
  const refused = spawnSync(process.execPath, [...args.slice(0, -1), refusedOutput], { cwd: f.service, env: { ...env, PLUGIN_SELECTION_IDENTITY: `sha256-${'3'.repeat(64)}` }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(refused.status, 1); assert.equal(existsSync(refusedOutput), false);
});

test('publication reads large committed SDK inputs through its default source state before remote or public effects', async t => {
  const f = fixture(t), candidate = readReleaseCandidate(f.manifestPath);
  let observations = 0, writes = 0, authority = 0;
  const result = await publishPluginCandidate({ repo: f.repo, manifestPath: f.manifestPath, adoptionPath: f.adoptionPath, verificationPath: f.verificationPath,
    version, sourceCommit: f.main.commit, output: join(f.artifacts, 'publication.json') }, {
    env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'BuildrAI/Buildr',
      GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish-dsh-plugin.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: f.main.commit, GITHUB_RUN_ID: '50', GITHUB_RUN_ATTEMPT: '1' },
    registry: async manifest => { observations++; assert.deepEqual(manifest, candidate.manifest); return { published: true, integrity: manifest.integrity }; },
    publish: async () => { writes++; throw new Error('No public write is allowed'); },
    authority: async () => { authority++; throw new Error('No authority request is allowed'); },
  }).catch(error => { throw new Error(`Default publication source state failed: ${error.code || error.message}`); });
  assert.equal(result.status, 'passed'); assert.equal(result.action, 'reused'); assert.equal(result.attempted, false);
  assert.equal(observations, 1); assert.equal(writes, 0); assert.equal(authority, 0);
  assert.equal(result.sha256, f.manifest.sha256); assert.equal(result.sourceCommit, f.manifest.sourceCommit);
});
