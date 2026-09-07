import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ensureReleaseTag } from '../../tools/release/release-tag-ensure.ts';
import { observeUnpublishedRelease, requestReleaseJson } from '../../tools/release/release-observation.ts';
import { registryVersionState, waitForRegistryRelease } from '../../tools/release/registry-version-state.ts';
import { ensureGitHubRelease } from '../../tools/release/github-release-ensure.ts';

function gitFixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-recovery-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(repo);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-b', 'dev']);
  git(['config', 'user.name', 'Buildr Test']);
  git(['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(repo, 'value.txt'), 'release\n');
  git(['add', 'value.txt']);
  git(['commit', '-m', 'release']);
  git(['init', '--bare', remote]);
  git(['remote', 'add', 'origin', remote]);
  return { repo, remote, git, sourceCommit: git(['rev-parse', 'HEAD']), tag: 'v1.2.3-rc.1' };
}

test('local tag creation survives rejected push and resumes without recreating it', t => {
  const fixture = gitFixture(t);
  const hook = path.join(fixture.remote, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const first = ensureReleaseTag(fixture);
  assert.equal(first.status, 'blocked');
  assert.equal(first.effects.find((effect: any) => effect.type === 'local-tag-created').state, 'confirmed');
  assert.equal(first.effects.find((effect: any) => effect.type === 'remote-tag-pushed').state, 'not-applied');
  assert.equal(fixture.git(['rev-parse', `${fixture.tag}^{commit}`]), fixture.sourceCommit);
  assert.equal(fixture.git(['ls-remote', 'origin', `refs/tags/${fixture.tag}`]), '');
  fs.unlinkSync(hook);
  const second = ensureReleaseTag(fixture);
  assert.equal(second.status, 'passed');
  assert.equal(second.effects[0].type, 'local-tag-reused');
  assert.ok(fixture.git(['ls-remote', 'origin', `refs/tags/${fixture.tag}`]));
  assert.equal(ensureReleaseTag(fixture).action, 'reuse');
});

test('remote tag success with a lost response is confirmed by readback', t => {
  const fixture = gitFixture(t);
  let pushes = 0;
  const result = ensureReleaseTag(fixture, { execute: (command: string, args: string[], options: any) => {
    const actual = spawnSync(command, args, { ...options, encoding: 'utf8' });
    if (args[0] === 'push') { pushes++; return { ...actual, status: 1, stderr: 'injected response loss' }; }
    return actual;
  } });
  assert.equal(result.status, 'passed');
  assert.equal(result.effects.at(-1).state, 'confirmed');
  assert.equal(pushes, 1);
  assert.equal(ensureReleaseTag(fixture).action, 'reuse');
});

test('readback failure preserves an unknown remote effect and a retry only reuses the tag', t => {
  const fixture = gitFixture(t);
  let pushed = false;
  const first = ensureReleaseTag(fixture, { execute: (command: string, args: string[], options: any) => {
    if (pushed && args[0] === 'ls-remote') return { status: 1, stdout: '', stderr: 'injected readback timeout' };
    const actual = spawnSync(command, args, { ...options, encoding: 'utf8' });
    if (args[0] === 'push') pushed = true;
    return actual;
  } });
  assert.equal(first.status, 'blocked');
  assert.equal(first.effects.at(-1).state, 'unknown');
  assert.equal(ensureReleaseTag(fixture).action, 'reuse');
});

test('conflicting local tag is retained and never pushed', t => {
  const fixture = gitFixture(t);
  fixture.git(['tag', fixture.tag]);
  fs.writeFileSync(path.join(fixture.repo, 'value.txt'), 'later\n');
  fixture.git(['commit', '-am', 'later']);
  const later = fixture.git(['rev-parse', 'HEAD']);
  const result = ensureReleaseTag({ ...fixture, sourceCommit: later });
  assert.equal(result.status, 'blocked');
  assert.equal(fixture.git(['rev-parse', `${fixture.tag}^{commit}`]), fixture.sourceCommit);
  assert.equal(fixture.git(['ls-remote', 'origin', `refs/tags/${fixture.tag}`]), '');
});

async function serverFixture(t: any, handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}
const json = (res: http.ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };

test('unpublished observation executes real absence judgments and tolerates a terminal failed run', async t => {
  const api = await serverFixture(t, (req, res) => {
    if (req.url === '/repos/BuildrAI/Buildr') return json(res, 200, { full_name: 'BuildrAI/Buildr', private: false });
    if (req.url?.includes('/actions/')) return json(res, 200, { workflow_runs: [{ id: 7, display_title: 'Release 1.2.3-rc.1 (previous)', status: 'completed', conclusion: 'failure' }, { id: 8, display_title: 'Release 1.2.3-rc.10 (other)', status: 'in_progress' }] });
    json(res, 404, { error: 'not found' });
  });
  const result = await observeUnpublishedRelease('1.2.3-rc.1', { githubApi: api, registry: api });
  assert.equal(result.status, 'unpublished');
  assert.deepEqual(Object.values(result.facts).map((fact: any) => fact.state), ['absent', 'absent', 'absent']);
  assert.equal(result.historicalRuns.length, 1);
});

test('a permission failure cannot be converted to absence', async t => {
  const api = await serverFixture(t, (req, res) => {
    if (req.url === '/repos/BuildrAI/Buildr') return json(res, 200, { full_name: 'BuildrAI/Buildr', private: false });
    if (req.url?.includes('/actions/')) return json(res, 200, { workflow_runs: [] });
    json(res, req.url?.includes('/releases/') ? 403 : 404, {});
  });
  const result = await observeUnpublishedRelease('1.2.3-rc.1', { githubApi: api, registry: api });
  assert.equal(result.status, 'blocked');
  assert.equal(result.facts.githubRelease.state, 'unknown');
  assert.equal(result.facts.githubRelease.code, 'release-permission-denied');
});

test('a masked repository 404 remains unknown', async t => {
  const api = await serverFixture(t, (_, res) => json(res, 404, {}));
  await assert.rejects(observeUnpublishedRelease('1.2.3-rc.1', { githubApi: api, registry: api }), /absence cannot be established/u);
});

test('network deadlines and retry limits apply to actual HTTP requests', async t => {
  let requests = 0;
  const api = await serverFixture(t, () => { requests++; });
  const started = Date.now();
  await assert.rejects(requestReleaseJson(api, { timeoutMs: 40, attempts: 2, sleep: async () => {} }), { code: 'release-request-timeout' });
  assert.equal(requests, 2);
  assert.ok(Date.now() - started < 2000);
});

test('registry integrity conflicts fail immediately without propagation retries', async t => {
  let requests = 0;
  const api = await serverFixture(t, (_, res) => { requests++; json(res, 200, { name: '@buildr-ai/buildr', version: '1.2.3', dist: { integrity: 'sha512-conflict' } }); });
  const fetchImpl: typeof fetch = (url, options) => fetch(`${api}${new URL(String(url)).pathname}`, options);
  await assert.rejects(waitForRegistryRelease({ packageName: '@buildr-ai/buildr', version: '1.2.3', npmTag: 'latest', integrity: 'sha512-expected', beforeTags: {} }, { fetchImpl, sleep: () => assert.fail('conflict must not sleep') }), { code: 'registry-integrity-conflict' });
  assert.equal(requests, 1);
});

test('registry distinguishes absent, permission, invalid response and matching published artifact', async t => {
  let status = 404;
  const api = await serverFixture(t, (_, res) => json(res, status, status === 200 ? { name: '@buildr-ai/buildr', version: '1.2.3', dist: { integrity: 'sha512-matching' } } : {}));
  const fetchImpl: typeof fetch = (url, options) => fetch(`${api}${new URL(String(url)).pathname}`, options);
  assert.equal((await registryVersionState('@buildr-ai/buildr', '1.2.3', fetchImpl)).published, false);
  status = 403;
  await assert.rejects(registryVersionState('@buildr-ai/buildr', '1.2.3', fetchImpl), { code: 'release-permission-denied' });
  status = 200;
  assert.equal((await registryVersionState('@buildr-ai/buildr', '1.2.3', fetchImpl)).integrity, 'sha512-matching');
});

test('GitHub Release creation with a lost response is read back and never created twice', async t => {
  const expected = { repository: 'BuildrAI/Buildr', tag: 'v1.2.3-rc.1', title: 'v1.2.3-rc.1', targetCommit: 'a'.repeat(40), body: 'release notes', prerelease: true };
  let saved: any = null;
  let writes = 0;
  const api = await serverFixture(t, (req, res) => {
    if (req.url?.includes('/git/ref/')) return json(res, 200, { object: { type: 'commit', sha: expected.targetCommit } });
    if (req.method === 'POST') {
      writes++;
      saved = { tag_name: expected.tag, name: expected.title, body: expected.body, draft: false, prerelease: true, assets: [] };
      req.socket.destroy();
      return;
    }
    if (req.url?.endsWith('/releases/latest')) return json(res, 404, {});
    json(res, saved ? 200 : 404, saved || {});
  });
  const options = { token: 'local-test-service', fetchImpl: ((url: any, init: any) => fetch(`${api}${new URL(url).pathname}`, init)) as typeof fetch };
  const result = await ensureGitHubRelease(expected, options);
  assert.equal(result.action, 'recovered');
  assert.equal(result.effects[0].state, 'confirmed');
  assert.equal((await ensureGitHubRelease(expected, options)).action, 'reused');
  assert.equal(writes, 1);
});
