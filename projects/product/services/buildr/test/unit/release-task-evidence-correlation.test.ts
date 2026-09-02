import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createReleaseTaskEvidenceCorrelation, inspectReleaseTaskEvidenceCorrelation, validateReleaseTaskEvidenceCorrelation } from '../../tools/release/release-task-evidence-correlation.ts';
import { createReleaseTransactionContext } from '../../tools/release/release-transaction-evidence.mjs';

const digest = (letter: string): string => `sha256-${letter.repeat(64)}`;
const sha = (letter: string): string => letter.repeat(40);
const task = (taskId: string, status = 'completed') => ({ taskId, title: taskId, status, recordDigest: digest('1') });

function correlation(overrides: Record<string, unknown> = {}) {
  return createReleaseTaskEvidenceCorrelation({
    releaseTask: task('release-1.0.0', 'active'),
    releaseTaskStatus: 'active',
    supportTasks: [task('support-1')],
    source: { sourceCommit: sha('c'), sourceTree: sha('d'), remoteRef: sha('e') },
    ...overrides,
  });
}

test('correlates only Task records and frozen source', () => {
  const result = correlation();
  assert.equal(result.schemaVersion, 'buildr.release-task-evidence-correlation/v5');
  assert.equal(result.status, 'passed');
  assert.equal('entries' in result, false);
  assert.equal(JSON.stringify(result).includes('environment'), false);
  assert.deepEqual(validateReleaseTaskEvidenceCorrelation(result), result);
  assert.equal(inspectReleaseTaskEvidenceCorrelation(result).identity, result.identity);
});

test('release Task remains active while support Tasks are completed', () => {
  assert.equal(correlation().releaseTask.status, 'active');
  assert.throws(() => correlation({ releaseTask: task('release-1.0.0') }), /releaseTask must be active/u);
  assert.throws(() => correlation({ supportTasks: [task('support-1', 'active')] }), /must be completed/u);
});

test('transaction context carries preparation and Task correlation without Environment facts', () => {
  const taskCorrelation = correlation();
  const preparationUnsigned = {
    schemaVersion: 'buildr.release-preparation-binding/v1',
    taskId: 'release-1.0.0',
    sourceCommit: sha('1'),
    service: 'product/buildr',
    serviceRoot: 'projects/product/services/buildr',
    command: { executable: 'npm', args: ['ci'], cwd: 'projects/product/services/buildr' },
    inputs: { 'package.json': digest('4'), 'package-lock.json': digest('5') },
    node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('6') },
    outcome: { status: 'passed' },
  };
  const preparation = { ...preparationUnsigned, identity: `sha256-${crypto.createHash('sha256').update(JSON.stringify(preparationUnsigned)).digest('hex')}` };
  const contextTask = (value: { taskId: string; title: string; status: string }) => ({ taskId: value.taskId, title: value.title, status: value.status });
  const context = createReleaseTransactionContext({
    releaseTask: contextTask(task('release-1.0.0')),
    supportTasks: [contextTask(task('support-1'))],
    candidate: { sourceCommit: sha('1'), workflow: '.github/workflows/verify.yml', runId: 11, runAttempt: 1, runUrl: 'https://github.example/run/11' },
    convergence: { candidateBase: sha('2'), candidateTree: sha('3'), sourceCommit: sha('1'), mainCommit: sha('1'), devCommit: sha('4') },
    preparation,
    taskCorrelation,
  });
  assert.ok(context.taskCorrelation);
  assert.equal(context.taskCorrelation.identity, taskCorrelation.identity);
  assert.equal(context.preparation.identity, preparation.identity);
  assert.equal('environment' in context, false);
  assert.equal('retrospectiveSources' in context, false);
});
