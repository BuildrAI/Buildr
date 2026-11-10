import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateRoundExecution, emptyCandidateRound, roundResult } from '../verification/candidate-round.ts';

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
