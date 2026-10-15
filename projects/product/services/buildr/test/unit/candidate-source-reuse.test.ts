import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  candidateSourceImportFromEnvironment, decodeCandidateSourceImport, encodeCandidateSourceImport,
  MAX_SOURCE_IMPORT_CHARACTERS, planCandidateSourceReuse,
} from '../verification/candidate-source-reuse.ts';

const record = (stepId: string, runner = 'macos', passed = true) => ({
  schemaVersion: 'buildr.verification-source-result/v1',
  identity: { key: `sha256-${'a'.repeat(64)}`, stepId },
  environment: { runner }, result: { status: passed ? 'passed' : 'failed' },
  origin: { finishedAt: '2026-10-15T00:00:00.000Z' },
});
const bundle = (records: any[] = []) => ({ schemaVersion: 'buildr.verification-source-bundle/v1', records });

test('source transport preserves the portable records and rejects modified or oversized input', () => {
  const original = bundle([record('unit')]);
  assert.deepEqual(decodeCandidateSourceImport(encodeCandidateSourceImport(original)), original);
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
    { id: 'mac', runner: 'macos', stepIds: ['unit', 'contract'] },
    { id: 'windows', runner: 'windows', stepIds: ['system'] },
    { id: 'artifact', runner: 'macos', stepIds: ['unit'], requiresArtifact: true },
  ];
  const validate = (r: any, _step: string, runner: string) => r.result.status === 'passed' && r.environment.runner === runner;
  const partial = planCandidateSourceReuse(shards, bundle([record('unit'), record('contract', 'macos', false), record('system')]), validate);
  assert.deepEqual(partial.sourceShards.map(s => s.id), ['mac', 'windows']);
  assert.deepEqual(partial.reusedStepIds, ['unit']);
  const complete = planCandidateSourceReuse(shards, bundle([record('unit'), record('contract')]), validate);
  assert.deepEqual(complete.sourceShards.map(s => s.id), ['windows']);
  assert.deepEqual(complete.reusedShards.map(s => s.shard.id), ['mac']);
  assert.equal(complete.reusedShards[0].records.length, 2);
});
