import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  inspectCandidateFile,
  inspectPackageMetadata,
  inspectPackageVersionConsistency,
  inspectTarballFiles,
} from '../../test/verification/release/open-source-candidate.mjs';
import { resolveReleaseContract } from '../../scripts/release/release-contract.mjs';
import { extractReleaseNotes } from '../../scripts/release/release-notes.mjs';
import { registryVersionState } from '../../scripts/release/registry-version-state.mjs';

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
  const files = ['LICENSE', 'README.md', 'package.json', 'bin/buildr.mjs', 'package/manifest.yml'].map((path) => ({ path }));
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
  const published = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 200 }));
  assert.equal(published.published, true);
  const absent = await registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 404 }));
  assert.equal(absent.published, false);
  await assert.rejects(
    registryVersionState('@buildr-ai/buildr', '0.1.0-rc.1', async () => ({ status: 503 })),
    /HTTP 503/,
  );
});

test('release contract maps prerelease to next and stable to latest', () => {
  assert.deepEqual(resolveReleaseContract('0.1.0-rc.1', 'v0.1.0-rc.1'), {
    version: '0.1.0-rc.1', refName: 'v0.1.0-rc.1', npmTag: 'next', prerelease: true,
  });
  assert.equal(resolveReleaseContract('0.1.0', 'v0.1.0').npmTag, 'latest');
  assert.throws(() => resolveReleaseContract('0.1.0', 'v0.1.1'), /does not match/);
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

test('publish workflow is tag-gated, OIDC-ready, and token-free', () => {
  const workflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  for (const required of [
    'tags:', 'id-token: write', 'environment: npm-production', 'release-contract.mjs',
    'release-notes.mjs', './scripts/verify-buildr-product', 'registry-version-state.mjs',
    "steps.registry.outputs.published != 'true'", 'npm publish --access public', 'gh release create',
    '--notes-file', '--verify-tag', '--latest=false',
  ]) assert.equal(workflow.includes(required), true, required);
  assert.equal(workflow.includes('NODE_AUTH_TOKEN'), false);
  assert.equal(workflow.includes('--generate-notes'), false);
  const releaseNotes = workflow.indexOf('Generate GitHub release notes');
  const registryCheck = workflow.indexOf('Check official registry version');
  const npmPublish = workflow.indexOf('Publish public npm package');
  assert.equal(releaseNotes < registryCheck, true);
  assert.equal(releaseNotes < npmPublish, true);
});

test('CI and publish workflows use the supported Node runtime', () => {
  const verifyWorkflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/verify.yml'), 'utf8');
  const publishWorkflow = fs.readFileSync(path.join(workspaceRoot, '.github/workflows/publish.yml'), 'utf8');
  assert.match(verifyWorkflow, /node: \[24\.15\.0, 24\.x\]/);
  assert.match(verifyWorkflow, /node-version: 24\.15\.0/);
  assert.match(verifyWorkflow, /BUILDR_VERIFICATION_PROFILE: ci-workspace-limited/);
  assert.match(publishWorkflow, /node-version: "24\.15\.0"/);
  assert.doesNotMatch(`${verifyWorkflow}\n${publishWorkflow}`, /node-version: ?(?:20|22)|node: \[20, 22\]/);
});

test('Buildr release Skill fixes release identity, dependency preparation, and tree-gated history bridging', () => {
  const skill = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-release/SKILL.md'), 'utf8');
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
    'command -v buildr', 'buildr --help', 'buildr doctor --agent <agent>',
    '不得要求维护者去其他 workspace', '不等同于 registry `buildr update`',
    '不触发其他 workspace 的 `buildr sync`',
    '展示待删除 ref、commit', '请求用户明确授权删除',
    '重新查询远端确认 ref 不存在', '清理 follow-up',
    '不得把长期保留当作默认结果', '未取得删除授权时必须明确报告待清理项',
  ]) assert.equal(skill.includes(required), true, required);
});
