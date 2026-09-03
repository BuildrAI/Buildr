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
} from '../../test/verification/release/open-source-candidate.ts';
import { resolveReleaseContract } from '../../tools/release/release-contract.ts';
import { extractReleaseNotes } from '../../tools/release/release-notes.ts';
import { ensureGitHubRelease } from '../../tools/release/github-release-ensure.ts';
import {
  assertRegistryArtifact,
  assertRegistryTagTransition,
  confirmRegistryRelease,
  registryDistTagsState,
  registryVersionState,
  waitForRegistryRelease,
} from '../../tools/release/registry-version-state.ts';
import { cleanupReleaseSmokeRoot, resolveReleaseSmokeSource } from '../../test/verification/release/release-smoke.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');

function tagSnapshot(latest: any, next: any): any  {
  return {
    schemaVersion: 'buildr.registry-dist-tags/v1',
    package: '@buildr-ai/buildr',
    tags: { latest, next },
    registry: 'https://registry.npmjs.org/',
  };
}

test('open-source candidate content rules block secrets without echoing values', () => {
  const secret: any = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const findings: any = inspectCandidateFile('fixture.txt', secret);
  assert.equal(findings[0].rule, 'secret.private-key');
  assert.equal(JSON.stringify(findings).includes(secret), false);
  assert.equal(inspectCandidateFile('README.md', 'https://github.com/BuildrAI/Buildr').length, 0);
  assert.equal(inspectCandidateFile('fixture.md', 'buildr@example.com').length, 0);
  assert.equal(inspectCandidateFile('fixture.md', ['person', 'private.test'].join('@'))[0].rule, 'private.email-address');
});

test('open-source metadata and tarball contracts enforce public identity and inventory', () => {
  const valid: any = {
    name: '@buildr-ai/buildr',
    bin: { buildr: 'bin/buildr.mjs' },
    repository: { url: 'git+https://github.com/BuildrAI/Buildr.git', directory: 'projects/product/services/buildr' },
    homepage: 'https://github.com/BuildrAI/Buildr#readme',
    bugs: { url: 'https://github.com/BuildrAI/Buildr/issues' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
  };
  assert.deepEqual(inspectPackageMetadata(valid), []);
  assert.equal(inspectPackageMetadata({ ...valid, name: '@wrong/buildr' })[0].rule, 'package.identity');
  const files: any = [
    'LICENSE',
    'README.md',
    'package.json',
    'bin/buildr.mjs',
    'application-payload.json',
    'installation-origin.json',
    'runtime/buildr.cjs',
    'payload/product/resources/manifest.yml',
    'payload/product/web-dist/index.html',
  ].map((path: any) => ({ path }));
  assert.deepEqual(inspectTarballFiles(files), []);
  assert.equal(inspectTarballFiles([...files, { path: 'openspec/spec.md' }]).at(-1).rule, 'tarball.forbidden');
  assert.equal(inspectTarballFiles([...files, { path: 'src/application/self-bootstrap-closeout/self-bootstrap-closeout.mjs' }]).at(-1).rule, 'tarball.self-bootstrap-runner');
});

test('package and lockfile versions remain identical', () => {
  const metadata: any = { version: '0.1.0-rc.5' };
  const lockfile: any = { version: '0.1.0-rc.5', packages: { '': { version: '0.1.0-rc.5' } } };
  assert.deepEqual(inspectPackageVersionConsistency(metadata, lockfile), []);
  assert.equal(inspectPackageVersionConsistency(metadata, { ...lockfile, version: '0.1.0-rc.3' })[0].rule, 'package.version-lock');
  assert.equal(inspectPackageVersionConsistency(metadata, { ...lockfile, packages: { '': { version: '0.1.0-rc.3' } } })[0].rule, 'package.root-version-lock');
});

test('official registry version check distinguishes published, absent, and unavailable states', async () => {
  const published: any = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({
    status: 200,
    async json(): Promise<any>  {
      return {
        name: '@buildr-ai/buildr',
        version: '0.1.0-rc.1',
        dist: { integrity: 'sha512-fixture', shasum: 'fixture-sha1', tarball: 'https://registry.npmjs.org/package.tgz' },
      };
    },
  }));
  assert.equal(published.published, true);
  assert.equal(published.integrity, 'sha512-fixture');
  const absent: any = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 404 }));
  assert.equal(absent.published, false);
  await assert.rejects(
    registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 503 })),
    /HTTP 503/,
  );
});

test('official registry recovery compares artifact integrity and both dist-tags', async () => {
  const responses: any[] = [
    {
      status: 200,
      async json(): Promise<any>  {
        return { name: '@buildr-ai/buildr', version: '0.1.0-rc.8', dist: { integrity: 'sha512-same' } };
      },
    },
    {
      status: 200,
      async json(): Promise<any>  {
        return { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.8' } };
      },
    },
  ];
  const state: any = await confirmRegistryRelease({
    packageName: '@buildr-ai/buildr',
    version: '0.1.0-rc.8',
    npmTag: 'next',
    integrity: 'sha512-same',
    beforeTags: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.7'),
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
  let attempts: any = 0;
  const state: any = await waitForRegistryRelease({
    packageName: '@buildr-ai/buildr', version: '0.1.0-rc.8', npmTag: 'next', integrity: 'sha512-same',
    beforeTags: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.7'),
  }, {
    attempts: 2,
    delayMs: 0,
    sleep: async () => {},
    fetchImpl: async (url: any) => {
      if (new URL(url).pathname.endsWith('/0.1.0-rc.8')) {
        attempts += 1;
        if (attempts === 1) return { status: 404 };
        return {
          status: 200,
          async json(): Promise<any>  {
            return { name: '@buildr-ai/buildr', version: '0.1.0-rc.8', dist: { integrity: 'sha512-same' } };
          },
        };
      }
      return { status: 200, async json(): Promise<any>  { return { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.8' } }; } };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(state.published, true);
});

test('release tag transition only advances the selected GA or RC tag', async () => {
  const observed: any = await registryDistTagsState('@buildr-ai/buildr', async () => ({
    status: 200,
    async json(): Promise<any>  { return { 'dist-tags': { latest: '0.1.0', next: '0.2.0-rc.1' } }; },
  }));
  assert.deepEqual(observed.tags, { latest: '0.1.0', next: '0.2.0-rc.1' });

  assert.deepEqual(assertRegistryTagTransition({
    packageName: '@buildr-ai/buildr', version: '0.1.0-rc.13', npmTag: 'next',
    before: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.12'),
    after: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.13'),
  }), {
    targetTag: 'next', targetVersion: '0.1.0-rc.13', unchangedTag: 'latest', unchangedVersion: '0.1.0-rc.1',
  });
  assert.deepEqual(assertRegistryTagTransition({
    packageName: '@buildr-ai/buildr', version: '0.1.0', npmTag: 'latest',
    before: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.13'),
    after: tagSnapshot('0.1.0', '0.1.0-rc.13'),
  }).unchangedTag, 'next');
  assert.throws(() => assertRegistryTagTransition({
    packageName: '@buildr-ai/buildr', version: '0.1.0', npmTag: 'next',
    before: tagSnapshot(null, '0.1.0-rc.13'), after: tagSnapshot(null, '0.1.0'),
  }), /must publish to latest/);
  assert.throws(() => assertRegistryTagTransition({
    packageName: '@buildr-ai/buildr', version: '0.1.0-rc.13', npmTag: 'next',
    before: tagSnapshot('0.1.0-rc.1', '0.1.0-rc.12'),
    after: tagSnapshot('0.1.0-rc.2', '0.1.0-rc.13'),
  }), /non-target dist-tag latest changed/);
  assert.throws(() => assertRegistryTagTransition({
    packageName: '@buildr-ai/buildr', version: '0.1.0-rc.13', npmTag: 'next',
    before: tagSnapshot('0.1.0', '0.1.0'), after: tagSnapshot('0.1.0', '0.1.0-rc.13'),
  }), /next points to stable version/);
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
  const cleanupError: any = Object.assign(new Error('locked'), { code: 'EPERM' });
  const warnings: any[] = [];
  const retained: any = cleanupReleaseSmokeRoot('C:\\temporary\\release-smoke', {
    platform: 'win32',
    removeRoot(): any  { throw cleanupError; },
    warn(message: any): any  { warnings.push(message); },
  });

  assert.equal(retained.status, 'retained');
  assert.equal(retained.error, cleanupError);
  assert.deepEqual(warnings, ['Buildr verification retained temporary root C:\\temporary\\release-smoke: EPERM']);

  assert.throws(() => cleanupReleaseSmokeRoot('C:\\temporary\\release-smoke', {
    platform: 'win32',
    removeRoot(): any  { throw Object.assign(new Error('unexpected cleanup defect'), { code: 'EINVAL' }); },
  }), /unexpected cleanup defect/);

  const cleaned: any = cleanupReleaseSmokeRoot('/tmp/release-smoke', { removeRoot(): any  {} });
  assert.deepEqual(cleaned, { status: 'cleaned', root: '/tmp/release-smoke' });
});

test('GitHub Release ensure reuses an exact release and fails closed on drift', async () => {
  const expected: any = {
    repository: 'BuildrAI/Buildr',
    tag: 'v0.1.0-rc.8',
    title: 'v0.1.0-rc.8',
    body: 'release notes\n',
    prerelease: true,
    targetCommit: 'commit-sha',
  };
  const release: any = {
    tag_name: expected.tag,
    name: expected.title,
    body: expected.body,
    draft: false,
    prerelease: true,
  };
  const responses: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json(): Promise<any>  { return release; } },
    { status: 200, async json(): Promise<any>  { return { tag_name: 'v0.1.0' }; } },
  ];
  const result: any = await ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => responses.shift() });
  assert.equal(result.action, 'reused');

  const drifted: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json(): Promise<any>  { return { ...release, body: 'wrong\n' }; } },
  ];
  await assert.rejects(
    ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => drifted.shift() }),
    /body does not match/,
  );

  const binaryAsset: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json(): Promise<any>  { return { ...release, assets: [{ name: 'buildr.pkg' }] }; } },
  ];
  await assert.rejects(
    ensureGitHubRelease(expected, { token: 'fixture', fetchImpl: async () => binaryAsset.shift() }),
    /must not contain binary Assets/,
  );
});

test('GitHub Release ensure creates only a missing release', async () => {
  const expected: any = {
    repository: 'BuildrAI/Buildr', tag: 'v0.1.0', title: 'v0.1.0', body: 'stable\n', prerelease: false, targetCommit: 'commit-sha',
  };
  const requests: any[] = [];
  const responses: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 404 },
    { status: 201, async json(): Promise<any>  { return { tag_name: expected.tag, name: expected.title, body: expected.body, draft: false, prerelease: false }; } },
    { status: 200, async json(): Promise<any>  { return { tag_name: expected.tag }; } },
  ];
  const result: any = await ensureGitHubRelease(expected, {
    token: 'fixture',
    fetchImpl: async (url: any, options: any) => {
      requests.push({ url, method: options.method });
      return responses.shift();
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(requests.filter((request: any) => request.method === 'POST').length, 1);
});

test('GitHub Release metadata preflight is read-only for missing state and fails closed on drift', async () => {
  const expected: any = {
    repository: 'BuildrAI/Buildr', tag: 'v0.1.0', title: 'v0.1.0', body: 'stable\n', prerelease: false, targetCommit: 'commit-sha',
  };
  const requests: any[] = [];
  const missingResponses: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 404 },
  ];
  const missing: any = await ensureGitHubRelease(expected, {
    token: 'fixture', mode: 'preflight',
    fetchImpl: async (url: any, options: any) => { requests.push({ url, method: options.method }); return missingResponses.shift(); },
  });
  assert.equal(missing.action, 'release-missing');
  assert.equal(missing.mutation, false);
  assert.equal(requests.every((request: any) => request.method === 'GET'), true);

  const newerLatest: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 404 },
    { status: 200, async json(): Promise<any>  { return { tag_name: 'v0.2.0' }; } },
  ];
  await assert.rejects(ensureGitHubRelease(expected, {
    token: 'fixture', mode: 'preflight', fetchImpl: async () => newerLatest.shift(),
  }), /cannot replace existing Latest v0\.2\.0/);

  const driftResponses: any[] = [
    { status: 200, async json(): Promise<any>  { return { object: { type: 'commit', sha: 'commit-sha' } }; } },
    { status: 200, async json(): Promise<any>  { return { tag_name: expected.tag, name: 'drift', body: expected.body, draft: false, prerelease: false }; } },
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
  const formal: any = resolveReleaseContract('0.1.0', 'v0.1.0', {
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
  const changelog: any = `# Changelog

## 0.1.0-rc.2 - 2026-07-14

- Added release notes.
- Fixed projection cleanup.

## 0.1.0-rc.1 - 2026-07-13

- Initial candidate.
`;
  const notes: any = extractReleaseNotes(changelog, '0.1.0-rc.2');
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

test('publish workflow uses one dispatch and one protected release transaction', () => {
  const workflow: any = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  const parsed: any = YAML.parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(parsed.errors, [], parsed.errors.map((error: any) => error.message).join('\n'));
  const document: any = parsed.toJS();
  for (const required of [
    'workflow_dispatch:', 'release_id:', 'release_context:', 'context_digest:', 'candidate_run_id:', 'source_commit:', 'candidate_base:', 'candidate_tree:', 'workflow_sha256:',
    'id-token: write', 'contents: write', 'environment: npm-production',
    'release-authority-oidc-probe.ts', 'release-convergence.ts', '--stage pre-tag',
    'release-tag-ensure.ts preflight', 'release-tag-ensure.ts ensure',
    'release-contract.ts', 'release-notes.ts',
    'release-readiness.ts validate-context', 'release-readiness.ts evaluate', 'release-transaction-evidence.ts finalize', 'release-transaction-evidence.json',
    'registry-version-state.ts', "steps.registry_before.outputs.published != 'true'",
    'trusted-publish.ts', 'github-release-ensure.ts',
    'github-release-ensure.ts preflight',
    'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC',
    '--manifest', '--require-published', '--wait', 'macos-15', 'windows-2025',
    'contract:', 'candidate:', 'host-node:', 'launcher:', 'release:',
    'name: candidate-aggregate', 'name: candidate-package', 'run-id: ${{ inputs.candidate_run_id }}',
    'releaseContextIdentity(aggregate)',
  ]) assert.equal(workflow.includes(required), true, required);
  assert.deepEqual(Object.keys(document.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(document.on.workflow_dispatch.inputs).sort(), ['candidate_base', 'candidate_run_id', 'candidate_tree', 'context_digest', 'release_context', 'release_id', 'source_commit', 'version', 'workflow_sha256']);
  assert.equal(document.on.push, undefined);
  assert.equal(document.jobs['authority-probe'], undefined);
  const protectedJobs: any = Object.entries(document.jobs).filter(([, job]: any) => job.environment !== undefined);
  assert.deepEqual(protectedJobs.map(([id, job]: any) => [id, job.environment]), [['release', 'npm-production']]);
  assert.equal(document.jobs.release.permissions['id-token'], 'write');
  assert.equal(document.jobs.release.permissions.contents, 'write');
  assert.deepEqual([...document.jobs.release.needs].sort(), ['candidate', 'contract', 'host-node', 'launcher']);
  for (const job of ['contract', 'candidate', 'host-node', 'launcher']) {
    assert.equal(document.jobs[job].environment, undefined, job);
    assert.notEqual(document.jobs[job].permissions?.['id-token'], 'write', job);
    assert.notEqual(document.jobs[job].permissions?.contents, 'write', job);
    const checkout: any = document.jobs[job].steps.find((step: any) => step.uses === 'actions/checkout@v7');
    assert.equal(checkout.with.ref, '${{ inputs.source_commit }}', job);
  }
  const hostNodeSteps: any = document.jobs['host-node'].steps;
  const checkoutIndex: any = hostNodeSteps.findIndex((step: any) => step.uses === 'actions/checkout@v7');
  const setupNodeIndex: any = hostNodeSteps.findIndex((step: any) => step.uses === 'actions/setup-node@v6');
  const installIndex: any = hostNodeSteps.findIndex((step: any) => step.run === 'npm ci');
  const downloadIndex: any = hostNodeSteps.findIndex((step: any) => step.uses === 'actions/download-artifact@v7');
  const verifierIndex: any = hostNodeSteps.findIndex((step: any) => typeof step.run === 'string' && step.run.includes('test/verification/host-node.ts'));
  const verifierStep: any = hostNodeSteps[verifierIndex];
  assert.equal(checkoutIndex < setupNodeIndex, true);
  assert.equal(setupNodeIndex < installIndex, true);
  assert.equal(installIndex < downloadIndex, true);
  assert.equal(downloadIndex < verifierIndex, true);
  for (const binding of [
    'BUILDR_CANDIDATE_TARBALL=',
    'BUILDR_CANDIDATE_PACK_METADATA="${RUNNER_TEMP}/candidate/npm-pack.json"',
    'BUILDR_CANDIDATE_RELEASE_MANIFEST="${RUNNER_TEMP}/candidate/release-artifact.json"',
  ]) assert.equal(verifierStep.run.includes(binding), true, binding);
  assert.equal(document.jobs['host-node'].needs.includes('candidate'), true);
  assert.equal(hostNodeSteps.some((step: any) => typeof step.run === 'string' && step.run.includes('npm pack')), false);
  assert.equal(workflow.includes('NODE_AUTH_TOKEN'), false);
  assert.equal(workflow.includes('NPM_TOKEN'), false);
  assert.equal(workflow.includes('--generate-notes'), false);
  assert.equal(workflow.includes('./test/verification/verify-buildr-product'), false);
  assert.equal(workflow.includes('gh release create'), false);
  for (const retired of [
    'environment: platform-production', 'node-distribution.mjs', 'sea-build.ts',
    'build-pkg.mjs', 'build-msi.mjs', 'release-manifest.mjs',
    'github-release-asset-ensure.mjs', 'public-release-readback.mjs',
    '.pkg', '.msi', 'postject', 'codesign', 'notar', 'signtool',
  ]) assert.equal(workflow.includes(retired), false, retired);
  assert.equal((workflow.match(/npm publish/g) || []).length, 0);
  assert.equal((workflow.match(/trusted-publish\.ts/g) || []).length, 1);
  assert.equal((workflow.match(/node tools\/release\/release-artifact\.mjs/g) || []).length, 0);
  assert.equal((workflow.match(/release-smoke\.ts/g) || []).length, 2);
  assert.equal((workflow.match(/application-payload\.mjs build/g) || []).length, 0);
  assert.equal((workflow.match(/npm pack/g) || []).length, 0);
  assert.equal(workflow.includes('npm-candidate-${{ github.ref_name }}-${{ github.run_attempt }}'), false);
  assert.equal(workflow.includes('Validate matching Candidate aggregate and immutable bytes'), true);
  const contract: any = workflow.indexOf('\n  contract:');
  const candidate: any = workflow.indexOf('\n  candidate:');
  const hostNode: any = workflow.indexOf('\n  host-node:');
  const launcher: any = workflow.indexOf('\n  launcher:');
  const release: any = workflow.indexOf('\n  release:');
  const authority: any = workflow.indexOf('Prove current hosted publishing authority without retaining credentials');
  const convergence: any = workflow.indexOf('Recheck final source and authority convergence before tag mutation');
  const tagPreflight: any = workflow.indexOf('Preflight immutable release tag');
  const registryCheck: any = workflow.indexOf('Snapshot official Registry artifact and both dist-tags');
  const tagEnsure: any = workflow.indexOf('Create or reuse the immutable release tag');
  const metadataPreflight: any = workflow.indexOf('Preflight GitHub Release metadata without assets or mutation');
  const npmPublish: any = workflow.indexOf('Publish the frozen npm tarball');
  const registryConfirm: any = workflow.indexOf('Confirm official Registry integrity and both dist-tags');
  const releaseEnsure: any = workflow.indexOf('Ensure GitHub Release notes without binary Assets');
  assert.equal(contract < candidate, true);
  assert.equal(candidate < hostNode, true);
  assert.equal(hostNode < launcher, true);
  assert.equal(launcher < release, true);
  assert.equal(release < authority, true);
  assert.equal(authority < convergence, true);
  assert.equal(convergence < tagPreflight, true);
  assert.equal(tagPreflight < registryCheck, true);
  assert.equal(registryCheck < tagEnsure, true);
  assert.equal(tagEnsure < metadataPreflight, true);
  assert.equal(registryCheck < npmPublish, true);
  assert.equal(npmPublish < registryConfirm, true);
  assert.equal(registryConfirm < releaseEnsure, true);
  assert.equal(workflow.includes('--snapshot-tags "${RUNNER_TEMP}/contract/registry-tags-before.json"'), true);
  assert.equal(workflow.includes('--before-tags "${RUNNER_TEMP}/contract/registry-tags-before.json"'), true);
});

test('CI and publish workflows use the supported Node runtime', () => {
  const verifyWorkflow: any = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/verify.yml'), 'utf8');
  const publishWorkflow: any = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  const verifyDocument: any = YAML.parseDocument(verifyWorkflow, { uniqueKeys: true }).toJS();
  const hostNodeSmoke: any = fs.readFileSync(path.join(serviceRoot, 'test/verification/host-node/cli-smoke.ts'), 'utf8');
  assert.deepEqual(Object.keys(verifyDocument.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(verifyDocument.on.pull_request.branches, ['dev', 'main']);
  assert.equal(verifyDocument.on.push, undefined);
  assert.equal(verifyDocument.jobs['dev-feedback-macos'].if, "github.event_name == 'pull_request' && github.base_ref == 'dev'");
  assert.equal(verifyDocument.jobs['dev-feedback-windows'].if, "github.event_name == 'pull_request' && github.base_ref == 'dev'");
  assert.equal(verifyDocument.jobs['dev-feedback-macos']['runs-on'], 'macos-latest');
  assert.equal(verifyDocument.jobs['dev-feedback-windows']['runs-on'], 'windows-latest');
  assert.equal(verifyDocument.jobs['candidate-bootstrap'].if, "github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'dev')");
  assert.equal(verifyDocument.jobs['candidate-gate'].if, "always() && (github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'dev'))");
  assert.doesNotMatch(verifyWorkflow, /os: \[macos-latest, windows-latest\]/);
  assert.match(verifyWorkflow, /npm run test:changed -- --base/);
  assert.match(verifyWorkflow, /npm run test:changed -- --development-runner windows --base/);
  assert.match(verifyWorkflow, /npm run test:browser:changed/);
  assert.match(verifyWorkflow, /development-browser-plan\.json/);
  assert.match(verifyWorkflow, /github\.base_ref == 'dev'/);
  assert.match(verifyWorkflow, /github\.base_ref == 'main'/);
  assert.match(verifyWorkflow, /github\.head_ref == 'dev'/);
  assert.doesNotMatch(verifyWorkflow, /^  release-smoke:/m);
  assert.equal((verifyWorkflow.match(/npm run test:candidate:ci/g) || []).length, 5);
  assert.equal((verifyWorkflow.match(/npm run test:candidate:host/g) || []).length, 1);
  assert.equal((verifyWorkflow.match(/node test\/verification\/candidate-ci\.ts aggregate/g) || []).length, 1);
  assert.match(hostNodeSmoke, /cliIdentity\.runtime\?\.role, 'host'/);
  assert.doesNotMatch(hostNodeSmoke, /WorkspaceOwnedRuntime|workspaceNode|BUILDR_NODE_RUNTIME/);
  assert.match(verifyWorkflow, /^  candidate-bootstrap:/m);
  assert.match(verifyWorkflow, /^  candidate-runtime-windows:/m);
  assert.match(verifyWorkflow, /^  candidate-windows:/m);
  assert.match(verifyWorkflow, /^  candidate-gate:/m);
  assert.match(verifyWorkflow, /node-version: 24\.15\.0/);
  assert.match(verifyWorkflow, /node: 24\.x/);
  assert.equal((verifyWorkflow.match(/release-tarball-smoke/g) || []).length, 0);
  assert.match(verifyWorkflow, /BUILDR_VERIFICATION_PROFILE: ci-workspace-limited/);
  assert.match(publishWorkflow, /node-version: "24\.15\.0"/);
  assert.doesNotMatch(`${verifyWorkflow}\n${publishWorkflow}`, /node-version: ?(?:20|22)|node: \[20, 22\]/);
});

test('release convergence and self-bootstrap runner fail closed on unmatched authority evidence', () => {
  const selfBootstrapRunner: any = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), 'utf8');
  const convergenceSource: any = fs.readFileSync(path.join(serviceRoot, 'tools/release/release-git-convergence.ts'), 'utf8');
  assert.match(selfBootstrapRunner, /self-bootstrap-closeout\.remote-drift/);
  assert.match(convergenceSource, /Publication evidence is not a complete passed transaction/);
  assert.match(convergenceSource, /published-but-dev-reconciliation-blocked/);
  assert.match(convergenceSource, /reconcilePublishedReleaseWithDev/);
  assert.match(convergenceSource, /authorizeRemoteDelete/);
  assert.doesNotMatch(convergenceSource, /\['merge'|\['commit'|\['worktree', 'add'|\['reset', '--hard'/);
});
