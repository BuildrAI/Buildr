import assert from 'node:assert/strict';
import test from 'node:test';
const { DEFAULT_HISTORY_GROUP, historyGroupOrder, moveHistoryGroup, readHistoryGroupPreference, writeHistoryGroupPreference } = await import('../src/features/agent-conversations/conversation-history-groups.ts');

const storage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};

test('默认空间固定最后，其余按偏好在前、未记录按稳定身份次序', () => {
  assert.deepEqual(historyGroupOrder(['w2', 'w1', '@default']), ['w1', 'w2', '@default']);
  assert.deepEqual(historyGroupOrder(['w2', 'w1', '@default'], ['w1']), ['w1', 'w2', '@default']);
  assert.deepEqual(historyGroupOrder(['w1']), ['w1']);
  assert.deepEqual(historyGroupOrder(['@default', 'w1'], ['gone', 'w1']), ['w1', '@default']);
  assert.deepEqual(DEFAULT_HISTORY_GROUP, '@default');
});

test('整组移动到目标之前或末尾，默认组始终在最后', () => {
  const order = ['w1', 'w2', 'w3', '@default'];
  assert.deepEqual(moveHistoryGroup(order, 'w3', 'w1'), ['w3', 'w1', 'w2', '@default']);
  assert.deepEqual(moveHistoryGroup(order, 'w1', 'w3'), ['w2', 'w1', 'w3', '@default']);
  assert.deepEqual(moveHistoryGroup(order, 'w1', 'end'), ['w2', 'w3', 'w1', '@default']);
  assert.deepEqual(moveHistoryGroup(order, '@default', 'w1'), order);
  assert.deepEqual(moveHistoryGroup(order, 'w1', 'w1'), order);
});

test('组顺序偏好只保存非默认空间，损坏或不安全内容回退为空', () => {
  const store = storage();
  assert.equal(writeHistoryGroupPreference(['w2', '@default', 'w1'], store, 'local'), true);
  assert.deepEqual(JSON.parse(store.data.get('buildr.agent-conversation.history-groups:local')), ['w2', 'w1']);
  assert.deepEqual(readHistoryGroupPreference(store, 'local'), ['w2', 'w1']);
  store.setItem('buildr.agent-conversation.history-groups:local', '{not json');
  assert.deepEqual(readHistoryGroupPreference(store, 'local'), []);
  store.setItem('buildr.agent-conversation.history-groups:local', JSON.stringify(['@default', 3, ' w2 ', 'w2']));
  assert.deepEqual(readHistoryGroupPreference(store, 'local'), ['w2']);
  assert.deepEqual(readHistoryGroupPreference(undefined, 'local'), []);
});

test('活动顺序变化不影响空间顺序，完整偏好在筛选后仍保留', () => {
  const preferred = ['w3', 'w1', 'w2'];
  assert.deepEqual(historyGroupOrder(['w2', 'w1', 'w3']), historyGroupOrder(['w3', 'w2', 'w1']));
  assert.deepEqual(historyGroupOrder(['w2'], preferred), ['w2']);
  assert.deepEqual(historyGroupOrder(['w2', 'w3', 'w1'], preferred), preferred);
  assert.deepEqual(historyGroupOrder(['w2', 'w1'], ['w2', 'w2']), ['w2', 'w1']);
});
