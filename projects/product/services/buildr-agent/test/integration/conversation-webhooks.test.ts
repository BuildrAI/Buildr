import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {test} from 'node:test';
import {setImmediate as immediate} from 'node:timers/promises';
import {ConversationWebhooks} from '../../src/application/conversation-webhooks.ts';
import {WebhookJournal} from '../../src/persistence/webhook-journal.ts';
import type {ConversationView,RunView,ServiceEvent} from '../../src/contracts.ts';
const env={BUILDR_AGENT_WEBHOOK_URL:'https://notify.example.test',BUILDR_AGENT_WEBHOOK_SECRET:'private-test-key'};
function event(status='completed'):Omit<ServiceEvent,'cursor'|'generation'>{return{type:'conversation',revision:'1',payload:{conversation:{id:'c',workspaceId:'w',cwd:'/',title:'title',revision:'1',hidden:false,participants:[],entries:[],requests:[],updatedAt:'2026-11-03T00:00:00Z',run:{id:'run',status} as RunView}}};}
async function until(check:()=>boolean){for(let n=0;n<400;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('condition did not settle');}
function root(){return fs.mkdtempSync(path.join(os.tmpdir(),'buildr-webhook-events-'));}
test('configuration rejects unsafe addresses and missing secrets',()=>{for(const bad of [{},{...env,BUILDR_AGENT_WEBHOOK_SECRET:''},{...env,BUILDR_AGENT_WEBHOOK_URL:'file:///tmp/x'},{...env,BUILDR_AGENT_WEBHOOK_URL:'https://user:pass@example.test'},{...env,BUILDR_AGENT_WEBHOOK_SECRET:'bad\nheader'}])assert.equal(ConversationWebhooks.configure(bad),undefined);});
test('real HTTP rejects then receives retry with identical eventId; replies contain no full text',async()=>{
  const dir=root(),received:any[]=[];let rejected=false;
  const server=createServer(async(request,response)=>{let data='';for await(const chunk of request)data+=chunk;assert.equal(request.headers.authorization,'Bearer private-test-key');const body=JSON.parse(data);received.push(body);if(body.eventType==='completed'&&!rejected){rejected=true;response.statusCode=503;}response.end();});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
  const hook=ConversationWebhooks.configure({...env,BUILDR_AGENT_WEBHOOK_URL:`http://127.0.0.1:${port}/hook`},fetch,{root:dir,retryBaseMs:10})!;
  try{const e=event();e.payload.conversation!.entries=[{id:'reply',runId:'run',sequence:1,kind:'message',role:'assistant',text:'FULL-REPLY-MUST-NOT-LEAVE',status:'completed',createdAt:'now'}];hook.publish(e);hook.publish(e);await until(()=>received.filter(body=>body.eventType==='completed').length===2);await immediate();
    const completions=received.filter(body=>body.eventType==='completed');assert.deepEqual(completions[0],completions[1]);assert.equal(received.filter(body=>body.eventType==='reply').length,1);assert.ok(!JSON.stringify(received).includes('FULL-REPLY-MUST-NOT-LEAVE'));assert.equal(completions[0].machine,os.hostname());assert.equal(completions[0].agent.name,'Buildr');assert.notEqual(completions[0].agent.id,'buildr');
  }finally{hook.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('network loss uses exponential backoff and the same immutable payload',async()=>{
  const dir=root(),sent:any[]=[],times:number[]=[];let failed=0;
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{const body=JSON.parse(String(init!.body));if(body.eventType==='completed'){sent.push(body);times.push(Date.now());if(failed++<2)throw Error('connection lost');}return new Response(null);},{root:dir,retryBaseMs:15})!;
  try{hook.publish(event());await until(()=>sent.length===3);assert.deepEqual(sent[0],sent[2]);assert.ok(times[1]-times[0]>=10);assert.ok(times[2]-times[1]>=25);}finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('restart restores failed delivery and dedup; per-instance identity is stable and independent',async()=>{
  const dir=root(),other=root(),first:any[]=[],next:any[]=[];
  let hook=ConversationWebhooks.configure(env,async(_url,init)=>{first.push(JSON.parse(String(init!.body)));return new Response(null,{status:500});},{root:dir,retryBaseMs:10})!;
  try{hook.publish(event());await immediate();hook.close();hook=ConversationWebhooks.configure(env,async(_url,init)=>{next.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir,retryBaseMs:10})!;
    await until(()=>next.some(body=>body.eventType==='completed'));await immediate();assert.deepEqual(next.find(body=>body.eventType==='completed'),first.find(body=>body.eventType==='completed'));
    const count=next.length;hook.publish(event());await immediate();assert.equal(next.length,count);
    const another:any[]=[];const second=ConversationWebhooks.configure(env,async(_url,init)=>{another.push(JSON.parse(String(init!.body)));return new Response(null);},{root:other})!;
    second.publish(event());await immediate();assert.notEqual(another[0].agent.id,next[0].agent.id);second.close();
  }finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(other,{recursive:true,force:true});}
});
test('eventId replay preserves original payload and rejects wrong conversation, scope and target',async()=>{
  const dir=root(),sent:any[]=[];const transport:typeof fetch=async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);};
  const hook=ConversationWebhooks.configure(env,transport,{root:dir})!;
  try{hook.publish(event());await immediate();const original=sent.find(body=>body.eventType==='completed');
    for(const [scope,id] of [['wrong','c'],['w','wrong']])assert.throws(()=>hook.replay(scope,id,original.eventId),{code:'agent_webhook_event_missing'});
    assert.throws(()=>hook.replay('w','c','0'.repeat(64)),{code:'agent_webhook_event_missing'});
    assert.deepEqual(hook.replay('w','c',original.eventId),{eventId:original.eventId,queued:true});await immediate();assert.deepEqual(sent.at(-1),original);
    const changed=ConversationWebhooks.configure({...env,BUILDR_AGENT_WEBHOOK_URL:'https://different.example.test'},transport,{root:dir})!;try{assert.throws(()=>changed.replay('w','c',original.eventId),{code:'agent_webhook_event_missing'});}finally{changed.close();}
  }finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('bounded transport retains more than the former 512-event queue and abort preserves pending work',async()=>{
  const dir=root(),sent:any[]=[],releases:Array<()=>void>=[];let active=0,max=0;
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));max=Math.max(max,++active);return new Promise<Response>(resolve=>{releases.push(()=>{active--;resolve(new Response(null));});});},{root:dir})!;
  try{for(let i=0;i<270;i++){const e=event();e.payload.conversation!.run!.id=String(i);hook.publish(e);}assert.equal(sent.length,16);
    for(let i=0;i<80&&sent.length<540;i++){releases.splice(0).forEach(release=>release());await immediate();}
    assert.equal(sent.length,540);assert.equal(new Set(sent.map(body=>body.eventId)).size,540);assert.equal(max,16);releases.splice(0).forEach(release=>release());await immediate();
  }finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('startup recovery fills the commit-to-publish gap without duplicate emission',async()=>{
  const dir=root(),sent:any[]=[];const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
  try{await hook.recover(after=>after?[]:[event().payload.conversation!]);await immediate();const count=sent.length;await hook.recover(after=>after?[]:[event().payload.conversation!]);await immediate();assert.equal(sent.length,count);assert.ok(sent.some(body=>body.eventType==='completed'));}finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('journal uses leases across processes, reclaims expired claims and persists extra fields unchanged',()=>{
  const dir=root(),a=new WebhookJournal(dir),b=new WebhookJournal(dir);const body:any={eventId:'e',conversationId:'c',workspaceId:'w',agent:{name:'Buildr',id:a.instanceId},machine:'m',eventType:'completed',summary:'done',timestamp:'t',vendorExtra:{value:['original']}};
  try{a.project('target','w','c',()=>({snapshot:{},events:[body]}));const first=a.claim('target','a',0)!;assert.equal(b.claim('target','b',1),undefined);const retry=b.claim('target','b',30001)!;assert.equal(retry.body,first.body);a.settle(first,true,0);assert.equal(b.claim('target','b',30002),undefined);b.settle(retry,true,0);a.replay('target','w','c','e');const replay=a.claim('target','a',30003)!;assert.deepEqual(JSON.parse(replay.body).vendorExtra,body.vendorExtra);
  }finally{a.close('a');b.close('b');fs.rmSync(dir,{recursive:true,force:true});}
});
test('redirects are never followed and remain pending for retry',async()=>{
  const dir=root();let called=0;const hook=ConversationWebhooks.configure(env,async(_url,init)=>{called++;assert.equal(init!.redirect,'error');return new Response(null,{status:302,headers:{location:'https://other.test'}});},{root:dir,retryBaseMs:10})!;
  try{hook.publish(event());await until(()=>called>=3);}finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('shutdown aborts in-flight transport and restart delivers its original event',async()=>{
  const dir=root(),signals:AbortSignal[]=[],bodies:any[]=[];
  let hook=ConversationWebhooks.configure(env,async(_url,init)=>{signals.push(init!.signal!);return new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(Error('aborted'))));},{root:dir})!;
  try{hook.publish(event());assert.ok(signals.length);hook.close();assert.ok(signals.every(signal=>signal.aborted));
    hook=ConversationWebhooks.configure(env,async(_url,init)=>{bodies.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
    await until(()=>bodies.some(body=>body.eventType==='completed'));
  }finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('known endpoint secrets are redacted recursively, while extra payload fields survive transport',async()=>{
  const dir=root(),sent:any[]=[];const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
  try{const e=event('waiting-question');e.payload.conversation!.requests=[{id:'q',runId:'run',participantId:'p',generation:'g',conversationId:'c',workspaceId:'w',kind:'question',title:'secret '+env.BUILDR_AGENT_WEBHOOK_SECRET,questions:[{id:'q1',label:env.BUILDR_AGENT_WEBHOOK_URL,options:[{id:'a',label:env.BUILDR_AGENT_WEBHOOK_SECRET}]}]}];hook.publish(e);await immediate();const body=JSON.stringify(sent);assert.ok(!body.includes(env.BUILDR_AGENT_WEBHOOK_SECRET));assert.ok(!body.includes(env.BUILDR_AGENT_WEBHOOK_URL));assert.ok(body.includes('[REDACTED]'));}finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('temporary journal failure in the timer cannot crash conversation service and pending events recover',async t=>{
  const dir=root(),sent:any[]=[];
  t.mock.timers.enable({apis:['setTimeout']});
  const warnings=t.mock.method(console,'warn',()=>{});
  const claim=t.mock.method(WebhookJournal.prototype,'claim',()=>{throw Error('temporary disk fault');});
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
  try{assert.doesNotThrow(()=>hook.publish(event()));assert.doesNotThrow(()=>t.mock.timers.tick(1));assert.equal(sent.length,0);assert.ok(warnings.mock.callCount());claim.mock.restore();t.mock.timers.tick(1000);await immediate();assert.ok(sent.some(body=>body.eventType==='completed'));}
  finally{hook.close();t.mock.timers.reset();fs.rmSync(dir,{recursive:true,force:true});}
});

test('changing recipient never regenerates history and new source changes keep advancing event sequence',async()=>{
  const dir=root(),old:any[]=[],next:any[]=[];
  let hook=ConversationWebhooks.configure(env,async(_url,init)=>{old.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
  try{hook.publish(event());await immediate();hook.close();
    hook=ConversationWebhooks.configure({...env,BUILDR_AGENT_WEBHOOK_URL:'https://new.example.test'},async(_url,init)=>{next.push(JSON.parse(String(init!.body)));return new Response(null);},{root:dir})!;
    hook.publish(event());await immediate();assert.equal(next.length,0);
    const changed=event('running');changed.payload.conversation!.run!.id='next-run';hook.publish(changed);await immediate();
    assert.ok(next.length);assert.ok(next.every(body=>body.sequence>Math.max(...old.map(body=>body.sequence))));
    assert.throws(()=>hook.replay('w','c',old[0].eventId),{code:'agent_webhook_event_missing'});
  }finally{hook.close();fs.rmSync(dir,{recursive:true,force:true});}
});
