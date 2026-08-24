import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeContextTestArguments, nodeTestConcurrencyArguments, parseNodeTestContextSummary, workerBudgetEnvironment } from '../../test/verification/executor.mjs';
import { VERIFICATION_WORKER_BUDGET_ENV, resolveVerificationWorkerBudget } from '../../test/verification/worker-budget.mjs';

test('验证内部 worker budget 使用默认值并受 suite 上限约束', () => {
  assert.equal(resolveVerificationWorkerBudget({ env: {}, fallback: 14, maximum: 25, label: 'System' }), 14);
  assert.equal(resolveVerificationWorkerBudget({ env: {}, fallback: 14, maximum: 10, label: 'System' }), 10);
});

test('验证内部 worker budget 只接受正整数且 fail closed', () => {
  assert.equal(resolveVerificationWorkerBudget({ env: { [VERIFICATION_WORKER_BUDGET_ENV]: '4' }, fallback: 14, maximum: 25, label: 'System' }), 4);
  for (const value of ['0', '-1', '1.5', 'many', '26']) {
    assert.throws(() => resolveVerificationWorkerBudget({ env: { [VERIFICATION_WORKER_BUDGET_ENV]: value }, fallback: 14, maximum: 25, label: 'System' }), /worker budget/);
  }
});

test('verification executor 只从当前 execution profile 向匹配 step 注入 worker budget', () => {
  const profile = { limits: { innerConcurrency: { system: 8 } } };
  assert.deepEqual(workerBudgetEnvironment({ id: 'system', executor: { type: 'node' } }, profile), { [VERIFICATION_WORKER_BUDGET_ENV]: '8' });
  assert.deepEqual(workerBudgetEnvironment({ id: 'integration', executor: { type: 'node' } }, profile), {});
  assert.deepEqual(workerBudgetEnvironment({ id: 'unit', executor: { type: 'npm' } }, { resourceGrant: { workers: 1 } }), {});
  assert.deepEqual(workerBudgetEnvironment({ id: 'slice', executor: { type: 'node-test' } }, { resourceGrant: { workers: 2 } }), {});
  assert.throws(() => workerBudgetEnvironment({ id: 'system', executor: { type: 'node' } }, { limits: { innerConcurrency: { system: 0 } } }), /Invalid inner concurrency budget/);
});

test('node test executor 从 execution profile 注入唯一内部并发参数', () => {
  const step = { id: 'integration-task-finish-delivery', executor: { type: 'node-test', args: ['--test-reporter=dot'] } };
  const profile = { limits: { innerConcurrency: { 'integration-task-finish-delivery': 2 } } };
  assert.deepEqual(nodeTestConcurrencyArguments(step, profile), ['--test-concurrency=2']);
  assert.deepEqual(nodeTestConcurrencyArguments(step, { limits: { innerConcurrency: {} } }), []);
  assert.deepEqual(nodeTestConcurrencyArguments({ ...step, executor: { ...step.executor, args: ['--test-concurrency=4'] } }, { resourceGrant: { workers: 1 }, executionProfile: profile }), ['--test-concurrency=1']);
});

test('Context-aware node runner只按outer grant启动持久Host', () => {
  const step = { id: 'integration-task-development', executor: { type: 'node-context-test' } };
  assert.deepEqual(nodeContextTestArguments(step, { resourceGrant: { workers: 3 } }, {
    runner: '/runtime/node-runner-cli.mjs', cwd: '/service', files: ['./one.mjs', './two.mjs'],
  }), ['/runtime/node-runner-cli.mjs', '--workers', '3', '--cwd', '/service', './one.mjs', './two.mjs']);
  assert.deepEqual(nodeContextTestArguments(step, {}, {
    runner: '/runtime/node-runner-cli.mjs', cwd: '/service', files: ['./one.mjs'],
  }), ['/runtime/node-runner-cli.mjs', '--workers', '1', '--cwd', '/service', './one.mjs']);
});

test('Context-aware node runner摘要进入稳定timing evidence', () => {
  const summary = parseNodeTestContextSummary('TAP version 13\n# node-test-context-summary {"schemaVersion":"node.test-context-summary/v1","hosts":4,"creates":8,"createDurationMs":12,"waitDurationMs":3,"testBodyDurationMs":40,"wallClockDurationMs":22}\n');
  assert.deepEqual(summary, {
    schemaVersion: 'node.test-context-summary/v1', hosts: 4, creates: 8,
    createDurationMs: 12, waitDurationMs: 3, testBodyDurationMs: 40, wallClockDurationMs: 22,
  });
  assert.equal(parseNodeTestContextSummary('# node-test-context-summary {'), null);
  assert.equal(parseNodeTestContextSummary('TAP version 13'), null);
});
