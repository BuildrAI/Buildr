import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTaskCommitTrailer, parseGitCommitObject } from '../../src/modules/task/commits/domain/task-commit.ts';

test('任务尾注只承认末尾规范段落，重复同值合并且不同值冲突', () => {
  for (const message of ['feat: title task-one', 'title\n\n正文提到 Buildr-Task: task-one。', 'title\n\nBuildr-Task: task-one\n\n继续解释', 'title\n\n```\nBuildr-Task: task-one\n```', 'Buildr-Task: task-one']) assert.equal(parseTaskCommitTrailer(message).taskId, null, message);
  assert.equal(parseTaskCommitTrailer('title\n\nBody.\n\nBuildr-Task: task-one\nSigned-off-by: Person <a@b>\n').taskId, 'task-one');
  assert.equal(parseTaskCommitTrailer('title\r\n\r\nbuildr-task: task-one\r\nBuildr-Task: task-one\r\n').taskId, 'task-one');
  assert.equal(parseTaskCommitTrailer('title\n\nBuildr-Task: task-one\nBuildr-Task: task-two').diagnostic, 'conflict');
  for (const value of ['', '../secret', 'TASK', 'a b', 'task-one\n continuation']) assert.equal(parseTaskCommitTrailer(`title\n\nBuildr-Task: ${value}`).diagnostic, 'invalid', value);
});

test('读取实际提交对象保留全文、作者、时间和完整 SHA-1/SHA-256', () => {
  const message = 'feat: 中文主题\n\n正文\n\nBuildr-Task: task-one\n';
  const body = Buffer.from(`tree ${'1'.repeat(40)}\nauthor 陈君 <real@example.com> 1780000000 +0800\ncommitter Bot <bot@example.com> 1780000060 +0800\ngpgsig signature\n continuation\n\n${message}`);
  for (const length of [40, 64]) {
    const commit = parseGitCommitObject('a'.repeat(length), body);
    assert.equal(commit.hash.length, length); assert.equal(commit.message, message); assert.equal(commit.authorName, '陈君');
    assert.equal(commit.authorEmail, 'real@example.com'); assert.equal(commit.subject, 'feat: 中文主题');
    assert.equal(commit.authoredAt, new Date(1780000000000).toISOString());
  }
  assert.throws(() => parseGitCommitObject('a'.repeat(40), Buffer.from('bad object')));
});
