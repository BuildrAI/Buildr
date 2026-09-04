import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyParentCompletionDraft, parentCompletionInput } from '../src/features/task-record/components/parentCoordination.ts';
const snapshot = { isParent: true, children: [{ taskId: 'child', status: 'completed' }], completion: { snapshotIdentity: 'current-snapshot', openChildTaskIds: [] } };
test('the confirmation is never authorized by default', () => {
  assert.throws(() => parentCompletionInput(snapshot, emptyParentCompletionDraft(), 'parent'));
});
test('acceptance without explicit confirmation cannot complete parent', () => {
  assert.throws(() => parentCompletionInput(snapshot, { summary: 'Goal met', children: { child: 'Actual result reviewed' }, confirmed: false }, 'parent'));
});
test('confirmation preserves the observed snapshot and explicit child dispositions', () => {
  const result = parentCompletionInput(snapshot, { summary: 'Goal met', children: { child: 'Actual result reviewed' }, confirmed: true }, 'parent');
  assert.equal(result.expectedSnapshot, 'current-snapshot');
  assert.deepEqual(result.acceptance.children, [{ taskId: 'child', summary: 'Actual result reviewed' }]);
  assert.match(result.authorization.statement, /parent/);
});
test('missing disposition and active children block completion', () => {
  assert.throws(() => parentCompletionInput(snapshot, { summary: 'Goal met', children: {}, confirmed: true }, 'parent'));
  assert.throws(() => parentCompletionInput({ ...snapshot, completion: { ...snapshot.completion, openChildTaskIds: ['child'] } }, { summary: 'Goal met', children: { child: 'Reviewed' }, confirmed: true }, 'parent'));
});
