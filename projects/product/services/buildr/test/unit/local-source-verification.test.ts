import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLocalSourceVerification } from '../verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';
import { emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
const record = (id: string, status = 'passed', platform = 'darwin') => roundResult({ id, status, exitCode: status === 'passed' ? 0 : 1, durationMs: 4 }, 'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform, nodeVersion: '24.15.0' });
const fixture = (records: any[]) => ({ createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{ id: 'unit', platformScope: { kind: 'common' } }, { id: 'native', platformScope: { kind: 'native' } }] }), readRound: () => ({ ...emptyCandidateRound('round'), records }) });
test('candidate preparation preserves success and returns all failed or not-run checks', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit'), record('native', 'failed')]));
  assert.equal(missing.status, 'local-verification-required'); assert.deepEqual(missing.missingStepIds, ['native']);
  assert.equal(missing.transport, undefined); assert.match(missing.nextActions[0], /--round round/u);
});
test('candidate preparation transports ordinary original results without rechecking source or environment digests', async () => {
  const ready = await prepareLocalSourceVerification({ repo: '/different-source', roundId: 'round', env: { NODE_OPTIONS: 'changed' } }, fixture([record('unit'), record('native')]));
  assert.equal(ready.status, 'ready'); assert.equal(decodeCandidateSourceImport(ready.transport).records[0].origin.sourceCommit, 'original');
});
test('another platform and another candidate round cannot inherit native success', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit', 'passed', 'win32'), record('native', 'passed', 'win32')]));
  assert.deepEqual(missing.missingStepIds, ['native']);
  await assert.rejects(prepareLocalSourceVerification({ repo: '/source', roundId: 'next' }, fixture([record('unit')])), /another round/u);
});
test('plugin-only candidates require their own unit result and never require Buildr groups', async () => {
  const ready = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, fixture([record('dsh-plugin:unit')]));
  assert.equal(ready.status, 'ready');
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, fixture([]));
  assert.deepEqual(missing.missingStepIds, ['dsh-plugin:unit']);
});
