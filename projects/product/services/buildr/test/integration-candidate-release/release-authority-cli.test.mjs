import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeSchema,
  sha256,
} from '../../scripts/release/release-authority.mjs';
import { runReleaseAuthorityOidcProbe } from '../../scripts/release/release-authority-oidc-probe.mjs';
import { containsCredentialMaterial } from '../../scripts/release/release-authority-preflight.mjs';
import { runHostedReleaseTransaction } from '../../scripts/release/release-transaction-runner.mjs';
import { ensureReleaseTag, inspectReleaseTag } from '../../scripts/release/release-tag-ensure.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = 987;
const runAttempt = 1;
const fixtureCommit = 'a'.repeat(40);
const candidateBase = 'b'.repeat(40);
const candidateTree = 'c'.repeat(40);
const version = '0.1.0-rc.15';
const workflow = `on:
  workflow_dispatch:
    inputs:
      release_id: { required: true, type: string }
      version: { required: true, type: string }
      source_commit: { required: true, type: string }
      candidate_base: { required: true, type: string }
      candidate_tree: { required: true, type: string }
      workflow_sha256: { required: true, type: string }
jobs:
  contract: { runs-on: ubuntu-latest }
  candidate: { runs-on: ubuntu-latest }
  host-node: { runs-on: ubuntu-latest }
  launcher: { runs-on: ubuntu-latest }
  release:
    needs: [contract, candidate, host-node, launcher]
    environment: npm-production
    permissions: { contents: write, id-token: write }
    steps:
      - run: node scripts/release/release-authority-oidc-probe.mjs fixture
      - run: node scripts/release/release-convergence.mjs --stage pre-tag
      - run: node scripts/release/release-tag-ensure.mjs preflight fixture
      - run: node scripts/release/release-tag-ensure.mjs ensure fixture
      - run: node scripts/release/trusted-publish.mjs fixture.tgz
`;

function hostedEnvironment(sourceCommit = fixtureCommit) {
  return {
    GITHUB_REPOSITORY: 'BuildrAI/Buildr',
    GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: sourceCommit,
    GITHUB_RUN_ID: String(runId),
    GITHUB_RUN_ATTEMPT: String(runAttempt),
    GITHUB_SERVER_URL: 'https://github.com',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/id-token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'github-request-secret',
  };
}

function probeRepo(t, prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  return repo;
}

test('hosted OIDC probe exchanges identity but never retains either token', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-');
  const created = '2026-08-13T00:04:00.000Z';
  const expires = '2026-08-13T01:04:00.000Z';
  const requests = [];
  const result = await runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    now: () => '2026-08-13T00:05:00.000Z',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (requests.length === 1) return new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 });
      return new Response(JSON.stringify({ token_type: 'oidc', token: 'npm_registry_secret_that_must_not_escape', created, expires }), { status: 201 });
    },
  });
  assert.equal(requests[0].url, 'https://actions.example/id-token?audience=npm%3Aregistry.npmjs.org');
  assert.match(requests[1].url, /\/oidc\/token\/exchange\/package\/%40buildr-ai%2Fbuildr$/);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer header.payload.signature');
  assert.equal(result.status, 'ready');
  assert.equal(result.npm.exchange.status, 201);
  assert.equal(JSON.stringify(result).includes('npm_registry_secret'), false);
  assert.equal(JSON.stringify(result).includes('header.payload.signature'), false);
  assert.equal(containsCredentialMaterial(result), false);
});

test('hosted OIDC probe normalizes Registry Unix-second exchange timestamps', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-unix-time-');
  const created = '2026-08-13T00:04:00.000Z';
  const expires = 1786583040;
  let requestCount = 0;
  const result = await runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    now: () => '2026-08-13T00:05:00.000Z',
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) return new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 });
      return new Response(JSON.stringify({ token_type: 'oidc', token: 'npm_registry_secret_that_must_not_escape', created, expires }), { status: 201 });
    },
  });
  assert.equal(result.npm.exchange.created, created);
  assert.equal(result.npm.exchange.expires, new Date(expires * 1000).toISOString());
  assert.equal(containsCredentialMaterial(result), false);
});

test('hosted OIDC probe fails closed on exchange rejection without parsing a secret body', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-reject-');
  let count = 0;
  await assert.rejects(runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    fetchImpl: async () => (++count === 1 ? new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 }) : new Response('registry-secret-body', { status: 403 })),
  }), (error) => error.code === 'npm_oidc_exchange_failed' && error.actual.status === 403);
});

test('hosted OIDC probe CLI creates the nested evidence directory even when blocked', (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-output-');
  const output = path.join(repo, 'runner-temp', 'authority', 'release-authority.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'scripts', 'release', 'release-authority-oidc-probe.mjs'),
    '--repo', repo,
    '--source-commit', fixtureCommit,
    '--workflow-sha256', sha256(workflow),
    '--output', output,
  ], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 1);
  const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityProbeSchema);
  assert.equal(evidence.status, 'blocked');
  assert.equal(containsCredentialMaterial(evidence), false);
});

test('release transaction runner dispatches and follows exactly one frozen workflow run', async () => {
  const currentRun = { id: runId, run_attempt: runAttempt, repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: fixtureCommit, status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml', html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}` };
  const calls = [];
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git rev-parse origin/main') return { status: 0, stdout: `${fixtureCommit}\n` };
    if (key === `git rev-parse ${fixtureCommit}^{tree}`) return { status: 0, stdout: `${candidateTree}\n` };
    if (key === `git show ${fixtureCommit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: JSON.stringify({ version }) };
    if (key === `git show ${fixtureCommit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key.startsWith('gh workflow run publish.yml ')) return { status: 0, stdout: '' };
    if (key.startsWith('gh run list ')) return { status: 0, stdout: JSON.stringify([{ databaseId: runId, displayTitle: `Release ${version} (fixture-release-id)`, headSha: fixtureCommit, status: 'queued', conclusion: null, url: currentRun.html_url }]) };
    if (key.startsWith(`gh run watch ${runId} `)) return { status: 0, stdout: '' };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}`) return { status: 0, stdout: JSON.stringify(currentRun) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  const result = await runHostedReleaseTransaction({ repo: '/fixture', sourceCommit: 'origin/main', remoteMain: 'origin/main', version, candidateBase, candidateTree, ghCommand: 'gh', timeoutMs: 1_000 }, { execute, wait: async () => {}, releaseId: 'fixture-release-id', onStatus: () => {} });
  assert.equal(result.status, 'passed');
  assert.equal(result.github.runId, runId);
  assert.equal(calls.filter((item) => item.startsWith('gh workflow run publish.yml ')).length, 1);
  for (const input of [`release_id=fixture-release-id`, `version=${version}`, `source_commit=${fixtureCommit}`, `candidate_base=${candidateBase}`, `candidate_tree=${candidateTree}`, `workflow_sha256=${sha256(workflow)}`]) {
    assert.equal(calls.some((item) => item.includes(input)), true, input);
  }
  assert.equal(calls.some((item) => item.startsWith('git tag ') || item.startsWith('git push ')), false);
  assert.equal(calls.some((item) => item.startsWith('npm ')), false);
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

test('release tag ensure creates once, reuses the same source, and rejects drift', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-tag-ensure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Buildr Test');
  git(repo, 'config', 'user.email', 'buildr@example.com');
  fs.writeFileSync(path.join(repo, 'fixture.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'one');
  const first = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', 'origin', 'main');
  assert.equal(inspectReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first }).action, 'create');
  const created = ensureReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first });
  assert.equal(created.status, 'passed');
  assert.equal(created.effects[0].type, 'tag-created');
  assert.equal(ensureReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first }).effects[0].type, 'tag-reused');
  fs.writeFileSync(path.join(repo, 'fixture.txt'), 'two\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'two');
  const second = git(repo, 'rev-parse', 'HEAD');
  const drift = inspectReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: second });
  assert.equal(drift.status, 'blocked');
  assert.equal(drift.diagnostic.code, 'release_tag_target_mismatch');
});

test('release tag ensure accepts a concurrent writer only when remote resolves to the same source', () => {
  const sourceCommit = 'd'.repeat(40);
  let pushed = false;
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    if (key === `git rev-parse ${sourceCommit}^{commit}`) return { status: 0, stdout: `${sourceCommit}\n` };
    if (key.startsWith('git ls-remote --tags origin ')) return { status: 0, stdout: pushed ? `${sourceCommit}\trefs/tags/v0.1.0\n` : '' };
    if (key.includes(' tag -a v0.1.0 ')) return { status: 0, stdout: '' };
    if (key === 'git push origin refs/tags/v0.1.0') {
      pushed = true;
      return { status: 1, stderr: 'remote ref appeared concurrently' };
    }
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  const result = ensureReleaseTag({ repo: '/fixture', tag: 'v0.1.0', sourceCommit }, { execute });
  assert.equal(result.status, 'passed');
  assert.equal(result.effects[0].type, 'tag-concurrently-reused');
});

test('release authority preflight CLI writes static ready evidence without control-plane mutation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-authority-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } })}\n`);
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Buildr Test'], ['config', 'user.email', 'buildr@example.com'], ['remote', 'add', 'origin', 'git@github.com:BuildrAI/Buildr.git'], ['add', '.'], ['commit', '-m', 'fixture']]) git(repo, ...args);
  const sourceCommit = git(repo, 'rev-parse', 'HEAD');
  const fakeGh = path.join(root, 'fake-gh.mjs');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node
const key=process.argv.slice(2).join(' ');
if(key==='repo view --json nameWithOwner') process.stdout.write(JSON.stringify({nameWithOwner:'BuildrAI/Buildr'}));
else if(key==='api repos/BuildrAI/Buildr/environments/npm-production') process.stdout.write(JSON.stringify({name:'npm-production'}));
else { process.stderr.write('unexpected gh command: '+key); process.exitCode=1; }
`, { mode: 0o755 });
  const evidencePath = path.join(root, 'authority-evidence.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'scripts', 'release', 'release-authority-preflight.mjs'),
    '--repo', repo,
    '--source-commit', sourceCommit,
    '--gh', fakeGh,
    '--output', evidencePath,
  ], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(evidence.status, 'ready');
  assert.deepEqual(evidence.observed.github, { repository: 'BuildrAI/Buildr', environment: 'npm-production' });
  assert.deepEqual(evidence.findings, []);
  assert.equal(containsCredentialMaterial(evidence), false);
});
