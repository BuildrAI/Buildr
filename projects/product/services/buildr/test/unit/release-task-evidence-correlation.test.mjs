import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  createReleaseTaskEvidenceCorrelation,
  inspectReleaseTaskEvidenceCorrelation,
  validateReleaseTaskEvidenceCorrelation,
} from '../../tools/release/release-task-evidence-correlation.mjs';
import { createReleaseTransactionContext } from '../../tools/release/release-transaction-evidence.mjs';

const digest = (letter) => `sha256-${letter.repeat(64)}`;
const sha = (letter) => letter.repeat(40);

function task(taskId, title = taskId) {
  return { taskId, title, status: 'completed', recordDigest: digest('1') };
}

function entry(taskId, overrides = {}) {
  return {
    taskId,
    environment: { status: 'ready', taskId, receiptIdentity: digest('2'), receiptDigest: digest('3'), declarationIdentity: digest('4'), executionIdentity: digest('5') },
    ...overrides,
  };
}

function correlation(overrides = {}) {
  return createReleaseTaskEvidenceCorrelation({
    releaseTask: { ...task('release-1.0.0'), status: 'active' },
    supportTasks: [task('support-1')],
    retrospectiveSources: [task('retro-1')],
    taskEvidence: [entry('release-1.0.0'), entry('support-1')],
    source: { sourceCommit: sha('c'), sourceTree: sha('d'), remoteRef: sha('e') },
    ...overrides,
  });
}

test('correlates release/support Task evidence into one portable identity', () => {
  const result = correlation();
  assert.equal(result.schemaVersion, 'buildr.release-task-evidence-correlation/v3');
  assert.equal(result.status, 'passed');
  assert.match(result.identity, /^sha256-[a-f0-9]{64}$/u);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(Object.keys(result.entries[0]).sort(), ['environment', 'findings', 'status', 'taskId']);
  assert.deepEqual(validateReleaseTaskEvidenceCorrelation(result), result);
  assert.equal(inspectReleaseTaskEvidenceCorrelation(result).identity, result.identity);
});

test('preparation correlation keeps the release coordination Task active with only its Environment evidence', () => {
  const releaseTask = { ...task('release-1.0.0'), status: 'active' };
  const releaseEntry = entry('release-1.0.0');
  const result = correlation({
    releaseTask,
    releaseTaskStatus: 'active',
    taskEvidence: [releaseEntry, entry('support-1')],
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.releaseTask.status, 'active');
  assert.equal(result.entries.find((item) => item.taskId === 'release-1.0.0').environment.status, 'passed');
  assert.equal('finish' in result.entries.find((item) => item.taskId === 'release-1.0.0'), false);
});

test('publication correlation requires the release coordination Task to remain active', () => {
  assert.throws(
    () => correlation({ releaseTask: task('release-1.0.0') }),
    /releaseTask must be active/u,
  );
});

test('直接完成的支持任务不要求额外专业记录', () => {
  const result = correlation({ taskEvidence: [entry('release-1.0.0'), entry('support-1', { environment: null })] });
  assert.equal(result.status, 'passed');
  const support = result.entries.find((item) => item.taskId === 'support-1');
  assert.deepEqual(Object.keys(support).sort(), ['environment', 'findings', 'status', 'taskId']);
  assert.deepEqual(support.findings, []);
  assert.throws(() => correlation({ supportTasks: [{ ...task('support-1'), status: 'active' }] }), /must be completed/);
});

test('支持任务完成不能替代发布环境和实际发布检查', () => {
  const result = correlation({ taskEvidence: [entry('release-1.0.0', { environment: null }), entry('support-1')] });
  assert.equal(result.status, 'blocked');
  assert.equal(result.entries.find((item) => item.taskId === 'release-1.0.0').findings[0].code, 'environment-not-ready');
});

test('transaction context can carry validated task correlation without copying retired workflow facts', () => {
  const taskCorrelation = correlation();
  const environment = {
    schemaVersion: 'buildr.release-environment-binding/v1', taskId: 'release-1.0.0', environmentStatus: 'ready', sourceCommit: sha('1'), service: 'product/buildr', serviceRoot: 'projects/product/services/buildr', planIdentity: digest('1'), declarationIdentity: digest('2'), recipe: { id: 'service:product/buildr/buildr.npm-ci', identity: digest('3'), stepId: 'service:product/buildr/buildr.npm-ci/npm-ci' }, inputs: { 'package.json': digest('4'), 'package-lock.json': digest('5') }, node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('6') },
  };
  environment.identity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(environment)).digest('hex')}`;
  const contextTask = (item) => ({ taskId: item.taskId, title: item.title, status: item.status });
  const context = createReleaseTransactionContext({
    releaseTask: contextTask(task('release-1.0.0')),
    retrospectiveSources: [contextTask(task('retro-1'))],
    supportTasks: [contextTask(task('support-1'))],
    candidate: { sourceCommit: sha('1'), workflow: '.github/workflows/verify.yml', runId: 11, runAttempt: 1, runUrl: 'https://github.example/run/11' },
    convergence: { candidateBase: sha('2'), candidateTree: sha('3'), sourceCommit: sha('1'), mainCommit: sha('1'), devCommit: sha('4') },
    environment,
    taskCorrelation,
  });
  assert.equal(context.taskCorrelation.identity, taskCorrelation.identity);
});
