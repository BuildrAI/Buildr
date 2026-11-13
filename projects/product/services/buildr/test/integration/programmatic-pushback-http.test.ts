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
async function startConversation(f:any,token:string,text='authorized work',extra:Record<string,unknown>={}){
 const endpoint='/workspaces/'+f.workspaceId+'/conversations',draft=randomUUID();
 const state=await(await f.call(endpoint+'/drafts/'+draft,token)).json();
 const response=await f.call(endpoint+'/drafts/'+draft+'/send',token,{connectionId:'fixture',text,clientRequestId:randomUUID(),expectedDraftRevision:state.revision,...extra});
 assert.equal(response.status,202,await response.clone().text());
 const sent=await response.json();
 return {endpoint,conversationId:sent.conversation.id as string,sent};
}
async function stopCurrent(f:any,token:string,conversation:string){
 const view=await(await f.call(conversation+'/observe',token,{})).json();
 const response=await f.call(conversation+'/stop',token,{expectedRevision:view.revision,runId:view.run.id,participantId:view.run.participantId,generation:view.run.generation});
 assert.equal(response.status,200,await response.clone().text());
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

test('messages inherits the latest permissionMode unless explicitly overridden and enforces allowFullAccess',async t=>{
 const f=await programmaticHttpFixture(t),{token}=await f.create();
 const full=await startConversation(f,token,'full access work',{permissionMode:'full-access'});
 const fullConversation=full.endpoint+'/'+full.conversationId;
 await stopCurrent(f,token,fullConversation);
 const inherited=await f.call(fullConversation+'/messages',token,{text:'inherit',clientRequestId:randomUUID()});
 assert.equal(inherited.status,202,await inherited.clone().text());
 assert.equal((await inherited.json()).run.permissionMode,'full-access','omission inherits the latest run');
 await stopCurrent(f,token,fullConversation);
 const overridden=await f.call(fullConversation+'/messages',token,{text:'override',clientRequestId:randomUUID(),permissionMode:'default'});
 assert.equal(overridden.status,202,await overridden.clone().text());
 assert.equal((await overridden.json()).run.permissionMode,'default','explicit mode overrides inheritance');

 const restricted=await startConversation(f,token,'default work');
 const restrictedConversation=restricted.endpoint+'/'+restricted.conversationId;
 await stopCurrent(f,token,restrictedConversation);
 const {token:noFull}=await f.create(['read','execute'],false);
 const forbidden=await f.call(restrictedConversation+'/messages',noFull,{text:'full',clientRequestId:randomUUID(),permissionMode:'full-access'});
 assert.equal(forbidden.status,403);
 assert.equal((await forbidden.json()).error.code,'programmatic_forbidden');
});

test('pushback management is session-only, redacts the secret and records deliveries',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{holdSend:false,pushbackTransport:receiver.transport});
 const {token,credential}=await f.create(),route=f.manager+'/'+credential.id+'/pushback';
 assert.equal((await fetch(route,{headers:{authorization:'Bearer '+token}})).status,403);
 assert.equal((await fetch(route)).status,403);
 const initial=await(await fetch(route,{headers:f.webHeaders})).json();
 assert.equal(initial.state,'unconfigured');assert.equal(initial.hasSecret,false);
 assert.equal(initial.progressEnabled,true);assert.equal(initial.stalledEnabled,true);
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
 const {endpoint,conversationId}=await startConversation(f,tokenA);
 await f.flush();
 f.complete();
 await f.flush();
 const updatedCredential=await fetch(f.manager+'/'+credA.id+'/update',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:credA.revision,name:'GrokBot fixture',workspaceIds:[f.workspaceId],scopes:['read','execute','answer'],allowFullAccess:false})});
 assert.equal(updatedCredential.status,200,await updatedCredential.clone().text());
 const continued=await f.call(endpoint+'/'+conversationId+'/messages',tokenA,{text:'second event',clientRequestId:randomUUID()});
 assert.equal(continued.status,202,await continued.clone().text());
 await f.flush();
 f.complete();
 await f.flush();
 assert.ok(receiver.calls.filter(call=>call.url==='https://receiver.test/a').some(call=>call.body.type==='run.completed'));
 const progressCall=receiver.calls.find(call=>call.url==='https://receiver.test/a'&&call.body.type==='run.progress');
 assert.ok(progressCall,'intermediate assistant text is delivered as run.progress');
 assert.equal(progressCall!.body.progress.text,'fixture result');
 assert.equal(typeof progressCall!.body.progress.elapsedMs,'number');
 assert.equal(progressCall!.body.progress.completedToolCount,0);
 assert.deepEqual(progressCall!.body.scopes,['read','execute']);
 assert.equal(progressCall!.body.allowFullAccess,true);
 const completedCall=receiver.calls.find(call=>call.url==='https://receiver.test/a'&&call.body.type==='run.completed'&&call.body.finalReply==='fixture result');
 assert.ok(completedCall,'completed event carries the full assistant reply');
 assert.deepEqual(completedCall!.body.scopes,['read','execute']);
 assert.equal(completedCall!.body.allowFullAccess,true);
 assert.equal(completedCall!.body.finalReplyUrl,'/api/v1/programmatic/workspaces/'+f.workspaceId+'/conversations/'+conversationId+'/runs/'+completedCall!.body.runId+'/final-reply');
 const latestCompleted=receiver.calls.filter(call=>call.url==='https://receiver.test/a'&&call.body.type==='run.completed').at(-1)!;
 assert.deepEqual(latestCompleted.body.scopes,['read','execute','answer'],'events use the updated credential scope snapshot');
 assert.equal(latestCompleted.body.allowFullAccess,false);
 assert.equal(receiver.calls.filter(call=>call.url==='https://receiver.test/b').length,0,'a credential without takeover receives nothing');
 const finalReply=await f.call(endpoint+'/'+conversationId+'/runs/'+completedCall!.body.runId+'/final-reply',tokenA);
 assert.equal(finalReply.status,200,await finalReply.clone().text());
 assert.deepEqual(await finalReply.json(),{runId:completedCall!.body.runId,finalReply:'fixture result'});
 assert.equal((await f.call(endpoint+'/'+conversationId+'/runs/'+randomUUID()+'/final-reply',tokenA)).status,404);
 const eventsRoute='/workspaces/'+f.workspaceId+'/events';
 const pageA=await(await f.call(eventsRoute,tokenA)).json();
 assert.ok(pageA.events.some((event:any)=>event.type==='run.completed'&&event.conversationId===conversationId));
 assert.ok(pageA.events.every((event:any,index:number)=>index===0||event.sequence>pageA.events[index-1].sequence),'ascending sequence');
 assert.ok(pageA.events.length>=2,'two completed rounds');
 assert.equal(pageA.nextCursor,String(pageA.events.at(-1).sequence),'end page still exposes its last sequence');
 assert.equal(pageA.hasMore,false);
 const tokenBPage=await(await f.call(eventsRoute,tokenB)).json();
 assert.deepEqual(tokenBPage.events,[]);
 assert.equal(tokenBPage.nextCursor,null);
 assert.equal(tokenBPage.hasMore,false);
 assert.equal((await f.call(eventsRoute+'?limit=0',tokenA)).status,400);
 assert.equal((await f.call(eventsRoute+'?limit=201',tokenA)).status,400);
 assert.equal((await f.call(eventsRoute+'?unknown=1',tokenA)).status,400);
 for(const after of ['bogus','-1','1.2','']){
  const invalid=await f.call(eventsRoute+'?after='+after,tokenA);
  assert.equal(invalid.status,400,'after='+after);
  assert.equal((await invalid.json()).error.code,'programmatic_input_invalid');
 }
 assert.equal((await f.call(eventsRoute)).status,401,'anonymous access is rejected');
 const pageOne=await(await f.call(eventsRoute+'?limit=1',tokenA)).json();
 assert.equal(pageOne.events.length,1);
 assert.equal(pageOne.nextCursor,String(pageOne.events[0].sequence));
 assert.equal(pageOne.hasMore,true);
 const pageTwo=await(await f.call(eventsRoute+'?after='+pageOne.nextCursor+'&limit=1',tokenA)).json();
 assert.equal(pageTwo.events.length,1);
 assert.ok(pageTwo.events[0].sequence>pageOne.events[0].sequence);
 assert.equal(pageTwo.nextCursor,String(pageTwo.events[0].sequence));
 assert.equal(pageTwo.hasMore,true);
 const pageThree=await(await f.call(eventsRoute+'?after='+pageTwo.nextCursor+'&limit=1',tokenA)).json();
 assert.equal(pageThree.events.length,1);
 assert.equal(pageThree.hasMore,false);
 const end=await(await f.call(eventsRoute+'?after='+pageThree.nextCursor,tokenA)).json();
 assert.deepEqual(end.events,[]);
 assert.equal(end.nextCursor,pageThree.nextCursor,'empty page echoes the requested after');
 assert.equal(end.hasMore,false);
});

test('disabled pushback still records takeover events for events backfill',async t=>{
 const receiver=fakePushbackReceiver(),f=await programmaticHttpFixture(t,{pushbackTransport:receiver.transport});
 const {token,credential}=await f.create(),route=f.manager+'/'+credential.id+'/pushback';
 const initial=await(await fetch(route,{headers:f.webHeaders})).json();
 const saved=await fetch(route,{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:initial.revision,enabled:false,url:RECEIVER,secret:SECRET})});
 assert.equal(saved.status,200,await saved.clone().text());
 assert.equal((await saved.json()).state,'disabled');
 const {conversationId}=await startConversation(f,token);
 await f.flush();
 f.complete();
 await f.flush();
 assert.equal(receiver.calls.length,0,'disabled pushback does not deliver');
 const page=await(await f.call('/workspaces/'+f.workspaceId+'/events',token)).json();
 assert.ok(page.events.some((event:any)=>event.type==='run.completed'&&event.conversationId===conversationId),'backfill sees the completed event');
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

test('decision.requested carries the complete question card and answer identity',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{pushbackTransport:receiver.transport});
 const {token,credential}=await f.create();
 await configurePushback(f,credential.id);
 const {endpoint,conversationId}=await startConversation(f,token);
 await f.flush();
 f.emit({type:'request',request:{id:'native-question',kind:'question',title:'请选择范围',description:'本轮需要确认两个问题。',questions:[
   {id:'scope',label:'处理范围',multiple:true,allowOther:true,options:[{id:'all',label:'全部',description:'覆盖所有文件'},{id:'changed',label:'仅变更'}]},
   {id:'risk',label:'风险偏好',multiple:false,allowOther:false,options:[{id:'low',label:'低'},{id:'high',label:'高',description:'允许高风险操作'}]},
 ]}});
 await f.flush();
 f.emit({type:'item',item:{id:'after-card-progress',kind:'message',role:'assistant',text:'正在整理范围',executionId:'native-run',status:'completed'}});
 await f.flush();
 const call=receiver.calls.find(value=>value.body.type==='decision.requested');
 assert.ok(call,'the decision event was delivered');
 const request=call!.body.request;
 assert.equal(request.kind,'question');
 assert.equal(request.title,'请选择范围');
 assert.equal(request.description,'本轮需要确认两个问题。');
 assert.equal(typeof request.requestId,'string');
 assert.equal(typeof request.conversationRevision,'string');
 assert.equal(call!.body.runId,request.runId);
 assert.deepEqual(request.questions,[
  {questionId:'scope',question:'处理范围',allowOther:true,multiple:true,options:[{optionId:'all',label:'全部',description:'覆盖所有文件'},{optionId:'changed',label:'仅变更'}]},
  {questionId:'risk',question:'风险偏好',allowOther:false,multiple:false,options:[{optionId:'low',label:'低'},{optionId:'high',label:'高',description:'允许高风险操作'}]},
 ]);
 const view=await(await f.call(endpoint+'/'+conversationId+'/observe',token,{})).json();
 assert.equal(request.participantId,view.run.participantId);
 assert.equal(request.generation,view.run.generation);
});

test('decision.requested always carries a description string, empty when the card has none',async t=>{
 const receiver=fakePushbackReceiver();
 const f=await programmaticHttpFixture(t,{pushbackTransport:receiver.transport});
 const {token,credential}=await f.create();
 await configurePushback(f,credential.id);
 await startConversation(f,token);
 await f.flush();
 f.emit({type:'request',request:{id:'native-no-description',kind:'approval',title:'请确认写入',options:[{id:'allow',label:'允许'}]}});
 await f.flush();
 const call=receiver.calls.find(value=>value.body.type==='decision.requested');
 assert.ok(call,'the decision event was delivered');
 assert.equal(call!.body.request.description,'','an absent card description is the empty string');
});

test('discovery points the events capability at the canonical operations document',async t=>{
 const f=await programmaticHttpFixture(t);
 const {token}=await f.create();
 const discovery=await(await f.call('',token)).json();
 const events=discovery.capabilities.find((item:any)=>item.id==='events');
 assert.ok(events,'a read credential discovers the events operation');
 assert.equal(events.documentationUrl,'/api/v1/programmatic/operations/events');
 const document=await f.call('/operations/events',token);
 assert.equal(document.status,200,'the linked single-operation document exists');
});

test('a completed assistant message keeps its state when a late running observation arrives',async t=>{
 const f=await programmaticHttpFixture(t);
 const {token}=await f.create();
 const {endpoint,conversationId}=await startConversation(f,token);
 await f.flush();
 f.emit({type:'item',item:{id:'late-message',kind:'message',role:'assistant',text:'中间结果',executionId:'native-run',status:'completed'}});
 await f.flush();
 f.emit({type:'item',item:{id:'late-message',kind:'message',role:'assistant',text:'中间结果，补充说明',executionId:'native-run',status:'running'}});
 await f.flush();
 const view=await(await f.call(endpoint+'/'+conversationId,token)).json();
 const entry=view.entries.find((item:any)=>item.role==='assistant'&&item.text.startsWith('中间结果'));
 assert.ok(entry,'the late observation was applied');
 assert.equal(entry.status,'completed','a settled assistant message is not downgraded to running');
 assert.equal(entry.text,'中间结果，补充说明','real late text is still retained');
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
