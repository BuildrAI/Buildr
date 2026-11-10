import { createVerificationReuseIdentity } from '../verification/verification-reuse.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { verificationInputApplicability } from '../verification/result-applicability.ts';
import { createCandidateRoundExecution, roundResult, emptyCandidateRound } from '../verification/candidate-round.ts';

const identity = { key: 'key', stepId: 'check', contentIdentity: 'source', recipeIdentity: 'recipe', environmentIdentity: 'environment' };
test('applicability reports changed facts independently of round and origin policy', () => {
  assert.equal(verificationInputApplicability(identity, { ...identity }).applicable, true);
  for (const [field, reason] of [['contentIdentity', 'product-input-changed'], ['recipeIdentity', 'check-recipe-changed'], ['environmentIdentity', 'environment-changed']] as const) {
    assert.deepEqual(verificationInputApplicability(identity, { ...identity, [field]: 'changed' }).reasons, [reason]);
  }
  assert.equal(verificationInputApplicability(identity, null).applicable, false);
  assert.equal(verificationInputApplicability(undefined, identity).applicable, false);
});
test('old reusable round success lacking input proof is retained but cannot authorize reuse', () => {
  const prior = roundResult({ id: 'check', status: 'passed', exitCode: 0 }, 'round', { runId: 'run' }, { platform: process.platform });
  const execution = createCandidateRoundExecution({ steps: [{ id: 'check', reuse: { scope: 'backend' }, executor: { type: 'command' } }] },
    { productRoot: process.cwd(), round: { roundId: 'round', imports: { ...emptyCandidateRound('round'), records: [prior] } } },
    { collectSnapshot: () => null });
  assert.equal(execution.hits.size, 0);
  assert.equal(execution.finish([], true).records.length, 1);
});

test('empty-round planning cannot reuse success and does not scan execution inputs', () => {
  const result = createCandidateRoundExecution({ steps: [{ id: 'check', reuse: { scope: 'backend' }, executor: { type: 'command' } }] },
    { productRoot: process.cwd(), inspectOnly: true, round: { roundId: 'new' } },
    { collectSnapshot: () => assert.fail('no prior proof exists to inspect') });
  assert.equal(result.hits.size, 0);
  assert.equal(result.explanation.steps[0].disposition, 'execute');
});

test('input drift during a round revokes current reuse without rewriting original success', () => {
  const sha = `sha256-${'a'.repeat(64)}`;
  const step = { id: 'check', reuse: { scope: 'backend' }, executor: { type: 'command' } };
  const snapshot: any = { contentIdentities: { backend: sha }, environment: { platform: process.platform, arch: process.arch,
    nodeVersion: process.versions.node, tools: { 'backend-dependencies': sha }, variablesIdentity: sha } };
  const proof = createVerificationReuseIdentity(step as any, snapshot);
  const original = roundResult({ id: 'check', status: 'passed', exitCode: 0, inputIdentity: proof }, 'round',
    { runId: 'original' }, { platform: process.platform });
  const execution = createCandidateRoundExecution({ steps: [step] }, { productRoot: process.cwd(),
    round: { roundId: 'round', imports: { ...emptyCandidateRound('round'), records: [original] } } }, { collectSnapshot: () => snapshot });
  assert.equal(execution.hits.size, 1);
  snapshot.contentIdentities.backend = `sha256-${'b'.repeat(64)}`;
  const result = { id: 'check', status: 'passed', exitCode: 0, disposition: 'reused' };
  const log = execution.finish([result], true);
  assert.equal(result.status, 'failed');
  assert.equal(log.records[0].result.status, 'passed');
  assert.equal(log.records[0].result.inputIdentity.key, proof!.key);
});
