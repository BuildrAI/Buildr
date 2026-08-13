import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeArtifactName,
  releaseAuthorityProbeSchema,
  releasePublishAuthority,
  sha256,
} from '../../scripts/release/release-authority.mjs';
import { runReleaseAuthorityOidcProbe } from '../../scripts/release/release-authority-oidc-probe.mjs';
import { runHostedReleaseAuthorityProbe } from '../../scripts/release/release-authority-probe-runner.mjs';
import { containsCredentialMaterial } from '../../scripts/release/release-authority-preflight.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = 987;
const runAttempt = 1;
const fixtureCommit = 'a'.repeat(40);
const workflow = `on:
  push:
    tags: ["v*"]
  workflow_dispatch:
jobs:
  authority-probe:
    if: github.event_name == 'workflow_dispatch'
    environment: npm-production
    permissions:
      id-token: write
    steps:
      - run: node scripts/release/release-authority-oidc-probe.mjs --source-commit fixture
  publish:
    if: github.event_name == 'push'
    environment: npm-production
    permissions:
      id-token: write
    steps:
      - run: node scripts/release/trusted-publish.mjs candidate.tgz --access public
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

test('hosted OIDC probe exchanges identity but never retains either token', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-authority-probe-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
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
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-authority-probe-unix-time-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
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
  assert.equal(result.status, 'ready');
  assert.equal(result.npm.exchange.created, created);
  assert.equal(result.npm.exchange.expires, new Date(expires * 1000).toISOString());
  assert.equal(containsCredentialMaterial(result), false);
});

test('hosted OIDC probe fails closed on exchange rejection without parsing a secret body', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-authority-probe-reject-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  let count = 0;
  await assert.rejects(runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    fetchImpl: async () => (++count === 1 ? new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 }) : new Response('registry-secret-body', { status: 403 })),
  }), (error) => error.code === 'npm_oidc_exchange_failed' && error.actual.status === 403);
});

test('hosted OIDC probe CLI creates the nested artifact directory even when blocked', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-authority-probe-output-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  const output = path.join(repo, 'runner-temp', 'authority-probe', 'release-authority-probe.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'scripts', 'release', 'release-authority-oidc-probe.mjs'),
    '--repo', repo,
    '--source-commit', fixtureCommit,
    '--workflow-sha256', sha256(workflow),
    '--output', output,
  ], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(output), true);
  const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityProbeSchema);
  assert.equal(evidence.status, 'blocked');
  assert.equal(containsCredentialMaterial(evidence), false);
});

test('hosted probe runner dispatches one frozen run, downloads its artifact, and returns v2 evidence', async () => {
  const now = new Date().toISOString();
  const created = new Date(Date.now() - 30_000).toISOString();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const currentRun = { id: runId, run_attempt: runAttempt, repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: fixtureCommit, status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml', html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}` };
  const artifactName = releaseAuthorityProbeArtifactName(runId, runAttempt);
  const probe = { schemaVersion: releaseAuthorityProbeSchema, status: 'ready', expected: releasePublishAuthority, sourceCommit: fixtureCommit, workflow: { path: '.github/workflows/publish.yml', sha256: sha256(workflow) }, artifact: { name: artifactName }, github: { repository: 'BuildrAI/Buildr', workflow: 'publish.yml', workflowRef: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main', environment: 'npm-production', event: 'workflow_dispatch', runId, runAttempt, headSha: fixtureCommit, runUrl: currentRun.html_url }, npm: { package: '@buildr-ai/buildr', registry: 'https://registry.npmjs.org', exchange: { status: 201, tokenType: 'oidc', created, expires } }, findings: [], observedAt: now };
  const calls = [];
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git rev-parse origin/main' || key === `git rev-parse ${fixtureCommit}`) return { status: 0, stdout: `${fixtureCommit}\n` };
    if (key === `git show ${fixtureCommit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key === `git show ${fixtureCommit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'https://github.com/BuildrAI/Buildr.git' } }) };
    if (key === 'git remote get-url origin') return { status: 0, stdout: 'git@github.com:BuildrAI/Buildr.git\n' };
    if (key.startsWith('gh workflow run publish.yml ')) return { status: 0, stdout: '' };
    if (key.startsWith('gh run list ')) return { status: 0, stdout: JSON.stringify([{ databaseId: runId, displayTitle: 'Authority probe fixture-probe-id', headSha: fixtureCommit, status: 'queued', conclusion: null }]) };
    if (key.startsWith(`gh run watch ${runId} `)) return { status: 0, stdout: '' };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}`) return { status: 0, stdout: JSON.stringify(currentRun) };
    if (key === 'gh repo view --json nameWithOwner') return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'BuildrAI/Buildr' }) };
    if (key === 'gh api repos/BuildrAI/Buildr/environments/npm-production') return { status: 0, stdout: JSON.stringify({ name: 'npm-production' }) };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}/artifacts`) return { status: 0, stdout: JSON.stringify({ artifacts: [{ name: artifactName, expired: false }] }) };
    if (key.startsWith(`gh run download ${runId} `)) {
      fs.writeFileSync(path.join(args[args.indexOf('--dir') + 1], 'release-authority-probe.json'), JSON.stringify(probe));
      return { status: 0, stdout: '' };
    }
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  const result = await runHostedReleaseAuthorityProbe({ repo: '/fixture', sourceCommit: 'origin/main', remoteMain: 'origin/main', ghCommand: 'gh', timeoutMs: 1_000 }, { execute, wait: async () => {}, probeId: 'fixture-probe-id', onStatus: () => {} });
  assert.equal(result.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(result.status, 'ready');
  assert.equal(calls.filter((item) => item.startsWith('gh workflow run publish.yml ')).length, 1);
  assert.equal(calls.some((item) => item.includes(`source_commit=${fixtureCommit}`)), true);
  assert.equal(calls.some((item) => item.includes(`workflow_sha256=${sha256(workflow)}`)), true);
  assert.equal(calls.some((item) => item.startsWith(`gh run download ${runId} `)), true);
  assert.equal(calls.some((item) => item.startsWith('npm ')), false);
});

test('release authority preflight CLI writes hosted ready evidence without npm CLI or control-plane mutation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-authority-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } })}\n`);
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Buildr Test'], ['config', 'user.email', 'buildr@example.com'], ['remote', 'add', 'origin', 'git@github.com:BuildrAI/Buildr.git'], ['add', '.'], ['commit', '-m', 'fixture']]) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const observedAt = new Date().toISOString();
  const created = new Date(Date.now() - 30_000).toISOString();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const artifactName = releaseAuthorityProbeArtifactName(runId, runAttempt);
  const run = {
    id: runId,
    run_attempt: runAttempt,
    repository: { full_name: 'BuildrAI/Buildr' },
    event: 'workflow_dispatch',
    head_sha: sourceCommit,
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/publish.yml',
    html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`,
  };
  const probe = {
    schemaVersion: releaseAuthorityProbeSchema,
    status: 'ready',
    expected: releasePublishAuthority,
    sourceCommit,
    workflow: { path: '.github/workflows/publish.yml', sha256: sha256(workflow) },
    artifact: { name: artifactName },
    github: { repository: 'BuildrAI/Buildr', workflow: 'publish.yml', workflowRef: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main', environment: 'npm-production', event: 'workflow_dispatch', runId, runAttempt, headSha: sourceCommit, runUrl: run.html_url },
    npm: { package: '@buildr-ai/buildr', registry: 'https://registry.npmjs.org', exchange: { status: 201, tokenType: 'oidc', created, expires } },
    findings: [],
    observedAt,
  };
  const probePath = path.join(root, 'probe.json');
  fs.writeFileSync(probePath, `${JSON.stringify(probe)}\n`);
  const fakeGh = path.join(root, 'fake-gh.mjs');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node
const a=process.argv.slice(2); const key=a.join(' ');
if(key==='repo view --json nameWithOwner') process.stdout.write(JSON.stringify({nameWithOwner:'BuildrAI/Buildr'}));
else if(key==='api repos/BuildrAI/Buildr/environments/npm-production') process.stdout.write(JSON.stringify({name:'npm-production'}));
else if(key==='api repos/BuildrAI/Buildr/actions/runs/${runId}') process.stdout.write(${JSON.stringify(JSON.stringify(run))});
else if(key==='api repos/BuildrAI/Buildr/actions/runs/${runId}/artifacts') process.stdout.write(JSON.stringify({artifacts:[{name:${JSON.stringify(artifactName)},expired:false}]}));
else { process.stderr.write('unexpected gh command: '+key); process.exitCode=1; }
`, { mode: 0o755 });
  const evidencePath = path.join(root, 'authority-evidence.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'scripts', 'release', 'release-authority-preflight.mjs'),
    '--repo', repo,
    '--source-commit', sourceCommit,
    '--gh', fakeGh,
    '--run-id', String(runId),
    '--probe-evidence', probePath,
    '--output', evidencePath,
  ], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.sourceCommit, sourceCommit);
  assert.equal(evidence.observed.github.run.id, runId);
  assert.equal(evidence.observed.probe.artifact.name, artifactName);
  assert.deepEqual(evidence.findings, []);
  assert.equal(JSON.stringify(evidence).includes('"token":'), false);
  assert.equal(JSON.stringify(evidence).includes('eyJ'), false);
});
