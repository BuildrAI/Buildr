import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  appendHarnessAdmissions,
  parseHarnessReleaseRunnerArgs,
  runHarnessReleaseCommand,
  verifyPublicHarnessRelease,
} from './harness-release-runner.ts';
import { HARNESS_PUBLISH_REPOSITORY } from './harness-publish.ts';

const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const VALID_TARBALL_SHA = createHash('sha256').update(Buffer.from('harness-public-bytes')).digest('hex');
const VALID_INTEGRITY = `sha512-${Buffer.alloc(64, 3).toString('base64')}`;

test('harness-release-runner --help exposes commands cleanly with zero side effects', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runner-help-'));
  try {
    const cli = path.resolve(import.meta.dirname, 'harness-release-runner.ts');
    const result = spawnSync(process.execPath, [cli, '--help'], { cwd: dir, encoding: 'utf8', timeout: 15_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    for (const cmd of ['preflight', 'prepare', 'handoff', 'admit', 'preserve', 'publish', 'readback', 'cleanup']) {
      assert.match(result.stdout, new RegExp(cmd));
    }
    assert.deepEqual(fs.readdirSync(dir), []);

    const parsed = parseHarnessReleaseRunnerArgs(['publish', '--dir', '/tmp/cand', '--preserve-run-id', '77', '--authorized', '--wait']);
    assert.equal(parsed.action, 'publish');
    assert.equal(parsed.preserveRunId, 77);
    assert.equal(parsed.authorized, true);
    assert.equal(parsed.wait, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendHarnessAdmissions preserves prior rows append-only and rejects duplicates', () => {
  const baseRaw = JSON.stringify({
    schemaVersion: 'buildr.harness-release-admissions/v1',
    admissions: [{
      target: 'harness',
      version: '0.1.0-rc.1',
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      sha256: 'c'.repeat(64),
      integrity: VALID_INTEGRITY,
      proofSha256: 'd'.repeat(64),
    }],
  });
  const nextEntry = {
    target: 'harness',
    version: '0.1.0-rc.3',
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    sha256: 'e'.repeat(64),
    integrity: VALID_INTEGRITY,
    proofSha256: 'f'.repeat(64),
  };
  const appended = appendHarnessAdmissions(baseRaw, [nextEntry]);
  assert.equal(appended.total, 2);
  assert.equal(appended.added.length, 1);

  assert.throws(() => appendHarnessAdmissions(appended.updatedRaw, [nextEntry]), /harness-admission-duplicate/);
});

test('verifyPublicHarnessRelease confirms npm integrity, dist-tag and GitHub Release asset bytes', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runner-verify-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const payload = Buffer.from('harness-public-bytes');
  const candidate = {
    target: 'dsh-buildr-harness' as const,
    packageName: '@buildr-ai/dsh-buildr-harness',
    version: '0.1.0-rc.3',
    file: 'buildr-ai-dsh-buildr-harness-0.1.0-rc.3.tgz',
    sha256: VALID_TARBALL_SHA,
    integrity: VALID_INTEGRITY,
    sourceCommit: SOURCE_COMMIT,
  };

  const result = await verifyPublicHarnessRelease(candidate, { expectedLatest: '0.0.0-stage', repo: tmp }, {
    fetch: (async (url: string | URL) => {
      const s = String(url);
      if (s.includes('/0.1.0-rc.3')) {
        return Response.json({ name: candidate.packageName, version: candidate.version, dist: { integrity: VALID_INTEGRITY, tarball: 'https://registry.npmjs.org/dl.tgz' } });
      }
      if (s.includes('dist-tags')) {
        return Response.json({ next: '0.1.0-rc.3', latest: '0.0.0-stage' });
      }
      if (s === 'https://registry.npmjs.org/dl.tgz') {
        return new Response(payload, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as any,
    execute: ((cmd: string, args: string[]) => {
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            tagName: 'dsh-buildr-harness-v0.1.0-rc.3',
            url: `https://github.com/${HARNESS_PUBLISH_REPOSITORY}/releases/tag/dsh-buildr-harness-v0.1.0-rc.3`,
            assets: [{ name: candidate.file }],
          }),
        };
      }
      if (cmd === 'git' && args[0] === 'ls-remote') {
        return { status: 0, stdout: `${SOURCE_COMMIT}\trefs/tags/dsh-buildr-harness-v0.1.0-rc.3^{}\n` };
      }
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'download') {
        const out = args[args.indexOf('--output') + 1]!;
        fs.writeFileSync(out, payload);
        return { status: 0, stdout: '' };
      }
      throw new Error(`unexpected ${cmd} ${args.join(' ')}`);
    }) as any,
  });

  assert.equal(result.status, 'confirmed');
  assert.equal(result.releaseTag, 'dsh-buildr-harness-v0.1.0-rc.3');
});

test('publish enforces --authorized and surfaces propagation-pending when only finalize fails', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runner-pub-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(
    runHarnessReleaseCommand(parseHarnessReleaseRunnerArgs(['publish', '--dir', dir, '--preserve-run-id', '10'])),
    /requires explicit --authorized/,
  );

  // Create real minimal valid candidate directory using git-free tar + inspectCandidate expectation
  const pkgRoot = path.join(dir, 'pkg');
  fs.mkdirSync(path.join(pkgRoot, 'package/lib'), { recursive: true });
  fs.writeFileSync(path.join(pkgRoot, 'package/package.json'), JSON.stringify({
    name: '@buildr-ai/dsh-buildr-harness',
    version: '0.1.0-rc.3',
    publishConfig: { access: 'public' },
    repository: { type: 'git', url: 'git+https://github.com/BuildrAI/Buildr.git' },
    engines: { dsh: '>=0.2.0-0 <0.3.0-0' },
    dsh: { manifestVersion: 1 },
    buildrCompatibility: { schemaVersion: 'buildr.package-compatibility/v1', requires: [{ packageName: '@buildr-ai/buildr-harness' }] },
  }));
  fs.writeFileSync(path.join(pkgRoot, 'package/cordis.patch.yml'), "name: '@buildr-ai/dsh-buildr-harness'\n");
  for (const rel of ['lib/index.js', 'lib/launcher.js', 'lib/client.js', 'LICENSE', 'README.md']) {
    fs.writeFileSync(path.join(pkgRoot, 'package', rel), '// fixture\n');
  }
  const tgzName = 'buildr-ai-dsh-buildr-harness-0.1.0-rc.3.tgz';
  execFileSync('tar', ['-czf', path.join(dir, tgzName), '-C', pkgRoot, 'package']);
  fs.rmSync(pkgRoot, { recursive: true, force: true });
  const tgzBytes = fs.readFileSync(path.join(dir, tgzName));
  const sha = createHash('sha256').update(tgzBytes).digest('hex');
  const integrity = `sha512-${createHash('sha512').update(tgzBytes).digest('base64')}`;
  fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({
    schemaVersion: 'buildr.harness-release-candidate/v1',
    target: 'dsh-buildr-harness',
    packageName: '@buildr-ai/dsh-buildr-harness',
    version: '0.1.0-rc.3',
    file: tgzName,
    sha256: sha,
    integrity,
    size: tgzBytes.length,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    rehearsal: false,
  }));

  let apiCalls = 0;
  const parsed = parseHarnessReleaseRunnerArgs(['publish', '--dir', dir, '--preserve-run-id', '55', '--authorized', '--wait']);
  const result = await runHarnessReleaseCommand(parsed, {
    now: () => 0,
    sleep: async () => {},
    execute: ((cmd: string, args: string[]) => {
      if (cmd === 'gh' && args[0] === 'run' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([{
            databaseId: 88,
            displayTitle: 'Harness publish dsh-buildr-harness 0.1.0-rc.3',
            status: 'completed',
            conclusion: 'failure',
            url: 'https://github.com/BuildrAI/Buildr/actions/runs/88',
          }]),
        };
      }
      if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${HARNESS_PUBLISH_REPOSITORY}/actions/runs/88`) {
        apiCalls += 1;
        return { status: 0, stdout: JSON.stringify({ id: 88, status: 'completed', conclusion: 'failure' }) };
      }
      if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${HARNESS_PUBLISH_REPOSITORY}/actions/runs/88/jobs`) {
        return {
          status: 0,
          stdout: JSON.stringify({
            jobs: [
              { name: 'publish', conclusion: 'success' },
              { name: 'finalize', conclusion: 'failure' },
            ],
          }),
        };
      }
      throw new Error(`unexpected ${cmd} ${args.join(' ')}`);
    }) as any,
  });

  assert.equal(apiCalls >= 1, true);
  assert.equal(result.status, 'propagation-pending');
  assert.equal(result.publishRunId, 88);
});
