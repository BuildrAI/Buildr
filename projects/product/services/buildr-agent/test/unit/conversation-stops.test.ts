import assert from 'node:assert/strict';
import test from 'node:test';
import {ConversationStops} from '../../src/application/conversation-stops.ts';
import {AgentServiceError} from '../../src/domain/agent-state.ts';
import type {StoredConversation} from '../../src/domain/agent-state.ts';
import type {RunView} from '../../src/contracts.ts';
import type {PendingSendRepository} from '../../src/persistence/pending-send-repository.ts';

const run=(id:string,generation='g'):RunView=>({id,participantId:'p-'+id,generation,provider:'qoder-cn',status:'running',accepted:true,tools:[],startedAt:'now',updatedAt:'now'});
function fixture() {
  let revision=0;
  let record={view:{id:'chat',workspaceId:'ws',revision:'r0',run:{...run('latest'),status:'stopped'},retainedRuns:[run('old','old-generation'),run('other')],requests:[],entries:[]},stops:[]} as unknown as StoredConversation;
  let pending:any={id:'queued',draft:{text:'do not send',connectionId:'qoder-cn',expectedRevision:'r0'}};
  const calls:Array<{runId:string;generation:string;action:string}>=[];
  let effect:((target:string)=>Promise<void>)|undefined;
  const stops=new ConversationStops({
    load(scope,id){if(scope!=='ws'||id!=='chat')throw new AgentServiceError('agent_conversation_missing','missing',404);return structuredClone(record);},
    save(value){if(value.view.revision!==record.view.revision)throw new AgentServiceError('agent_revision_conflict','conflict',409);record=structuredClone(value);record.view.revision='r'+(++revision);},
    read(){return structuredClone(record.view);},
    pending:{cancelForStop(_scope:string,_id:string,persist:any){const prior=pending;const result=persist(prior);pending=undefined;return result;},cancelStopped(_scope:string,_id:string,id:string){if(pending?.id===id)pending=undefined;}} as unknown as PendingSendRepository,
    now:()=> 'now',
    async invoke(_scope,_id,input,action){calls.push({runId:input.runId,generation:input.generation,action});await effect?.(input.runId);},
  });
  return {stops,calls,get record(){return record;},get pending(){return pending;},setEffect(value:(id:string)=>Promise<void>){effect=value;}};
}

test('conversation stop snapshots retained generations even after the current run stopped and retains cancelled input',async()=>{
  const f=fixture();
  const result=await f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
  assert.deepEqual(result.stopRequest?.runIds,['old','other']);
  assert.equal(result.stopRequest?.cancelledSend?.draft.text,'do not send');
  assert.equal(f.pending,undefined);
  assert.deepEqual(f.calls.map(call=>[call.runId,call.generation,call.action]),[['old','old-generation','stop'],['other','g','stop']]);
  assert.ok(f.record.view.retainedRuns!.every(run=>run.stopRequested));
});
test('wrong scope or stale revision has no cancellation effect',async()=>{
  for(const [scope,revision,code]of [['foreign','r0','agent_conversation_missing'],['ws','stale','agent_revision_conflict']]){
    const f=fixture();
    await assert.rejects(f.stops.stop(scope,'chat',{expectedRevision:revision,clientRequestId:'stop'}),{code});
    assert.equal(f.pending.id,'queued');assert.equal(f.calls.length,0);
  }
});
test('duplicate stop and recovery observe the original scope, never stop a later independent turn',async()=>{
  const f=fixture();
  await f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
  f.record.view.run=run('new');
  await f.stops.stop('ws','chat',{expectedRevision:'old-observation',clientRequestId:'stop'});
  assert.equal(f.calls.filter(call=>call.action==='stop').length,2);
  assert.deepEqual(f.calls.filter(call=>call.action==='observe').map(call=>call.runId),['old','other']);
  assert.ok(!f.record.view.run.stopRequested);
});
test('a failed retained owner does not prevent another owner being stopped',async()=>{
  const f=fixture();
  f.setEffect(async id=>{if(id==='old')throw new Error('owner unavailable');});
  const view=await f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
  assert.equal(view.retainedRuns![0].status,'unknown');
  assert.equal(f.calls.filter(call=>call.action==='stop').length,2);
  assert.match(view.retainedRuns![0].diagnostic!,/尚未确认/);
});
test('concurrent identical stops share native effects',async()=>{
  const f=fixture();let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});f.setEffect(()=>gate);
  const a=f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
  const b=f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
  release();await Promise.all([a,b]);
  assert.equal(f.calls.filter(call=>call.action==='stop').length,2);assert.equal(f.stops.active,0);
});

test('recovery reasserts the durable stop only when the original owner proves live work',async()=>{
 const f=fixture();await f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
 f.record.view.retainedRuns![0].executionState='active';f.record.view.retainedRuns![1].executionState='unknown';
 f.calls.length=0;await f.stops.resume('ws','chat','stop');
 assert.deepEqual(f.calls.map(call=>[call.runId,call.action]),[['old','observe'],['other','observe'],['old','stop']]);
});

test('durable admission returns while slow native cleanup remains tracked',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});f.setEffect(()=>gate);
 const response=f.stops.stop('ws','chat',{expectedRevision:'r0',clientRequestId:'stop'});
 await Promise.resolve();await Promise.resolve();t.mock.timers.tick(1000);
 assert.equal((await response).stopRequest?.id,'stop');assert.equal(f.stops.active,1);
 release();await f.stops.resume('ws','chat','stop');assert.equal(f.stops.active,0);
});
