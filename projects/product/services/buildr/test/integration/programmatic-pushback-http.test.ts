import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {programmaticHttpFixture,fakePushbackReceiver} from '../helpers/programmatic-http-fixture.ts';

const SECRET='pushback-secret-token';
const RECEIVER='https://receiver.test/hook';

async function configurePushback(f:any,credentialId:string,url=RECEIVER,extra:Record<string,unknown>={}){
 const route=f.manager+'/'+credentialId+'/pushback';
 const initial=await(await fetch(route,{headers:f.webHeaders})).json();
 const response=await fetch(route,{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:initial.revision,enabled:true,url,secret:SECRET,...extra})});
 assert.equal(response.status,200,await response.clone().text());
 return response.json();
}
async function startConversation(f:any,token:string,text='authorized work'){
 const endpoint='/workspaces/'+f.workspaceId+'/conversations',draft=randomUUID();
 const state=await(await f.call(endpoint+'/drafts/'+draft,token)).json();
 const response=await f.call(endpoint+'/drafts/'+draft+'/send',token,{connectionId:'fixture',text,clientRequestId:randomUUID(),expectedDraftRevision:state.revision});
 assert.equal(response.status,202,await response.clone().text());
 const sent=await response.json();
 return {endpoint,conversationId:sent.conversation.id as string,sent};
}

test('messages single-step continue reuses the connection and enforces send semantics',async t=>{
 const f=await programmaticHttpFixture(t),{token}=await f.create();
 const {endpoint,conversationId}=await startConversation(f,token),conversation=endpoint+'/'+conversationId;
 const running=await f.call(conversation+'/messages',token,{text:'continue',clientRequestId:randomUUID()});
 assert.equal(running.status,409,await running.clone().text());
 assert.equal((await running.json()).error.code,'agent_native_supplement_required');
 const {token:readToken}=await f.create(['read']);
 assert.equal((await f.call(conversation+'/messages',readToken,{text:'x',clientRequestId:randomUUID()})).status,403);
 assert.equal((await f.call(conversation+'/messages',token,{clientRequestId:randomUUID()})).status,400);
 assert.equal((await f.call(conversation+'/messages',token,{text:'x'})).status,400);
 assert.equal((await f.call(conversation+'/messages',token,{text:'x',clientRequestId:'not-a-uuid'})).status,400);
 const view=await(await f.call(conversation+'/observe',token,{})).json();
 const control={expectedRevision:view.revision,runId:view.run.id,participantId:view.run.participantId,generation:view.run.generation};
 assert.equal((await f.call(conversation+'/stop',token,control)).status,200);
 const requestId=randomUUID();
 const continued=await f.call(conversation+'/messages',token,{text:'single step',clientRequestId:requestId});
 assert.equal(continued.status,202,await continued.clone().text());
 const sent=await continued.json();assert.ok(sent.run.id);
 const after=await(await f.call(conversation,token)).json();
 const participant=after.participants.find((item:any)=>item.id===sent.run.participantId);
 assert.equal(participant.connectionId,'fixture','the original connection is reused');
 const repeated=await f.call(conversation+'/messages',token,{text:'single step',clientRequestId:requestId});
 assert.equal(repeated.status,202);assert.equal((await repeated.json()).run.id,sent.run.id,'idempotent replay returns the same run');
 assert.equal((await f.call(conversation+'/messages',token,{text:'changed',clientRequestId:requestId})).status,409);
 assert.equal((await f.call(conversation+'/messages',token,{text:'x',clientRequestId:randomUUID(),expectedRevision:'stale'})).status,409);
});

test('messages on a conversation without a reusable run returns idle 409',async t=>{
 const f=await programmaticHttpFixture(t),{token}=await f.create();
 const idle=await f.service.conversations.create(f.workspaceId,{title:'idle'});
 const response=await f.call('/workspaces/'+f.workspaceId+'/conversations/'+idle.id+'/messages',token,{text:'x',clientRequestId:randomUUID()});
 assert.equal(response.status,409);assert.equal((await response.json()).error.code,'agent_conversation_idle');
});

test('pushback management is session-only, redacts the secret and records deliveries',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{holdSend:false,pushbackTransport:receiver.transport});
 const {token,credential}=await f.create(),route=f.manager+'/'+credential.id+'/pushback';
 assert.equal((await fetch(route,{headers:{authorization:'Bearer '+token}})).status,403);
 assert.equal((await fetch(route)).status,403);
 const initial=await(await fetch(route,{headers:f.webHeaders})).json();
 assert.equal(initial.state,'unconfigured');assert.equal(initial.hasSecret,false);
 const saved=await configurePushback(f,credential.id);
 assert.equal(saved.state,'enabled');assert.equal(saved.hasSecret,true);
 assert.ok(!JSON.stringify(saved).includes(SECRET),'the public view never carries the secret');
 assert.equal((await fetch(route+'/reveal',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:'stale'})})).status,409);
 const revealed=await(await fetch(route+'/reveal',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:saved.revision})})).json();
 assert.equal(revealed.secret,SECRET);
 const tested=await fetch(route+'/test',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:saved.revision})});
 assert.equal(tested.status,200,await tested.clone().text());
 const result=await tested.json();assert.equal(result.kind,'test');assert.equal(result.success,true);
 assert.equal(receiver.calls.length,1);assert.equal(receiver.calls[0].init.headers.authorization,'Bearer '+SECRET);
 const after=await(await fetch(route,{headers:f.webHeaders})).json();
 assert.ok(after.recentDeliveries.some((item:any)=>item.kind==='test'&&item.success));
 assert.equal((await fetch(f.manager+'/'+randomUUID()+'/pushback',{headers:f.webHeaders})).status,404);
});

test('events backfill is read-scoped and only the takeover credential receives events',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{pushbackTransport:receiver.transport});
 const {token:tokenA,credential:credA}=await f.create(),{token:tokenB,credential:credB}=await f.create();
 await configurePushback(f,credA.id,'https://receiver.test/a');
 await configurePushback(f,credB.id,'https://receiver.test/b');
 const {conversationId}=await startConversation(f,tokenA);
 await f.flush();
 f.complete();
 await f.flush();
 assert.ok(receiver.calls.filter(call=>call.url==='https://receiver.test/a').some(call=>call.body.type==='run.completed'));
 assert.equal(receiver.calls.filter(call=>call.url==='https://receiver.test/b').length,0,'a credential without takeover receives nothing');
 const eventsRoute='/workspaces/'+f.workspaceId+'/events';
 const pageA=await(await f.call(eventsRoute,tokenA)).json();
 assert.ok(pageA.events.some((event:any)=>event.type==='run.completed'&&event.conversationId===conversationId));
 assert.ok(pageA.events.every((event:any,index:number)=>index===0||event.sequence>pageA.events[index-1].sequence),'ascending sequence');
 assert.deepEqual((await(await f.call(eventsRoute,tokenB)).json()).events,[]);
 assert.equal((await f.call(eventsRoute+'?limit=0',tokenA)).status,400);
 assert.equal((await f.call(eventsRoute+'?limit=201',tokenA)).status,400);
 assert.equal((await f.call(eventsRoute+'?unknown=1',tokenA)).status,400);
 assert.equal((await f.call(eventsRoute)).status,401,'anonymous access is rejected');
 const first=pageA.events[0];
 const afterPage=await(await f.call(eventsRoute+'?after='+first.sequence,tokenA)).json();
 assert.ok(afterPage.events.every((event:any)=>event.sequence>first.sequence));
});

test('stop attribution suppresses the initiator credential run.stopped',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{pushbackTransport:receiver.transport});
 const {token,credential}=await f.create();
 await configurePushback(f,credential.id);
 const {endpoint,conversationId}=await startConversation(f,token),conversation=endpoint+'/'+conversationId;
 const view=await(await f.call(conversation+'/observe',token,{})).json();
 const control={expectedRevision:view.revision,runId:view.run.id,participantId:view.run.participantId,generation:view.run.generation};
 assert.equal((await f.call(conversation+'/stop',token,control)).status,200);
 await f.flush();
 const page=await(await f.call('/workspaces/'+f.workspaceId+'/events',token)).json();
 assert.ok(!page.events.some((event:any)=>event.type==='run.stopped'),'the initiator does not receive its own stop');
 assert.ok(!receiver.calls.some(call=>call.body.type==='run.stopped'));
});

test('list query parameters pass through the HTTP allowlist with activityCounts',async t=>{
 const f=await programmaticHttpFixture(t,{holdSend:false}),{token}=await f.create();
 await startConversation(f,token,'first');
 await startConversation(f,token,'second');
 await f.flush();
 const route='/workspaces/'+f.workspaceId+'/conversations';
 const summary=await(await f.call(route+'?fields=summary&limit=1',token)).json();
 assert.ok(summary.activityCounts,'activityCounts is always present');
 assert.equal(summary.conversations.length,1,'limit is honored');
 assert.deepEqual(Object.keys(summary.conversations[0]).sort(),['active','id','pendingDecisionCount','runStatus','title','updatedAt']);
 const active=await(await f.call(route+'?active=true',token)).json();
 assert.ok(active.conversations.every((item:any)=>item.activity.active===true));
 const attention=await(await f.call(route+'?attention=true',token)).json();
 assert.ok(Array.isArray(attention.conversations));
 assert.equal((await f.call(route+'?bogus=1',token)).status,400);
});