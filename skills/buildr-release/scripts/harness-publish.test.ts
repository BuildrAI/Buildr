import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import YAML from '../../../projects/product/services/buildr/node_modules/yaml/dist/index.js';
import { HARNESS_PUBLISH_REPOSITORY, HARNESS_PUBLISH_WORKFLOW, runHarnessPublish } from './harness-publish.ts';

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const PLUGIN_SHA = 'c'.repeat(64);
const HARNESS_SHA = 'd'.repeat(64);
const PLUGIN_INTEGRITY = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const HARNESS_INTEGRITY = `sha512-${Buffer.alloc(64, 2).toString('base64')}`;

function createCandidateDir(t: test.TestContext, target: 'harness' | 'dsh-buildr-harness' = 'harness') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-publish-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const isHarness = target === 'harness';
  const version = '0.1.0-rc.3';
  const packageName = isHarness ? '@buildr-ai/buildr-harness' : '@buildr-ai/dsh-buildr-harness';
  const sha256 = isHarness ? HARNESS_SHA : PLUGIN_SHA;
  const integrity = isHarness ? HARNESS_INTEGRITY : PLUGIN_INTEGRITY;
  const fileName = isHarness ? `buildr-ai-buildr-harness-${version}.tgz` : `buildr-ai-dsh-buildr-harness-${version}.tgz`;
  fs.writeFileSync(path.join(dir, fileName), Buffer.from('fixture-tarball-bytes'));
  const verificationBytes = Buffer.from(JSON.stringify({ status: 'passed', sha256 }));
  fs.writeFileSync(path.join(dir, 'verification.json'), verificationBytes);
  const candidate = {
    schemaVersion: 'buildr.harness-release-candidate/v1',
    target,
    packageName,
    version,
    file: fileName,
    sha256,
    integrity,
    size: 21,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    rehearsal: false,
  };
  const proof = isHarness
    ? { status: 'passed', check: 'installed-cli-launcher-web', node: 'v24.15.0', sha256 }
    : { status: 'passed', check: 'installed-dsh-npm-and-github', dshVersion: '0.2.2-rc.5', harnessVersion: '0.1.0-rc.3', harnessIntegrity: HARNESS_INTEGRITY, sha256 };
  return { dir, candidate, filePath: path.join(dir, fileName), proof };
}

function baseEnv(target = 'harness', version = '0.1.0-rc.3', extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_REPOSITORY: HARNESS_PUBLISH_REPOSITORY,
    GITHUB_REPOSITORY_ID: '993537957',
    GITHUB_WORKFLOW_REF: HARNESS_PUBLISH_WORKFLOW,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: '9'.repeat(40),
    GITHUB_RUN_ID: '123456',
    GITHUB_RUN_ATTEMPT: '1',
    GH_TOKEN: 'fixture-gh-token',
    RELEASE_TARGET: target,
    RELEASE_VERSION: version,
    ...extra,
  };
}

test('publish mode requires OIDC tokens while readback runs without OIDC credentials', async t => {
  const { dir, candidate, filePath, proof } = createCandidateDir(t, 'harness');
  await assert.rejects(
    runHarnessPublish({
      dir,
      expectedCommit: SOURCE_COMMIT,
      expectedSha: HARNESS_SHA,
      mode: 'publish',
      env: baseEnv('harness'),
    }, {
      inspect: () => ({ candidate: candidate as any, file: filePath, distribution: { status: 'eligible', publicationApproved: true, findings: [], platformSupport: {} as any, components: 0, componentsMissing: [], decisionVersionDrift: [], unresolved: [] } as any }),
      assertAdmitted: () => proof as any,
    }),
    /protected-harness-publisher-required/,
  );

  // readback succeeds without ACTIONS_ID_TOKEN_REQUEST_* and never runs npm publish
  let npmPublishCalls = 0;
  const result = await runHarnessPublish({
    dir,
    expectedCommit: SOURCE_COMMIT,
    expectedSha: HARNESS_SHA,
    mode: 'readback',
    env: baseEnv('harness'),
    readbackTimeoutMs: 5_000,
    readbackInitialDelayMs: 0,
  }, {
    inspect: () => ({ candidate: candidate as any, file: filePath, distribution: { status: 'eligible' } as any }),
    assertAdmitted: () => proof as any,
    execFileSync: ((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-parse') return '9'.repeat(40);
      if (cmd === 'npm' && args[0] === 'publish') npmPublishCalls += 1;
      throw new Error(`unexpected command ${cmd}`);
    }) as any,
    fetch: (async (url: string | URL) => {
      const target = String(url);
      if (target.endsWith('/0.1.0-rc.3')) {
        return Response.json({ name: '@buildr-ai/buildr-harness', version: '0.1.0-rc.3', dist: { integrity: HARNESS_INTEGRITY } });
      }
      if (target.endsWith('/dist-tags')) {
        return Response.json({ next: '0.1.0-rc.3', latest: '0.0.0-stage' });
      }
      return new Response(null, { status: 404 });
    }) as any,
  });
  assert.equal(npmPublishCalls, 0);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.distTag, 'next');
});

test('publish mode uploads once inside protected environment and returns uploaded without waiting on CDN', async t => {
  const { dir, candidate, filePath, proof } = createCandidateDir(t, 'harness');
  const calls: string[] = [];
  const logs: string[] = [];
  const env = baseEnv('harness', '0.1.0-rc.3', {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/oidc',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-secret',
  });
  const result = await runHarnessPublish({
    dir,
    expectedCommit: SOURCE_COMMIT,
    expectedSha: HARNESS_SHA,
    mode: 'publish',
    env,
  }, {
    log: line => logs.push(line),
    inspect: () => ({ candidate: candidate as any, file: filePath, distribution: { status: 'eligible' } as any }),
    assertAdmitted: () => proof as any,
    execFileSync: ((cmd: string, args: string[]) => {
      calls.push(`${cmd}:${args[0]}`);
      if (cmd === 'git' && args[0] === 'rev-parse') return '9'.repeat(40);
      if (cmd === 'npm' && args[0] === 'publish') return '';
      throw new Error(`unexpected ${cmd}`);
    }) as any,
    fetch: (async (url: string | URL) => {
      const target = String(url);
      if (target.includes('registry.npmjs.org')) return new Response(null, { status: 404 });
      if (target.includes('actions/workflows/publish-harness.yml/runs')) return Response.json({ total_count: 1, workflow_runs: [{ id: 123456, display_title: 'Harness publish harness 0.1.0-rc.3' }] });
      throw new Error(`unexpected fetch ${target}`);
    }) as any,
  });
  assert.equal(result.status, 'uploaded');
  assert.deepEqual(calls, ['git:rev-parse', 'npm:publish']);
  assert.match(logs[0]!, /"status":"upload-attempted"/);
});

test('readback polls across transient 404s, finalizes DSH GitHub Release, and reports propagation-pending cleanly', async t => {
  const { dir, candidate, filePath, proof } = createCandidateDir(t, 'dsh-buildr-harness');
  const exactBytes = fs.readFileSync(filePath);
  const actualFileSha = createHash('sha256').update(exactBytes).digest('hex');
  candidate.sha256 = actualFileSha;
  let pluginPollCount = 0;
  let releaseCreated = false;
  let ghReleaseCalls = 0;
  let fakeNow = 0;

  const confirmed = await runHarnessPublish({
    dir,
    expectedCommit: SOURCE_COMMIT,
    expectedSha: actualFileSha,
    mode: 'readback',
    env: baseEnv('dsh-buildr-harness'),
    readbackTimeoutMs: 60_000,
    readbackInitialDelayMs: 100,
    readbackMaxDelayMs: 200,
  }, {
    now: () => fakeNow,
    sleep: async ms => { fakeNow += ms; },
    inspect: () => ({ candidate: candidate as any, file: filePath, distribution: null }),
    assertAdmitted: () => proof as any,
    execFileSync: ((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-parse') return '9'.repeat(40);
      if (cmd === 'git' && args[0] === 'ls-remote') return `${SOURCE_COMMIT}\trefs/tags/dsh-buildr-harness-v0.1.0-rc.3^{}`;
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'create') {
        ghReleaseCalls += 1;
        releaseCreated = true;
        return 'https://github.com/BuildrAI/Buildr/releases/tag/dsh-buildr-harness-v0.1.0-rc.3';
      }
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'download') {
        const out = args[args.indexOf('--output') + 1]!;
        fs.writeFileSync(out, exactBytes);
        return '';
      }
      throw new Error(`unexpected ${cmd} ${args.join(' ')}`);
    }) as any,
    fetch: (async (url: string | URL) => {
      const target = String(url);
      if (target.includes('%40buildr-ai%2Fbuildr-harness/0.1.0-rc.3')) {
        return Response.json({
          name: '@buildr-ai/buildr-harness',
          version: '0.1.0-rc.3',
          dist: { integrity: HARNESS_INTEGRITY },
          buildrCompatibility: { provides: [{ feature: 'desktop-entry', contracts: ['buildr.harness-desktop-web/v1'] }] },
        });
      }
      if (target.includes('%40buildr-ai%2Fdsh-buildr-harness/0.1.0-rc.3')) {
        pluginPollCount += 1;
        if (pluginPollCount < 3) return new Response(null, { status: 404 });
        return Response.json({ name: '@buildr-ai/dsh-buildr-harness', version: '0.1.0-rc.3', dist: { integrity: PLUGIN_INTEGRITY } });
      }
      if (target.includes('dist-tags')) return Response.json({ next: '0.1.0-rc.3', latest: '0.0.0-stage' });
      if (target.includes('/releases/tags/dsh-buildr-harness-v0.1.0-rc.3')) {
        return releaseCreated
          ? Response.json({ tag_name: 'dsh-buildr-harness-v0.1.0-rc.3', assets: [{ name: candidate.file }] })
          : new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    }) as any,
  });

  assert.equal(pluginPollCount, 3);
  assert.equal(ghReleaseCalls, 1);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.releaseTag, 'dsh-buildr-harness-v0.1.0-rc.3');

  // Timeout emits propagation-pending structured message before throwing
  const timeoutLogs: string[] = [];
  let timeoutClock = 0;
  await assert.rejects(
    runHarnessPublish({
      dir,
      expectedCommit: SOURCE_COMMIT,
      expectedSha: actualFileSha,
      mode: 'readback',
      env: baseEnv('dsh-buildr-harness'),
      readbackTimeoutMs: 1_000,
      readbackInitialDelayMs: 600,
      readbackMaxDelayMs: 600,
    }, {
      now: () => timeoutClock,
      sleep: async ms => { timeoutClock += ms; },
      log: line => timeoutLogs.push(line),
      inspect: () => ({ candidate: candidate as any, file: filePath, distribution: null }),
      assertAdmitted: () => proof as any,
      execFileSync: ((cmd: string, args: string[]) => {
        if (cmd === 'git' && args[0] === 'rev-parse') return '9'.repeat(40);
        throw new Error(`unexpected ${cmd}`);
      }) as any,
      fetch: (async (url: string | URL) => {
        if (String(url).includes('%40buildr-ai%2Fbuildr-harness/0.1.0-rc.3')) {
          return Response.json({
            name: '@buildr-ai/buildr-harness',
            version: '0.1.0-rc.3',
            dist: { integrity: HARNESS_INTEGRITY },
            buildrCompatibility: { provides: [{ feature: 'desktop-entry', contracts: ['buildr.harness-desktop-web/v1'] }] },
          });
        }
        return new Response(null, { status: 404 });
      }) as any,
    }),
    /npm-propagation-pending/,
  );
  assert.match(timeoutLogs.at(-1)!, /"status":"propagation-pending"/);
});

test('publish-harness workflow separates protected npm-production upload from unapproved finalize readback', () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, '.github/workflows/publish-harness.yml'), 'utf8'));
  assert.deepEqual(Object.keys(workflow.jobs), ['authority', 'publish', 'finalize']);
  assert.equal(workflow.jobs.publish.environment, 'npm-production');
  assert.equal(workflow.jobs.publish.permissions['id-token'], 'write');
  assert.equal(workflow.jobs.finalize.environment, undefined);
  assert.equal(workflow.jobs.finalize.permissions['id-token'], undefined);
  assert.equal(workflow.jobs.finalize.permissions.contents, 'write');
  assert.deepEqual(workflow.jobs.finalize.needs, ['publish']);
  assert.match(workflow.jobs.finalize.if, /inputs\.mode == 'readback'/);
  assert.match(workflow.jobs.finalize.if, /needs\.publish\.result == 'success'/);
});
