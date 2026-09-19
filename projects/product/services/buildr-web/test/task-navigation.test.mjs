import assert from 'node:assert/strict';
import test from 'node:test';
import { taskReturnPath } from '../src/features/task/taskNavigation.ts';
import { isIndexedTaskQuery } from '../src/features/task/task-search.ts';

test('任务返回保留同一工作空间的列表条件和概览来源', () => {
  assert.equal(taskReturnPath({ from: '/workspaces/demo/tasks?status=todo&project=alpha&group=project' }, '/workspaces/demo/'), '/workspaces/demo/tasks?status=todo&project=alpha&group=project');
  assert.equal(taskReturnPath({ from: '/workspaces/demo/overview?project=alpha' }, '/workspaces/demo/'), '/workspaces/demo/overview?project=alpha');
});
test('任务来源不能跳转其他工作空间或通过路径归一化逃离当前范围', () => {
  for (const from of ['https://example.com', '//example.com/workspaces/demo/tasks', '/workspaces/other/tasks', '/workspaces/demo/../other/tasks', '/workspaces/demo/%2e%2e/other/tasks', '/workspaces/demo\\..\\other/tasks']) {
    assert.equal(taskReturnPath({ from }, '/workspaces/demo'), '/workspaces/demo/tasks');
  }
});
test('列表与全局搜索共享索引边界，短关键词不提交，完整编号可精确定位', () => {
  assert.equal(isIndexedTaskQuery('任务'), false);
  assert.equal(isIndexedTaskQuery('工作台'), true);
  assert.equal(isIndexedTaskQuery('task ui'), false);
  assert.equal(isIndexedTaskQuery('task workbench'), true);
  assert.equal(isIndexedTaskQuery('#ui'), true);
  assert.equal(isIndexedTaskQuery('#ui/escape'), false);
  assert.equal(isIndexedTaskQuery(''), true);
});
