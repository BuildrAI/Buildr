import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleaseContext, validateReleaseContext } from '../../tools/release/release-readiness.ts';
import { releaseExecutionCommit, validateReleaseExecutorRecovery } from '../../tools/release/release-executor-recovery.ts';
import { createReleaseTransactionEvidence, validateReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';

const sha = (letter: string) => letter.repeat(40);
const digest = (letter: string) => `sha256-${letter.repeat(64)}`;
function original() {
  return createReleaseContext({ release: { version: '1.2.3', sourceCommit: sha('a'), sourceTree: sha('b') },
    convergence: { mainCommit: sha('c'), mainTree: sha('b'), devCommit: sha('d') } });
}
function recovered() {
  const context = original();
  const { schemaVersion: _schema, identity: _identity, ...input } = context;
  return createReleaseContext({ ...input, executorRecovery: { schemaVersion: 'buildr.release-executor-recovery/v1', sourceCommit: sha('e'), sourceTree: sha('f'),
    workflowDigest: digest('1'), originalContextIdentity: context.identity, previousRunId: 42, previousRunAttempt: 2, previousEvidenceIdentity: digest('2') } });
}

test('legacy context projection omits recovery and retains its exact original identity', () => {
  const context = original();
  assert.equal(Object.hasOwn(context, 'executorRecovery'), false);
  assert.deepEqual(validateReleaseContext(context), context);
  assert.equal(validateReleaseExecutorRecovery(context), null);
  assert.equal(releaseExecutionCommit(context), sha('c'));
  assert.equal(context.identity, 'sha256-7fbdee9685e4469f6dff2ff5a9879a473cebdbe239eaf719c8df2522525489f0');
});

test('recovery changes only execution identity and rejects any altered original context', () => {
  const context = recovered();
  assert.equal(releaseExecutionCommit(context), sha('e'));
  assert.equal(context.convergence.mainCommit, sha('c'));
  assert.equal(context.release.sourceCommit, sha('a'));
  assert.notEqual(context.identity, original().identity);
  for (const alter of [
    (value: any) => { value.release.sourceCommit = sha('9'); },
    (value: any) => { value.convergence.mainCommit = sha('9'); },
    (value: any) => { value.executorRecovery.previousRunAttempt = 0; },
    (value: any) => { value.executorRecovery.extra = true; },
    (value: any) => { value.executorRecovery = null; },
    (value: any) => { value.executorRecovery.sourceCommit = sha('c'); },
  ]) {
    const value = structuredClone(context); alter(value);
    assert.throws(() => validateReleaseContext(value));
  }
});

test('publication evidence binds the real execution head while preserving the original tag target', () => {
  const context = recovered();
  const input = { context, publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: 43, runAttempt: 1,
    runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/43', headSha: sha('e') }, outcome: 'passed',
    publicFacts: { version: '1.2.3', tagCommit: sha('c'), registryPublished: true, registryIntegrity: 'sha512-test', registrySmoke: 'passed', githubRelease: 'https://github.com/BuildrAI/Buildr/releases/tag/v1.2.3' } };
  const evidence = createReleaseTransactionEvidence(input);
  assert.deepEqual(validateReleaseTransactionEvidence(evidence), evidence);
  assert.equal(evidence.aggregateEligible, false);
  assert.equal(evidence.publish.headSha, sha('e'));
  assert.equal(evidence.release.tagCommit, sha('c'));
  assert.throws(() => createReleaseTransactionEvidence({ ...input, publish: { ...input.publish, headSha: sha('c') } }), /Publish run head/);
  assert.throws(() => createReleaseTransactionEvidence({ ...input, publicFacts: { ...input.publicFacts, tagCommit: sha('e') } }), /tag at/);
});
