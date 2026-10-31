import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../../src/index.ts';
import type {AgentExecutor,AgentRuntime,ExecutorObservation} from '../../src/contracts.ts';
import type {ModelProvider} from '../../src/model-access/contracts.ts';
import {ConversationRepository} from '../../src/persistence/conversation-repository.ts';

async function fixture({proof=true,shared=false,stopFails=false,closeStartsWork=false,executionUnknown=false,modelHold=false,upgrade=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-resource-lifecycle-'));
 const connection=upgrade?'codex':'local',original=path.join(root,'original'),installed=path.join(root,'installed');
 if(upgrade){fs.writeFileSync(original,'old');fs.writeFileSync(installed,'new');}
 const contexts=new Map<string,{execution:string;idle:boolean;observation:ExecutorObservation;finish?:()=>void}>();
 const sent:string[]=[],closed:AgentRuntime[]=[];let opens=0,common:AgentRuntime|undefined;
 let releaseModel:(()=>void)|undefined,modelStarted=false,modelResponse:Promise<string>|undefined;
 const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
 const executor:AgentExecutor={descriptor:{id:connection,label:'Local',capabilities},async open(options){
  opens++;if(shared&&common)return common;
  let disposed=false;
  const runtime:AgentRuntime={get closed(){return disposed;},bindingIdentity:'resource-fixture',...(upgrade?{bindingData:{executable:original}}:{}),capabilities,
   inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'model',label:'Model'}],beginLogin:async()=>{},cancelLogin:async()=>{},
   async createContext(){const ref={id:randomUUID()};contexts.set(ref.id,{execution:'',idle:false,observation:{status:'idle',tools:[]}});return ref;},
   async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},readHistory:async()=>[],
   async send(input){
    if(input.text==='auxiliary'){const gateway=options.gateway!;modelResponse=fetch(gateway.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gateway.apiKey},body:JSON.stringify({model:input.model,stream:false,messages:[{role:'user',content:'one auxiliary result'}]})}).then(response=>{assert.equal(response.status,200);return response.text();});modelResponse.catch(()=>{});}
    sent.push(input.text);const state=contexts.get(input.contextRef.id)!;state.execution=input.clientRequestId;
    const executionRef={id:state.execution};input.onEvent({type:'accepted',executionRef});
    if(input.text==='hold')await new Promise<void>(resolve=>{state.finish=resolve;});
    if(input.text==='uncertain'){
     input.onEvent({type:'item',item:{id:'unsettled',kind:'tool',role:'system',text:'side effect may have happened; result missing',name:'command',status:'running',executionId:executionRef.id}});
     state.observation={status:'unknown',executionRef,tools:[{id:'unsettled',label:'one operation',status:'unknown'}]};
    }else{state.idle=true;state.observation={status:'idle',executionRef,tools:[]};input.onEvent({type:'completed',status:'completed'});}
   },
   observe:async({contextRef})=>structuredClone(contexts.get(contextRef.id)!.observation),reply:async()=>{},
   async stop(){if(stopFails)throw Error('agent_native_process_closed');return {status:'stopped',tools:[]};},
   ...(proof?{async canRelease({contextRef,executionRef}:{contextRef:{id:string};executionRef:{id:string}}){const state=contexts.get(contextRef.id)!;return state.execution===executionRef.id&&state.idle?(executionUnknown?{executionState:'unknown' as const}:true):false;}}:{}),
   async close(){if(!disposed){disposed=true;closed.push(runtime);if(closeStartsWork)for(const state of contexts.values())state.idle=false;}},
  };common=runtime;return runtime;
 }};
 const provider:ModelProvider={id:'fixture',label:'Fixture',async open(){return {protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'model',label:'Model',images:false,tools:true},{id:'other-model',label:'Other',images:false,tools:true}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{if(!modelHold)throw Error('paid model forbidden');modelStarted=true;await new Promise<void>(resolve=>{releaseModel=resolve;});return Response.json({id:'auxiliary',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'finished'},finish_reason:'stop'}]});},close:async()=>{}};}};
 const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:[provider],...(upgrade?{programRelease:async()=>({latestVersion:'0.166.0',source:'https://fixture.invalid'}),programManager:{isManaged:(_provider:string,file:string)=>file===installed,async discover(input:{boundExecutable?:string}){const file=input.boundExecutable??original;return {candidates:[{executable:file,source:'managed' as const,label:'Fixture',version:file===installed?'0.166.0':'0.165.0',compatible:true}],installation:{label:'Fixture',version:'0.166.0',url:'https://fixture.invalid',canInstall:true}};},async install(){return installed;}}}:{}),resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 await service.connections.connect(connection,{expectedRevision:'unconfigured',...(upgrade?{executable:original}:{})});const account=await service.models.accounts.add({provider:'fixture'});const checked=await service.models.accounts.check(account.id);await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true},{id:'other-model',enabled:true}]});
 async function wait(predicate:()=>boolean){for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('resource state did not settle');}
 async function start(text:string){const c=await service.conversations.create('workspace',{}),draft={expectedRevision:c.revision,connectionId:connection,modelAccountId:account.id,model:'model',text},preview=service.conversations.prepareSend('workspace',c.id,draft);service.conversations.send('workspace',c.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});await wait(()=>service.conversations.read('workspace',c.id).run?.accepted===true);if(text!=='hold')await wait(()=>!service.activity().reasons.some(r=>['execution','title','recovery','observation'].includes(r.kind)));return service.conversations.read('workspace',c.id);}
 return {root,service,contexts,original,installed,sent,closed,start,wait,modelStarted:()=>modelStarted,finishModel:async()=>{releaseModel?.();await modelResponse;},opens:()=>opens,async close(){releaseModel?.();await modelResponse?.catch(()=>{});for(const state of contexts.values())state.finish?.();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}

test('unknown result can release an idle exact source without declaring success or replaying input',async()=>{
 const f=await fixture();try{
  let chat=await f.start('uncertain');const original=chat.run!.id,context=chat.participants[0].contextId;
  await f.service.releaseIdleSources();assert.equal(f.closed.length,0,'unconfirmed native resource still holds its owner');
  f.contexts.get(context)!.idle=true;
  await f.service.releaseIdleSources();chat=f.service.conversations.read('workspace',chat.id);
  assert.equal(f.closed.length,1);assert.equal(chat.run?.status,'unknown');assert.equal(chat.run?.executionState,'ended');assert.equal(chat.run?.resourcesReleased,true);
  assert.equal(chat.run?.tools[0].status,'unknown');assert.equal(chat.run?.id,original);assert.deepEqual(f.sent,['uncertain']);assert.equal(f.service.activity().busy,false);
  const draft={expectedRevision:chat.revision,connectionId:'local',text:'new goal, do not repeat the original'};assert.equal(f.service.conversations.prepareSend('workspace',chat.id,draft).participantId,undefined);assert.deepEqual(f.sent,['uncertain']);
  const opens=f.opens();await f.service.conversations.stop('workspace',chat.id,{expectedRevision:chat.revision,runId:original,participantId:chat.run!.participantId,generation:chat.run!.generation});assert.equal(f.opens(),opens,'stopping already-released resources must not recreate a native owner');
  chat=f.service.conversations.read('workspace',chat.id);await f.service.conversations.update('workspace',chat.id,{expectedRevision:chat.revision,hidden:true});assert.equal(f.service.conversations.listAll(['workspace'],{activeOnly:true}).total,0);
 }finally{await f.close();}
});

test('explicit same-selection continuation preserves released unknown work and cannot be queued or replayed',async()=>{
 const f=await fixture({executionUnknown:true});try{
  let chat=await f.start('uncertain');const original=chat.run!.id, originalExecution=f.contexts.get(chat.participants[0].contextId)!.execution;
  const draft=()=>({expectedRevision:chat.revision,connectionId:'local',continueRunId:original,text:'',modelAccountId:chat.run!.modelAccountId,modelAccountIdentity:chat.run!.modelAccountIdentity,model:chat.run!.model,serviceTier:chat.run!.serviceTier,reasoningEffort:chat.run!.reasoningEffort,permissionMode:chat.run!.permissionMode});
  assert.throws(()=>f.service.conversations.prepareSend('workspace',chat.id,draft()),{code:'agent_continue_unavailable'});
  f.contexts.get(chat.participants[0].contextId)!.idle=true;await f.service.releaseIdleSources();chat=f.service.conversations.read('workspace',chat.id);
  assert.equal(chat.run!.status,'unknown');assert.equal(chat.run!.resourcesReleased,true);assert.equal(chat.run!.executionState,'unknown');
  const input=draft();assert.equal(f.service.allowsReleasedContinuation('workspace',chat.id,input),true);
  for(const changed of [{...input,continueRunId:'stale'},{...input,model:'other-model'},{...input,permissionMode:'full-access' as const},{...input,modelAccountIdentity:'other'}]){
   assert.equal(f.service.allowsReleasedContinuation('workspace',chat.id,changed),false);
   assert.throws(()=>f.service.conversations.prepareSend('workspace',chat.id,changed));
  }
  assert.throws(()=>f.service.conversations.queueSend('workspace',chat.id,{...input,clientRequestId:randomUUID()}),{code:'agent_continue_unavailable'});
  const preview=f.service.conversations.prepareSend('workspace',chat.id,input);assert.equal(preview.fits,true);assert.deepEqual(f.sent,['uncertain']);
  const submission={...input,previewToken:preview.token,clientRequestId:randomUUID()};
  const next=f.service.conversations.send('workspace',chat.id,submission);const repeated=f.service.conversations.send('workspace',chat.id,submission);assert.equal(repeated.run.id,next.run.id);
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  assert.equal(f.sent.length,2);assert.notEqual(f.sent[1],'uncertain');assert.match(f.sent[1],/结果仍未知/);assert.match(f.sent[1],/unsettled/);
  const stored=new ConversationRepository(path.join(f.root,'agent-service')).readConversation(chat.id)!;
  assert.equal(stored.runOutcomes?.[original].status,'unknown');assert.equal(stored.attempts.at(-1)?.continuationOf,original);
  assert.equal(stored.attempts.find(attempt=>attempt.runId===original)?.executionRef?.id,originalExecution);
  assert.ok(stored.view.entries.some(entry=>entry.runId===original&&entry.kind==='tool'&&entry.status!=='completed'));
  assert.equal(stored.view.entries.filter(entry=>entry.runId===next.run.id&&entry.role==='user').length,0);
 }finally{await f.close();}
});

test('one unknown result releases independently while another exact source keeps executing',async()=>{
 const f=await fixture();try{
  const unknown=await f.start('uncertain');f.contexts.get(unknown.participants[0].contextId)!.idle=true;
  const other=await f.start('hold');await f.service.releaseIdleSources();
  assert.equal(f.closed.length,1);assert.equal(f.service.conversations.read('workspace',other.id).run?.status,'running');assert.equal(f.service.activity().busy,true);
  f.contexts.get(other.participants[0].contextId)!.finish?.();await f.wait(()=>f.service.conversations.read('workspace',other.id).run?.status==='completed');await f.service.releaseIdleSources();assert.equal(f.service.activity().busy,false);
 }finally{await f.close();}
});

test('a shared native resource cannot close until every conversation owner is releasable',async()=>{
 const f=await fixture({shared:true});try{
  const unknown=await f.start('uncertain');f.contexts.get(unknown.participants[0].contextId)!.idle=true;
  const other=await f.start('hold');await f.service.releaseIdleSources();assert.equal(f.closed.length,0);
  f.contexts.get(other.participants[0].contextId)!.finish?.();await f.wait(()=>f.service.conversations.read('workspace',other.id).run?.status==='completed');await f.service.releaseIdleSources();assert.equal(f.closed.length,1);assert.equal(f.service.conversations.read('workspace',unknown.id).run?.status,'unknown');
 }finally{await f.close();}
});

test('legacy executors without physical release evidence remain conservative about unknown results',async()=>{
 const f=await fixture({proof:false});try{const chat=await f.start('uncertain');f.contexts.get(chat.participants[0].contextId)!.idle=true;await f.service.releaseIdleSources();assert.equal(f.closed.length,0);assert.equal(f.service.activity().busy,true);}finally{await f.close();}
});

test('failed stop restores unknown rather than pretending a model is still executing',async()=>{
 const f=await fixture({stopFails:true});try{let c=await f.start('uncertain');await assert.rejects(f.service.conversations.stop('workspace',c.id,{expectedRevision:c.revision,runId:c.run!.id,participantId:c.run!.participantId,generation:c.run!.generation}));c=f.service.conversations.read('workspace',c.id);assert.equal(c.run?.status,'unknown');assert.equal(f.service.conversations.listAll(['workspace'],{activeOnly:true}).stats.modelExecutions.length,0);}finally{await f.close();}
});


test('a completed result does not authorize release while its managed source still has work',async()=>{
 const f=await fixture();try{
  const chat=await f.start('done'),state=f.contexts.get(chat.participants[0].contextId)!;state.idle=false;
  await f.service.releaseIdleSources();assert.equal(f.closed.length,0);assert.equal(f.service.activity().busy,true);
  assert.equal(f.service.conversations.read('workspace',chat.id).run?.status,'completed');
  state.idle=true;await f.service.releaseIdleSources();const settled=f.service.conversations.read('workspace',chat.id);
  assert.equal(settled.run?.status,'completed');assert.equal(settled.run?.resourcesReleased,true);assert.equal(f.service.activity().busy,false);
 }finally{await f.close();}
});


test('release is confirmed after close and retains ownership until late child work drains',async()=>{
 const f=await fixture({closeStartsWork:true});try{
  const chat=await f.start('uncertain'),state=f.contexts.get(chat.participants[0].contextId)!;state.idle=true;
  await f.service.releaseIdleSources();assert.equal(f.closed.length,1);assert.notEqual(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);assert.equal(f.service.activity().busy,true);
  state.idle=true;await f.service.releaseIdleSources();assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);assert.equal(f.service.activity().busy,false);
 }finally{await f.close();}
});

test('released physical resources do not prevent a later exact terminal result from being reconciled',async()=>{
 const f=await fixture();try{
  const chat=await f.start('uncertain'),state=f.contexts.get(chat.participants[0].contextId)!;state.idle=true;
  await f.service.releaseIdleSources();state.observation={status:'idle',executionRef:{id:state.execution},tools:[]};
  const observed=await f.service.conversations.observe('workspace',chat.id);assert.equal(observed.run?.status,'completed');assert.equal(observed.run?.executionState,'ended');assert.equal(observed.run?.resourcesReleased,true);assert.deepEqual(f.sent,['uncertain']);
 }finally{await f.close();}
});


test('backend resource release is independent of an unknown detached command outcome',async()=>{
 const f=await fixture({executionUnknown:true});try{
  const chat=await f.start('uncertain'),state=f.contexts.get(chat.participants[0].contextId)!;state.idle=true;
  await f.service.releaseIdleSources();const released=f.service.conversations.read('workspace',chat.id);
  assert.equal(released.run?.resourcesReleased,true);assert.equal(released.run?.executionState,'unknown');assert.equal(released.run?.status,'unknown');assert.equal(released.run?.tools[0].status,'unknown');assert.equal(f.service.activity().busy,false);assert.deepEqual(f.sent,['uncertain']);
  assert.equal(f.service.conversations.prepareSend('workspace',chat.id,{expectedRevision:released.revision,connectionId:'local',text:'new goal, do not replay'}).participantId,undefined);assert.deepEqual(f.sent,['uncertain']);
 }finally{await f.close();}
});


test('historical participant resources use their own exact attempt after a model handoff',async()=>{
 const f=await fixture();try{
  const first=await f.start('done'),participant=first.participants[0];
  const draft={expectedRevision:first.revision,connectionId:'local',modelAccountId:participant.modelAccountId,model:'other-model',text:'next',handoffSummary:'The prior operation completed.'};
  const preview=f.service.conversations.prepareSend('workspace',first.id,draft);f.service.conversations.send('workspace',first.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  await f.wait(()=>f.service.conversations.read('workspace',first.id).run?.status==='completed');
  await f.service.releaseIdleSources();const current=f.service.conversations.read('workspace',first.id);
  assert.equal(current.participants.length,2);assert.equal(f.closed.length,2);assert.equal(current.run?.resourcesReleased,true);assert.equal(f.service.activity().busy,false);assert.equal(f.sent.length,2);assert.match(f.sent[1]!,/\nnext\n/);
 }finally{await f.close();}
});


test('shared release protects the exact model lease without holding an unrelated conversation',async()=>{
 const f=await fixture({modelHold:true});try{
  const auxiliary=await f.start('auxiliary');await f.wait(f.modelStarted);
  const other=await f.start('done');await f.service.releaseIdleSources();
  assert.equal(f.closed.length,1);assert.equal(f.service.conversations.read('workspace',other.id).run?.resourcesReleased,true);
  assert.notEqual(f.service.conversations.read('workspace',auxiliary.id).run?.resourcesReleased,true);
  await f.finishModel();await f.service.releaseIdleSources();
  assert.equal(f.closed.length,2);assert.equal(f.service.conversations.read('workspace',auxiliary.id).run?.resourcesReleased,true);assert.equal(f.service.activity().busy,false);
 }finally{await f.close();}
});


test('historical participant without a retained run releases only with its exact accepted native proof',async()=>{
 for(const mode of ['exact','missing-proof','unaccepted']){
  const f=await fixture({proof:mode!=='missing-proof'});try{
   const chat=await f.start('done'),repository=new ConversationRepository(path.join(f.root,'agent-service'));
   const saved=repository.readConversation(chat.id)!,revision=saved.view.revision;
   if(mode==='unaccepted')saved.attempts.at(-1)!.accepted=false;
   delete saved.view.run;repository.saveConversation(saved,revision);
   const state=f.contexts.get(chat.participants[0].contextId)!;state.idle=false;
   await f.service.releaseIdleSources();assert.equal(f.closed.length,0);
   state.idle=true;await f.service.releaseIdleSources();
   assert.equal(f.closed.length,mode==='exact'?1:0,mode);assert.deepEqual(f.sent,['done']);
   assert.equal(repository.readConversation(chat.id)!.view.run,undefined,'release must not invent a current execution');
  }finally{await f.close();}
 }
});

test('program upgrade proceeds after exact resources release while the historical tool result stays unknown',async()=>{
 const f=await fixture({upgrade:true,executionUnknown:true});try{
  const chat=await f.start('uncertain'),state=f.contexts.get(chat.participants[0].contextId)!;
  const current=f.service.connections.read('codex');
  f.service.connections.upgradeProgram('codex',{expectedRevision:current.revision,expectedVersion:'0.166.0'});
  await f.wait(()=>f.service.connections.programUpdates().programs[0]?.upgrade?.state==='waiting');
  assert.equal(f.service.connections.read('codex').executable,f.original);
  state.idle=true;await f.service.releaseIdleSources();
  await f.wait(()=>f.service.connections.programUpdates().programs[0]?.upgrade?.state==='completed');
  assert.equal(f.service.connections.read('codex').executable,f.installed);
  const result=f.service.conversations.read('workspace',chat.id);assert.equal(result.run?.status,'unknown');assert.equal(result.run?.executionState,'unknown');assert.equal(result.run?.tools[0]?.status,'unknown');assert.deepEqual(f.sent,['uncertain']);
 }finally{await f.close();}
});
