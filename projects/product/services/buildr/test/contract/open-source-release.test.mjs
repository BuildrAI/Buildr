import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import {
  inspectCandidateFile,
  inspectPackageMetadata,
  inspectPackageVersionConsistency,
  inspectTarballFiles,
} from '../../test/verification/release/open-source-candidate.mjs';
import { resolveReleaseContract } from '../../scripts/release/release-contract.mjs';
import { extractReleaseNotes } from '../../scripts/release/release-notes.mjs';
import { ensureGitHubRelease } from '../../scripts/release/github-release-ensure.mjs';
import {
  assertRegistryArtifact,
  confirmRegistryRelease,
  registryVersionState,
  waitForRegistryRelease,
} from '../../scripts/release/registry-version-state.mjs';
import { cleanupReleaseSmokeRoot, resolveReleaseSmokeSource } from '../../test/verification/release/release-smoke.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');

test('open-source candidate content rules block secrets without echoing values', () => {
  const secret = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const findings = inspectCandidateFile('fixture.txt', secret);
  assert.equal(findings[0].rule, 'secret.private-key');
  assert.equal(JSON.stringify(findings).includes(secret), false);
  assert.equal(inspectCandidateFile('README.md', 'https://github.com/BuildrAI/Buildr').length, 0);
  assert.equal(inspectCandidateFile('fixture.md', 'buildr@example.com').length, 0);
  assert.equal(inspectCandidateFile('fixture.md', ['person', 'private.test'].join('@'))[0].rule, 'private.email-address');
});

test('open-source metadata and tarball contracts enforce public identity and inventory', () => {
  const valid = {
    name: '@buildr-ai/buildr',
    bin: { buildr: 'bin/buildr.mjs' },
    repository: { url: 'git+https://github.com/BuildrAI/Buildr.git', directory: 'projects/product/services/buildr' },
    homepage: 'https://github.com/BuildrAI/Buildr#readme',
    bugs: { url: 'https://github.com/BuildrAI/Buildr/issues' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
  };
  assert.deepEqual(inspectPackageMetadata(valid), []);
  assert.equal(inspectPackageMetadata({ ...valid, name: '@wrong/buildr' })[0].rule, 'package.identity');
  const files = [
    'LICENSE',
    'README.md',
    'package.json',
    'bin/buildr.mjs',
    'application-payload.json',
    'installation-origin.json',
    'runtime/buildr.cjs',
    'payload/product/package/manifest.yml',
    'payload/product/src/interfaces/local-app/web-dist/index.html',
  ].map((path) => ({ path }));
  assert.deepEqual(inspectTarballFiles(files), []);
  assert.equal(inspectTarballFiles([...files, { path: 'openspec/spec.md' }]).at(-1).rule, 'tarball.forbidden');
  assert.equal(inspectTarballFiles([...files, { path: 'src/application/self-bootstrap-closeout/self-bootstrap-closeout.mjs' }]).at(-1).rule, 'tarball.self-bootstrap-runner');
});

test('package and lockfile versions remain identical', () => {
  const metadata = { version: '0.1.0-rc.5' };
  const lockfile = { version: '0.1.0-rc.5', packages: { '': { version: '0.1.0-rc.5' } } };
  assert.deepEqual(inspectPackageVersionConsistency(metadata, lockfile), []);
  assert.equal(inspectPackageVersionConsistency(metadata, { ...lockfile, version: '0.1.0-rc.3' })[0].rule, 'package.version-lock');
  assert.equal(inspectPackageVersionConsistency(metadata, { ...lockfile, packages: { '': { version: '0.1.0-rc.3' } } })[0].rule, 'package.root-version-lock');
});

test('official registry version check distinguishes published, absent, and unavailable states', async () => {
  const published = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({
    status: 200,
    async json() {
      return {
        name: '@buildr-ai/buildr',
        version: '0.1.0-rc.1',
        dist: { integrity: 'sha512-fixture', shasum: 'fixture-sha1', tarball: 'https://registry.npmjs.org/package.tgz' },
      };
    },
  }));
  assert.equal(published.published, true);
  assert.equal(published.integrity, 'sha512-fixture');
  const absent = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 404 }));
  assert.equal(absent.published, false);
  await assert.rejects(
    registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 503 })),
    /HTTP 503/,
  );
});

test('official registry recovery compares artifact integrity and exact dist-tag', async () => {
  const responses = [
    {
      status: 200,
      async json() {
        return { name: '@buildr-ai/buildr', version: '0.1.0-rc.8', dist: { integrity: 'sha512-same' } };
      },
    },
    {
      status: 200,
      async json() {
        return { 'dist-tags': { next: '0.1.0-rc.8' } };
      },
    },
  ];
  const state = await confirmRegistryRelease({
    packageName: '@buildr-ai/buildr',
    version: '0.1.0-rc.8',
    npmTag: 'next',
    integrity: 'sha512-same',
    fetchImpl: async () => responses.shift(),
  });
  assert.equal(state.taggedVersion, '0.1.0-rc.8');
  assert.throws(
    () => assertRegistryArtifact({
      package: '@buildr-ai/buildr', version: '0.1.0-rc.8', published: true, integrity: 'sha512-other',
    }, {
      packageName: '@buildr-ai/buildr', version: '0.1.0-rc.8', integrity: 'sha512-same',
    }),
    /integrity mismatch/,
  );
});

test('official registry confirmation retries only within a bounded window', async () => {
  let attempts = 0;
  const state = await waitForRegistryRelease({
    packageName: '@buildr-ai/buildr', version: '0.1.0-rc.8', npmTag: 'next', integrity: 'sha512-same',
  }, {
    attempts: 2,
    delayMs: 0,
    sleep: async () => {},
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith('/0.1.0-rc.8')) {
        attempts += 1;
        if (attempts === 1) return { status: 404 };
        return {
          status: 200,
          async json() {
            return { name: '@buildr-ai/buildr', version: '0.1.0-rc.8', dist: { integrity: 'sha512-same' } };
          },
        };
      }
      return { status: 200, async json() { return { 'dist-tags': { next: '0.1.0-rc.8' } }; } };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(state.published, true);
});

test('release smoke selects one explicit immutable source', () => {
  assert.deepEqual(resolveReleaseSmokeSource({ BUILDR_RELEASE_PACKAGE_SPEC: '@buildr-ai/buildr@0.1.0-rc.8' }), {
    kind: 'official-registry',
    installTarget: '@buildr-ai/buildr@0.1.0-rc.8',
    expectedName: '@buildr-ai/buildr',
    expectedVersion: '0.1.0-rc.8',
    offline: false,
  });
  assert.throws(
    () => resolveReleaseSmokeSource({
      BUILDR_RELEASE_PACKAGE_SPEC: '@buildr-ai/buildr@0.1.0-rc.8',
      BUILDR_RELEASE_ARTIFACT_MANIFEST: '/tmp/release-artifact.json',
    }),
    /exactly one explicit package source/,
  );
  assert.throws(
    () => resolveReleaseSmokeSource({ BUILDR_RELEASE_PACKAGE_SPEC: '@buildr-ai/buildr@next' }),
    /requires exact/,
  );
});

test('release smoke cleanup reports retained temporary roots without masking verification', () => {
  const cleanupError = Object.assign(new Error('locked'), { code: 'EPERM' });
  const warnings = [];
  const retained = cleanupReleaseSmokeRoot('C:\\temporary\\release-smoke', {
    platform: 'win32',
    removeRoot() { throw cleanupError; },
    warn(message) { warnings.push(message); },
  });

  assert.equal(retained.status, 'retained');
  assert.equal(retained.error, cleanupError);
  assert.deepEqual(warnings, ['Buildr verification retained temporary root C:\\temporary\\release-smoke: EPERM']);

  assert.throws(() => cleanupReleaseSmokeRoot('C:\\temporary\\release-smoke', {
    platform: 'win32',
    removeRoot() { throw Object.assign(new Error('unexpected cleanup defect'), { code: 'EINVAL' }); },
  }), /unexpected cleanup defect/);

  const cleaned = cleanupReleaseSmokeRoot('/tmp/release-smoke', { removeRoot() {} });
  assert.deepEqual(cleaned, { status: 'cleaned', root: '/tmp/release-smoke' });
});

test('GitHub Release ensure reuses an exact release and fails closed on drift', async () => {
  const expected = {
    repository: 'BuildrAI/Buildr',
    tag: 'v0.1.0-rc.8',
    title: 'v0.1.0-rc.8',
    body: 'release notes\n',
    prerelease: true,
    targetCommit: 'commit-sha',
  };
  const release = {
    tag_name: expected.tag,
    name: expected.title,
    body: expected.body,
    draft: false,
    prerelease: true,
  };
  const responses = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json() { return release; } },
    { status: 200, async json() { return { tag_name: 'v0.1.0' }; } },
  ];
  const result = await ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => responses.shift() });
  assert.equal(result.action, 'reused');

  const drifted = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json() { return { ...release, body: 'wrong\n' }; } },
  ];
  await assert.rejects(
    ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => drifted.shift() }),
    /body does not match/,
  );

  const binaryAsset = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json() { return { ...release, assets: [{ name: 'buildr.pkg' }] }; } },
  ];
  await assert.rejects(
    ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => binaryAsset.shift() }),
    /must not contain binary Assets/,
  );
});

test('GitHub Release ensure creates only a missing release', async () => {
  const expected = {
    repository: 'BuildrAI/Buildr', tag: 'v0.1.0', title: 'v0.1.0', body: 'stable\n', prerelease: false, targetCommit: 'commit-sha',
  };
  const requests = [];
  const responses = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 404 },
    { status: 201, async json() { return { tag_name: expected.tag, name: expected.title, body: expected.body, draft: false, prerelease: false }; } },
    { status: 200, async json() { return { tag_name: expected.tag }; } },
  ];
  const result = await ensureGitHubRelease(expected, {
    token: 'fixture',
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      return responses.shift();
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(requests.filter((request) => request.method === 'POST').length, 1);
});

test('GitHub Release metadata preflight is read-only for missing state and fails closed on drift', async () => {
  const expected = {
    repository: 'BuildrAI/Buildr', tag: 'v0.1.0', title: 'v0.1.0', body: 'stable\n', prerelease: false, targetCommit: 'commit-sha',
  };
  const requests = [];
  const missingResponses = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 404 },
  ];
  const missing = await ensureGitHubRelease(expected, {
    token: 'fixture', mode: 'preflight',
    fetchImpl: async (url, options) => { requests.push({ url, method: options.method }); return missingResponses.shift(); },
  });
  assert.equal(missing.action, 'release-missing');
  assert.equal(missing.mutation, false);
  assert.equal(requests.every((request) => request.method === 'GET'), true);

  const newerLatest = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 200, async json() { return { tag_name: 'v0.2.0' }; } },
  ];
  await assert.rejects(ensureGitHubRelease(expected, {
    token: 'fixture', mode: 'preflight', fetchImpl: async () => newerLatest.shift(),
  }), /cannot replace existing Latest v0\.2\.0/);

  const driftResponses = [
    { status: 200, async json() { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json() { return { tag_name: expected.tag, name: 'drift', body: expected.body, draft: false, prerelease: false }; } },
  ];
  await assert.rejects(ensureGitHubRelease(expected, {
    token: 'fixture', mode: 'preflight', fetchImpl: async () => driftResponses.shift(),
  }), /title does not match/);
});

test('release contract maps prerelease to next and stable to latest', () => {
  assert.deepEqual(resolveReleaseContract('0.1.0-rc.1', 'v0.1.0-rc.1'), {
    version: '0.1.0-rc.1', refName: 'v0.1.0-rc.1', npmTag: 'next', prerelease: true,
  });
  assert.equal(resolveReleaseContract('0.1.0', 'v0.1.0').npmTag, 'latest');
  assert.throws(() => resolveReleaseContract('0.1.0', 'v0.1.1'), /does not match/);
  const formal = resolveReleaseContract('0.1.0', 'v0.1.0', {
    sourceCommit: 'a'.repeat(40),
    protocolIdentity: 'buildr.web-protocol/v1',
    enginesNode: '>=24.15.0 <25',
    releaseNotes: 'notes\n',
  });
  assert.equal(formal.schemaVersion, 'buildr.release-contract/v2');
  assert.deepEqual(formal.distribution, {
    channel: 'npm', registry: 'https://registry.npmjs.org/', package: '@buildr-ai/buildr',
  });
  assert.equal(formal.github.binaryAssets, false);
  assert.deepEqual(formal.publishAuthority, {
    provider: 'github-actions',
    repository: 'BuildrAI/Buildr',
    workflow: 'publish.yml',
    environment: 'npm-production',
    allowedActions: ['npm publish'],
  });
  for (const retired of ['productNodeVersion', 'platformTargets', 'generation', 'previousPlatformRelease']) {
    assert.equal(Object.hasOwn(formal, retired), false, retired);
  }
});

test('release notes extract the exact target changelog section', () => {
  const changelog = `# Changelog

## 0.1.0-rc.2 - 2026-07-14

- Added release notes.
- Fixed projection cleanup.

## 0.1.0-rc.1 - 2026-07-13

- Initial candidate.
`;
  const notes = extractReleaseNotes(changelog, '0.1.0-rc.2');
  assert.equal(notes, `## 0.1.0-rc.2 - 2026-07-14

- Added release notes.
- Fixed projection cleanup.
`);
  assert.equal(notes.includes('Initial candidate'), false);
});

test('release notes fail closed for missing, duplicate, or empty target sections', () => {
  assert.throws(
    () => extractReleaseNotes('# Changelog\n', '0.1.0-rc.2'),
    /missing release section ## 0\.1\.0-rc\.2 - <YYYY-MM-DD>/,
  );
  assert.throws(
    () => extractReleaseNotes(`## 0.1.0-rc.2 - 2026-07-14

- First

## 0.1.0-rc.2 - 2026-07-15

- Second
`, '0.1.0-rc.2'),
    /duplicate release sections/,
  );
  assert.throws(
    () => extractReleaseNotes(`## 0.1.0-rc.2 - 2026-07-14

<!-- pending -->

## 0.1.0-rc.1 - 2026-07-13

- Initial
`, '0.1.0-rc.2'),
    /has no content/,
  );
});

test('publish workflow isolates credential-free OIDC probe from tag-gated npm release', () => {
  const workflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  const parsed = YAML.parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(parsed.errors, [], parsed.errors.map((error) => error.message).join('\n'));
  const document = parsed.toJS();
  for (const required of [
    'tags:', 'workflow_dispatch:', 'authority-probe:', 'id-token: write', 'environment: npm-production',
    'release-authority-oidc-probe.mjs', 'release-authority-probe-${{ github.run_id }}-${{ github.run_attempt }}',
    'release-contract.mjs', 'release-notes.mjs', 'application-payload.mjs build',
    'release-artifact.mjs',
    'registry-version-state.mjs', "steps.registry_before.outputs.published != 'true'",
    'trusted-publish.mjs', 'github-release-ensure.mjs',
    'github-release-ensure.mjs preflight',
    'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC',
    '--manifest', '--require-published', '--wait', 'macos-15', 'windows-2025',
    'contract:', 'candidate:', 'host-node:', 'launcher:', 'publish:',
    'name: npm-candidate-${{ github.ref_name }}',
  ]) assert.equal(workflow.includes(required), true, required);
  assert.deepEqual(Object.keys(document.on).sort(), ['push', 'workflow_dispatch']);
  assert.equal(document.jobs['authority-probe'].if, "github.event_name == 'workflow_dispatch'");
  assert.equal(document.jobs['authority-probe'].environment, 'npm-production');
  assert.equal(document.jobs['authority-probe'].permissions['id-token'], 'write');
  assert.equal(document.jobs['authority-probe'].steps.filter((step) => typeof step.run === 'string' && step.run.includes('release-authority-oidc-probe.mjs')).length, 1);
  for (const job of ['contract', 'candidate', 'host-node', 'launcher', 'publish']) assert.equal(document.jobs[job].if, "github.event_name == 'push'", job);
  const hostNodeSteps = document.jobs['host-node'].steps;
  const checkoutIndex = hostNodeSteps.findIndex((step) => step.uses === 'actions/checkout@v7');
  const setupNodeIndex = hostNodeSteps.findIndex((step) => step.uses === 'actions/setup-node@v6');
  const installIndex = hostNodeSteps.findIndex((step) => step.run === 'npm ci');
  const downloadIndex = hostNodeSteps.findIndex((step) => step.uses === 'actions/download-artifact@v7');
  const verifierIndex = hostNodeSteps.findIndex((step) => typeof step.run === 'string' && step.run.includes('test/verification/host-node.mjs'));
  assert.equal(checkoutIndex < setupNodeIndex, true);
  assert.equal(setupNodeIndex < installIndex, true);
  assert.equal(installIndex < downloadIndex, true);
  assert.equal(downloadIndex < verifierIndex, true);
  assert.equal(document.jobs['host-node'].needs.includes('candidate'), true);
  assert.equal(hostNodeSteps.some((step) => typeof step.run === 'string' && step.run.includes('npm pack')), false);
  const probeRuns = document.jobs['authority-probe'].steps.map((step) => step.run).filter((value) => typeof value === 'string').join('\n');
  for (const forbidden of ['npm publish', 'trusted-publish.mjs', 'npm pack', 'release-artifact.mjs', 'github-release-ensure.mjs']) assert.equal(probeRuns.includes(forbidden), false, forbidden);
  assert.equal(workflow.includes('NODE_AUTH_TOKEN'), false);
  assert.equal(workflow.includes('NPM_TOKEN'), false);
  assert.equal(workflow.includes('--generate-notes'), false);
  assert.equal(workflow.includes('./scripts/verify-buildr-product'), false);
  assert.equal(workflow.includes('gh release create'), false);
  for (const retired of [
    'environment: platform-production', 'node-distribution.mjs', 'sea-build.mjs',
    'build-pkg.mjs', 'build-msi.mjs', 'release-manifest.mjs',
    'github-release-asset-ensure.mjs', 'public-release-readback.mjs',
    '.pkg', '.msi', 'postject', 'codesign', 'notar', 'signtool',
  ]) assert.equal(workflow.includes(retired), false, retired);
  assert.equal((workflow.match(/npm publish/g) || []).length, 0);
  assert.equal((workflow.match(/trusted-publish\.mjs/g) || []).length, 1);
  assert.equal((workflow.match(/node scripts\/release\/release-artifact\.mjs/g) || []).length, 1);
  assert.equal((workflow.match(/release-smoke\.mjs/g) || []).length, 3);
  assert.equal((workflow.match(/application-payload\.mjs build/g) || []).length, 1);
  assert.equal(workflow.includes('npm-candidate-${{ github.ref_name }}-${{ github.run_attempt }}'), false);
  assert.equal(workflow.includes('Validate restored bytes or declare the candidate missing'), true);
  const contract = workflow.indexOf('\n  contract:');
  const candidate = workflow.indexOf('\n  candidate:');
  const hostNode = workflow.indexOf('\n  host-node:');
  const launcher = workflow.indexOf('\n  launcher:');
  const publish = workflow.indexOf('\n  publish:');
  const registryCheck = workflow.indexOf('Check official Registry artifact');
  const metadataPreflight = workflow.indexOf('Preflight GitHub Release metadata without assets or mutation');
  const npmPublish = workflow.indexOf('Publish the frozen npm tarball');
  const registryConfirm = workflow.indexOf('Confirm official Registry integrity and dist-tag');
  const releaseEnsure = workflow.indexOf('Ensure GitHub Release notes without binary Assets');
  assert.equal(contract < candidate, true);
  assert.equal(candidate < hostNode, true);
  assert.equal(hostNode < launcher, true);
  assert.equal(launcher < publish, true);
  assert.equal(metadataPreflight < registryCheck, true);
  assert.equal(registryCheck < npmPublish, true);
  assert.equal(npmPublish < registryConfirm, true);
  assert.equal(registryConfirm < releaseEnsure, true);
});

test('CI and publish workflows use the supported Node runtime', () => {
  const verifyWorkflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/verify.yml'), 'utf8');
  const publishWorkflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  const verifyDocument = YAML.parseDocument(verifyWorkflow, { uniqueKeys: true }).toJS();
  const hostNodeSmoke = fs.readFileSync(path.join(serviceRoot, 'test/verification/host-node/cli-smoke.mjs'), 'utf8');
  assert.deepEqual(Object.keys(verifyDocument.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(verifyDocument.on.pull_request.branches, ['dev', 'main']);
  assert.equal(verifyDocument.on.push, undefined);
  assert.equal(verifyDocument.jobs['dev-feedback'].if, "github.event_name == 'pull_request' && github.base_ref == 'dev'");
  assert.equal(verifyDocument.jobs['candidate-preflight'].if, "github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'dev')");
  assert.equal(verifyDocument.jobs['candidate-gate'].if, "always() && (github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'dev'))");
  assert.match(verifyWorkflow, /os: \[macos-latest, windows-latest\]/);
  assert.match(verifyWorkflow, /github\.base_ref == 'dev'/);
  assert.match(verifyWorkflow, /github\.base_ref == 'main'/);
  assert.match(verifyWorkflow, /github\.head_ref == 'dev'/);
  assert.doesNotMatch(verifyWorkflow, /^  release-smoke:/m);
  assert.equal((verifyWorkflow.match(/npm run test:candidate:ci/g) || []).length, 4);
  assert.equal((verifyWorkflow.match(/npm run test:candidate:host/g) || []).length, 1);
  assert.equal((verifyWorkflow.match(/npm run test:candidate:aggregate/g) || []).length, 1);
  assert.match(hostNodeSmoke, /verifyWorkspaceOwnedRuntime/);
  assert.match(hostNodeSmoke, /expectedMainRole: 'host'/);
  assert.match(hostNodeSmoke, /expectedChannel: 'npm'/);
  assert.match(verifyWorkflow, /^  candidate-preflight:/m);
  assert.match(verifyWorkflow, /^  candidate-artifact:/m);
  assert.match(verifyWorkflow, /^  candidate-windows:/m);
  assert.match(verifyWorkflow, /^  candidate-gate:/m);
  assert.match(verifyWorkflow, /node-version: 24\.15\.0/);
  assert.match(verifyWorkflow, /node: 24\.x/);
  assert.equal((verifyWorkflow.match(/release-tarball-smoke/g) || []).length, 0);
  assert.match(verifyWorkflow, /BUILDR_VERIFICATION_PROFILE: ci-workspace-limited/);
  assert.match(publishWorkflow, /node-version: "24\.15\.0"/);
  assert.doesNotMatch(`${verifyWorkflow}\n${publishWorkflow}`, /node-version: ?(?:20|22)|node: \[20, 22\]/);
});

test('Buildr release Skill fixes release identity, dependency preparation, and tree-gated history bridging', () => {
  const skill = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-release/SKILL.md'), 'utf8');
  const preparation = skill.slice(skill.indexOf('## 准备发布'), skill.indexOf('## 发布版本'));
  const release = skill.slice(skill.indexOf('## 发布版本'), skill.indexOf('## 中断与失败恢复'));
  const identity = skill.indexOf('tasks/release-<version>');
  const npmCi = skill.indexOf('`npm ci`');
  const versionMutation = skill.indexOf('`package.json`');
  const candidateTree = skill.indexOf('candidate tree identity');
  const localCliInstall = skill.indexOf('scripts/install-buildr-cli');
  const bridge = skill.indexOf('bridge-main-to-dev.mjs');
  const postReleaseCleanup = skill.indexOf('必须进入发布后清理检查');
  for (const [name, value] of Object.entries({ identity, npmCi, versionMutation, candidateTree, localCliInstall, bridge, postReleaseCleanup })) {
    assert.notEqual(value, -1, name);
  }
  assert.equal(identity < npmCi, true);
  assert.equal(npmCi < versionMutation, true);
  assert.equal(candidateTree < bridge, true);
  assert.equal(localCliInstall < bridge, true);
  for (const required of [
    'release-<version>', '<workspace-root>/.worktrees/release-<version>',
    'origin/main^{tree}', 'origin/dev^{tree}', 'force push', 'tree gate',
    'release-notes.mjs', 'GitHub Release body', '不是 Latest',
    'projects/product/buildr version --json', 'projects/product/buildr --help', 'projects/product/buildr doctor --agent <agent>',
    '不得调用`scripts/install-buildr-cli`', '不得读取、创建、覆盖或要求PATH默认`buildr`绑定checkout',
    'npm发布身份由候选tarball验证与发布后官方registry精确安装smoke独立证明',
    '展示待删除 ref、commit', '请求用户明确授权删除',
    '重新查询远端确认 ref 不存在', '清理 follow-up',
    '不得把长期保留当作默认结果', '未取得删除授权时必须明确报告待清理项',
    '只执行一次 `npm pack`', '`npm publish <tarball>`', '`dist.integrity`',
    'release-authority-probe-runner.mjs', 'GitHub-hosted authority probe',
    '--authority-evidence <authority-evidence.json>', '不得回退本机 token publish',
    'GitHub Release 使用 ensure 语义', '安装精确 `@buildr-ai/buildr@<version>`',
    '不删除 tag、不 unpublish、不重复 publish',
    '`Candidate gate`', '普通发布准备不再无条件本地运行完整`test:candidate`',
    '重新运行失败作业', '三个Windows高成本shard继续并行',
  ]) assert.equal(skill.includes(required), true, required);
  assert.equal(preparation.includes('release-authority-probe-runner.mjs'), false);
  assert.equal(preparation.includes('--stage post-main'), true);
  assert.equal(preparation.includes('--authority-evidence'), false);
  assert.equal(release.includes('release-authority-probe-runner.mjs'), true);
  assert.equal(release.includes('--stage pre-tag --authority-evidence <authority-evidence.json>'), true);
  for (const retired of ['npm trust list @buildr-ai/buildr --json', 'npm 11.15+ authenticated maintainer session', 'authenticated authority evidence']) assert.equal(skill.includes(retired), false, retired);
});
