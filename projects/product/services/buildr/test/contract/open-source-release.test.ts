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
} from '../verification/release/open-source-candidate.ts';
import { resolveReleaseContract } from '../../tools/release/release-contract.ts';
import { extractReleaseNotes } from '../../tools/release/release-notes.ts';
import { releasePublicationRepositoryRoot } from '../../tools/release/release-publication.ts';
import { ensureGitHubRelease } from '../../tools/release/github-release-ensure.ts';
import {
  assertRegistryArtifact,
  assertRegistryTagTransition,
  confirmRegistryRelease,
  registryDistTagsState,
  registryVersionState,
  waitForRegistryRelease,
} from '../../tools/release/registry-version-state.ts';
import { cleanupReleaseSmokeRoot, resolveReleaseSmokeSource } from '../verification/release/release-smoke.ts';

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

test('publish workflow delegates one protected transaction and consumes the Candidate bytes', () => {
  const workflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  const document = YAML.parse(workflow);
  assert.deepEqual(Object.keys(document.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(document.jobs), ['contract', 'candidate', 'release']);
  assert.deepEqual(document.jobs.release.needs, ['contract', 'candidate']);
  assert.deepEqual(Object.entries(document.jobs).filter(([, job]: any) => job.environment).map(([id, job]: any) => [id, job.environment]), [['release', 'npm-production']]);
  assert.equal(document.jobs.release.permissions['id-token'], 'write');
  assert.equal(document.jobs.release.permissions.contents, 'write');
  for (const job of Object.values(document.jobs) as any[]) {
    assert.equal(job.steps.find((step: any) => step.uses === 'actions/checkout@v7').with.ref, '${{ inputs.source_commit }}');
    for (const step of job.steps.filter((step: any) => step.with?.name === 'candidate-package')) assert.equal(step.with['run-id'], '${{ inputs.candidate_run_id }}');
  }
  assert.equal(document.jobs.candidate.steps.filter((step: any) => step.run?.includes('release-consumption.ts verify')).length, 1);
  assert.equal(document.jobs.release.steps.filter((step: any) => step.run?.includes('release-publication.ts')).length, 1);
  assert.equal(document.jobs.release.steps.filter((step: any) => step.run === 'node tools/verification/candidate-environment.ts prepare --profile publisher').length, 1);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|npm publish|npm pack|artifacts:prepare|application-payload.*build/);
});

test('protected publication resolves the Workspace repository root', () => {
  assert.equal(releasePublicationRepositoryRoot, workspaceRoot);
  assert.equal(fs.statSync(path.join(releasePublicationRepositoryRoot, '.github', 'workflows', 'publish.yml')).isFile(), true);
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
  assert.equal(verifyDocument.jobs['candidate-plan'].if, "github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'dev')");
  assert.deepEqual(verifyDocument.on.workflow_dispatch.inputs.purpose.options, ['candidate', 'release-rehearsal']);
  assert.equal(verifyDocument.on.workflow_dispatch.inputs.expected_source_tree.required, false);
  assert.equal(verifyDocument.on.workflow_dispatch.inputs.rehearsal_identity.required, false);
  const candidateJobs: any[] = ['candidate-bootstrap', 'candidate-source', 'candidate-artifact-consumers', 'candidate-host-node'].map(id => verifyDocument.jobs[id]);
  for (const job of candidateJobs) {
    assert.equal(job.steps.filter((step: any) => /candidate-environment\.ts prepare --profile/u.test(step.run || '')).length, 1);
    assert.equal(job.steps.some((step: any) => step.run === 'npm ci' || /artifacts:prepare|prepare-development-web\.ts/u.test(step.run || '')), false);
  }
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
  assert.equal((verifyWorkflow.match(/node test\/verification\/candidate-ci\.ts run/g) || []).length, 3);
  assert.equal((verifyWorkflow.match(/node test\/verification\/candidate-ci\.ts host/g) || []).length, 1);
  assert.equal((verifyWorkflow.match(/node test\/verification\/candidate-ci\.ts aggregate/g) || []).length, 1);
  assert.match(hostNodeSmoke, /cliIdentity\.runtime\?\.role, 'host'/);
  assert.doesNotMatch(hostNodeSmoke, /WorkspaceOwnedRuntime|workspaceNode|BUILDR_NODE_RUNTIME/);
  assert.match(verifyWorkflow, /^  candidate-bootstrap:/m);
  assert.match(verifyWorkflow, /^  candidate-artifact-consumers:/m);
  assert.match(verifyWorkflow, /^  candidate-source:/m);
  assert.match(verifyWorkflow, /^  candidate-gate:/m);
  assert.match(verifyWorkflow, /node-version: 24\.15\.0/);
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
