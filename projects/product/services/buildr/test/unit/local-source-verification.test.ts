import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLocalSourceVerification } from '../verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';
import { emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
import { parseSourceArgs, selectSourceVerificationSubset } from '../verification/source.ts';
const inputs = (id: string) => ({ key: `sha256-${id}`, stepId: id, contentIdentity: 'sha256-content',
  recipeIdentity: 'sha256-recipe', environmentIdentity: 'sha256-environment' });
const record = (id: string, status = 'passed', platform = process.platform, inputIdentity = inputs(id)) => roundResult(
  { id, status, exitCode: status === 'passed' ? 0 : 1, durationMs: 4, inputIdentity }, 'round',
  { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' },
  { platform, arch: process.arch, nodeVersion: process.versions.node });
const observation = { sourceHead: () => 'original', inputsFor: (step: { id: string }) => inputs(step.id), fileSteps: () => [] };
const plan = (steps: any[]) => ({ status: 'ready', runner: process.platform, steps: steps.map(step => ({ reuse: { scope: 'repository' }, ...step })) });
const fixture = (records: any[]) => ({ ...observation,
  pluginUnitStep: () => ({ id: 'dsh-plugin:unit', inputs: ['services/dsh-plugin/**'], platformScope: { kind: 'common' }, reuse: { scope: 'repository' } }),
  createSourcePlan: () => plan([{ id: 'unit', platformScope: { kind: 'common' } }, { id: 'native', platformScope: { kind: 'native' } }]),
  readRound: () => ({ ...emptyCandidateRound('round'), records }),
});
const ownedFixture = (records: any[]) => ({ ...observation,
  createSourcePlan: () => plan([
    { id: 'integration-connections', platformScope: { kind: 'common' }, executor: { type: 'node-test', files: ['test/integration/connection-skills-cli.test.ts'] } },
    { id: 'integration-code', platformScope: { kind: 'common' }, executor: { type: 'node-test', files: ['test/integration/code-commit-application.test.ts'] } },
  ]),
  readRound: () => ({ ...emptyCandidateRound('round'), records }),
});
test('candidate preparation preserves success and returns all failed or not-run checks', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit'), record('native', 'failed')]));
  assert.equal(missing.status, 'local-verification-required'); assert.deepEqual(missing.missingStepIds, ['native']);
  assert.equal(missing.transport, undefined); assert.match(missing.nextActions[0], /--round round/u);
});
test('candidate preparation reruns records without a fingerprint or a confirmed source identity', async () => {
  const legacy = record('unit');
  delete legacy.result.inputIdentity;
  for (const [dependencies, missing] of [
    [fixture([legacy, record('native')]), ['unit']],
    [{ ...fixture([record('unit'), record('native')]), sourceHead: () => null }, ['unit', 'native']],
    [fixture([{ ...record('unit'), origin: { runId: 'original' } }, record('native')]), ['unit']],
  ] as const) {
    const result = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, dependencies);
    assert.equal(result.status, 'local-verification-required');
    assert.deepEqual(result.missingStepIds, missing);
    assert.equal(result.transport, undefined);
  }
});
test('candidate preparation transports original results only when the fingerprint matches', async () => {
  const deps = fixture([record('unit'), record('native')]);
  const options = { repo: '/source', roundId: 'round' };
  const ready = await prepareLocalSourceVerification(options, deps);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.verificationPlan.counts, { execute: 0, reuse: 2, notRun: 0 });
  assert.equal(decodeCandidateSourceImport(ready.transport).records[0].origin.sourceCommit, 'original');
  const mismatch = await prepareLocalSourceVerification(options, { ...deps, inputsFor: (step: { id: string }) =>
    step.id === 'unit' ? { ...inputs(step.id), key: 'sha256-changed', contentIdentity: 'sha256-changed' } : inputs(step.id) });
  assert.deepEqual(mismatch.missingStepIds, ['unit']);
  assert.equal(mismatch.transport, undefined);
});
test('another platform and another candidate round cannot inherit native success', async () => {
  const otherPlatform = process.platform === 'win32' ? 'darwin' : 'win32';
  const missing = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, fixture([record('unit'), record('native', 'passed', otherPlatform)]));
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
test('source subset keeps plan dependencies and ignores checks owned by another target', () => {
  const plan = { steps: [{ id: 'candidate-tarball', dependsOn: [] }, { id: 'application-payload-artifact', dependsOn: ['candidate-tarball'] }] };
  const subset = selectSourceVerificationSubset(plan, ['application-payload-artifact', 'integration-windows-native']);
  assert.deepEqual(subset.steps.map((step: any) => step.id), ['candidate-tarball', 'application-payload-artifact']);
  assert.throws(() => selectSourceVerificationSubset(plan, ['not-a-real-check']), /Unknown selected verification step/u);
});
test('source changes after a passed record invalidate only steps that own the changed inputs', async () => {
  const changed = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
  });
  assert.deepEqual(changed.missingStepIds, ['integration-connections']);
  assert.deepEqual(changed.invalidatedStepIds, ['integration-connections']);
  assert.deepEqual(changed.verificationPlan.counts, { execute: 1, reuse: 1, notRun: 0 });
  assert.deepEqual(changed.verificationPlan.invalidationsByInput, [{ input: 'projects/product/services/buildr/src/modules/connection-skills/application/example.ts', checkIds: ['integration-connections'], scope: 'single' }]);
  assert.doesNotMatch(changed.nextActions[0], /--invalidate/u);
  assert.deepEqual(changed.verificationPlan.invalidationsByReason, [{ reason: 'declared-input-changed', checkIds: ['integration-connections'] }]);
  const unrelated = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
  });
  assert.deepEqual(unrelated.missingStepIds, ['integration-code']);
  assert.deepEqual(unrelated.invalidatedStepIds, ['integration-code']);
});
test('changed-path observation compares the recorded source with the observed head', async () => {
  const calls: string[][] = [];
  const result = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture([record('integration-connections'), record('integration-code')]),
    sourceHead: () => 'new',
    changedPaths: (from: string, to: string) => { calls.push([from, to]); return []; },
  });
  assert.deepEqual(calls, [['original', 'new']]);
  assert.deepEqual(result.missingStepIds, []);
});
test('unrelated changes do not invalidate a broad content fingerprint', async () => {
  const previous = { key: 'sha256-old', stepId: 'integration-connections', contentIdentity: 'sha256-old-content',
    recipeIdentity: 'sha256-recipe', environmentIdentity: 'sha256-environment' };
  const current = { ...previous, key: 'sha256-new', contentIdentity: 'sha256-new-content' };
  const record = roundResult({ id: 'integration-connections', status: 'passed', exitCode: 0, durationMs: 4, inputIdentity: previous },
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node });
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
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node });
  const changed = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{
      id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' },
      executor: { type: 'node', file: 'test/verification/example.ts' },
    }] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records: [record] }),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/code/application/example.ts'],
    fileSteps: () => [],
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
  assert.equal(pluginChanged.diagnostic.code, 'candidate-full-rerun-required');
  assert.doesNotMatch(pluginChanged.nextActions[0], /--invalidate/u);
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
  assert.deepEqual(missing.verificationPlan.invalidationsByReason, [{ reason: 'source-diff-unavailable', checkIds: ['integration-connections', 'integration-code'] }]);
});
test('release script changes invalidate their owning steps through workspace-relative inputs', async () => {
  const releaseFixture = (records: any[]) => ({ ...observation,
    createSourcePlan: () => plan([
      { id: 'integration-candidate-release', platformScope: { kind: 'common' } },
      { id: 'integration-code', platformScope: { kind: 'common' } },
    ]),
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
    'round', { runId: 'original', sourceCommit: 'original', finishedAt: '2026-10-19' }, { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node });
  const userScopeFixture = (records: any[]) => ({
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [
      { id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' }, executor: { type: 'node-test', files: ['test/integration/connection-skills-cli.test.ts'] } },
      { id: 'integration-code', platformScope: { kind: 'common' }, reuse: { scope: 'repository' }, executor: { type: 'node-test', files: ['test/integration/code-commit-application.test.ts'] } },
    ] }),
    readRound: () => ({ ...emptyCandidateRound('round'), records }),
    sourceHead: () => 'new', changedPaths: () => ['projects/product/services/buildr/src/modules/connection-skills/application/example.ts'],
    fileSteps: () => [],
    inputsFor: () => ({ ...previous, key: 'sha256-new', contentIdentity: 'sha256-new-content', environmentIdentity: 'sha256-new-environment' }),
  });
  const scoped = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', selectedStepIds: ['integration-connections'] },
    userScopeFixture([withIdentity('integration-connections'), withIdentity('integration-code')]));
  assert.deepEqual(scoped.missingStepIds, ['integration-connections']);
  assert.deepEqual(scoped.invalidatedStepIds, ['integration-connections']);
  assert.deepEqual(scoped.retainedStepIds, ['integration-code']);
  assert.deepEqual(scoped.outOfScopeStepIds, ['integration-code']);
  assert.match(scoped.nextActions[0], /--selected integration-connections/u);

  const absent = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round', selectedStepIds: ['integration-connections'] },
    userScopeFixture([withIdentity('integration-connections')]));
  assert.deepEqual(absent.missingStepIds, ['integration-connections']);
  assert.deepEqual(absent.retainedStepIds, []);
  assert.deepEqual(absent.outOfScopeStepIds, ['integration-code']);
  assert.equal(absent.verificationPlan.steps.find((step: any) => step.id === 'integration-code').disposition, 'not-run');
  assert.deepEqual(absent.verificationPlan.steps.find((step: any) => step.id === 'integration-code').reasons, ['declared-out-of-scope']);
});

test('preparer-only changes and retired failures do not expand the current candidate plan', async () => {
  const records = [record('integration-connections'), record('integration-code'), record('harness-products-consumption', 'failed')];
  const ready = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...ownedFixture(records), sourceHead: () => 'new',
    changedPaths: () => ['projects/product/services/buildr/test/verification/local-source-verification.ts'],
  });
  assert.deepEqual(ready.verificationPlan.counts, { execute: 0, reuse: 2, notRun: 0 });
  assert.ok(!ready.verificationPlan.steps.some((step: any) => step.id === 'harness-products-consumption'));
  assert.equal(decodeCandidateSourceImport(ready.transport).records.find((entry: any) => entry.identity.stepId === 'harness-products-consumption').result.status, 'failed');
});

test('one shared input reports all affected checks without counting it as multiple triggers', async () => {
  const changedPath = 'projects/product/services/buildr/package-lock.json';
  const result = await prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...observation,
    createSourcePlan: () => plan(['unit', 'native'].map(id => ({ id, inputs: ['package-lock.json'] }))),
    readRound: () => ({ ...emptyCandidateRound('round'), records: [record('unit'), record('native')] }),
    sourceHead: () => 'new', changedPaths: () => [changedPath],
  });
  assert.deepEqual(result.verificationPlan.invalidationsByInput, [{ input: changedPath, checkIds: ['unit', 'native'], scope: 'shared' }]);
});

test('non-portable compatibility proof is accepted only for the clean exact candidate', async () => {
  const id = 'compatibility';
  const proof = record(id);
  delete proof.result.inputIdentity;
  Object.assign(proof.result, { processCleanup: { status: 'clean' }, stateCleanup: { status: 'cleaned' }, childSignal: null });
  const verify = (candidate: any, source = 'original') => prepareLocalSourceVerification({ repo: '/source', roundId: 'round' }, {
    ...fixture([candidate]), sourceHead: () => source,
    createSourcePlan: () => plan([{ id, reuse: undefined, platformScope: { kind: 'native' } }]),
  });
  assert.equal((await verify(proof)).status, 'ready');
  assert.equal((await verify(proof, 'other')).status, 'local-verification-required');
  assert.equal((await verify({ ...proof, result: { ...proof.result, stateCleanup: undefined } })).status, 'local-verification-required');
});
