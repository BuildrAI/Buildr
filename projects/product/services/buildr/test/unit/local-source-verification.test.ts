import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLocalSourceVerification } from '../verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';
import { emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
import { parseSourceArgs } from '../verification/source.ts';
const record = (id: string, status = 'passed', platform = 'darwin') => roundResult({ id, status, exitCode: status === 'passed' ? 0 : 1, durationMs: 4 }, 'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform, nodeVersion: '24.15.0' });
const fixture = (records: any[]) => ({ createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{ id: 'unit', platformScope: { kind: 'common' } }, { id: 'native', platformScope: { kind: 'native' } }] }), readRound: () => ({ ...emptyCandidateRound('round'), records }) });
const ownedFixture = (records: any[]) => ({
  createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [
    { id: 'integration-connections', platformScope: { kind: 'common' }, executor: { type: 'node-test', files: ['test/integration/connection-skills-cli.test.ts'] } },
    { id: 'integration-code', platformScope: { kind: 'common' }, executor: { type: 'node-test', files: ['test/integration/code-commit-application.test.ts'] } },
  ] }),
  readRound: () => ({ ...emptyCandidateRound('round'), records }),
});
test('candidate preparation preserves success and returns all failed or not-run checks', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit'), record('native', 'failed')]));
  assert.equal(missing.status, 'local-verification-required'); assert.deepEqual(missing.missingStepIds, ['native']);
  assert.equal(missing.transport, undefined); assert.match(missing.nextActions[0], /--round round/u);
});
test('candidate preparation transports ordinary original results when the source head cannot be observed', async () => {
  const ready = await prepareLocalSourceVerification({ repo: '/different-source', roundId: 'round', env: { NODE_OPTIONS: 'changed' } }, fixture([record('unit'), record('native')]));
  assert.equal(ready.status, 'ready'); assert.equal(decodeCandidateSourceImport(ready.transport).records[0].origin.sourceCommit, 'original');
});
test('another platform and another candidate round cannot inherit native success', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit', 'passed', 'win32'), record('native', 'passed', 'win32')]));
  assert.deepEqual(missing.missingStepIds, ['native']);
  await assert.rejects(prepareLocalSourceVerification({ repo: '/source', roundId: 'next' }, fixture([record('unit')])), /another round/u);
});
test('source verification accepts explicit invalidation step ids', () => {
  assert.deepEqual(parseSourceArgs(['--round', 'round', '--invalidate', 'a,b:c']).invalidate, ['a', 'b:c']);
  assert.throws(() => parseSourceArgs(['--invalidate', 'a b']), /comma-separated/u);
  assert.throws(() => parseSourceArgs(['--invalidate', 'a', '--invalidate', 'b']), /only be supplied once/u);
});
test('source changes after a passed record invalidate only steps that own the changed inputs', async () => {
  const changed = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
  });
  assert.deepEqual(changed.missingStepIds, ['integration-connections']);
  assert.deepEqual(changed.invalidatedStepIds, ['integration-connections']);
  assert.match(changed.nextActions[0], /--invalidate integration-connections/u);
  assert.deepEqual(changed.nextActions[1], '源码自记录后发生变化，仅需重跑受影响步骤：integration-connections。');
  const unrelated = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
  });
  assert.deepEqual(unrelated.missingStepIds, ['integration-code']);
  assert.deepEqual(unrelated.invalidatedStepIds, ['integration-code']);
});
test('plugin source changes invalidate only the plugin step', async () => {
  const pluginChanged = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, {
    ...fixture([record('dsh-plugin:unit')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/dsh-plugin/tools/verify-source.ts'],
  });
  assert.deepEqual(pluginChanged.missingStepIds, ['dsh-plugin:unit']);
  assert.deepEqual(pluginChanged.invalidatedStepIds, ['dsh-plugin:unit']);
  assert.match(pluginChanged.nextActions[0], /--invalidate dsh-plugin:unit/u);
  const buildrChanged = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, {
    ...fixture([record('dsh-plugin:unit')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
  });
  assert.equal(buildrChanged.status, 'ready');
  assert.deepEqual(buildrChanged.invalidatedStepIds, []);
});
test('unprovable source differences invalidate the step instead of reusing its old record', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => null,
  });
  assert.deepEqual(missing.missingStepIds, ['integration-connections', 'integration-code']);
  assert.deepEqual(missing.invalidatedStepIds, ['integration-code', 'integration-connections']);
});
test('release script changes invalidate their owning steps through workspace-relative inputs', async () => {
  const releaseFixture = (records: any[]) => ({
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [
      { id: 'integration-candidate-release', platformScope: { kind: 'common' } },
      { id: 'integration-code', platformScope: { kind: 'common' } },
    ] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records }),
  });
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...releaseFixture([record('integration-candidate-release'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => ['skills/buildr-release/scripts/release-targets.ts'],
  });
  assert.deepEqual(missing.missingStepIds, ['integration-candidate-release']);
  assert.deepEqual(missing.invalidatedStepIds, ['integration-candidate-release']);
});
test('plugin-only candidates require their own unit result and never require Buildr groups', async () => {
  const ready = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, fixture([record('dsh-plugin:unit')]));
  assert.equal(ready.status, 'ready');
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', packages: ['dsh-plugin'] }, fixture([]));
  assert.deepEqual(missing.missingStepIds, ['dsh-plugin:unit']);
});
