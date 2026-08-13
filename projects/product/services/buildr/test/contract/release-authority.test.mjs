import assert from 'node:assert/strict';
import test from 'node:test';

import {
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeArtifactName,
  releaseAuthorityProbeSchema,
  releasePublishAuthority,
  sha256,
} from '../../scripts/release/release-authority.mjs';
import {
  containsCredentialMaterial,
  inspectWorkflowAuthority,
  runReleaseAuthorityPreflight,
} from '../../scripts/release/release-authority-preflight.mjs';
import {
  authorityFailureDiagnostic,
  runTrustedPublish,
} from '../../scripts/release/trusted-publish.mjs';

const commit = 'a'.repeat(40);
const runId = 123;
const runAttempt = 2;
const now = '2026-08-13T00:05:00.000Z';
const created = '2026-08-13T00:04:00.000Z';
const expires = '2026-08-13T01:04:00.000Z';
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

function probeEvidence(overrides = {}) {
  return {
    schemaVersion: releaseAuthorityProbeSchema,
    status: 'ready',
    expected: releasePublishAuthority,
    sourceCommit: commit,
    workflow: { path: '.github/workflows/publish.yml', sha256: sha256(workflow) },
    artifact: { name: releaseAuthorityProbeArtifactName(runId, runAttempt) },
    github: {
      repository: 'BuildrAI/Buildr',
      workflow: 'publish.yml',
      workflowRef: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main',
      environment: 'npm-production',
      event: 'workflow_dispatch',
      runId,
      runAttempt,
      headSha: commit,
      runUrl: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`,
    },
    npm: {
      package: '@buildr-ai/buildr',
      registry: 'https://registry.npmjs.org',
      exchange: { status: 201, tokenType: 'oidc', created, expires },
    },
    findings: [],
    observedAt: now,
    ...overrides,
  };
}

function githubRun(overrides = {}) {
  return {
    id: runId,
    run_attempt: runAttempt,
    repository: { full_name: 'BuildrAI/Buildr' },
    event: 'workflow_dispatch',
    head_sha: commit,
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/publish.yml',
    html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`,
    ...overrides,
  };
}

function successfulExecutor(overrides = new Map()) {
  return (command, args) => {
    const key = [command, ...args].join(' ');
    if (overrides.has(key)) return overrides.get(key);
    if (key === 'git rev-parse HEAD') return { status: 0, stdout: `${commit}\n` };
    if (key === `git show ${commit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } }) };
    if (key === 'git remote get-url origin') return { status: 0, stdout: 'git@github.com:BuildrAI/Buildr.git\n' };
    if (key === `git show ${commit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key === 'gh repo view --json nameWithOwner') return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'BuildrAI/Buildr' }) };
    if (key === 'gh api repos/BuildrAI/Buildr/environments/npm-production') return { status: 0, stdout: JSON.stringify({ name: 'npm-production' }) };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}`) return { status: 0, stdout: JSON.stringify(githubRun()) };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}/artifacts`) return { status: 0, stdout: JSON.stringify({ artifacts: [{ name: releaseAuthorityProbeArtifactName(runId, runAttempt), expired: false }] }) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
}

test('workflow authority isolates hosted probe from tag publish', () => {
  assert.deepEqual(inspectWorkflowAuthority(workflow), {
    publish: { environment: 'npm-production', idToken: 'write', condition: "github.event_name == 'push'", scriptInvocations: 1, allowedActions: ['npm publish'], wrapperInvocations: 1, rawPublishInvocations: 0 },
    probe: { environment: 'npm-production', idToken: 'write', condition: "github.event_name == 'workflow_dispatch'", scriptInvocations: 1 },
  });
  assert.deepEqual(inspectWorkflowAuthority(workflow.replace('trusted-publish.mjs', 'other.mjs')).publish.allowedActions, []);
  assert.deepEqual(inspectWorkflowAuthority(workflow.replace('node scripts/release/trusted-publish.mjs candidate.tgz --access public', 'npm publish candidate.tgz')).publish.allowedActions, []);
});

test('release authority preflight binds current GitHub run and probe artifact without npm CLI', () => {
  const ready = runReleaseAuthorityPreflight({ repo: '/fixture', runId, probeEvidence: probeEvidence() }, { execute: successfulExecutor(), now: () => now, nowMs: () => Date.parse(now) });
  assert.equal(ready.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.expected, releasePublishAuthority);
  assert.equal(ready.sourceCommit, commit);
  assert.equal(ready.findings.length, 0);

  const staleRun = runReleaseAuthorityPreflight({ repo: '/fixture', runId, probeEvidence: probeEvidence() }, {
    execute: successfulExecutor(new Map([[`gh api repos/BuildrAI/Buildr/actions/runs/${runId}`, { status: 0, stdout: JSON.stringify(githubRun({ head_sha: 'b'.repeat(40) })) }]])),
    now: () => now,
    nowMs: () => Date.parse(now),
  });
  assert.equal(staleRun.status, 'blocked');
  assert.equal(staleRun.findings.some((item) => item.code === 'github_probe_run_mismatch'), true);

  const expired = runReleaseAuthorityPreflight({ repo: '/fixture', runId, probeEvidence: probeEvidence({ observedAt: '2026-08-12T00:00:00.000Z' }) }, { execute: successfulExecutor(), now: () => now, nowMs: () => Date.parse(now) });
  assert.equal(expired.status, 'blocked');
  assert.equal(expired.findings.some((item) => item.code === 'probe_evidence_stale'), true);
});

test('credential scanner rejects token fields and JWT material', () => {
  assert.equal(containsCredentialMaterial({ token: 'anything' }), true);
  assert.equal(containsCredentialMaterial({ nested: 'eyJheader.eyJpayload.signature' }), true);
  assert.equal(containsCredentialMaterial(probeEvidence()), false);
});

test('trusted publish preserves npm result and adds only authority-related diagnostics', () => {
  const failure = runTrustedPublish(['candidate.tgz', '--access', 'public'], {
    execute: (command, args) => ({ status: 1, stdout: '', stderr: `npm ERR! code E404\n${command} ${args.join(' ')}` }),
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /E404/);
  assert.deepEqual(failure.diagnostic.expected, releasePublishAuthority);
  assert.match(failure.diagnostic.recovery.join('\n'), /GitHub-hosted/);
  assert.equal(authorityFailureDiagnostic('npm ERR! code E500'), null);

  const success = runTrustedPublish(['candidate.tgz'], { execute: () => ({ status: 0, stdout: '+ @buildr-ai/buildr', stderr: '' }) });
  assert.equal(success.status, 0);
  assert.equal(success.diagnostic, null);
});
