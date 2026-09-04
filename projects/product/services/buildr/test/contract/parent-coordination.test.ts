import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { normalizeParentCompletion } from '../../src/task/application/task-record-validation.ts';
const root: any = path.resolve(import.meta.dirname, '../..');
test('parent completion is closed evidence, not arbitrary workflow state', () => {
  const evidence: any = { expectedSnapshot: 'observed', acceptance: { summary: 'Goal met', children: [] }, authorization: { source: 'user-message', statement: 'Complete this parent.' } };
  assert.deepEqual(normalizeParentCompletion(evidence), evidence);
  assert.throws(() => normalizeParentCompletion({ ...evidence, authorized: true }));
  assert.throws(() => normalizeParentCompletion({ ...evidence, authorization: { source: '', statement: 'Complete.' } }));
  assert.throws(() => normalizeParentCompletion({ ...evidence, recordedAt: new Date().toISOString() }));
});
test('parent coordination adds no progress or authorization queue store', () => {
  const source: any = fs.readFileSync(path.join(root, 'src/infrastructure/sqlite/migrations/0021_add_parent_completion_evidence.sql'), 'utf8');
  assert.doesNotMatch(source, /CREATE TABLE|UPDATE tasks SET status/i);
});
