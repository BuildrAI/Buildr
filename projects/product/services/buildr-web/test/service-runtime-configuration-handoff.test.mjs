import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: key => { storage.delete(key); },
  },
});

const moduleUrl = version => new URL(`../src/features/service-runtime/runtimeConfigurationHandoff.ts?case=${version}`, import.meta.url).href;
const handoff = {
  workspaceId: 'workspace-one', code: 'front', name: '前端',
  conversationId: 'conversation-one', baseline: null, startedAt: '2026-11-04T03:00:00.000Z',
};

test('交接记录按工作空间保存并在重新加载后恢复', async () => {
  const store = await import(moduleUrl('persist'));
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-one'), null);
  assert.equal(store.readRuntimeConfigurationHandoff(null), null);
  store.recordRuntimeConfigurationHandoff(handoff);
  assert.deepEqual(store.readRuntimeConfigurationHandoff('workspace-one'), handoff);
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-two'), null, '其他工作空间不受影响');
  const reloaded = await import(moduleUrl('reload'));
  assert.deepEqual(reloaded.readRuntimeConfigurationHandoff('workspace-one'), handoff, '新页面实例从存储恢复同一交接');
});

test('损坏或身份不完整的记录不会被恢复', async () => {
  storage.clear();
  storage.set('buildr.runtime-configuration.handoff:local', JSON.stringify({
    'workspace-one': { ...handoff, conversationId: '' },
    'workspace-two': { ...handoff, workspaceId: 'other-workspace' },
    'workspace-three': { ...handoff, workspaceId: 'workspace-three', startedAt: 'not-a-date' },
    'workspace-four': { ...handoff, workspaceId: 'workspace-four', code: 'back', conversationId: 'conversation-two' },
  }));
  const store = await import(moduleUrl('invalid'));
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-one'), null, '缺少对话身份时丢弃');
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-two'), null, '记录内工作空间与键不一致时丢弃');
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-three'), null, '交接时间不可解析时丢弃');
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-four').code, 'back');
  storage.set('buildr.runtime-configuration.handoff:local', '{not-json');
  const broken = await import(moduleUrl('broken'));
  assert.equal(broken.readRuntimeConfigurationHandoff('workspace-four'), null, '存储内容损坏时按无记录处理');
});

test('清除只结束匹配对话的交接并通知订阅者', async () => {
  storage.clear();
  const store = await import(moduleUrl('clear'));
  let notified = 0;
  const unsubscribe = store.subscribeRuntimeConfigurationHandoff(() => { notified += 1; });
  store.recordRuntimeConfigurationHandoff(handoff);
  assert.equal(notified, 1, '写入通知订阅者');
  store.clearRuntimeConfigurationHandoff('workspace-one', 'another-conversation');
  assert.deepEqual(store.readRuntimeConfigurationHandoff('workspace-one'), handoff, '其他对话的清除不影响当前交接');
  store.clearRuntimeConfigurationHandoff('workspace-one', 'conversation-one');
  assert.equal(store.readRuntimeConfigurationHandoff('workspace-one'), null);
  assert.equal(notified, 2);
  unsubscribe();
  store.recordRuntimeConfigurationHandoff(handoff);
  assert.equal(notified, 2, '退订后不再通知');
});
