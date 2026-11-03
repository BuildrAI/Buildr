import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../../src/index.ts';
import type {AgentExecutor,ExecutorSendInput} from '../../src/contracts.ts';
import type {ModelProvider} from '../../src/model-access/contracts.ts';
import {CONNECTION_IDLE_MS,QODER_IDLE_REUSE_MS,QODER_PREPARATION_IDLE_MS} from '../../src/application/conversation-warmups.ts';
const flush=async()=>{for(let i=0;i<30;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
async function waitFor<T>(read:()=>T,accept:(value:T)=>boolean):Promise<T>{const deadline=Date.now()+5000;let value=read();while(!accept(value)&&Date.now()<deadline){await flush();value=read();}assert.ok(accept(value),'fixture work did not reach its expected state');return value;}
async function fixture(connectionId='local'){
 const root=await mkdtemp(join(tmpdir(),'buildr-selection-warmup-'));
 let clock=Date.now(),opens=0,closed=0,prepared=0,inferred=0,failPreparation=false,failFirstClose=false;
 const sent:ExecutorSendInput[]=[],preparedContexts:string[]=[];
 let finish:(()=>void)|undefined;
 const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default','full-access'] as ('default'|'full-access')[]};
 const executor:AgentExecutor={descriptor:{id:connectionId,label:'Local',capabilities},async open(options){
  const source=Boolean(options.gateway);if(source)opens++;const sourceIndex=opens;let disposed=false,execution='',blocked=false,toolPending=false;
  return {get closed(){return disposed;},bindingIdentity:'local-binding',capabilities,
   inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'model',label:'Model'}],beginLogin:async()=>{},cancelLogin:async()=>{},
   createContext:async()=>({id:randomUUID()}),prepareContext:async input=>{prepared++;preparedContexts.push(input.contextRef.id);if(failPreparation)throw Error('preparation failed');},resumeContext:async()=>{},readHistory:async()=>[],
   send:async input=>{sent.push(input);execution=input.clientRequestId;input.onEvent({type:'accepted',executionRef:{id:execution}});if(input.text==='question'){blocked=true;input.onEvent({type:'request',request:{id:'question',kind:'question',title:'Choose',questions:[{id:'q',label:'Choose'}]}});}if(input.text==='tool'){blocked=true;toolPending=true;input.onEvent({type:'item',item:{id:'tool',kind:'tool',role:'system',text:'uncertain command',status:'unknown',executionId:execution}});}if(input.text==='hold'){blocked=true;await new Promise<void>(resolve=>{finish=()=>{blocked=false;resolve();};});}input.onEvent({type:'completed',status:'completed'});},
   observe:async()=>({status:blocked?'running':'idle',tools:toolPending?[{id:'tool',label:'uncertain command',status:'unknown',canStop:false}]:[],executionRef:{id:execution}}),canRelease:async()=>!blocked,
   reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),close:async()=>{if(source&&sourceIndex===1&&failFirstClose)throw Error('close unconfirmed');if(!disposed&&source)closed++;disposed=true;},
  };
 }};
 const provider:ModelProvider={id:'fixture',label:'Fixture',async open(){return {protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'model',label:'Model',images:false,tools:true}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{inferred++;throw Error('must not infer');},close:async()=>{}};}};
 const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:root}),assertTask(){},now:()=>new Date(clock)});
 await service.connections.connect(connectionId,{expectedRevision:'unconfigured'});
 const added=await service.models.accounts.add({provider:'fixture'}),account=await service.models.accounts.check(added.id);
 await service.models.accounts.preferences(account.id,{expectedRevision:account.revision,models:[{id:'model',enabled:true}]});
 const draftId=randomUUID(),clientRequestId=randomUUID(),choice={connectionId,modelAccountId:account.id,model:'model',permissionMode:'default' as const,clientRequestId};
 const start=async(text='goal')=>{const revision=service.conversations.readDraft('workspace',draftId).revision;const result=await service.conversations.startDraft('workspace',draftId,{...choice,text,expectedDraftRevision:revision});await waitFor(()=>service.conversations.read('workspace',result.conversation.id),view=>text==='hold'?view.run?.accepted===true:text==='question'?view.requests.length>0:text==='tool'?Boolean(view.run?.tools.some(tool=>tool.status==='unknown')):view.run?.status==='completed');await flush();return result.conversation;};
 return {service,root,choice,draftId,start,sent,preparedContexts,advance:(ms:number)=>clock+=ms,finish:()=>finish?.(),breakFirstClose:()=>{failFirstClose=true;},fail:()=>{failPreparation=true;},counts:()=>({opens,closed,prepared,inferred}),close:async()=>{finish?.();await service.close();await rm(root,{recursive:true,force:true});}};
}
test('selection is adopted once, promptly reclaimed after use and can be prepared again',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  await Promise.all([f.service.conversations.warmup('workspace',f.draftId,f.choice,true),f.service.conversations.warmup('workspace',f.draftId,f.choice,true)]);
  assert.equal(f.service.conversations.list('workspace',{}).conversations.length,0);
  assert.deepEqual(f.counts(),{opens:1,closed:0,prepared:1,inferred:0});assert.equal(f.sent.length,0);
  const chat=await f.start();assert.equal(f.counts().opens,1);assert.equal(f.sent.length,1);assert.equal(f.sent[0].contextRef.id,f.preparedContexts[0]);
  t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,1);
  assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);
  assert.equal((await f.service.conversations.warmup('workspace',chat.id,f.choice)).prepared,true,'release transfers the slot back to speculative preparation');
  assert.equal(f.counts().opens,2);assert.equal(f.sent.length,1);
 }finally{await f.close();t.mock.timers.reset();}
});
test('selection permission changes close the old unadopted owner before preparing another',async()=>{
 const f=await fixture();try{
  await f.service.conversations.warmup('workspace',f.draftId,f.choice,true);
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,permissionMode:'full-access'},true);
  assert.equal(f.counts().closed,1);assert.equal(f.counts().opens,2);
  await f.start();assert.equal(f.sent[0].permissionMode,'default');assert.equal(f.counts().closed,2);
 }finally{await f.close();}
});
test('failed speculative preparation closes its owner and ordinary sending can cold-start',async()=>{
 const f=await fixture();try{
  f.fail();await assert.rejects(f.service.conversations.warmup('workspace',f.draftId,f.choice,true),/preparation failed/);
  assert.equal(f.counts().closed,1);await f.start();assert.equal(f.sent.length,1);assert.equal(f.counts().opens,2);
 }finally{await f.close();}
});
test('unused selections retain 30 minutes while completed work releases promptly and long active input stays owned',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const g=await fixture();try{
  await g.service.conversations.warmup('workspace',g.draftId,g.choice,true);
  g.advance(CONNECTION_IDLE_MS-1);t.mock.timers.tick(60_000);await flush();assert.equal(g.counts().closed,0);
  g.advance(1);t.mock.timers.tick(60_000);await flush();assert.equal(g.counts().closed,1);
  const chat=await g.start('hold');g.advance(CONNECTION_IDLE_MS*2);t.mock.timers.tick(60_000);await flush();assert.equal(g.counts().closed,1,'active work stays owned');
  g.finish();await flush();t.mock.timers.tick(60_000);await flush();assert.equal(g.counts().closed,2,'completed work does not retain the 30-minute selection cache');assert.equal(g.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);
 }finally{await g.close();t.mock.timers.reset();}
});


test('expired idle age never dismisses an unanswered question or an unconfirmed native tool',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 try{for(const connectionId of ['local','qoder'])for(const mode of ['question','tool']){
  const f=await fixture(connectionId);try{
   const chat=await f.start(mode);f.advance(CONNECTION_IDLE_MS*2);t.mock.timers.tick(60_000);await flush();
   assert.equal(f.counts().closed,0,mode);const current=f.service.conversations.read('workspace',chat.id);
   if(mode==='question')assert.equal(current.requests.length,1);else assert.equal(current.run?.tools[0].status,'unknown');
  }finally{await f.close();}
 }}finally{t.mock.timers.reset();}
});


test('one failed speculative close does not prevent an independent completed conversation from releasing',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture();try{
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,clientRequestId:randomUUID()},true);f.breakFirstClose();
  const chat=await f.start();f.advance(CONNECTION_IDLE_MS);t.mock.timers.tick(60_000);await flush();
  assert.equal(f.counts().closed,1);assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);
  assert.ok(f.service.activity().reasons.some(reason=>reason.kind==='runtime-release'),'the failed owner remains explicitly held');
 }finally{await f.close();t.mock.timers.reset();}
});

test('shared native controls retain only their owning conversation',async()=>{
 const f=await fixture();try{
  const first=await f.service.conversations.create('workspace',{}),other=await f.service.conversations.create('workspace',{});
  const draft={connectionId:'local',text:'hold',expectedRevision:first.revision};
  const preview=f.service.conversations.prepareSend('workspace',first.id,draft);
  f.service.conversations.send('workspace',first.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  await flush();
  assert.equal(f.service.retainsConversationSource('workspace',first.id),true);
  assert.equal(f.service.retainsConversationSource('workspace',other.id),false);
  assert.equal(f.service.retainsConversationSource('other-workspace',first.id),false);
 }finally{await f.close();}
});

test('Qoder retains a used idle source across turns, refreshes its window, then expires',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture('qoder');try{
  const chat=await f.start();assert.equal(f.counts().opens,1);
  f.advance(QODER_IDLE_REUSE_MS-1);t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,0);
  const current=f.service.conversations.read('workspace',chat.id);
  assert.notEqual(current.run?.resourcesReleased,true,'retained process is not physically released');
  const draft={...f.choice,text:'follow up',expectedRevision:current.revision},preview=f.service.conversations.prepareSend('workspace',chat.id,draft);
  f.service.conversations.send('workspace',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});await waitFor(()=>f.service.conversations.read('workspace',chat.id),view=>view.run?.status==='completed');await flush();
  assert.equal(f.counts().opens,1);assert.equal(f.sent.length,2);assert.equal(f.sent[0].contextRef.id,f.sent[1].contextRef.id);
  f.advance(1);t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,0,'second use refreshed the idle window');
  f.advance(QODER_IDLE_REUSE_MS);t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,1);
 }finally{await f.close();t.mock.timers.reset();}
});

test('Qoder explicit release bypasses idle retention and speculative discard never closes adopted work',async()=>{
 const f=await fixture('qoder');try{
  await f.service.conversations.warmup('workspace',f.draftId,f.choice,true);
  const chat=await f.start();
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,discard:true},true);
  assert.equal(f.counts().closed,0);
  await f.service.releaseIdleSources();assert.equal(f.counts().closed,1,'upgrade/release is never blocked by the idle window');
  assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);
 }finally{await f.close();}
});

test('Qoder speculative selection is latest-only, versioned discard is safe and unused entry expires',async t=>{ t.mock.timers.enable({apis:['setInterval']});
 const f=await fixture('qoder');try{
  await f.service.conversations.warmup('workspace',f.draftId,f.choice,true);
  const changed={...f.choice,permissionMode:'full-access' as const};
  await f.service.conversations.warmup('workspace',f.draftId,changed,true);
  assert.equal(f.counts().closed,1);
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,discard:true},true);
  assert.equal(f.counts().closed,1,'old binding cannot discard the new selection');
  await f.service.conversations.warmup('workspace',randomUUID(),{...f.choice,clientRequestId:randomUUID()},true);
  assert.equal(f.counts().closed,2,'a new Qoder slot replaces the old unused selection');
  f.advance(QODER_PREPARATION_IDLE_MS-1);t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,2);
  f.advance(1);t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,3);
 }finally{await f.close();t.mock.timers.reset();}
});

test('Qoder pending backend upgrade revokes the idle window without stopping active work',async t=>{
 t.mock.timers.enable({apis:['setInterval','setTimeout']});const f=await fixture('qoder');try{
  await f.start();assert.equal(f.counts().closed,0);
  f.service.setQoderIdleRetention(false);for(let n=0;n<7&&f.counts().closed<1;n++){t.mock.timers.tick(1000);await flush();}assert.equal(f.counts().closed,1);
  const chat=await f.service.conversations.create('workspace',{}),draft={...f.choice,text:'hold',expectedRevision:chat.revision};
  const preview=f.service.conversations.prepareSend('workspace',chat.id,draft);
  f.service.conversations.send('workspace',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});await flush();
  t.mock.timers.tick(60_000);await flush();assert.equal(f.counts().closed,1,'real execution is protected');
  f.finish();await flush();for(let n=0;n<7&&f.counts().closed<2;n++){t.mock.timers.tick(1000);await flush();}assert.equal(f.counts().closed,2,'completion during upgrade does not acquire a new idle window');
 }finally{await f.close();t.mock.timers.reset();}
});

test('Qoder warmup cancellation is scoped to an attempt even when the binding is reselected unchanged',async()=>{
 const f=await fixture('qoder');try{
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,preparationId:'first-selection'},true);
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,preparationId:'reselected'},true);
  assert.equal(f.counts().opens,1);
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,preparationId:'first-selection',discard:true},true);
  assert.equal(f.counts().closed,0);
  await f.service.conversations.warmup('workspace',f.draftId,{...f.choice,preparationId:'reselected',discard:true},true);
  assert.equal(f.counts().closed,1);
 }finally{await f.close();}
});
