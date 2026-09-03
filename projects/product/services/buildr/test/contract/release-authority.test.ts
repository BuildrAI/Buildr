import assert from 'node:assert/strict';
import test from 'node:test';

import {
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeArtifactName,
  releaseAuthorityProbeSchema,
  releasePublishAuthority,
  sha256,
} from '../../tools/release/release-authority.ts';
import {
  containsCredentialMaterial,
  inspectWorkflowAuthority,
  runReleaseAuthorityPreflight,
} from '../../tools/release/release-authority-preflight.ts';
import { checkReleaseAuthorityEvidence } from '../../tools/release/release-convergence.ts';
import {
  authorityFailureDiagnostic,
  runTrustedPublish,
} from '../../tools/release/trusted-publish.ts';

const commit: any = 'a'.repeat(40);
const runId: any = 123;
const runAttempt: any = 2;
const now: any = '2026-08-13T00:05:00.000Z';
const created: any = '2026-08-13T00:04:00.000Z';
const expires: any = '2026-08-13T01:04:00.000Z';
const workflow: any = `on:
  workflow_dispatch:
    inputs:
      release_id: { required: true, type: string }
      release_context: { required: true, type: string }
      context_digest: { required: true, type: string }
      candidate_run_id: { required: true, type: string }
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
    permissions:
      contents: write
      id-token: write
    steps:
      - run: node tools/release/release-authority-oidc-probe.ts --source-commit fixture
      - run: node tools/release/release-convergence.ts --stage pre-tag
      - run: node tools/release/release-tag-ensure.ts preflight v0.1.0 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      - run: node tools/release/release-tag-ensure.ts ensure v0.1.0 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      - run: node tools/release/trusted-publish.ts candidate.tgz --access public
`;

function probeEvidence(overrides: any = {}): any  {
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

function successfulExecutor(overrides: any = new Map()): any  {
  return (command: any, args: any) => {
    const key: any = [command, ...args].join(' ');
    if (overrides.has(key)) return overrides.get(key);
    if (key === 'git rev-parse HEAD') return { status: 0, stdout: `${commit}\n` };
    if (key === `git show ${commit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } }) };
    if (key === 'git remote get-url origin') return { status: 0, stdout: 'git@github.com:BuildrAI/Buildr.git\n' };
    if (key === `git show ${commit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key === 'gh repo view --json nameWithOwner') return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'BuildrAI/Buildr' }) };
    if (key === 'gh api repos/BuildrAI/Buildr/environments/npm-production') return { status: 0, stdout: JSON.stringify({ name: 'npm-production' }) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
}

test('workflow authority has one dispatch entry and one protected transaction owner', () => {
  const observed: any = inspectWorkflowAuthority(workflow);
  assert.deepEqual(observed.triggers, {
    workflowDispatch: true,
    dispatchInputs: ['candidate_base', 'candidate_run_id', 'candidate_tree', 'context_digest', 'release_context', 'release_id', 'source_commit', 'version', 'workflow_sha256'],
    push: false,
    pushTags: [],
  });
  assert.deepEqual(observed.environmentJobs, [{ id: 'release', environment: 'npm-production' }]);
  assert.deepEqual(observed.privilegedJobs, []);
  assert.deepEqual(observed.release, {
    environment: 'npm-production',
    idTokenPermission: 'write',
    contentsPermission: 'write',
    needs: ['candidate', 'contract', 'host-node', 'launcher'],
    oidcProbeInvocations: 1,
    preTagInvocations: 1,
    tagPreflightInvocations: 1,
    tagEnsureInvocations: 1,
    trustedPublishInvocations: 1,
    rawPublishInvocations: 0,
  });
});

test('release authority preflight validates static topology without dispatching or exchanging credentials', () => {
  const ready: any = runReleaseAuthorityPreflight({ repo: '/fixture' }, { execute: successfulExecutor(), now: () => now });
  assert.equal(ready.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.expected, releasePublishAuthority);
  assert.equal(ready.sourceCommit, commit);
  assert.equal(ready.findings.length, 0);
  assert.equal(containsCredentialMaterial(ready), false);

  const duplicateEnvironment: any = workflow.replace('  contract: { runs-on: ubuntu-latest }', '  contract: { runs-on: ubuntu-latest, environment: npm-production }');
  const blocked: any = runReleaseAuthorityPreflight({ repo: '/fixture' }, {
    execute: successfulExecutor(new Map([[`git show ${commit}:.github/workflows/publish.yml`, { status: 0, stdout: duplicateEnvironment }]])),
    now: () => now,
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.findings.some((item: any) => item.code === 'workflow_environment_owner_mismatch'), true);
});

test('pre-tag convergence consumes credential-free evidence from the current protected job', () => {
  assert.deepEqual(checkReleaseAuthorityEvidence({ evidence: probeEvidence(), sourceCommit: commit, workflowSource: workflow, nowMs: Date.parse(now) }), []);
  const wrongRun: any = checkReleaseAuthorityEvidence({ evidence: probeEvidence({ github: { ...probeEvidence().github, runAttempt: 0 } }), sourceCommit: commit, workflowSource: workflow, nowMs: Date.parse(now) });
  assert.equal(wrongRun.some((item: any) => item.code === 'release_authority_github_identity_mismatch'), true);
  const expiredEvidence: any = probeEvidence({ observedAt: '2026-08-12T00:00:00.000Z' });
  assert.equal(checkReleaseAuthorityEvidence({ evidence: expiredEvidence, sourceCommit: commit, workflowSource: workflow, nowMs: Date.parse(now) }).some((item: any) => item.code === 'release_authority_evidence_stale'), true);
  const drifted: any = probeEvidence({ workflow: { path: '.github/workflows/publish.yml', sha256: '0'.repeat(64) } });
  assert.equal(checkReleaseAuthorityEvidence({ evidence: drifted, sourceCommit: commit, workflowSource: workflow, nowMs: Date.parse(now) }).some((item: any) => item.code === 'release_authority_workflow_mismatch'), true);
});

test('credential scanner rejects token fields and JWT material', () => {
  assert.equal(containsCredentialMaterial({ token: 'anything' }), true);
  assert.equal(containsCredentialMaterial({ nested: 'eyJheader.eyJpayload.signature' }), true);
  assert.equal(containsCredentialMaterial(probeEvidence()), false);
});

test('trusted publish preserves npm result and adds only authority-related diagnostics', () => {
  const failure: any = runTrustedPublish(['candidate.tgz', '--access', 'public'], {
    execute: (command: any, args: any) => ({ status: 1, stdout: '', stderr: `npm ERR! code E404\n${command} ${args.join(' ')}` }),
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /E404/);
  assert.deepEqual(failure.diagnostic.expected, releasePublishAuthority);
  assert.match(failure.diagnostic.recovery.join('\n'), /GitHub-hosted/);
  assert.equal(authorityFailureDiagnostic('npm ERR! code E500'), null);

  const success: any = runTrustedPublish(['candidate.tgz'], { execute: () => ({ status: 0, stdout: '+ @buildr-ai/buildr', stderr: '' }) });
  assert.equal(success.status, 0);
  assert.equal(success.diagnostic, null);
});
