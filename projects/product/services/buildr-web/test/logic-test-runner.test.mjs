import assert from 'node:assert/strict';
import test from 'node:test';
import { logicTestWorkerBudget } from '../tools/run-logic-tests.mjs';

test('logic runner consumes only a positive granted budget and uses one worker without a grant', () => {
  assert.equal(logicTestWorkerBudget(undefined), 1);
  assert.equal(logicTestWorkerBudget('1'), 1);
  assert.equal(logicTestWorkerBudget('2'), 2);
  for (const value of ['', '0', '-1', '1.5', '2x', '9007199254740992']) assert.throws(() => logicTestWorkerBudget(value), /positive integer worker budget/u);
});
