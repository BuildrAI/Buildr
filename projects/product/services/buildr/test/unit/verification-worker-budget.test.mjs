import assert from 'node:assert/strict';
import test from 'node:test';

import { workerBudgetEnvironment } from '../../test/verification/executor.mjs';
import { VERIFICATION_WORKER_BUDGET_ENV, resolveVerificationWorkerBudget } from '../../test/verification/worker-budget.mjs';

test('验证内部 worker budget 使用默认值并受 suite 上限约束', () => {
  assert.equal(resolveVerificationWorkerBudget({ fallback: 14, maximum: 25, label: 'System' }), 14);
  assert.equal(resolveVerificationWorkerBudget({ fallback: 14, maximum: 10, label: 'System' }), 10);
});

test('验证内部 worker budget 只接受正整数且 fail closed', () => {
  assert.equal(resolveVerificationWorkerBudget({ env: { [VERIFICATION_WORKER_BUDGET_ENV]: '4' }, fallback: 14, maximum: 25, label: 'System' }), 4);
  for (const value of ['0', '-1', '1.5', 'many', '26']) {
    assert.throws(() => resolveVerificationWorkerBudget({ env: { [VERIFICATION_WORKER_BUDGET_ENV]: value }, fallback: 14, maximum: 25, label: 'System' }), /worker budget/);
  }
});

test('verification executor 只从当前 execution profile 向匹配 step 注入 worker budget', () => {
  const profile = { limits: { innerConcurrency: { system: 8 } } };
  assert.deepEqual(workerBudgetEnvironment({ id: 'system' }, profile), { [VERIFICATION_WORKER_BUDGET_ENV]: '8' });
  assert.deepEqual(workerBudgetEnvironment({ id: 'integration' }, profile), {});
  assert.throws(() => workerBudgetEnvironment({ id: 'system' }, { limits: { innerConcurrency: { system: 0 } } }), /Invalid inner concurrency budget/);
});
