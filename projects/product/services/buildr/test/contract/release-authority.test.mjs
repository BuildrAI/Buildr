import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareNpmTrustedPublishers,
  npmSupportsTrustList,
  parseJsonDocuments,
  releasePublishAuthority,
} from '../../scripts/release/release-authority.mjs';
import {
  inspectWorkflowAuthority,
  runReleaseAuthorityPreflight,
} from '../../scripts/release/release-authority-preflight.mjs';
import {
  authorityFailureDiagnostic,
  runTrustedPublish,
} from '../../scripts/release/trusted-publish.mjs';

const commit = 'a'.repeat(40);
const workflow = `jobs:
  publish:
    environment: npm-production
    permissions:
      id-token: write
    steps:
      - run: node scripts/release/trusted-publish.mjs candidate.tgz --access public
`;

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
    if (key === 'npm --version') return { status: 0, stdout: '11.17.0\n' };
    if (key === 'npm trust list @buildr-ai/buildr --json') return { status: 0, stdout: JSON.stringify({ id: 'publisher', type: 'github', repository: 'BuildrAI/Buildr', file: 'publish.yml', environment: 'npm-production', permissions: ['createPackage'] }) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
}

test('authority tuple maps exactly to one npm publish Trusted Publisher', () => {
  const current = { id: 'publisher', type: 'github', repository: 'BuildrAI/Buildr', file: 'publish.yml', environment: 'npm-production', permissions: ['createPackage'] };
  assert.equal(compareNpmTrustedPublishers(current).ok, true);
  assert.equal(compareNpmTrustedPublishers({ ...current, repository: 'old-owner/Buildr' }).ok, false);
  assert.equal(compareNpmTrustedPublishers({ ...current, permissions: ['createPackage', 'createStagedPackage'] }).ok, false);
  assert.equal(compareNpmTrustedPublishers([current, current]).ok, false);
  assert.equal(npmSupportsTrustList('11.15.0'), true);
  assert.equal(npmSupportsTrustList('11.14.9'), false);
  assert.deepEqual(parseJsonDocuments(`${JSON.stringify(current)}\n${JSON.stringify({ ...current, id: 'second' })}`).length, 2);
});

test('workflow authority requires protected OIDC and the single wrapper action', () => {
  assert.deepEqual(inspectWorkflowAuthority(workflow), {
    environment: 'npm-production', idToken: 'write', allowedActions: ['npm publish'], wrapperInvocations: 1, rawPublishInvocations: 0,
  });
  assert.deepEqual(inspectWorkflowAuthority(workflow.replace('trusted-publish.mjs', 'other.mjs')).allowedActions, []);
  assert.deepEqual(inspectWorkflowAuthority(workflow.replace('node scripts/release/trusted-publish.mjs candidate.tgz --access public', 'npm publish candidate.tgz')).allowedActions, []);
});

test('release authority preflight is ready only for authenticated current facts', () => {
  const ready = runReleaseAuthorityPreflight({ repo: '/fixture' }, { execute: successfulExecutor(), now: () => '2026-08-13T00:00:00.000Z' });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.expected, releasePublishAuthority);
  assert.equal(ready.sourceCommit, commit);
  assert.equal(ready.findings.length, 0);

  const unauthenticated = runReleaseAuthorityPreflight({ repo: '/fixture' }, {
    execute: successfulExecutor(new Map([['npm trust list @buildr-ai/buildr --json', { status: 1, stderr: 'npm error code E401' }]])),
    now: () => '2026-08-13T00:00:00.000Z',
  });
  assert.equal(unauthenticated.status, 'blocked');
  assert.equal(unauthenticated.findings.at(-1).code, 'npm_trusted_publisher_unavailable');
  assert.equal(unauthenticated.findings.at(-1).actual, 'E401');

  const oldNpm = runReleaseAuthorityPreflight({ repo: '/fixture' }, {
    execute: successfulExecutor(new Map([['npm --version', { status: 0, stdout: '11.12.1\n' }]])),
    now: () => '2026-08-13T00:00:00.000Z',
  });
  assert.equal(oldNpm.status, 'blocked');
  assert.equal(oldNpm.findings.at(-1).code, 'npm_trust_list_unsupported');
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
