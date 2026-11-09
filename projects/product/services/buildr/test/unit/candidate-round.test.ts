import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateRoundExecution, emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';
import { createVerificationReuseIdentity } from '../verification/verification-reuse.ts';

function record(id: string): any {
  return roundResult({ id, status: 'passed', exitCode: 0, durationMs: 1 }, 'round',
    { kind: 'local', runId: 'run', sourceCommit: 'source', startedAt: '2026-10-20T00:00:00.000Z', finishedAt: '2026-10-20T00:00:00.001Z' },
    { platform: 'darwin', arch: 'arm64', nodeVersion: '24.15.0' });
}

test('explicit invalidation executes only the selected steps while retaining other passed records', () => {
  const imports = { ...emptyCandidateRound('round'), records: [record('unit'), record('native')] };
  const execution = createCandidateRoundExecution({ runner: 'darwin', steps: [
    { id: 'unit', platformScope: { kind: 'common' } },
    { id: 'native', platformScope: { kind: 'common' } },
  ] }, { productRoot: process.cwd(), round: { roundId: 'round', imports, invalidStepIds: ['unit'] } });
  assert.equal(execution.hits.has('unit'), false);
  assert.equal(execution.hits.has('native'), true);
  assert.deepEqual(execution.explanation.steps.find((step: any) => step.id === 'unit').reasons, ['source-inputs-changed']);
  assert.equal(execution.explanation.estimate.executedCount, 1);
  assert.equal(execution.explanation.estimate.reusedCount, 1);
});

test('candidate round reuses a passed check when changed source is outside its ownership', () => {
  const step = {
    id: 'integration-connections', platformScope: { kind: 'common' }, reuse: { scope: 'repository' as const },
    executor: { type: 'node', file: 'test/verification/example.ts' },
  };
  const environment = { platform: 'darwin', arch: 'arm64', nodeVersion: process.versions.node,
    variablesIdentity: `sha256-${'1'.repeat(64)}`, tools: { 'backend-dependencies': `sha256-${'2'.repeat(64)}`,
      'web-dependencies': `sha256-${'3'.repeat(64)}` } };
  const oldSnapshot: any = { productRoot: process.cwd(), repositoryRoot: process.cwd(), sourceCommit: 'source',
    contentIdentities: { repository: `sha256-${'4'.repeat(64)}`, backend: `sha256-${'5'.repeat(64)}`,
      'platform-backend': `sha256-${'6'.repeat(64)}`, web: `sha256-${'7'.repeat(64)}`, plugin: `sha256-${'8'.repeat(64)}`,
      product: `sha256-${'9'.repeat(64)}`, runtime: `sha256-${'a'.repeat(64)}` }, environment };
  const previous = createVerificationReuseIdentity(step, oldSnapshot)!;
  const record = roundResult({ id: step.id, status: 'passed', exitCode: 0, durationMs: 1, inputIdentity: previous },
    'round', { kind: 'local', runId: 'run', sourceCommit: 'source', startedAt: '2026-10-20T00:00:00.000Z',
      finishedAt: '2026-10-20T00:00:00.001Z' }, { platform: 'darwin', arch: 'arm64', nodeVersion: process.versions.node });
  const imports = { ...emptyCandidateRound('round'), records: [record] };
  const currentSnapshot = { ...oldSnapshot, contentIdentities: { ...oldSnapshot.contentIdentities,
    repository: `sha256-${'b'.repeat(64)}` } };
  const execute = (changed: string[]) => createCandidateRoundExecution({ runner: 'darwin', steps: [step] },
    { productRoot: process.cwd(), round: { roundId: 'round', imports } },
    { collectSnapshot: () => currentSnapshot, changedPaths: () => changed });

  assert.equal(execute(['projects/product/services/buildr/src/modules/code/application/example.ts']).hits.has(step.id), true);
  assert.equal(execute(['projects/product/services/buildr/src/modules/connection-skills/application/example.ts']).hits.has(step.id), false);
});
