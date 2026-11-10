import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { CANDIDATE_CI_SHARDS, verificationStepById } from '../verification/registry.ts';
import {
  candidateSourceImportFromEnvironment, candidateSourceShardReuse, decodeCandidateSourceImport, encodeCandidateSourceImport,
  MAX_SOURCE_IMPORT_CHARACTERS, planCandidateSourceReuse, reusedCandidateSourceResult, validateCandidateSourceRecord,
} from '../verification/candidate-source-reuse.ts';
import { createVerificationReuseIdentity, type VerificationReuseEnvironment, type VerificationReuseSnapshot } from '../verification/verification-reuse.ts';

const record = (stepId: string, runner = 'macos', passed = true) => ({
  schemaVersion: 'buildr.verification-source-result/v1',
  identity: { key: `sha256-${'a'.repeat(64)}`, stepId },
  environment: { runner }, result: { status: passed ? 'passed' : 'failed' },
  origin: { finishedAt: '2026-10-15T00:00:00.000Z' },
});
const bundle = (records: any[] = []) => ({ schemaVersion: 'buildr.verification-source-bundle/v1', records });

test('complete reusable local source proof leaves only the other system native boundaries on either machine', () => {
  for (const local of ['macos', 'windows']) {
    const source = CANDIDATE_CI_SHARDS.filter((shard: any) => !shard.requiresArtifact && !shard.producesArtifact
      && (shard.platformScope.kind === 'common' || shard.runner === local));
    const records = source.flatMap((shard: any) => shard.stepIds.filter((id: string) => verificationStepById(id).reuse).map((id: string) => record(id, local)));
    const plan = planCandidateSourceReuse(CANDIDATE_CI_SHARDS, bundle(records), (item, id, runner) =>
      verificationStepById(id).platformScope.kind === 'common' || item.environment.runner === runner);
    assert.deepEqual(plan.sourceShards.map((shard: any) => shard.id), [`platform-boundaries-${local === 'macos' ? 'windows' : 'macos'}`]);
    assert.deepEqual(plan.reusedShards.map(item => item.shard.id), source.map((shard: any) => shard.id));
  }
});

test('source transport preserves the portable records and rejects modified or oversized input', () => {
  const original = bundle([record('unit')]);
  assert.deepEqual(decodeCandidateSourceImport(encodeCandidateSourceImport(original)), original);
  const digest = `sha256-${crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex')}`;
  const legacy = gzipSync(JSON.stringify({ schemaVersion: 'buildr.candidate-source-import/v1', digest, bundle: original })).toString('base64');
  assert.deepEqual(decodeCandidateSourceImport(legacy), original);
  assert.throws(() => decodeCandidateSourceImport('a'.repeat(MAX_SOURCE_IMPORT_CHARACTERS + 1)), /budget/);
  assert.throws(() => decodeCandidateSourceImport('not a payload'), /invalid/);
  const corrupt = gzipSync(JSON.stringify({ schemaVersion: 'buildr.candidate-source-import/v1', digest: 'wrong', bundle: original })).toString('base64');
  assert.throws(() => decodeCandidateSourceImport(corrupt), /integrity/);
  const bomb = gzipSync('x'.repeat(2 * 1024 * 1024 + 1)).toString('base64');
  assert.throws(() => decodeCandidateSourceImport(bomb), /byte budget/);
});

test('external pull requests cannot import passing claims to skip source execution', () => {
  const encoded = encodeCandidateSourceImport(bundle([record('unit')]));
  assert.throws(() => candidateSourceImportFromEnvironment({ GITHUB_EVENT_NAME: 'pull_request', BUILDR_SOURCE_VERIFICATION: encoded }), /controlled manual/);
  assert.deepEqual(candidateSourceImportFromEnvironment({ GITHUB_EVENT_NAME: 'workflow_dispatch', BUILDR_SOURCE_VERIFICATION: encoded }), bundle([record('unit')]));
  assert.deepEqual(candidateSourceImportFromEnvironment({}), bundle());
});

test('closed source shard coverage can be reused while missing, failed and other-platform results remain selected', () => {
  const shards = [
    { id: 'mac', runner: 'macos', stepIds: ['unit', 'source-contracts'] },
    { id: 'windows', runner: 'windows', stepIds: ['system'] },
    { id: 'artifact', runner: 'macos', stepIds: ['unit'], requiresArtifact: true },
  ];
  const validate = (r: any, _step: string, runner: string) => r.result.status === 'passed' && r.environment.runner === runner;
  const partial = planCandidateSourceReuse(shards, bundle([record('unit'), record('source-contracts', 'macos', false), record('system')]), validate);
  assert.deepEqual(partial.sourceShards.map(s => s.id), ['mac', 'windows']);
  assert.deepEqual(partial.reusedStepIds, ['unit']);
  const complete = planCandidateSourceReuse(shards, bundle([record('unit'), record('source-contracts')]), validate);
  assert.deepEqual(complete.sourceShards.map(s => s.id), ['windows']);
  assert.deepEqual(complete.reusedShards.map(s => s.shard.id), ['mac']);
  assert.equal(complete.reusedShards[0].records.length, 2);
});

test('a partial source shard keeps valid sibling checks for transport and executes only the missing check', () => {
  const shard = { id: 'mac', runner: 'macos', platformScope: { kind: 'common' }, stepIds: ['unit', 'source-contracts'] };
  const bundle = (records: any[]) => ({ schemaVersion: 'buildr.verification-source-bundle/v1', records });
  const validate = (item: any, _step: string, runner: string) => item.result.status === 'passed' && item.environment.runner === runner;
  const split = candidateSourceShardReuse(shard, bundle([record('unit')]), validate);
  assert.deepEqual(split.reused.map(item => item.stepId), ['unit']);
  assert.deepEqual(split.missingStepIds, ['source-contracts']);
  const plan = planCandidateSourceReuse([shard], bundle([record('unit')]), validate);
  assert.deepEqual(plan.sourceShards.map(item => item.id), ['mac']);
  assert.deepEqual(plan.reusedStepIds, ['unit']);
  assert.deepEqual(plan.reusedByShard[0].missingStepIds, ['source-contracts']);
  const result = reusedCandidateSourceResult(split.reused[0].record);
  assert.equal(result.disposition, 'reused');
  assert.equal(result.durationMs, 0);
  assert.equal(result.sourceRecord, split.reused[0].record);
});

test('platform source proofs retain their original same-OS environment instead of the checker host', () => {
  const step = { id: 'native-macos', executor: { type: 'node-test', files: ['native.test.ts'] },
    reuse: { scope: 'platform-backend' as const, tools: ['git'] }, platformScope: { kind: 'platform', runners: ['macos'] } };
  const environment: VerificationReuseEnvironment = { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0',
    tools: { 'backend-dependencies': `sha256-${'a'.repeat(64)}`, git: '2.50.1' }, variablesIdentity: `sha256-${'b'.repeat(64)}` };
  const snapshot: VerificationReuseSnapshot = { productRoot: '/checkout/projects/product/services/buildr', repositoryRoot: '/checkout',
    sourceCommit: 'c'.repeat(40), gitIdentity: `sha256-${'d'.repeat(64)}`,
    contentIdentities: { backend: `sha256-${'e'.repeat(64)}`, 'platform-backend': `sha256-${'f'.repeat(64)}`,
      web: `sha256-${'1'.repeat(64)}`, product: `sha256-${'2'.repeat(64)}`, repository: `sha256-${'3'.repeat(64)}`,
      plugin: `sha256-${'4'.repeat(64)}`, runtime: `sha256-${'5'.repeat(64)}` }, environment };
  const identity = createVerificationReuseIdentity(step, snapshot);
  assert.ok(identity);
  const record = {
    schemaVersion: 'buildr.candidate-round-result/v1', roundId: 'round',
    identity: { stepId: step.id, key: `round:${step.id}` }, origin: { runId: 'source-1', sourceCommit: snapshot.sourceCommit,
      startedAt: '2026-11-09T00:00:00.000Z', finishedAt: '2026-11-09T00:00:01.000Z' },
    environment: { platform: environment.platform, arch: environment.arch, nodeVersion: environment.nodeVersion },
    result: { id: step.id, status: 'passed', exitCode: 0, inputIdentity: identity, inputEnvironment: environment },
  };
  const checker = { ...snapshot, productRoot: '/checker/projects/product/services/buildr', repositoryRoot: '/checker',
    environment: { ...environment, platform: 'linux', arch: 'x64', nodeVersion: '24.22.2' } };
  assert.equal(validateCandidateSourceRecord({ record, step, runner: 'macos', selectionId: 'round', snapshot: checker }), true);
  assert.equal(validateCandidateSourceRecord({ record, step, runner: 'windows', selectionId: 'round', snapshot: checker }), false);
  const later: VerificationReuseSnapshot = { ...checker, sourceCommit: '9'.repeat(40),
    contentIdentities: { ...checker.contentIdentities, 'platform-backend': `sha256-${'8'.repeat(64)}` } };
  const scoped = { ...step, inputs: ['test/kept.test.ts'] };
  const validate = (changed: string[] | null, selected = scoped, evidence = record) =>
    validateCandidateSourceRecord({ record: evidence, step: selected, runner: 'macos', selectionId: 'round', snapshot: later,
      readChangedPaths(from, to) { assert.equal(from, snapshot.sourceCommit); assert.equal(to, later.sourceCommit); return changed; } });
  assert.equal(validate(['projects/product/services/buildr/test/unrelated.test.ts']), true,
    'CI must honor the ordinary source owner proof that broad-scope changes do not affect this check');
  assert.equal(validate(['projects/product/services/buildr/test/kept.test.ts']), false);
  assert.equal(validate(null), false, 'unknown source changes cannot retain a broad-scope proof');
  const changedRecipe = { ...scoped, executor: { ...scoped.executor, args: ['--no-warnings'] } };
  assert.equal(validate(['projects/product/services/buildr/test/unrelated.test.ts'], changedRecipe), false, 'recipe changes still invalidate');
  assert.equal(validate(['projects/product/services/buildr/test/unrelated.test.ts'], scoped,
    { ...record, result: { ...record.result, inputEnvironment: { ...environment, variablesIdentity: `sha256-${'7'.repeat(64)}` } } }), false,
    'execution environment changes still invalidate');
});
