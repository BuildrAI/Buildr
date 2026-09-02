import assert from 'node:assert/strict';
import test from 'node:test';

import { createReleaseContext, evaluateReleaseReadiness, validateReleaseContext } from '../../tools/release/release-readiness.mjs';

const digest = (letter) => `sha256-${letter.repeat(64)}`;
const sha = (letter) => letter.repeat(40);

function input(overrides = {}) {
  return {
    selection: { identity: digest('1'), version: '1.2.3', branch: 'release-1.2.3', releaseHead: sha('a'), releaseTree: sha('b'), generation: 2, status: 'frozen' },
    release: { version: '1.2.3', sourceCommit: sha('a'), sourceTree: sha('b') },
    candidate: { workflow: '.github/workflows/verify.yml', runId: 42, runAttempt: 1, runUrl: 'https://github.example/runs/42', sourceCommit: sha('a'), sourceTree: sha('b'), registryIdentity: digest('2'), aggregateIdentity: digest('3'), status: 'passed' },
    artifact: { artifactName: 'candidate-package', sourceCommit: sha('a'), filename: 'buildr.tgz', size: 100, sha256: '4'.repeat(64), integrity: 'sha512-test', applicationPayloadDigest: digest('5') },
    convergence: { mainCommit: sha('c'), mainTree: sha('b'), devCommit: sha('d'), devTree: sha('e') },
    environment: { identity: digest('6'), status: 'ready', taskId: 'release-1.2.3', nodeVersion: '24.15.0', nodeIdentity: digest('7') },
    node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('7') },
    workflow: { path: '.github/workflows/publish.yml', digest: digest('8'), repository: 'BuildrAI/Buildr', environment: 'npm-production' },
    taskCorrelation: { identity: digest('9'), status: 'passed', sourceCommit: sha('a'), sourceTree: sha('b'), remoteRef: sha('c') },
    ...overrides,
  };
}

test('normalizes one complete release context into a stable digest', () => {
  const context = createReleaseContext(input());
  const reordered = createReleaseContext({ ...input(), workflow: { repository: 'BuildrAI/Buildr', environment: 'npm-production', digest: digest('8'), path: '.github/workflows/publish.yml' } });
  assert.equal(context.identity, reordered.identity);
  assert.deepEqual(validateReleaseContext(context), context);
});

test('dispatch readiness is collect-all, frozen and always side-effect free', () => {
  const result = evaluateReleaseReadiness({ stage: 'dispatch-check', context: createReleaseContext(input()) });
  assert.equal(result.status, 'ready');
  assert.equal(result.frozen, true);
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.deferredChecks.map((item) => item.id), ['npm-production-approval', 'hosted-oidc-exchange', 'pre-tag-remote-readback']);
});

test('readiness retains independent Candidate, artifact, Task, Node, workflow and main findings', () => {
  const result = evaluateReleaseReadiness({
    stage: 'dispatch-check',
    context: createReleaseContext(input({
      candidate: { ...input().candidate, status: 'failed', sourceCommit: sha('f') },
      artifact: { ...input().artifact, artifactName: 'other-package', sourceCommit: sha('e') },
      convergence: { ...input().convergence, mainTree: sha('f') },
      node: { ...input().node, version: '24.19.0', executionIdentity: digest('f') },
      workflow: { ...input().workflow, path: '.github/workflows/other.yml' },
      taskCorrelation: { ...input().taskCorrelation, status: 'blocked', sourceTree: sha('f') },
    })),
  });
  const codes = new Set(result.findings.map((item) => item.code));
  for (const code of ['candidate-not-passed', 'candidate-source-mismatch', 'artifact-name-mismatch', 'task-correlation-not-passed', 'node-environment-mismatch', 'workflow-authority-mismatch', 'main-tree-mismatch']) assert.equal(codes.has(code), true, code);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.effects, []);
});

test('pre-candidate reports missing owner facts without requiring future Candidate/main facts', () => {
  const context = createReleaseContext(input({ candidate: null, artifact: null, convergence: null, taskCorrelation: null }));
  const result = evaluateReleaseReadiness({ stage: 'pre-candidate', context });
  assert.deepEqual(result.findings.map((item) => item.code), ['taskCorrelation-missing']);
  assert.equal(result.frozen, false);
});

test('reconciled release readiness requires matching merge-commit provenance', () => {
  const reconciliationIdentity = digest('r');
  const context = createReleaseContext(input({
    selection: { ...input().selection, reconciliationIdentity },
    convergence: {
      ...input().convergence,
      mergeCommit: sha('c'),
      mergeParents: [sha('d'), sha('a')],
      mergeMethod: 'merge',
      reconciliationIdentity,
    },
  }));
  const ready = evaluateReleaseReadiness({ stage: 'dispatch-check', context });
  assert.equal(ready.status, 'ready', JSON.stringify(ready));

  const blocked = evaluateReleaseReadiness({
    stage: 'dispatch-check',
    context: createReleaseContext({
      ...input(),
      selection: { ...input().selection, reconciliationIdentity },
      convergence: { ...input().convergence, mergeCommit: sha('c'), mergeParents: [sha('d'), sha('a')], mergeMethod: 'squash', reconciliationIdentity: digest('x') },
    }),
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.findings.some((item) => item.code === 'main-reconciliation-identity-mismatch'), true);
  assert.equal(blocked.findings.some((item) => item.code === 'main-merge-method-mismatch'), true);
});
