import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTaskFinishDeliveryCommit,
  publicTaskFinishDeliveryCommit,
  taskFinishDeliveryCommitFromMessage,
} from '../../src/task/application/finish/task-finish-delivery-commit.mjs';

test('Task Finish delivery commit规范化换行并确定性维护Task trailer', () => {
  const commit = normalizeTaskFinishDeliveryCommit('  fix(task-finish): 保留语义提交信息\r\n\r\n说明最终交付内容。\r\n\r\nBuildr-Task: old-task  ', 'finish-message');
  assert.equal(commit.message, 'fix(task-finish): 保留语义提交信息\n\n说明最终交付内容。\n\nBuildr-Task: finish-message');
  assert.equal(commit.subject, 'fix(task-finish): 保留语义提交信息');
  assert.match(commit.identity, /^sha256-[0-9a-f]{64}$/);
  assert.deepEqual(publicTaskFinishDeliveryCommit(commit), { subject: commit.subject, identity: commit.identity });
  assert.equal(taskFinishDeliveryCommitFromMessage(commit.message).identity, commit.identity);
});

test('Task Finish delivery commit拒绝缺失、空subject和当前Task占位主题', () => {
  assert.throws(() => normalizeTaskFinishDeliveryCommit(null, 'finish-message'), (error) => error.code === 'task_finish.commit_message_required');
  assert.throws(() => normalizeTaskFinishDeliveryCommit(' \r\n ', 'finish-message'), (error) => error.code === 'task_finish.commit_message_subject_required');
  assert.throws(() => normalizeTaskFinishDeliveryCommit('交付 finish-message', 'finish-message'), (error) => error.code === 'task_finish.commit_message_placeholder');
});
