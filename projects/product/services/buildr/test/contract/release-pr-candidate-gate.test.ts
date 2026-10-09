import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createPluginSourceAggregate, createReleaseCandidatePlan, releaseCandidateRequirements, verifyReleasePullRequestCandidate } from '../../tools/release/verify-pr-candidate.ts';
import { parseReleaseCandidate } from '../../../dsh-plugin/tools/release-candidate.ts';
import { mainCompatibilityFixture, pluginCompatibilityFixture } from '../helpers/package-compatibility-fixtures.ts';

const repository = 'BuildrAI/Buildr';
const branch = 'codex/release-main-0.1.0-rc.36-g3';
const sourceCommit = 'd70a89840820e32634146b614e7979fecfde239a';
const runId = 35994036028;
const sourceSdkDirectory = path.resolve(import.meta.dirname, '../../../dsh-plugin/sdk-patches');
const sourceSdkManifest = fs.readFileSync(path.join(sourceSdkDirectory, 'dsh-v0.2.0-rc.2-event-sources-settings.json'), 'utf8');
const sourceSdkPatch = fs.readFileSync(path.join(sourceSdkDirectory, 'dsh-v0.2.0-rc.2-event-sources-settings.patch'), 'utf8');
const peerIntegrity = `sha512-${Buffer.alloc(64).toString('base64')}`;

function fixture(overrides: any = {}) {
  const event = { pull_request: { base: { ref: 'main' }, head: { ref: branch, sha: sourceCommit }, body: `Release 0.1.0-rc.36.\n\nCandidate run ID: ${runId}`, ...overrides.event } };
  const responses: Record<string, any> = {
    [`repos/${repository}/actions/runs/${runId}`]: { id: runId, repository: { full_name: repository }, event: 'workflow_dispatch', path: '.github/workflows/verify.yml', head_sha: sourceCommit, head_branch: branch, status: 'completed', conclusion: 'success', ...overrides.run },
    [`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]: { total_count: 1, jobs: [{ name: 'Candidate gate', conclusion: 'success' }], ...overrides.jobs },
    [`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]: { total_count: 2, artifacts: [
      { name: 'candidate-package', expired: false, size_in_bytes: 100 },
      { name: 'candidate-aggregate', expired: false, size_in_bytes: 100 },
    ], ...overrides.artifacts },
  };
  const scoped = {
    git: (args: string[]) => {
      if (args[1] === `${sourceCommit}:projects/product/services/buildr/package.json`) {
        assert.equal(args[0], 'show');
        assert.equal(args.at(-1), '--');
        return JSON.stringify({ name: '@buildr-ai/buildr', version: '0.1.0-rc.36', ...overrides.sourcePackage });
      }
      assert.deepEqual(args, ['show', `${sourceCommit}:.github/workflows/verify.yml`, '--']);
      return overrides.sourceWorkflow ?? 'name: Verify Buildr\non:\n  workflow_dispatch:\n    inputs:\n      purpose: {}\n';
    },
    loadAggregate: async () => { throw new Error('A legacy source never loads plugin proof.'); },
  };
  return { event, requestJson: async (endpoint: string) => responses[endpoint], scoped };
}

test('release PR gate reuses the exact successful Candidate and its two artifacts', async () => {
  const { event, requestJson, scoped } = fixture();
  assert.deepEqual(await verifyReleasePullRequestCandidate(event, repository, requestJson, scoped), { status: 'passed', runId, sourceCommit, branch });
});

test('release PR gate rejects source drift, missing run identity and expired artifact', async () => {
  const drift = fixture({ run: { head_sha: 'a'.repeat(40) } });
  await assert.rejects(verifyReleasePullRequestCandidate(drift.event, repository, drift.requestJson, drift.scoped), /source differs/u);
  const missingId = fixture({ event: { body: 'Release without a Candidate pointer.' } });
  await assert.rejects(verifyReleasePullRequestCandidate(missingId.event, repository, missingId.requestJson, missingId.scoped), /identify one Candidate run/u);
  const expired = fixture({ artifacts: { total_count: 2, artifacts: [
    { name: 'candidate-package', expired: true, size_in_bytes: 100 },
    { name: 'candidate-aggregate', expired: false, size_in_bytes: 100 },
  ] } });
  await assert.rejects(verifyReleasePullRequestCandidate(expired.event, repository, expired.requestJson, expired.scoped), /candidate-package is unavailable/u);
});

test('deleting selection proof cannot turn plugin, joint or custom carriers into legacy releases', async () => {
  for (const ref of ['codex/release-main-dsh-plugin-0.1.0-rc.7-g0', 'codex/release-main-buildr-0.1.0-rc.41_dsh-plugin-0.1.0-rc.7-g0', 'codex/release-main-custom-selection-g0']) {
    const value = fixture({ event: { head: { ref, sha: sourceCommit } }, run: { head_branch: ref } });
    let requested = false;
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, async endpoint => {
      requested = true;
      return value.requestJson(endpoint);
    }, value.scoped), /selection proof is required/u);
    assert.equal(requested, false, ref);
  }
});

test('a main SemVer carrier requires selection proof when its frozen source declares compatibility', async () => {
  for (const buildrCompatibility of [{ schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [] }, null]) {
    const value = fixture({ sourcePackage: { buildrCompatibility } });
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), /selection proof is required for compatibility-aware source/u);
  }
  const peer = fixture({ event: { body: `Candidate run ID: ${runId}\nBuildr peer: {}` } });
  await assert.rejects(verifyReleasePullRequestCandidate(peer.event, repository, peer.requestJson, peer.scoped), /selection proof is required/u);
});

test('legacy recovery requires exact old frozen package facts instead of an omitted body line', async () => {
  const value = fixture();
  await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson), /frozen source inspection/u);
  const wrongVersion = fixture({ sourcePackage: { version: '0.1.0-rc.37' } });
  await assert.rejects(verifyReleasePullRequestCandidate(wrongVersion.event, repository, wrongVersion.requestJson, wrongVersion.scoped), /differs from frozen main package/u);
  assert.equal((await verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped)).status, 'passed');
});

test('a scoped frozen workflow cannot recover as legacy even when compatibility metadata is absent', async () => {
  for (const sourceWorkflow of ['on: { workflow_dispatch: { inputs: { release_packages: { type: string } } } }', 'env: { BUILDR_RELEASE_PACKAGES: scope }']) {
    const value = fixture({ sourceWorkflow });
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), /selection proof is required for a scoped verification recipe/u);
  }
});

test('main PR gate rejects unsupported ordinary and malformed carrier sources before reading remote evidence', async () => {
  for (const ref of ['codex/ordinary-fix', 'feature/release', 'codex/release-main-invalid']) {
    const { event } = fixture({ event: { head: { ref, sha: sourceCommit } } });
    let requested = false;
    await assert.rejects(verifyReleasePullRequestCandidate(event, repository, async () => {
      requested = true;
      throw new Error('Unexpected remote request');
    }), /Expected a release carrier pull request into main/u);
    assert.equal(requested, false, ref);
  }
});

test('package targets select independent checks and cannot bypass actual product inputs', () => {
  assert.deepEqual(releaseCandidateRequirements({ packages: ['dsh-plugin'], changedPaths: ['projects/product/services/dsh-plugin/plugin/entry.ts'] }), { buildr: false, plugin: true });
  assert.deepEqual(releaseCandidateRequirements({ packages: ['buildr'], changedPaths: [] }), { buildr: true, plugin: false });
  assert.deepEqual(releaseCandidateRequirements({ packages: ['buildr', 'dsh-plugin'], changedPaths: [] }), { buildr: true, plugin: true });
  for (const changed of ['projects/product/services/buildr/src/runtime.ts', 'projects/product/services/buildr/resources/runtime/file.json', 'projects/product/services/buildr/package-lock.json', 'projects/product/services/buildr/tools/codegen/contracts/task-dto.ts', 'projects/product/services/buildr/tools/release/release-consumption.ts', 'projects/product/services/buildr/tools/release/release-contract.ts', 'projects/product/services/buildr/tools/release/release-notes.ts', 'projects/product/services/buildr/tools/release/release-authority.ts', 'projects/product/services/buildr/tools/release/application-payload.ts', 'projects/product/services/buildr/test/verification/registry.ts', 'projects/product/services/buildr/test/integration/open-source-release-filesystem.test.ts', 'projects/product/services/buildr/test/contract/package-artifact-observation.test.ts', 'projects/product/services/buildr/test/helpers/runtime-fixtures.ts', 'projects/product/services/buildr-web/src/App.tsx', '.github/workflows/verify.yml', '.github/workflows/publish.yml']) {
    assert.equal(releaseCandidateRequirements({ packages: ['dsh-plugin'], changedPaths: [changed] }).buildr, true, changed);
  }
  assert.equal(releaseCandidateRequirements({ packages: ['dsh-plugin'], changedPaths: ['projects/product/services/buildr/tools/release/release-targets.ts', 'projects/product/services/buildr/test/contract/release-pr-candidate-gate.test.ts', 'projects/product/services/buildr/test/contract/release-authority.test.ts', 'projects/product/services/buildr/test/contract/release-model-governance.test.ts', 'projects/product/services/buildr/test/contract/open-source-release.test.ts', 'projects/product/services/buildr/test/contract/package-compatibility.test.ts', 'projects/product/services/buildr/test/helpers/package-compatibility-fixtures.ts', 'projects/product/services/buildr/test/unit/package-compatibility.test.ts', 'projects/product/services/buildr/test/integration-candidate-release/git-convergence/release-git-convergence-selection.test.ts'] }).buildr, false);
  assert.throws(() => releaseCandidateRequirements({ packages: ['other'], changedPaths: [] }), /Unsupported/u);
});

test('legacy dispatch stays on the original Buildr Candidate entry without new inputs', () => {
  const plan = createReleaseCandidatePlan({}, () => { throw new Error('Legacy entry does not read scoped selection facts.'); });
  assert.deepEqual(plan, { schemaVersion: 'buildr.package-candidate-plan/v1', legacy: true, requirements: { buildr: true, plugin: false } });
});

function scopedFixture(changedPaths = ['projects/product/services/dsh-plugin/plugin/entry.ts'], packages = ['dsh-plugin']) {
  const versions: Record<string, string> = Object.fromEntries(packages.map(name => [name, name === 'buildr' ? '0.1.0-rc.38' : '0.1.0-rc.1']));
  const selection = { id: packages.map(name => `${name}-${versions[name]}`).join('_'), packages, versions, baseline: 'b'.repeat(40), main: 'c'.repeat(40), identity: 'd'.repeat(64) };
  const scopedBranch = `codex/release-main-${selection.id}-g1`;
  const git = (args: string[]): string => {
    if (args[0] === 'show') assert.equal(args.at(-1), '--');
    const key = (args[0] === 'show' ? args.slice(0, -1) : args).join(' ');
    if (key === 'rev-parse HEAD') return sourceCommit;
    if (key === 'rev-parse refs/remotes/origin/main') return selection.main;
    if (key === `rev-parse ${sourceCommit}^{tree}`) return 'e'.repeat(40);
    if (key === `rev-parse ${sourceCommit}:projects/product/services/dsh-plugin`) return 'f'.repeat(40);
    if (key === `show ${sourceCommit}:projects/product/services/dsh-plugin/package.json`) return JSON.stringify({ version: '0.1.0-rc.1' });
    if (key === `show ${sourceCommit}:projects/product/services/buildr/package.json`) return JSON.stringify({ version: '0.1.0-rc.38' });
    if (key === `show ${sourceCommit}:.github/workflows/verify.yml`) return 'name: Verify Buildr\n';
    if (key === `show ${sourceCommit}:projects/product/services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json`) return sourceSdkManifest;
    if (key === `show ${sourceCommit}:projects/product/services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch`) return sourceSdkPatch;
    if (args[0] === 'diff') { assert.equal(args[4], selection.main); return `${changedPaths.join('\0')}\0`; }
    throw new Error(`Unexpected fixture Git read: ${key}`);
  };
  const env = { BUILDR_RELEASE_PACKAGES: packages.join(','), BUILDR_SOURCE_BUILDR_VERSION: versions.buildr, BUILDR_PLUGIN_VERSION: '0.1.0-rc.1', BUILDR_SELECTION_ID: selection.id, BUILDR_SELECTION_BASELINE: selection.baseline, BUILDR_SELECTION_MAIN: selection.main, BUILDR_SELECTION_IDENTITY: selection.identity, BUILDR_BUILDR_PEER_VERSION: '0.1.0-rc.38', BUILDR_BUILDR_PEER_INTEGRITY: peerIntegrity, CANDIDATE_SOURCE_SHA: sourceCommit };
  const plan = createReleaseCandidatePlan(env, git);
  const candidate = parseReleaseCandidate({ schemaVersion: 'buildr.dsh-plugin-release-candidate/v1', packageName: '@buildr-ai/buildr-dsh-plugin', registry: 'https://registry.npmjs.org/', published: false, npmTag: 'next', size: 100, sha256: '0'.repeat(64), integrity: `sha512-${Buffer.alloc(64).toString('base64')}`, sourceCommit, sourceTree: plan.serviceTree, version: plan.pluginVersion, filename: 'plugin.tgz', fileCount: 1,
    sourceSdk: plan.sourceSdk, compatibility: pluginCompatibilityFixture });
  const consumer = { packageName: candidate.packageName, version: candidate.version, integrity: candidate.integrity, artifactSha256: candidate.sha256, origin: 'candidate', sourceCommit, sourceTree: plan.serviceTree, compatibility: pluginCompatibilityFixture };
  const peer = { packageName: '@buildr-ai/buildr', version: '0.1.0-rc.38', integrity: candidate.integrity, artifactSha256: '1'.repeat(64), origin: packages.includes('buildr') ? 'candidate' : 'registry', compatibility: packages.includes('buildr') ? mainCompatibilityFixture : null, ...(packages.includes('buildr') ? { sourceCommit } : {}) };
  const identity = (input: any) => ({ packageName: input.packageName, version: input.version, integrity: input.integrity, artifactSha256: input.artifactSha256 });
  const evidence = { consumer: identity(consumer), provider: identity(peer), features: [{ feature: 'entry', required: true, status: 'passed' }, { feature: 'sourceCapture', required: false, status: 'passed' }], contracts: [...mainCompatibilityFixture.provides], diagnostic: null };
  const evidenceSha256 = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const legacyPairEvidence = { schemaVersion: 'buildr.package-pair-evidence/v1', consumer: evidence.consumer, provider: evidence.provider, features: evidence.features, evidenceSha256 };
  const pair = { schemaVersion: 'buildr.dsh-package-pair-verification/v1', status: 'passed', ...evidence, evidenceSha256, legacyPairEvidence,
    ...(!packages.includes('buildr') ? { providerContracts: { schemaVersion: 'buildr.package-contract-proof/v1', ...identity(peer), contracts: evidence.contracts, evidenceSha256 } } : {}) };
  const verificationSource = { observedCommit: sourceCommit, dirty: false, contentSha256: '2'.repeat(64) };
  const full = { schemaVersion: 'buildr.dsh-full-verification/v1', status: 'passed', candidateBound: true, sourceCommit, sourceTree: plan.serviceTree, consumer, consumerTreeSha256: '3'.repeat(64), peer, sourceSdk: candidate.sourceSdk, verificationSource,
    sourceBinding: { method: 'git-tree-content-equivalence', testedGitHead: verificationSource.observedCommit, testedWorkingTreeDirty: verificationSource.dirty, verifiedContentSha256: verificationSource.contentSha256, candidateSourceCommit: sourceCommit, candidateSourceTree: plan.serviceTree },
    pair, checks: ['unit', 'integration', 'source-ui', 'released-loader', 'development-loader', 'actual-package-pair'], variants: ['released', 'development'], runtimeActivated: false, desktopValidated: false };
  const aggregate = createPluginSourceAggregate(plan, candidate, full, { runId, runAttempt: 1 });
  const base = fixture({ event: { base: { ref: 'main', sha: selection.main }, head: { ref: scopedBranch, sha: sourceCommit }, body: `Candidate run ID: ${runId}\nRelease selection: ${JSON.stringify(selection)}\nBuildr peer: ${JSON.stringify(peer)}` }, run: { head_branch: scopedBranch, run_attempt: 1 }, artifacts: { total_count: 2, artifacts: [{ name: 'plugin-candidate-v0.1.0-rc.1', expired: false, size_in_bytes: 100 }, { name: 'plugin-candidate-aggregate', expired: false, size_in_bytes: 100 }] } });
  return { ...base, selection, env, git, plan, aggregate, scoped: { git, loadAggregate: async () => aggregate } };
}

test('pure plugin source carrier passes with its own aggregate and never needs a main package', async () => {
  const value = scopedFixture();
  assert.deepEqual(await verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), { status: 'passed', runId, sourceCommit, branch: value.event.pull_request.head.ref });
});

test('scoped carrier rejects main source changes without the complete main Candidate', async () => {
  const value = scopedFixture(['projects/product/services/buildr/src/runtime.ts']);
  assert.equal(value.plan.requirements.buildr, true);
  await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), /candidate-package is unavailable/u);
});

test('joint source carrier requires both independent proof sets', async () => {
  const value = scopedFixture([], ['buildr', 'dsh-plugin']);
  const requestJson = async (endpoint: string) => {
    const response = await value.requestJson(endpoint);
    return endpoint.includes('/artifacts?') ? { total_count: 4, artifacts: [...response.artifacts, { name: 'candidate-package', expired: false, size_in_bytes: 100 }, { name: 'candidate-aggregate', expired: false, size_in_bytes: 100 }] } : response;
  };
  assert.equal((await verifyReleasePullRequestCandidate(value.event, repository, requestJson, value.scoped)).status, 'passed');
  for (const name of ['candidate-package', 'candidate-aggregate', 'plugin-candidate-v0.1.0-rc.1', 'plugin-candidate-aggregate']) {
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, async endpoint => {
      const response = await requestJson(endpoint);
      return endpoint.includes('/artifacts?') ? { ...response, total_count: 3, artifacts: response.artifacts.filter((item: any) => item.name !== name) } : response;
    }, value.scoped), /is unavailable/u);
  }
});

test('scoped source carrier refuses duplicate selection, stale main, wrong source version and incomplete evidence lists', async () => {
  const duplicate = scopedFixture();
  duplicate.event.pull_request.body += `\nRelease selection: ${JSON.stringify(duplicate.selection)}`;
  await assert.rejects(verifyReleasePullRequestCandidate(duplicate.event, repository, duplicate.requestJson, duplicate.scoped), /one selection/u);
  const stale = scopedFixture();
  stale.event.pull_request.base.sha = '0'.repeat(40);
  await assert.rejects(verifyReleasePullRequestCandidate(stale.event, repository, stale.requestJson, stale.scoped), /current main differs/u);
  const wrongVersion = scopedFixture();
  assert.throws(() => createReleaseCandidatePlan({ ...wrongVersion.env, BUILDR_PLUGIN_VERSION: '0.2.0' }, wrongVersion.git), /version differs/u);
  for (const part of ['jobs', 'artifacts']) {
    const value = scopedFixture();
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, async endpoint => {
      const response = await value.requestJson(endpoint);
      return endpoint.includes(`/${part}?`) ? { ...response, total_count: 100 } : response;
    }, value.scoped), /list is incomplete/u);
  }
});

test('source selection uses the single target normalizer grammar and canonical projection', () => {
  const value = scopedFixture();
  assert.equal(createReleaseCandidatePlan({ ...value.env, BUILDR_SELECTION_ID: 'a'.repeat(240) }, value.git).selection.id.length, 240);
  for (const id of ['Uppercase', 'unsafe..id', 'lock.lock', 'a'.repeat(241)]) assert.throws(() => createReleaseCandidatePlan({ ...value.env, BUILDR_SELECTION_ID: id }, value.git), /release-selection-id-invalid/u);
  const joint = scopedFixture([], ['buildr', 'dsh-plugin']);
  assert.throws(() => createReleaseCandidatePlan({ ...joint.env, BUILDR_RELEASE_PACKAGES: 'dsh-plugin,buildr' }, joint.git), /normalized targets/u);
});

test('scoped carrier refuses wrong recipe, selection, source proof and rerun attempts', async () => {
  for (const mutate of [
    (value: any) => { value.workflow.sha256 = '0'.repeat(64); },
    (value: any) => { value.selection = { ...value.selection, identity: '0'.repeat(64) }; },
    (value: any) => { value.purpose = 'publication'; },
    (value: any) => { value.verification.status = 'failed'; },
  ]) {
    const value = scopedFixture();
    mutate(value.aggregate);
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), /Plugin source aggregate/u);
  }
  const value = scopedFixture();
  await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, async endpoint => {
    const response = await value.requestJson(endpoint);
    return endpoint.endsWith(`/runs/${runId}`) ? { ...response, run_attempt: 0 } : response;
  }, value.scoped), /run attempt is invalid/u);
});

test('source proof reuses a successful earlier attempt of the same exact run without weakening publication identity', async () => {
  const value = scopedFixture();
  const requestJson = async (endpoint: string) => {
    const response = await value.requestJson(endpoint);
    return endpoint.endsWith(`/runs/${runId}`) ? { ...response, run_attempt: 2 } : response;
  };
  assert.equal((await verifyReleasePullRequestCandidate(value.event, repository, requestJson, value.scoped)).status, 'passed');
  value.aggregate.workflow.runAttempt = 3;
  await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, requestJson, value.scoped), /recipe or run differs/u);
});

test('source aggregate rejects unbound bytes, wrong peer origin and a failed actual package pair', async () => {
  for (const mutate of [
    (value: any) => { value.verification.candidateBound = false; },
    (value: any) => { value.verification.consumer.artifactSha256 = '2'.repeat(64); },
    (value: any) => { value.verification.peer = { ...value.verification.peer, origin: 'candidate', sourceCommit }; },
    (value: any) => { value.verification.peer.version = '0.1.0-rc.39'; },
    (value: any) => { value.verification.peer.integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`; },
    (value: any) => { value.verification.sourceSdk = { ...value.verification.sourceSdk, baseline: { ...value.verification.sourceSdk.baseline, commit: '0'.repeat(40) } }; },
    (value: any) => { value.verification.pair.legacyPairEvidence.features[0].status = 'failed'; },
    (value: any) => { delete value.verification.sourceBinding; },
    (value: any) => { delete value.verification.verificationSource; },
    (value: any) => { value.verification.sourceBinding.verifiedContentSha256 = '4'.repeat(64); },
    (value: any) => { value.verification.sourceBinding.candidateSourceTree = '0'.repeat(40); },
    (value: any) => { value.verification.variants = ['released']; },
    (value: any) => { value.verification.runtimeActivated = true; },
    (value: any) => { value.verification.desktopValidated = true; },
    (value: any) => { value.verification.pair.evidenceSha256 = '5'.repeat(64); },
    (value: any) => { value.verification.checks = ['unit']; },
  ]) {
    const value = scopedFixture();
    mutate(value.aggregate);
    await assert.rejects(verifyReleasePullRequestCandidate(value.event, repository, value.requestJson, value.scoped), /Full plugin/u);
  }
});

test('workflow keeps default/dev entries and plugin source Candidate has no publication authority', () => {
  const file = path.resolve(import.meta.dirname, '../../../../../../.github/workflows/verify.yml');
  const workflow = fs.readFileSync(file, 'utf8');
  assert.match(workflow, /options: \[candidate, release-rehearsal\]/u);
  assert.match(workflow, /release_packages:\n(?:[^\n]*\n)*?        default: ''\n        type: string/u);
  assert.match(workflow, /branches: \[dev, main\]/u);
  assert.match(workflow, /github\.head_ref == 'dev'/u);
  const development = workflow.split('  dev-feedback-macos:\n')[1].split('  dev-feedback-windows:\n')[0];
  assert.match(development, /--discover current/u);
  assert.match(development, /BUILDR_DSH_BUILDR_PEER_INPUT/u);
  assert.ok(development.indexOf('--discover current') < development.indexOf('npm run test:changed'));
  const plugin = workflow.split('  plugin-source-candidate:\n')[1].split('  candidate-gate:\n')[0];
  assert.doesNotMatch(plugin, /id-token|npm-production|tools\/trusted-publish|npm publish/u);
  assert.match(plugin, /--buildr-peer/u);
  assert.match(plugin, /--candidate-manifest/u);
  assert.match(plugin, /ci --ignore-scripts/u);
  assert.doesNotMatch(plugin, /--omit=dev/u);
  assert.match(plugin, /run test:integration:candidate:release/u);
  assert.match(plugin, /'test\/contract\/release-\*\.test\.ts' 'test\/contract\/open-source-release\.test\.ts'/u);
  assert.match(plugin, /'test\/contract\/package-compatibility\.test\.ts'/u);
  assert.ok(plugin.indexOf('run artifacts:prepare') < plugin.indexOf('run test:integration:candidate:release'));
  assert.ok(plugin.indexOf('run test:integration:candidate:release') < plugin.indexOf('tools/verify-all.ts'));
  assert.match(plugin, /plugin-candidate-aggregate/u);
});
