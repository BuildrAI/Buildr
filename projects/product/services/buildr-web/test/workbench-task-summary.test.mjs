import assert from 'node:assert/strict';
import test from 'node:test';
import { workbenchTaskSummary } from '../src/features/workbench/taskSummary.ts';

function item(status, { progress, result, intent = '任务目标说明' } = {}) {
  return {
    task: { record: { taskId: 'task-1', status, intent, result: result === undefined ? null : { summary: result } } },
    workContext: { context: progress === undefined ? null : { progress, nextStep: '下一步', updatedAt: '2026-10-27T00:00:00.000Z', attention: null } },
  };
}

test('进行中任务行显示工作摘要最近进展，缺失时回退结果摘要', () => {
  assert.equal(workbenchTaskSummary(item('active', { progress: '正在实现', result: '已有结果' })), '正在实现');
  assert.equal(workbenchTaskSummary(item('todo', { result: '已有结果' })), '已有结果');
  assert.equal(workbenchTaskSummary(item('todo', {})), '任务目标说明');
});

test('终态任务行显示任务结果摘要，不显示收尾前的进展旁白', () => {
  assert.equal(workbenchTaskSummary(item('completed', { progress: '等待收尾授权', result: '已交付结果' })), '已交付结果');
  assert.equal(workbenchTaskSummary(item('abandoned', { progress: '等待收尾授权', result: '已放弃原因' })), '已放弃原因');
});

test('终态任务缺少结果摘要时退回任务目标', () => {
  assert.equal(workbenchTaskSummary(item('completed', { progress: '等待收尾授权' })), '任务目标说明');
});
