import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLocalSourceVerification } from '../verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';
import { emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
import { parseSourceArgs } from '../verification/source.ts';
const record = (id: string, status = 'passed', platform = 'darwin') => roundResult({ id, status, exitCode: status === 'passed' ? 0 : 1, durationMs: 4 }, 'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform, nodeVersion: '24.15.0' });
const fixture = (records: any[]) => ({ pluginUnitStep: () => ({ id: 'dsh-plugin:unit', inputs: ['services/dsh-plugin/**'], platformScope: { kind: 'common' } }), createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{ id: 'unit', platformScope: { kind: 'common' } }, { id: 'native', platformScope: { kind: 'native' } }] }), readRound: () => ({ ...emptyCandidateRound('round'), records }) });
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
  assert.deepEqual(parseSourceArgs(['--round', 'round', '--selected', 'a,b:c']).selected, ['a', 'b:c']);
  assert.throws(() => parseSourceArgs(['--selected', 'a b']), /comma-separated/u);
  assert.throws(() => parseSourceArgs(['--selected', 'a', '--selected', 'b']), /only be supplied once/u);
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
test('broad content identity changes reuse a check when source ownership is unaffected', async () => {
  const previous = { key: 'sha256-old', stepId: 'integration-connections', contentIdentity: 'sha256-old-content',
    recipeIdentity: 'sha256-recipe', environmentIdentity: 'sha256-environment' };
  const current = { ...previous, key: 'sha256-new', contentIdentity: 'sha256-new-content' };
  const record = roundResult({ id: 'integration-connections', status: 'passed', exitCode: 0, durationMs: 4, inputIdentity: previous },
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: 'darwin', nodeVersion: '24.15.0' });
  const fixture = {
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{
      id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' },
      executor: { type: 'node', file: 'test/verification/example.ts' },
    }] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records: [record] }),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
    inputsFor: () => current,
  };
  const reused = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture);
  assert.equal(reused.status, 'ready');
  assert.deepEqual(reused.missingStepIds, []);
  assert.deepEqual(reused.invalidatedStepIds, []);

  const affected = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...fixture,
    changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
  });
  assert.deepEqual(affected.missingStepIds, ['integration-connections']);
  assert.deepEqual(affected.invalidatedStepIds, ['integration-connections']);
});
test('unaffected source content still rejects recipe changes', async () => {
  const previous = { key: 'sha256-old', stepId: 'integration-connections', contentIdentity: 'sha256-old-content',
    recipeIdentity: 'sha256-recipe', environmentIdentity: 'sha256-environment' };
  const record = roundResult({ id: 'integration-connections', status: 'passed', exitCode: 0, durationMs: 4, inputIdentity: previous },
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: 'darwin', nodeVersion: '24.15.0' });
  const changed = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{
      id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' },
      executor: { type: 'node', file: 'test/verification/example.ts' },
    }] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records: [record] }),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
    inputsFor: () => ({ ...previous, key: 'sha256-new', contentIdentity: 'sha256-new-content', recipeIdentity: 'sha256-new-recipe' }),
  });
  assert.deepEqual(changed.missingStepIds, ['integration-connections']);
  assert.deepEqual(changed.invalidatedStepIds, ['integration-connections']);
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
test('user-selected scope retains passed checks outside the selection without revalidating their environment', async () => {
  const previous = { key: 'sha256-old', stepId: 'integration-connections', contentIdentity: 'sha256-old-content',
    recipeIdentity: 'sha256-recipe', environmentIdentity: 'sha256-old-environment' };
  const withIdentity = (id: string) => roundResult({ id, status: 'passed', exitCode: 0, durationMs: 4, inputIdentity: { ...previous, stepId: id } },
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: 'darwin', nodeVersion: '24.15.0' });
  const userScopeFixture = (records: any[]) => ({
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [
      { id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' }, executor: { type: 'node-test', files: ['test/integration/connection-skills-cli.test.ts'] } },
      { id: 'integration-code', platformScope: { kind: 'common' }, reuse: { scope: 'repository' }, executor: { type: 'node-test', files: ['test/integration/code-commit-application.test.ts'] } },
    ] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records }),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
    inputsFor: () => ({ ...previous, key: 'sha256-new', contentIdentity: 'sha256-new-content', environmentIdentity: 'sha256-new-environment' }),
  });
  const scoped = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', selectedStepIds: ['integration-connections'] },
    userScopeFixture([withIdentity('integration-connections'), withIdentity('integration-code')]));
  assert.deepEqual(scoped.missingStepIds, ['integration-connections']);
  assert.deepEqual(scoped.invalidatedStepIds, ['integration-connections']);
  assert.deepEqual(scoped.retainedStepIds, ['integration-code']);
  assert.deepEqual(scoped.missingBaselineStepIds, []);
  assert.match(scoped.nextActions[0], /--selected integration-connections/u);

  const absent = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', selectedStepIds: ['integration-connections'] },
    userScopeFixture([withIdentity('integration-connections')]));
  assert.deepEqual(absent.missingStepIds, ['integration-connections', 'integration-code']);
  assert.deepEqual(absent.missingBaselineStepIds, ['integration-code']);
});
