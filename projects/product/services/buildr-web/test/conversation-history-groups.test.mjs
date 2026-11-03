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

test('同页排序实时通知浮窗，存储失败仍同步，取消订阅释放通知', async () => {
  const {subscribeHistoryGroupPreference} = await import('../src/features/agent-conversations/conversation-history-groups.ts');
  const received=[];
  const stop=subscribeHistoryGroupPreference(order=>received.push(order));
  try {
    assert.equal(writeHistoryGroupPreference(['w2','w1'],storage()),true);
    assert.deepEqual(received,[['w2','w1']]);
    assert.equal(writeHistoryGroupPreference(['w1','w2'],{setItem(){throw Error('denied');}}),false);
    assert.deepEqual(received.at(-1),['w1','w2']);
    writeHistoryGroupPreference(['other'],storage(),'other-profile');
    assert.equal(received.length,2);
  } finally {stop();}
  writeHistoryGroupPreference(['w3'],storage());assert.equal(received.length,2);
});

test('跨页签仅同步当前配置，清理存储及卸载订阅均正确处理', async () => {
  const {subscribeHistoryGroupPreference}=await import('../src/features/agent-conversations/conversation-history-groups.ts');
  const oldWindow=globalThis.window,oldStorage=globalThis.localStorage,target=new EventTarget(),store=storage(),received=[];
  globalThis.window=target;globalThis.localStorage=store;
  const stop=subscribeHistoryGroupPreference(order=>received.push(order));
  const send=(key,storageArea=store)=>target.dispatchEvent(Object.assign(new Event('storage'),{key,storageArea}));
  try {
    store.setItem('buildr.agent-conversation.history-groups:local',JSON.stringify(['w2','w1']));
    send('unrelated');send('buildr.agent-conversation.history-groups:other');send('buildr.agent-conversation.history-groups:local',storage());
    assert.equal(received.length,0);
    send('buildr.agent-conversation.history-groups:local');assert.deepEqual(received,[['w2','w1']]);
    store.data.clear();send(null);assert.deepEqual(received.at(-1),[]);
    stop();send(null);assert.equal(received.length,2);
  } finally {
    stop();
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
    if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;
  }
});

test('浮窗沿用列表组序、过滤空组并保留组内待处理及用户输入排序', async () => {
  const {groupConversationWorkspaces,orderActivityItems}=await import('../src/features/agent-conversations/conversation-activity.ts');
  const rows=[
    {id:'new',workspaceId:'w2',state:'running',userInputAt:'2026-11-03T12:00:00Z'},
    {id:'waiting',workspaceId:'w2',state:'waiting',userInputAt:'2026-11-03T10:00:00Z'},
    {id:'old',workspaceId:'w2',state:'running',userInputAt:'2026-11-03T09:00:00Z'},
    {id:'other',workspaceId:'w1',state:'running',userInputAt:'2026-11-03T08:00:00Z'},
    {id:'default',workspaceId:'@default',state:'unseen',userInputAt:'2026-11-03T13:00:00Z'},
  ];
  const groups=groupConversationWorkspaces(orderActivityItems(rows));
  assert.deepEqual(historyGroupOrder([...groups.keys()],['empty','w1','w2']),['w1','w2','@default']);
  assert.deepEqual(groups.get('w2').map(row=>row.id),['waiting','new','old']);
  assert.deepEqual(historyGroupOrder([...groups.keys()],['w2','w1']),['w2','w1','@default']);
});
