import assert from 'node:assert/strict';
import test from 'node:test';
import { readConversationHistoryPage } from '../src/features/agent-conversations/conversation-history-page.ts';

const fixture = total => {
  const calls = [], rows = Array.from({length:total},(_,i)=>({id:String(i),workspaceId:'w1'}));
  return {calls, read:async({limit,cursor})=>{
    calls.push({limit,cursor});const offset=cursor?Number(cursor.split(':')[1])+1:0,chosen=rows.slice(offset,offset+limit);
    return {total,conversations:chosen,nextCursor:offset+limit<total?'after:'+chosen.at(-1).id:undefined};
  }};
};
test('首批5条，用户每次续读仅请求末条游标后的10条，不重读前缀',async()=>{
 const f=fixture(1000),signal=new AbortController().signal;
 let page=await readConversationHistoryPage(f.read,5,signal);assert.equal(page.conversations.length,5);assert.equal(f.calls.length,1);
 page=await readConversationHistoryPage(f.read,10,signal,page);assert.equal(page.conversations.length,15);
 page=await readConversationHistoryPage(f.read,10,signal,page);assert.equal(page.conversations.length,25);
 assert.deepEqual(f.calls,[{limit:5,cursor:undefined},{limit:10,cursor:'after:4'},{limit:10,cursor:'after:14'}]);
});
test('尾批不足10条且没有后续游标时不再读取，重新展开从首批5条开始',async()=>{
 const f=fixture(8),signal=new AbortController().signal;
 const initial=await readConversationHistoryPage(f.read,5,signal),tail=await readConversationHistoryPage(f.read,10,signal,initial);
 assert.equal(tail.conversations.length,8);assert.equal(await readConversationHistoryPage(f.read,10,signal,tail),tail);assert.equal(f.calls.length,2);
 assert.equal((await readConversationHistoryPage(f.read,5,signal)).conversations.length,5);assert.equal(f.calls.at(-1).cursor,undefined);
});
test('取消、重复游标及无进展不会返回混合半成品或自动追读',async()=>{
 const controller=new AbortController();await assert.rejects(readConversationHistoryPage(async()=>{controller.abort();return {conversations:[{id:'late'}]};},5,controller.signal),{name:'AbortError'});
 const f=fixture(20),signal=new AbortController().signal,page=await readConversationHistoryPage(f.read,5,signal);
 await assert.rejects(readConversationHistoryPage(async()=>({conversations:[],nextCursor:page.nextCursor}),10,signal,page),/未前进/);
 assert.equal(page.conversations.length,5);await assert.rejects(readConversationHistoryPage(f.read,0,signal),/无效/);
});
test('失败重试沿用相同游标，重复身份不会重复追加或覆盖已有条目',async()=>{
 const f=fixture(20),signal=new AbortController().signal,page=await readConversationHistoryPage(f.read,5,signal);let calls=0;
 const read=async input=>{calls++;assert.equal(input.cursor,'after:4');if(calls===1)throw Error('unavailable');const result=await f.read(input);return {...result,conversations:[page.conversations[0],...result.conversations]};};
 await assert.rejects(readConversationHistoryPage(read,10,signal,page),/unavailable/);assert.equal(page.conversations.length,5);
 const next=await readConversationHistoryPage(read,10,signal,page);assert.equal(next.conversations.length,15);assert.equal(calls,2);assert.equal(next.conversations[0],page.conversations[0]);
});
