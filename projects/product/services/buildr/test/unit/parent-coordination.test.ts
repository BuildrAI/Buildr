import assert from 'node:assert/strict';

import test from 'node:test';
import { normalizeParentCompletion } from '../../src/modules/task/application/task-validation.ts';

test('parent completion is closed evidence, not arbitrary workflow state', () => {
  const evidence: any = { expectedSnapshot: 'observed', acceptance: { summary: 'Goal met', children: [] }, authorization: { source: 'user-message', statement: 'Complete this parent.' } };
  assert.deepEqual(normalizeParentCompletion(evidence), evidence);
  assert.throws(() => normalizeParentCompletion({ ...evidence, authorized: true }));
  assert.throws(() => normalizeParentCompletion({ ...evidence, authorization: { source: '', statement: 'Complete.' } }));
  assert.throws(() => normalizeParentCompletion({ ...evidence, recordedAt: new Date().toISOString() }));
});
