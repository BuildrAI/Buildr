import assert from 'node:assert/strict';
import test from 'node:test';
import { codeEntryRestoreCandidates, resolveCodeEntryRestore } from '../src/features/code/code-entry-restore.ts';

const member = (id, groupId, available = true) => ({
  id, repositoryId: 'repo', groupId, path: groupId === 'main' ? '/workspace' : '/workspace/.worktrees/t1',
  branch: groupId === 'main' ? 'dev' : 'task/t1', kind: groupId === 'main' ? 'main' : 'task',
  taskId: groupId === 'main' ? null : groupId.slice(5), available,
});
const main = member('checkout-main', 'main');
const task = member('checkout-new', 'task:t1');
const file = (checkoutId = 'checkout-old') => ({ repositoryId: 'repo', checkoutId, path: 'projects/a/readme.md' });

test('a recreated task checkout resolves through the same task identity', () => {
  const restored = resolveCodeEntryRestore({ worktrees: [main, task] }, 'repo', file(), 't1');
  assert.equal(restored.reason, 'replaced');
  assert.equal(restored.successor?.id, 'checkout-new');
});

test('a task entry never falls back to another worktree group', () => {
  const restored = resolveCodeEntryRestore({ worktrees: [main] }, 'repo', file(), 't1');
  assert.equal(restored.reason, 'missing');
  assert.equal(restored.successor, null);
  const otherTask = member('checkout-other', 'task:t2');
  assert.equal(resolveCodeEntryRestore({ worktrees: [main, otherTask] }, 'repo', file(), 't1').reason, 'missing');
});

test('an entry without task identity cannot choose a replacement silently', () => {
  assert.deepEqual(resolveCodeEntryRestore({ worktrees: [main, task] }, 'repo', file()), { reason: 'ambiguous', successor: null });
  assert.equal(resolveCodeEntryRestore({ worktrees: [task] }, 'repo', file()).successor?.id, 'checkout-new', 'a single remaining checkout is still an explicit choice, never automatic');
});

test('recovery candidates list available checkouts of the same repository, task first', () => {
  const other = member('checkout-other', 'worktree:other');
  const otherRepo = { ...member('checkout-foreign', 'task:t1'), repositoryId: 'other-repo' };
  const candidates = codeEntryRestoreCandidates({ worktrees: [other, main, task, otherRepo, member('checkout-off', 'worktree:off', false)] }, 'repo', file(), 't1');
  assert.deepEqual(candidates.map(item => item.id), ['checkout-new', 'checkout-main', 'checkout-other']);
  assert.deepEqual(codeEntryRestoreCandidates({ worktrees: [main, task] }, 'repo', file(), 't2').map(item => item.id), ['checkout-main', 'checkout-new']);
  assert.deepEqual(codeEntryRestoreCandidates({ worktrees: [main, task] }, 'repo', file(task.id), 't1').map(item => item.id), ['checkout-main'], 'the stale identity is never offered back');
  assert.deepEqual(codeEntryRestoreCandidates({ worktrees: [main] }, 'repo', file(), 't1').map(item => item.id), ['checkout-main'], 'a vanished task checkout still leaves the same-repository choice');
});

test('unavailable, foreign and stale checkouts cannot become the successor', () => {
  assert.equal(resolveCodeEntryRestore({ worktrees: [member('checkout-new', 'task:t1', false)] }, 'repo', file(), 't1').reason, 'missing');
  assert.equal(resolveCodeEntryRestore({ worktrees: [member('checkout-new', 'task:t1')] }, 'other-repo', file(), 't1').reason, 'missing');
  assert.equal(resolveCodeEntryRestore({ worktrees: [task] }, 'repo', file(task.id), 't1').reason, 'missing');
});

test('multiple checkouts in one task group stay ambiguous', () => {
  const duplicate = { ...task, id: 'checkout-second' };
  assert.deepEqual(resolveCodeEntryRestore({ worktrees: [task, duplicate] }, 'repo', file(), 't1'), { reason: 'ambiguous', successor: null });
});

test('a historical commit keeps its identity and may use another checkout of the same repository', () => {
  const historical = { ...file(), commitHash: 'a'.repeat(40) };
  assert.equal(resolveCodeEntryRestore({ worktrees: [main, task] }, 'repo', historical)?.successor?.id, 'checkout-main');
  assert.equal(resolveCodeEntryRestore({ worktrees: [main, task] }, 'repo', historical, 't1')?.successor?.id, 'checkout-new');
  assert.equal(resolveCodeEntryRestore({ worktrees: [main] }, 'repo', historical, 't1')?.successor?.id, 'checkout-main');
  assert.equal(resolveCodeEntryRestore({ worktrees: [member('checkout-main', 'main', false)] }, 'repo', historical).reason, 'missing');
  const detached = [member('checkout-a', 'worktree:a'), member('checkout-b', 'worktree:b')];
  assert.deepEqual(resolveCodeEntryRestore({ worktrees: detached }, 'repo', historical), { reason: 'ambiguous', successor: null });
  const only = member('checkout-only', 'worktree:only');
  assert.equal(resolveCodeEntryRestore({ worktrees: [only] }, 'repo', historical)?.successor?.id, 'checkout-only');
});

test('an incomplete checkout observation is retryable, not evidence of removal', () => {
  const diagnostic = (code, repositoryId = null) => ({ code, message: code, repositoryId });
  const truncated = { worktrees: [main], diagnostics: [diagnostic('code_worktrees_truncated')] };
  assert.deepEqual(resolveCodeEntryRestore(truncated, 'repo', file(), 't1'), { reason: 'unconfirmed', successor: null });
  const unavailableRepository = { worktrees: [main], repositories: [{ id: 'repo', available: false }] };
  assert.equal(resolveCodeEntryRestore(unavailableRepository, 'repo', file(), 't1').reason, 'unconfirmed');
  const historical = resolveCodeEntryRestore({ ...truncated }, 'repo', { ...file(), commitHash: 'a'.repeat(40) }, 't1');
  assert.deepEqual(historical, { reason: 'unconfirmed', successor: null }, 'an incomplete read must not silently switch read locations');
  const association = { worktrees: [main], diagnostics: [diagnostic('code_worktree_task_unconfirmed')] };
  assert.equal(resolveCodeEntryRestore(association, 'repo', file(), 't1').reason, 'unconfirmed');
  assert.equal(resolveCodeEntryRestore(association, 'repo', file()).reason, 'replaced', 'association state is irrelevant without task identity; the single remaining checkout is an explicit choice');
  assert.equal(resolveCodeEntryRestore({ worktrees: [main], diagnostics: [diagnostic('code_worktree_unavailable', 'other')] }, 'repo', file(), 't1').reason, 'missing', 'another repository cannot block this one');
});
