import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PUBLISHER_PAIR_DIAGNOSIS_SCOPE, publisherPairPluginInput, runPublisherPairDiagnosis,
  validatePublisherPairArtifact, validatePublisherPairDiagnosis, validatePublisherPairPublicPlugin } from '../verification/release/package-pair-publisher-diagnosis.ts';

const original = 'a'.repeat(40), current = 'b'.repeat(40), tree = 'c'.repeat(40), bytes = Buffer.from('frozen public plugin');
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const artifactSha256 = createHash('sha256').update(bytes).digest('hex');
const env = { DIAGNOSTIC_SCOPE: PUBLISHER_PAIR_DIAGNOSIS_SCOPE, DIAGNOSTIC_CANDIDATE_RUN_ID: '123', DIAGNOSTIC_CANDIDATE_SOURCE: original,
  DIAGNOSTIC_PLUGIN_VERSION: '0.1.0-rc.1', DIAGNOSTIC_PLUGIN_INTEGRITY: integrity, DIAGNOSTIC_PLUGIN_SHA256: artifactSha256,
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/dev', BUILDR_CANDIDATE_PURPOSE: 'candidate', GITHUB_REPOSITORY: 'BuildrAI/Buildr',
  GITHUB_SHA: current, EXPECTED_SOURCE_TREE: tree, DIAGNOSTIC_OUTPUT: '/diagnosis', DIAGNOSTIC_RUN_JSON: '/run.json', DIAGNOSTIC_ARTIFACT_DIR: '/package' };
const run = { id: 123, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch',
  status: 'completed', conclusion: 'success', head_sha: original, run_attempt: 1 };
const facts = { head: current, tree, dirty: false };
const manifest = { packageName: '@buildr-ai/buildr', version: '0.1.0-rc.39', sourceCommit: original, sha256: 'd'.repeat(64), integrity, size: 123 };
const plugin = { observation: { status: 'present', artifact: { packageName: '@buildr-ai/buildr-dsh-plugin', version: env.DIAGNOSTIC_PLUGIN_VERSION,
  origin: 'registry', integrity, artifactSha256, compatibility: null } }, bytes };
const runtime = { platform: 'darwin', nodeVersion: '24.15.0', nodeExecutable: '/node/bin/node', pairNpm: { cli: '/node/npm-cli.js', version: '11.11.0' },
  publisherNpm: { cli: '/publisher/npm-cli.js', version: '11.5.1' } };

test('publisher pair diagnosis binds a successful original run and a separate exact clean diagnosis checkout', () => {
  assert.doesNotThrow(() => validatePublisherPairDiagnosis(env, run, facts));
  assert.doesNotThrow(() => validatePublisherPairDiagnosis({ ...env, GITHUB_REF: 'refs/heads/codex/verification-fix' }, run, facts));
  assert.doesNotThrow(() => validatePublisherPairDiagnosis({ ...env, DIAGNOSTIC_CANDIDATE_RUN_ID: '456' }, { ...run, id: 456 }, facts));
  for (const changed of [{ id: 456 }, { repository: { full_name: 'other/repo' } }, { path: '.github/workflows/publish.yml' },
    { event: 'pull_request' }, { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: current }, { run_attempt: 0 }]) {
    assert.throws(() => validatePublisherPairDiagnosis(env, { ...run, ...changed }, facts), /publisher-pair-/u);
  }
  for (const changed of [{ DIAGNOSTIC_SCOPE: 'none' }, { BUILDR_CANDIDATE_PURPOSE: 'release-rehearsal' },
    { DIAGNOSTIC_CANDIDATE_RUN_ID: 'HEAD' }, { DIAGNOSTIC_CANDIDATE_SOURCE: original.slice(0, 12) }, { GITHUB_SHA: original },
    { EXPECTED_SOURCE_TREE: current }, { BUILDR_RELEASE_PACKAGES: 'buildr' }, { BUILDR_SOURCE_VERIFICATION: 'old-proof' }]) {
    assert.throws(() => validatePublisherPairDiagnosis({ ...env, ...changed }, run, facts), /publisher-pair-/u);
  }
  assert.throws(() => validatePublisherPairDiagnosis(env, run, { ...facts, dirty: true }), /tree-mismatch/u);
});

test('original artifact and official plugin reject identity, byte and frozen integrity substitutions', () => {
  assert.doesNotThrow(() => validatePublisherPairArtifact(manifest, original));
  for (const changed of [{ packageName: 'other' }, { sourceCommit: current }, { version: 'latest' }, { sha256: 'bad' }, { integrity: 'bad' }]) {
    assert.throws(() => validatePublisherPairArtifact({ ...manifest, ...changed }, original), /artifact-mismatch/u);
  }
  const expected = publisherPairPluginInput(env);
  assert.doesNotThrow(() => validatePublisherPairPublicPlugin(plugin, expected));
  for (const changed of [{ origin: 'candidate' }, { version: '0.1.0-rc.2' }, { integrity: `sha512-${Buffer.alloc(64).toString('base64')}` },
    { artifactSha256: 'f'.repeat(64) }, { verifiedContracts: {} }]) {
    assert.throws(() => validatePublisherPairPublicPlugin({ ...plugin, observation: { status: 'present', artifact: { ...plugin.observation.artifact, ...changed } } }, expected), /plugin-mismatch/u);
  }
  for (const status of ['absent', 'unknown']) assert.throws(() => validatePublisherPairPublicPlugin({ ...plugin, observation: { status } }, expected), /plugin-mismatch/u);
  assert.throws(() => validatePublisherPairPublicPlugin({ ...plugin, bytes: Buffer.from('changed') }, expected), /bytes-mismatch/u);
  assert.throws(() => publisherPairPluginInput({ ...env, DIAGNOSTIC_PLUGIN_VERSION: 'next' }), /input-invalid/u);
});

function dependencies(overrides: any = {}): any {
  return { readRun: () => run, readGitFacts: () => facts, readArtifact: () => ({ manifest, manifestPath: '/original.json', tarball: '/original.tgz' }),
    observePlugin: async (name: any, options: any) => { assert.equal(name, 'dsh-plugin'); assert.deepEqual(options, { version: plugin.observation.artifact.version, expectedIntegrity: integrity }); return plugin; },
    runtimeIdentity: () => runtime, writeSummary: () => {}, verifyPair: () => ({ status: 'passed' }),
    publisherDryRun: (operation: string, options: any) => { assert.equal(operation, 'publisher'); assert.equal(options.manifestPath, '/original.json');
      return { status: 'passed', artifact: manifest }; },
    checkCompatibility: async (options: any, collaborators: any) => {
      assert.equal(options.artifact.tarball, '/original.tgz'); assert.equal(options.context.release.version, manifest.version);
      assert.equal(await collaborators.observePublishedPackageArtifact(), plugin);
      assert.equal(Object.hasOwn(collaborators, 'npmCli'), false, 'preserve the actual publisher Node-associated npm selection');
      return collaborators.verifyBuildrPluginPair({ consumer: {}, provider: {} });
    }, ...overrides };
}

test('one diagnostic check retains distinct Node/npm facts and cannot become complete Candidate evidence', async () => {
  const saved: any[] = []; let executions = 0, reads = 0;
  const result = await runPublisherPairDiagnosis({ env }, dependencies({ readGitFacts: () => { reads++; return facts; },
    verifyPair: () => { executions++; return { status: 'passed' }; }, writeSummary: (_dir: string, summary: any) => saved.push(structuredClone(summary)) }));
  assert.equal(executions, 1); assert.equal(reads, 2); assert.equal(result.pairExecutions, 1); assert.equal(result.status, 'passed');
  assert.equal(result.aggregateEligible, false); assert.equal(result.kind, 'diagnostic-only'); assert.equal(result.preparationProfile, 'publisher');
  assert.equal(result.artifactSourceCommit, original); assert.equal(result.checkSourceCommit, current); assert.equal(result.checkSourceTree, tree);
  assert.deepEqual(result.runtime, runtime); assert.equal(saved[0].status, 'running'); assert.equal(saved.at(-1).sourceReadback, 'unchanged');
  assert.equal(result.artifactSha256, manifest.sha256); assert.equal(result.artifactIntegrity, manifest.integrity);
  assert.equal(result.publisherDryRun.status, 'passed'); assert.equal(result.publisherDryRun.artifactSha256, manifest.sha256);
  assert.equal(Object.hasOwn(result, 'sourceRecord'), false);
});

test('blocked pair keeps original bounded diagnostics, while drift, invalid inputs and repeated execution never pass', async () => {
  const compatibility = { status: 'blocked', pairDiagnostics: [{ stage: 'plugin-open', code: 'package-consumption-error', message: 'unsupported linux' }] };
  const blocked = await runPublisherPairDiagnosis({ env }, dependencies({ verifyPair: () => compatibility }));
  assert.equal(blocked.status, 'blocked'); assert.deepEqual(blocked.compatibility, compatibility); assert.equal(blocked.pairExecutions, 1);
  let reads = 0;
  const drift = await runPublisherPairDiagnosis({ env }, dependencies({ readGitFacts: () => ++reads === 1 ? facts : { ...facts, dirty: true } }));
  assert.equal(drift.status, 'failed'); assert.equal(drift.compatibility.status, 'passed'); assert.equal(drift.sourceFailure.stage, 'source-readback');
  const repeated = await runPublisherPairDiagnosis({ env }, dependencies({ checkCompatibility: async (_input: any, deps: any) => {
    deps.verifyBuildrPluginPair({}); deps.verifyBuildrPluginPair({}); return { status: 'passed' };
  } }));
  assert.equal(repeated.status, 'failed'); assert.equal(repeated.failure.code, 'publisher-pair-repeated-execution');
  for (const changed of [{ nodeVersion: '24.21.0' }, { platform: 'win32' }, { platform: 'linux' }, { publisherNpm: { version: '12.0.0' } }]) {
    const result = await runPublisherPairDiagnosis({ env }, dependencies({ runtimeIdentity: () => ({ ...runtime, ...changed }),
      verifyPair: () => assert.fail('invalid runtime cannot execute the pair') }));
    assert.equal(result.status, 'failed'); assert.equal(result.pairExecutions, 0);
  }
});

test('publisher dry-run is one separate original-package operation and preserves failures without Candidate reuse', async () => {
  for (const failure of ['exit', 'bytes', 'throw']) {
    let calls = 0;
    const result = await runPublisherPairDiagnosis({ env }, dependencies({ publisherDryRun: (operation: string, request: any) => {
      calls++; assert.equal(operation, 'publisher'); assert.equal(request.manifestPath, '/original.json');
      if (failure === 'throw') throw Object.assign(new Error('dry-run child failed'), { code: 'ETIMEDOUT' });
      return { status: failure === 'exit' ? 'failed' : 'passed', artifact: { ...manifest, sha256: failure === 'bytes' ? 'f'.repeat(64) : manifest.sha256 } };
    } }));
    assert.equal(calls, 1); assert.equal(result.pairExecutions, 1); assert.equal(result.compatibility.status, 'passed');
    assert.equal(result.status, 'failed'); assert.equal(result.publisherDryRun.status, 'failed'); assert.equal(result.aggregateEligible, false);
    assert.equal(result.failure.stage, 'publisher-dry-run'); assert.ok(Number.isInteger(result.publisherDryRun.durationMs));
  }
});
