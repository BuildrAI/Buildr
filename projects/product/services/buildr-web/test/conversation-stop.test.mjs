import assert from 'node:assert/strict';
import test from 'node:test';
import {stoppedConversationEntries,stopConversationWithRecovery} from '../src/features/agent-conversations/conversation-stop.ts';
const chat={id:'chat',workspaceId:'ws',revision:'r1',entries:[{id:'a',runId:'run',text:'点击时的文字',kind:'message'}],run:{id:'run',participantId:'p',generation:'g',status:'running',tools:[]}};
const conflict=()=>Object.assign(new Error('内容已变化，请刷新后重试。'),{status:409,code:'agent_revision_conflict'});
test('stop freezes this round while control state and other rounds remain live',()=>{
 const stopped={workspaceId:'ws',conversationId:'chat',runId:'run',entries:structuredClone(chat.entries)};
 const fresh={...chat,entries:[{...chat.entries[0],text:'迟到片段',status:'completed'},{id:'late',runId:'run',text:'新输出'},{id:'next',runId:'next',text:'下一轮'}]};
 const result=stoppedConversationEntries(fresh,stopped);
 assert.deepEqual(result.map(e=>e.text),['点击时的文字','下一轮']);assert.equal(result[0].status,'completed');
 assert.equal(stoppedConversationEntries({...fresh,id:'other'},stopped),fresh.entries);
 const tool={id:'tool',runId:'run',kind:'tool',text:'点击时的工具输出',detail:{revision:'live',live:true}};
 const tools=stoppedConversationEntries({...chat,entries:[{...tool,text:'迟到工具输出',detail:{revision:'final'}}]},{...stopped,entries:[tool]});
 assert.equal(tools[0].text,tool.text);assert.deepEqual(tools[0].detail,tool.detail,'停止后不切换到会自动加载迟到正文的详情修订');
});
test('revision rejection refreshes only the original round',async()=>{
 const sent=[];
 const result=await stopConversationWithRecovery(chat,async current=>{sent.push(current);if(sent.length===1)throw conflict();return current;},async()=>({...chat,revision:'r2'}));
 assert.equal(result.revision,'r2');assert.equal(sent.length,2);assert.equal(sent[1].run.id,'run');
});
test('recovery cannot stop a replacement run or changed owner',async()=>{
 for(const changes of [{id:'other'},{participantId:'other'},{generation:'other'}]){
  let calls=0;await assert.rejects(stopConversationWithRecovery(chat,async()=>{calls++;throw conflict();},async()=>({...chat,run:{...chat.run,...changes}})),/原执行已变化/);assert.equal(calls,1);
 }
});
test('unknown delivery is never retried and contention has a finite budget',async()=>{
 let calls=0,reads=0;const lost=new Error('network lost');
 await assert.rejects(stopConversationWithRecovery(chat,async()=>{calls++;throw lost;},async()=>{reads++;return chat;}),lost);assert.equal(calls,1);assert.equal(reads,0);
 calls=0;await assert.rejects(stopConversationWithRecovery(chat,async()=>{calls++;throw conflict();},async()=>chat),{code:'agent_revision_conflict'});assert.equal(calls,3);
});
