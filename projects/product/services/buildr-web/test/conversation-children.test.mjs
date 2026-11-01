import assert from 'node:assert/strict';
import test from 'node:test';
import {childConversationStatus,childCreationStorageKey,mergeChildConversations,readChildCreation} from '../src/features/agent-conversations/conversation-children.ts';
const row=(id,createdAt,fields={})=>({id,workspaceId:'workspace',updatedAt:'2026-10-29',childOf:{createdAt},...fields});
test('子对话以创建次序保留全部入口，刷新和分页不重复且不按输出跳动',()=>{
  const a=row('a','2026-01-01'),b=row('b','2026-01-02');
  const rows=mergeChildConversations([b,a],[{...b,title:'new'},row('c','2026-01-03')]);
  assert.deepEqual(rows.map(r=>r.id),['a','b','c']);assert.equal(rows[1].title,'new');
  assert.deepEqual(mergeChildConversations(rows,[b]).map(r=>r.id),['a','b','c']);
});
test('浮动入口显示真实工作和待回应状态而不把收起当作停止',()=>{
  for(const [status,expected] of [['running','正在处理'],['waiting-approval','等待授权'],['waiting-question','等待回答'],['unknown','待核对'],['tools-active','待核对'],['failed','执行失败'],['stopped','已停止']])assert.equal(childConversationStatus(row('a','',{run:{status}})),expected);
  assert.equal(childConversationStatus(row('a','',{run:{status:'completed'},activity:{version:2,seenThrough:1}})),'有新消息');
  assert.equal(childConversationStatus(row('a','')),'尚未开始');
});
test('未知创建按父对话及配置隔离保存原请求，损坏存储不伪造请求',()=>{
  const parent={id:'parent',workspaceId:'workspace'},key=childCreationStorageKey(parent,'profile');
  assert.notEqual(key,childCreationStorageKey({...parent,id:'another'},'profile'));
  assert.notEqual(key,childCreationStorageKey(parent,'other-profile'));
  const input={expectedRevision:'observed-version',clientRequestId:'original-request'};
  assert.deepEqual(readChildCreation({getItem:()=>JSON.stringify(input)},key),input);
  for(const value of ['invalid','{}','{"expectedRevision":"r"}','null'])assert.equal(readChildCreation({getItem:()=>value},key),undefined);
  assert.equal(readChildCreation({getItem(){throw Error('unavailable');}},key),undefined);
});
