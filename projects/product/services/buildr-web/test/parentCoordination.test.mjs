import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyParentCompletionDraft, parentCompletionInput, prioritizeOpenChildren } from '../src/features/task/components/parentCoordination.ts';

test('组合任务子任务默认未完成在前，组内保持原顺序且不改写原结果', () => {
  const children = [
    { taskId: 'completed-first', status: 'completed' },
    { taskId: 'todo-first', status: 'todo' },
    { taskId: 'abandoned-first', status: 'abandoned' },
    { taskId: 'active-later', status: 'active' },
    { taskId: 'completed-later', status: 'completed' },
    { taskId: 'todo-later', status: 'todo' },
  ];
  const before = structuredClone(children);
  assert.deepEqual(prioritizeOpenChildren(children).map(child => child.taskId), ['todo-first', 'active-later', 'todo-later', 'completed-first', 'abandoned-first', 'completed-later']);
  assert.deepEqual(children, before);
  assert.deepEqual(prioritizeOpenChildren([]), []);
  assert.deepEqual(prioritizeOpenChildren(children.filter(child => child.status === 'completed')), children.filter(child => child.status === 'completed'));
});
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
