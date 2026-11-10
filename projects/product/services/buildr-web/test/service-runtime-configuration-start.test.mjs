import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = version => new URL(`../src/features/service-runtime/runtimeConfigurationStart.ts?case=${version}`, import.meta.url).href;

test('启动请求只对匹配的工作空间与服务生效，并在消费后清除', async () => {
  const store = await import(moduleUrl('consume'));
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'front'), false);
  let notified = 0;
  const unsubscribe = store.subscribeRuntimeConfigurationStart(() => { notified += 1; });
  store.requestRuntimeConfigurationStart('workspace-one', 'front');
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'front'), true);
  assert.equal(store.runtimeConfigurationStartRequested('workspace-two', 'front'), false, '其他工作空间不受影响');
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'back'), false, '其他服务不受影响');
  assert.equal(store.runtimeConfigurationStartRequested(null, 'front'), false);
  assert.equal(notified, 1, '请求通知订阅者');
  store.consumeRuntimeConfigurationStart('workspace-one', 'back');
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'front'), true, '不匹配的消费不清除请求');
  store.consumeRuntimeConfigurationStart('workspace-one', 'front');
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'front'), false);
  assert.equal(notified, 2, '消费通知订阅者');
  unsubscribe();
});

test('新请求替换旧请求，退订后不再通知', async () => {
  const store = await import(moduleUrl('replace'));
  let notified = 0;
  const unsubscribe = store.subscribeRuntimeConfigurationStart(() => { notified += 1; });
  store.requestRuntimeConfigurationStart('workspace-one', 'front');
  store.requestRuntimeConfigurationStart('workspace-one', 'back');
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'front'), false);
  assert.equal(store.runtimeConfigurationStartRequested('workspace-one', 'back'), true);
  unsubscribe();
  store.consumeRuntimeConfigurationStart('workspace-one', 'back');
  assert.equal(notified, 2, '退订后不再收到通知');
});
