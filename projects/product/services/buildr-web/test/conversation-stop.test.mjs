import assert from 'node:assert/strict';
import test from 'node:test';
import {stoppedConversationEntries,stopConversationWithRecovery,conversationStopControlState} from '../src/features/agent-conversations/conversation-stop.ts';
const chat={id:'chat',workspaceId:'ws',revision:'r1',entries:[{id:'a',runId:'run',text:'点击时的文字',kind:'message'}],run:{id:'run',participantId:'p',generation:'g',status:'running',tools:[]}};
const conflict=()=>Object.assign(new Error('内容已变化，请刷新后重试。'),{status:409,code:'agent_revision_conflict'});
test('independent stop control retains pending feedback and covers retained work without depending on drafts',()=>{
 const current={...chat,requests:[]};
 assert.equal(conversationStopControlState(null),'hidden');
 assert.equal(conversationStopControlState(current),'ready');
 assert.equal(conversationStopControlState(current,true),'stopping');
 const cancelling={...current,run:{...current.run,status:'stopping',stopRequested:true}};
 assert.equal(conversationStopControlState(cancelling),'stopping');
 const ended={...current,run:{...current.run,status:'stopped',executionState:'ended',resourcesReleased:true}};
 assert.equal(conversationStopControlState(ended),'hidden');
 assert.equal(conversationStopControlState({...ended,retainedRuns:[{...cancelling.run,id:'retained-cancelling'}]}),'stopping');
 for(const status of ['running','tools-active','unknown'])assert.equal(conversationStopControlState({...ended,retainedRuns:[{...chat.run,id:'retained',status}]}),'ready');
 assert.equal(conversationStopControlState({...ended,pendingSend:{id:'pending'}}),'ready');
 assert.equal(conversationStopControlState({...cancelling,retainedRuns:[{...chat.run,id:'unconfirmed',status:'unknown'}]}),'ready','partial uncertainty stays actionable');
});
test('stop freezes this round while control state and other rounds remain live',()=>{
 const stopped={workspaceId:'ws',conversationId:'chat',runId:'run',entries:structuredClone(chat.entries)};
 const fresh={...chat,entries:[{...chat.entries[0],text:'迟到片段',status:'completed'},{id:'late',runId:'run',text:'新输出'},{id:'next',runId:'next',text:'下一轮'}]};
 const result=stoppedConversationEntries(fresh,stopped);
 assert.deepEqual(result.map(e=>e.text),['点击时的文字','下一轮']);assert.equal(result[0].status,'completed');
 assert.equal(stoppedConversationEntries({...fresh,id:'other'},stopped),fresh.entries);
 assert.deepEqual(stoppedConversationEntries({...chat,entries:[]},stopped).map(entry=>entry.text),['点击时的文字'],'后续投影省略条目也不能抹掉点击时的输出');
 const tool={id:'tool',runId:'run',kind:'tool',text:'点击时的工具输出',detail:{revision:'live',live:true}};
 const tools=stoppedConversationEntries({...chat,entries:[{...tool,text:'迟到工具输出',detail:{revision:'final'}}]},{...stopped,entries:[tool]});
 assert.equal(tools[0].text,tool.text);assert.deepEqual(tools[0].detail,tool.detail,'停止后不切换到会自动加载迟到正文的详情修订');
});
test('revision rejection refreshes only the original round',async()=>{
 const sent=[];
 const result=await stopConversationWithRecovery(chat,async current=>{sent.push(current);if(sent.length===1)throw conflict();return current;},async()=>({...chat,revision:'r2'}));
 assert.equal(result.revision,'r2');assert.equal(sent.length,2);assert.equal(sent[1].run.id,'run');
});
test('control generation rejection refreshes only the original round',async()=>{
 const sent=[];
 const stale=()=>Object.assign(new Error('本轮执行或服务代次已变化，请重新观察。'),{status:409,code:'agent_control_stale'});
 const result=await stopConversationWithRecovery(chat,async current=>{sent.push(current);if(sent.length===1)throw stale();return current;},async()=>({...chat,revision:'r2'}));
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

test('whole conversation stop freezes retained rounds but not a later independent turn',async()=>{
 const {conversationStopRunIds}=await import('../src/features/agent-conversations/conversation-stop.ts');
 const current={...chat,run:{...chat.run,status:'stopped'},retainedRuns:[{id:'old',participantId:'p-old',generation:'old-g',status:'running',tools:[]}],requests:[]};
 assert.deepEqual(conversationStopRunIds(current),['old']);
 const frozen={workspaceId:'ws',conversationId:'chat',runIds:['old'],entries:[{id:'old-text',runId:'old',text:'before stop'}]};
 const next={...current,entries:[{id:'old-text',runId:'old',text:'late output'},{id:'new-text',runId:'new',text:'new turn'}]};
 assert.deepEqual(stoppedConversationEntries(next,frozen).map(e=>e.text),['before stop','new turn']);
});
test('whole conversation stop retries a rejected stream revision but never widens to replacement work',async()=>{
 const {stopAllWithRecovery}=await import('../src/features/agent-conversations/conversation-stop.ts');
 let calls=0;
 const result=await stopAllWithRecovery(chat,'stop-id',async current=>{if(++calls===1)throw conflict();return current;},async()=>({...chat,revision:'r2'}));
 assert.equal(result.revision,'r2');assert.equal(calls,2);
 for(const changed of [{run:{...chat.run,id:'new'}},{pendingSend:{id:'later'}}]){
  calls=0;await assert.rejects(stopAllWithRecovery(chat,'stop-id',async()=>{calls++;throw conflict();},async()=>({...chat,...changed})),/未将停止扩展/);assert.equal(calls,1);
 }
 calls=0;const lost=new Error('lost receipt');await assert.rejects(stopAllWithRecovery(chat,'stop-id',async()=>{calls++;throw lost;},async()=>chat),lost);assert.equal(calls,1);
});

test('normal aggregate cancellation prevents duplicate effects, while unresolved or new work remains controllable',async()=>{
 const {canStopConversation}=await import('../src/features/agent-conversations/conversation-stop.ts');
 const stopping={...chat,requests:[],run:{...chat.run,status:'stopping',stopRequested:true}};
 assert.equal(canStopConversation(stopping),false);
 assert.equal(canStopConversation({...stopping,run:{...stopping.run,status:'unknown'}}),true);
 assert.equal(canStopConversation({...stopping,run:{...stopping.run,status:'stopped'},retainedRuns:[{...chat.run,id:'new'}]}),true);
});
