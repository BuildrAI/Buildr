import assert from 'node:assert/strict';
import test from 'node:test';
import { taskCommitKey, taskCommitsState } from '../src/features/task/components/task-commit-model.ts';

test('跨仓库相同提交哈希保留独立身份，分隔符不能造成碰撞', () => {
  const hash = 'a'.repeat(40);
  assert.notEqual(taskCommitKey({ repositoryId: 'repo-a', hash }), taskCommitKey({ repositoryId: 'repo-b', hash }));
  assert.notEqual(taskCommitKey({ repositoryId: 'repo:a', hash: 'b' }), taskCommitKey({ repositoryId: 'repo', hash: 'a:b' }));
});

test('只有完整读取的空结果才展示空状态，部分结果不伪装为空', () => {
  assert.equal(taskCommitsState({ status: 'complete', commits: [] }, false, ''), 'empty');
  assert.equal(taskCommitsState({ status: 'partial', commits: [] }, false, ''), 'partial');
  assert.equal(taskCommitsState({ status: 'partial', commits: [{}] }, false, ''), 'partial');
  assert.equal(taskCommitsState(null, true, ''), 'loading');
  assert.equal(taskCommitsState(null, false, 'unavailable'), 'failure');
});

test('刷新等待和失败时保留上次成功读取的列表', () => {
  const data = { status: 'complete', commits: [{}] };
  assert.equal(taskCommitsState(data, true, ''), 'ready');
  assert.equal(taskCommitsState(data, false, 'refresh failed'), 'ready');
});
