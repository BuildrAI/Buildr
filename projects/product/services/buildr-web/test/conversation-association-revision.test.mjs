import assert from 'node:assert/strict';
import test from 'node:test';
import {applyAssociationResult} from '../src/features/harness-ui/conversation-associations.ts';

const observed = {workspaceId: 'workspace', id: 'conversation', revision: 'original', taskLinks: []};
const result = {...observed, revision: 'save-result', taskLinks: [{workspaceId: 'workspace', taskId: 'task-a'}]};

test('任务页保存后，仍在原版本的对话应显示保存结果', () => {
  assert.equal(applyAssociationResult(observed, result, observed.revision), result);
});

test('任务页保存结果晚到时，不替换通过对话观察取得的更新关联', () => {
  const newer = {...observed, revision: 'stream-result', taskLinks: [{workspaceId: 'workspace', taskId: 'task-b'}]};
  assert.equal(applyAssociationResult(newer, result, observed.revision), newer);
});

test('已收到同版本或已切换对象时，保留当前观察', () => {
  for (const current of [{...result}, {...observed, workspaceId: 'another-workspace'}, {...observed, id: 'other-conversation'}, null]) {
    assert.equal(applyAssociationResult(current, result, observed.revision), current);
  }
});
