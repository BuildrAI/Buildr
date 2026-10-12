import assert from 'node:assert/strict';
import test from 'node:test';
import {createBindingRecovery, readBindingRecovery, saveBindingRecovery, clearBindingRecovery} from '../src/features/agents/codex-binding-recovery.ts';

const storage = () => {const values = new Map(); return {values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};};
test('创建前保存有界原请求，刷新仅恢复查询所需范围，不存聊天身份', () => {
  const store = storage(), now = 1000;
  const request = createBindingRecovery('workspace', 'task', 'connection', now);
  saveBindingRecovery({...request, nativeSessionId: 'must-not-store', message: 'must-not-store'}, () => store);
  assert.equal(store.values.size, 1); assert.equal([...store.values.values()][0].includes('must-not-store'), false);
  assert.deepEqual(readBindingRecovery('workspace', 'task', () => store, now), request);
  assert.equal(readBindingRecovery('other', 'task', () => store, now), null);
  assert.equal(readBindingRecovery('workspace', 'other', () => store, now), null);
  assert.equal(readBindingRecovery('workspace', 'task', () => store, request.expiresAt), null); assert.equal(store.values.size, 0);
});
test('伪造范围、永久句柄、非法请求编号及拒绝的可选存储不构成绑定事实', () => {
  const now = 1000, request = createBindingRecovery('workspace', 'task', 'connection', now);
  for (const patch of [{workspaceId: 'other'}, {taskId: 'other'}, {expiresAt: Infinity}, {expiresAt: now + 31 * 60_000}, {id: '../../other'}, {nativeSessionId: 'unexpected'}]) {
    const store = storage(); saveBindingRecovery(request, () => store);
    const [key] = store.values.keys(); store.values.set(key, JSON.stringify({...request, ...patch}));
    assert.equal(readBindingRecovery('workspace', 'task', () => store, now), null);
  }
  const denied = () => {throw Error('storage denied');};
  assert.doesNotThrow(() => saveBindingRecovery(request, denied)); assert.equal(readBindingRecovery('workspace', 'task', denied, now), null); assert.doesNotThrow(() => clearBindingRecovery('workspace', 'task', denied));
});
