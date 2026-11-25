import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runReleasePreflight } from './release-preflight.ts';

function createFixtureRepo(t: test.TestContext, options: {
  buildrVersion?: string;
  lockVersion?: string;
  harnessApprovedVersion?: string;
  changelog?: string;
  decisionName?: string;
} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-test-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const buildrVersion = options.buildrVersion ?? '0.1.0-rc.66';
  const lockVersion = options.lockVersion ?? buildrVersion;
  const harnessApprovedVersion = options.harnessApprovedVersion ?? '0.1.0-rc.3';

  const write = (rel: string, content: string) => {
    const file = path.join(repo, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  write('CHANGELOG.md', options.changelog ?? `# Changelog\n\n## ${buildrVersion} - 2026-11-24\n\n- Ready for release.\n`);
  write('skills/buildr-release/scripts/harness-release-admissions.json', JSON.stringify({
    schemaVersion: 'buildr.harness-release-admissions/v1',
    admissions: [
      {
        target: 'harness',
        version: '0.1.0-rc.1',
        sourceCommit: 'a'.repeat(40),
        sourceTree: 'b'.repeat(40),
        sha256: 'c'.repeat(64),
        integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`,
        proofSha256: 'd'.repeat(64),
      },
    ],
  }, null, 2));

  write('projects/product/services/buildr/package.json', JSON.stringify({ name: '@buildr-ai/buildr', version: buildrVersion, license: 'MIT' }));
  write('projects/product/services/buildr/LICENSE', 'MIT\n');
  fs.mkdirSync(path.join(repo, 'projects/product/services/buildr/node_modules'), { recursive: true });
  write('projects/product/services/buildr/package-lock.json', JSON.stringify({ version: lockVersion, packages: { '': { version: lockVersion } } }));
  write('projects/product/services/buildr/tools/build/platform-support.json', JSON.stringify({ schemaVersion: 1, productId: 'buildr-development', platforms: { darwin: { support: 'candidate' } }, publicationApproved: true }));

  write('projects/product/services/buildr-web/package.json', JSON.stringify({ name: '@buildr-ai/buildr-web', version: '0.1.0', license: 'MIT' }));
  write('projects/product/services/buildr-web/LICENSE', 'MIT\n');
  fs.mkdirSync(path.join(repo, 'projects/product/services/buildr-web/node_modules'), { recursive: true });

  write('projects/product/services/buildr-harness/package.json', JSON.stringify({ name: '@buildr-ai/buildr-harness', version: '0.1.0', license: 'MIT' }));
  write('projects/product/services/buildr-harness/LICENSE', 'MIT\n');
  fs.mkdirSync(path.join(repo, 'projects/product/services/buildr-harness/node_modules'), { recursive: true });
  write('projects/product/services/buildr-harness/resources/platform-support.json', JSON.stringify({
    schemaVersion: 1,
    productId: 'buildr-harness',
    platforms: { darwin: { support: 'supported', architectures: ['arm64'] } },
    publicationApproved: true,
    publicationApproval: { version: harnessApprovedVersion, platform: 'darwin', architectures: ['arm64'], authority: 'approved' },
  }));
  write('projects/product/services/buildr-harness/resources/distribution-decisions.json', JSON.stringify({
    schemaVersion: 1,
    decisions: [
      { name: options.decisionName ?? '@buildr-ai/buildr', version: buildrVersion, disposition: 'approved', authority: { name: 'Buildr Release', source: 'fixture' }, reason: 'approved' },
      { name: '@buildr-ai/buildr-web', version: '0.1.0', disposition: 'approved', authority: { name: 'Buildr Release', source: 'fixture' }, reason: 'approved' },
      { name: '@buildr-ai/buildr-harness', version: '0.1.0', disposition: 'approved', authority: { name: 'Buildr Release', source: 'fixture' }, reason: 'approved' },
      { name: '@buildr-ai/buildr-harness-web', version: '0.1.0', disposition: 'approved', authority: { name: 'Buildr Release', source: 'fixture' }, reason: 'approved' },
    ],
  }));

  write('projects/product/services/buildr-harness-web/package.json', JSON.stringify({ name: '@buildr-ai/buildr-harness-web', version: '0.1.0', license: 'MIT' }));
  write('projects/product/services/buildr-harness-web/LICENSE', 'MIT\n');
  fs.mkdirSync(path.join(repo, 'projects/product/services/buildr-harness-web/node_modules'), { recursive: true });

  write('projects/product/services/buildr-harness-dsh-plugin/tools/build-dev.ts', '// stub\n');
  return repo;
}

test('release-preflight --help produces no side effects', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-help-'));
  try {
    const cli = path.resolve(import.meta.dirname, 'release-preflight.ts');
    const result = spawnSync(process.execPath, [cli, '--help'], { cwd: dir, encoding: 'utf8', timeout: 15_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: release-preflight\.ts/);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release-preflight reports ready for aligned materials and leaves repo clean', t => {
  const repo = createFixtureRepo(t);
  const result = runReleasePreflight({
    repo,
    targets: ['buildr', 'harness', 'dsh-buildr-harness'],
    buildrVersion: '0.1.0-rc.66',
    harnessVersion: '0.1.0-rc.3',
    pluginVersion: '0.1.0-rc.3',
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.checks.some(item => item.status === 'action-required'), false);
  assert.equal(fs.existsSync(path.join(repo, 'projects/product/services/buildr-harness/build/third-party')), false);
});

test('release-preflight flags version, changelog, platform-approval and third-party gaps early', t => {
  const repo = createFixtureRepo(t, {
    buildrVersion: '0.1.0-rc.66',
    lockVersion: '0.1.0-rc.65',
    harnessApprovedVersion: '0.1.0-rc.2',
    changelog: '# Changelog\n',
    decisionName: '@other/missing',
  });
  const result = runReleasePreflight({
    repo,
    targets: ['buildr', 'harness'],
    buildrVersion: '0.1.0-rc.66',
    harnessVersion: '0.1.0-rc.3',
  });
  assert.equal(result.status, 'action-required');
  const blockedIds = result.checks.filter(item => item.status === 'action-required').map(item => item.id);
  assert.ok(blockedIds.includes('buildr-package-version'));
  assert.ok(blockedIds.includes('buildr-changelog-notes'));
  assert.ok(blockedIds.includes('buildr-third-party-decisions'));
  assert.ok(blockedIds.includes('harness-platform-support'));
});
