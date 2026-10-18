import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeContextTestArguments, nodeTestConcurrencyArguments, parseNodeTestContextSummary, workerBudgetEnvironment } from '../verification/executor.ts';
import { resolveVerificationExecutionProfile, verificationSteps } from '../verification/registry.ts';
import { VERIFICATION_WORKER_BUDGET_ENV, resolveVerificationWorkerBudget } from '../verification/worker-budget.ts';

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
  const profile: any = { limits: { innerConcurrency: { system: 8 } } };
  assert.deepEqual(workerBudgetEnvironment({ id: 'system', executor: { type: 'node' } }, profile), { [VERIFICATION_WORKER_BUDGET_ENV]: '8' });
  assert.deepEqual(workerBudgetEnvironment({ id: 'integration', executor: { type: 'node' } }, profile), {});
  assert.deepEqual(workerBudgetEnvironment({ id: 'unit', executor: { type: 'npm' } }, { resourceGrant: { workers: 1 } }), {});
  assert.deepEqual(workerBudgetEnvironment({ id: 'slice', executor: { type: 'node-test' } }, { resourceGrant: { workers: 2 } }), {});
  assert.throws(() => workerBudgetEnvironment({ id: 'system', executor: { type: 'node' } }, { limits: { innerConcurrency: { system: 0 } } }), /Invalid inner concurrency budget/);
});

test('node test executor 从 execution profile 注入唯一内部并发参数', () => {
  const step: any = { id: 'integration-task-finish-delivery', executor: { type: 'node-test', args: ['--test-reporter=dot'] } };
  const profile: any = { limits: { innerConcurrency: { 'integration-task-finish-delivery': 2 } } };
  assert.deepEqual(nodeTestConcurrencyArguments(step, profile), ['--test-concurrency=2']);
  assert.deepEqual(nodeTestConcurrencyArguments(step, { limits: { innerConcurrency: {} } }), []);
  assert.deepEqual(nodeTestConcurrencyArguments({ ...step, executor: { ...step.executor, args: ['--test-concurrency=4'] } }, { resourceGrant: { workers: 1 }, executionProfile: profile }), ['--test-concurrency=1']);
});

test('Context-aware node runner只按outer grant启动持久Host', () => {
  const step: any = { id: 'integration-task-development', executor: { type: 'node-context-test' } };
  assert.deepEqual(nodeContextTestArguments(step, { resourceGrant: { workers: 3 } }, {
    runner: '/runtime/node-runner-cli.mjs', cwd: '/service', files: ['./one.mjs', './two.mjs'],
  }), ['/runtime/node-runner-cli.mjs', '--workers', '3', '--cwd', '/service', './one.mjs', './two.mjs']);
  assert.deepEqual(nodeContextTestArguments(step, {}, {
    runner: '/runtime/node-runner-cli.mjs', cwd: '/service', files: ['./one.mjs'],
  }), ['/runtime/node-runner-cli.mjs', '--workers', '1', '--cwd', '/service', './one.mjs']);
});

test('Context-aware node runner摘要进入稳定timing evidence', () => {
  const summary: any = parseNodeTestContextSummary('TAP version 13\n# node-test-context-summary {"schemaVersion":"node.test-context-summary/v1","hosts":4,"creates":8,"createDurationMs":12,"waitDurationMs":3,"testBodyDurationMs":40,"wallClockDurationMs":22}\n');
  assert.deepEqual(summary, {
    schemaVersion: 'node.test-context-summary/v1', hosts: 4, creates: 8,
    createDurationMs: 12, waitDurationMs: 3, testBodyDurationMs: 40, wallClockDurationMs: 22,
  });
  assert.equal(parseNodeTestContextSummary('# node-test-context-summary {'), null);
  assert.equal(parseNodeTestContextSummary('TAP version 13'), null);
});


test('complete low-cost suites execute through the granted node-test boundary instead of unbounded npm children', () => {
  for (const [id, local, limited] of [['unit', 4, 3], ['component', 1, 1], ['contract', 2, 2]] as const) {
    const step = verificationSteps.find((item: any) => item.id === id);
    assert.equal(step.executor.type, 'node-test');
    assert.deepEqual(step.executor.files, [`test/${id}/*.test.ts`]);
    assert.equal(step.resourceDemand.workers, local);
    assert.deepEqual(nodeTestConcurrencyArguments(step, { resourceGrant: { workers: local } }), [`--test-concurrency=${local}`]);
    assert.deepEqual(nodeTestConcurrencyArguments(step, resolveVerificationExecutionProfile('ci-workspace-limited')), [`--test-concurrency=${limited}`]);
    assert.deepEqual(nodeTestConcurrencyArguments(step, { resourceGrant: { workers: 1 } }), ['--test-concurrency=1']);
    assert.ok(step.executor.args.includes('./test/register-development-entry.ts'));
  }
});

test('Archify lifecycle stays isolated from Workspace checks with bounded concurrency and private Git inputs', () => {
  const archify = verificationSteps.find((step: any) => step.id === 'integration-archify');
  const workspace = verificationSteps.find((step: any) => step.id === 'integration-workspace-assets');
  assert.deepEqual(archify.executor.files, ['test/integration/archify-command-cost.test.ts', 'test/integration/archify-component.test.ts']);
  assert.equal(workspace.executor.files.some((file: string) => archify.executor.files.includes(file)), false);
  const limited = resolveVerificationExecutionProfile('ci-workspace-limited');
  assert.deepEqual(nodeTestConcurrencyArguments(archify, limited), ['--test-concurrency=1']);
  assert.deepEqual(nodeTestConcurrencyArguments(workspace, limited), ['--test-concurrency=2']);
  for (const id of ['integration-code', 'integration-desktop', 'integration-workspace-assets', 'integration-task-records', 'integration-connections', 'integration-runtime-projection', 'integration-runtime']) {
    const step = verificationSteps.find((item: any) => item.id === id);
    assert.ok(step.reuse.tools.includes('git'), `${id}: real fixture Git requires the observed Git executable version`);
    assert.equal(step.reuse.git, false, `${id}: private fixture Git must not bind the shared checkout HEAD`);
  }
});
