import test from 'node:test';
import assert from 'node:assert/strict';
import {dshHistoryItems} from '../../src/executors/dsh/protocol.ts';
import {pausePreviousDshGoal} from '../../src/executors/dsh/goals.ts';

test('goal rounds retain the creating request across newer user inputs and follow a later explicit edit',()=>{
 const events=[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{source:{kind:'user',rpcId:'original'},content:'first'}},{type:'goal/change',data:{operation:'create',goal:{id:'goal'}}},{type:'turn/start',data:{turn:2}},{type:'user/message',data:{source:{kind:'user',rpcId:'new'},content:'next'}},{type:'turn/start',data:{turn:3}},{type:'user/message',data:{source:{kind:'goal',goalId:'goal'}}},{type:'assistant/message',data:{turn:3,step:1,message:{content:'old completion'}}},{type:'turn/start',data:{turn:4}},{type:'user/message',data:{source:{kind:'user',rpcId:'edit'},content:'new goal'}},{type:'goal/change',data:{operation:'edit',goal:{id:'goal'}}},{type:'turn/start',data:{turn:5}},{type:'user/message',data:{source:{kind:'goal',goalId:'goal'}}},{type:'assistant/message',data:{turn:5,step:1,message:{content:'new completion'}}}];
 const items=dshHistoryItems(events);assert.equal(items.find(item=>item.text==='old completion')?.executionId,'original');assert.equal(items.find(item=>item.text==='new completion')?.executionId,'edit');
});
test('new input pauses an exact old goal without claiming completion and refuses unconfirmed pause',async()=>{
 let phase='active',calls=0;
 const snapshot=async()=>({agent:{goal:{goal:{id:'goal',phase}}}});
 await pausePreviousDshGoal({commands:{execute:async(id:string,line:string)=>{assert.equal(id,'session');assert.equal(line,'/goal pause');calls++;phase='paused';return{ok:true};}}},'session',snapshot);
 assert.equal(calls,1);await pausePreviousDshGoal({},'session',snapshot);phase='active';
 await assert.rejects(pausePreviousDshGoal({commands:{execute:async()=>({ok:true})}},'session',snapshot),/dsh_goal_pause_unconfirmed/);
});
