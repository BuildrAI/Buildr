import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../../src/index.ts';
import type {AgentExecutor,AgentRuntime,ExecutorObservation,AgentServiceOptions} from '../../src/contracts.ts';
import type {ModelProvider} from '../../src/model-access/contracts.ts';
import {ConversationRepository} from '../../src/persistence/conversation-repository.ts';
import {PendingSendRepository} from '../../src/persistence/pending-send-repository.ts';
import {PendingSends} from '../../src/process/pending-sends.ts';

async function fixture({proof=true,shared=false,stopFails=false,closeStartsWork=false,executionUnknown=false,modelHold=false,upgrade=false,closeWait=false,unaccepted=false,unacceptedProof=true,daemon=false,oldOwnerAlive=false,rejectDispatch=false,backendChange=undefined as AgentServiceOptions['backendChange']}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-resource-lifecycle-'));
 const connection=upgrade?'codex':'local',original=path.join(root,'original'),installed=path.join(root,'installed');
 if(upgrade){fs.writeFileSync(original,'old');fs.writeFileSync(installed,'new');}
 const contexts=new Map<string,{execution:string;idle:boolean;observation:ExecutorObservation;finish?:()=>void}>();
 const sent:string[]=[],closed:AgentRuntime[]=[];let opens=0,common:AgentRuntime|undefined;
 const gateways:NonNullable<Parameters<AgentExecutor['open']>[0]['gateway']>[]=[];
 let finishClose:(()=>void)|undefined;
 let releaseModel:(()=>void)|undefined,modelStarted=false,modelResponse:Promise<string>|undefined;
 const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
 const executor:AgentExecutor={descriptor:{id:connection,label:'Local',capabilities},async open(options){
  opens++;if(options.gateway)gateways.push(options.gateway);if(shared&&common)return common;
  let disposed=false;
  const runtime:AgentRuntime={get closed(){return disposed;},bindingIdentity:'resource-fixture',...(upgrade?{bindingData:{executable:original}}:{}),capabilities,
   inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'model',label:'Model'}],beginLogin:async()=>{},cancelLogin:async()=>{},
   async createContext(){const ref={id:randomUUID()};contexts.set(ref.id,{execution:'',idle:false,observation:{status:'idle',tools:[]}});return ref;},
   async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},readHistory:async()=>[],
   async send(input){
    if(input.text==='auxiliary'){const gateway=options.gateway!;modelResponse=fetch(gateway.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gateway.apiKey},body:JSON.stringify({model:input.model,stream:false,messages:[{role:'user',content:'one auxiliary result'}]})}).then(response=>{assert.equal(response.status,200);return response.text();});modelResponse.catch(()=>{});}
    if(rejectDispatch&&input.text.includes('reject next'))throw Error('fixture_dispatch_rejected');
    sent.push(input.text);const state=contexts.get(input.contextRef.id)!;state.execution=input.clientRequestId;
    if(unaccepted&&input.text==='no-receipt'){state.idle=false;throw Error('acceptance receipt missing');}
    const executionRef={id:state.execution};input.onEvent({type:'accepted',executionRef});
    if(input.text==='hold')await new Promise<void>(resolve=>{state.finish=resolve;});
    if(input.text==='uncertain'){
     input.onEvent({type:'item',item:{id:'unsettled',kind:'tool',role:'system',text:'side effect may have happened; result missing',name:'command',status:'running',executionId:executionRef.id}});
     state.observation={status:'unknown',executionRef,tools:[{id:'unsettled',label:'one operation',status:'unknown'}]};
    }else{state.idle=true;state.observation={status:'idle',executionRef,tools:[]};input.onEvent({type:'completed',status:'completed'});}
   },
   observe:async({contextRef})=>structuredClone(contexts.get(contextRef.id)!.observation),reply:async()=>{},
   async stop(){if(stopFails)throw Error('agent_native_process_closed');return {status:'stopped',tools:[]};},
   ...(unaccepted&&unacceptedProof?{async releaseUnaccepted({contextRef,clientRequestId}:{contextRef:{id:string};clientRequestId:string}){const state=contexts.get(contextRef.id)!;return state.execution===clientRequestId&&state.idle?{executionState:'unknown' as const}:false;}}:{}),
   ...(daemon?{async prepareRelease({contextRef,executionRef}:{contextRef:{id:string};executionRef:{id:string}}){const state=contexts.get(contextRef.id)!;return state.execution===executionRef.id&&state.idle;}}:{}),
   ...(proof?{async canRelease({contextRef,executionRef}:{contextRef:{id:string};executionRef:{id:string}}){const state=contexts.get(contextRef.id)!;return state.execution===executionRef.id&&state.idle&&(!daemon||disposed)?(executionUnknown?{executionState:'unknown' as const}:true):false;}}:{}),
   async close(){if(!disposed){disposed=true;closed.push(runtime);if(closeStartsWork)for(const state of contexts.values())state.idle=false;if(closeWait){closeWait=false;await new Promise<void>(resolve=>{finishClose=resolve;});}}},
  };common=runtime;return runtime;
 }};
 const provider:ModelProvider={id:'fixture',label:'Fixture',async open(){return {protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'model',label:'Model',images:false,tools:true},{id:'other-model',label:'Other',images:false,tools:true}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{if(!modelHold)throw Error('paid model forbidden');modelStarted=true;await new Promise<void>(resolve=>{releaseModel=resolve;});return Response.json({id:'auxiliary',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'finished'},finish_reason:'stop'}]});},close:async()=>{}};}};
 const service=createAgentService({backendChange,dataRoot:root,generationAlive:()=>oldOwnerAlive,executors:[executor],modelProviders:[provider],...(upgrade?{programRelease:async()=>({latestVersion:'0.166.0',source:'https://fixture.invalid'}),programManager:{isManaged:(_provider:string,file:string)=>file===installed,async discover(input:{boundExecutable?:string}){const file=input.boundExecutable??original;return {candidates:[{executable:file,source:'managed' as const,label:'Fixture',version:file===installed?'0.166.0':'0.165.0',compatible:true}],installation:{label:'Fixture',version:'0.166.0',url:'https://fixture.invalid',canInstall:true}};},async install(){return installed;}}}:{}),resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 await service.connections.connect(connection,{expectedRevision:'unconfigured',...(upgrade?{executable:original}:{})});const account=await service.models.accounts.add({provider:'fixture'});const checked=await service.models.accounts.check(account.id);await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true},{id:'other-model',enabled:true}]});
 async function wait(predicate:()=>boolean){for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('resource state did not settle');}
 async function start(text:string){const c=await service.conversations.create('workspace',{}),draft={expectedRevision:c.revision,connectionId:connection,modelAccountId:account.id,model:'model',text},preview=service.conversations.prepareSend('workspace',c.id,draft);service.conversations.send('workspace',c.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});await wait(()=>{const run=service.conversations.read('workspace',c.id).run;return unaccepted&&text==='no-receipt'?run?.status==='unknown':run?.accepted===true;});if(text!=='hold')await wait(()=>!service.activity().reasons.some(r=>['execution','title','recovery','observation'].includes(r.kind)));return service.conversations.read('workspace',c.id);}
 return {root,service,contexts,original,installed,sent,closed,start,wait,gateways,finishClose:()=>finishClose?.(),modelStarted:()=>modelStarted,finishModel:async()=>{releaseModel?.();await modelResponse;},opens:()=>opens,async close(){finishClose?.();releaseModel?.();await modelResponse?.catch(()=>{});for(const state of contexts.values())state.finish?.();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
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

test('closing released unknown work keeps its records and a new request reopens it without replay',async()=>{
 const f=await fixture({executionUnknown:true});try{
  let chat=await f.start('uncertain');const original=chat.run!.id;
  f.contexts.get(chat.participants[0].contextId)!.idle=true;await f.service.releaseIdleSources();chat=f.service.conversations.read('workspace',chat.id);
  const revision=chat.revision,oldRun=structuredClone(chat.run),oldEntries=structuredClone(chat.entries);
  chat=await f.service.conversations.update('workspace',chat.id,{expectedRevision:revision,hidden:true});
  assert.equal(chat.hidden,true);assert.deepEqual(chat.run,oldRun);assert.deepEqual(chat.entries,oldEntries);
  assert.equal(f.service.conversations.listAll(['workspace'],{activeOnly:true}).total,0);assert.deepEqual(f.sent,['uncertain']);
  await assert.rejects(f.service.conversations.update('workspace',chat.id,{expectedRevision:revision,hidden:false}),{code:'agent_revision_conflict'});
  const input={expectedRevision:chat.revision,connectionId:'local',text:'a new request; verify existing results'};
  const preview=f.service.conversations.prepareSend('workspace',chat.id,input);
  f.service.conversations.send('workspace',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  const next=f.service.conversations.read('workspace',chat.id);assert.equal(next.hidden,false);
  assert.equal(next.retainedRuns?.find(run=>run.id===original)?.status,'unknown');assert.equal(f.sent.length,2);assert.equal(f.sent[0],'uncertain');assert.ok(f.sent[1].endsWith(input.text),'only the new request is sent, with the preserved local history');
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
 const f=await fixture({stopFails:true});try{const c=await f.start('uncertain');const result=await f.service.conversations.stop('workspace',c.id,{expectedRevision:c.revision,runId:c.run!.id,participantId:c.run!.participantId,generation:c.run!.generation});assert.equal(result.run?.status,'unknown');assert.equal(result.run?.stopRequested,true);assert.match(result.run?.diagnostic??'',/停止已请求/);assert.equal(f.service.conversations.listAll(['workspace'],{activeOnly:true}).stats.modelExecutions.length,0);}finally{await f.close();}
});


test('a completed result does not authorize release while its managed source still has work',async()=>{
 const f=await fixture();try{
  const chat=await f.start('done'),state=f.contexts.get(chat.participants[0].contextId)!;state.idle=false;
  await f.service.releaseIdleSources();assert.equal(f.closed.length,0);assert.equal(f.service.activity().busy,true);
  assert.equal(f.service.conversations.read('workspace',chat.id).run?.status,'completed');
  state.idle=true;await f.service.releaseIdleSources();const settled=f.service.conversations.read('workspace',chat.id);
  assert.equal(settled.run?.status,'completed');assert.equal(settled.run?.resourcesReleased,true);assert.equal(f.service.activity().busy,false);
  assert.equal(settled.run?.updatedAt,chat.run?.updatedAt,'idle resource release must not extend the completed execution duration');
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

test('program upgrade is not held forever by an unknown run from a dead generation',async()=>{
 const f=await fixture({upgrade:true});try{
  const chat=await f.start('done');await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.resourcesReleased===true);
  const repository=new ConversationRepository(path.join(f.root,'agent-service')),saved=repository.readConversation(chat.id)!,revision=saved.view.revision,participant=chat.participants[0];
  saved.view.retainedRuns=[{id:randomUUID(),participantId:participant.id,provider:'codex',generation:'dead-generation',status:'unknown',accepted:false,tools:[],model:chat.run!.model,startedAt:'2026-11-04T05:29:32.179Z',updatedAt:'2026-11-04T05:40:09.908Z',diagnostic:'尚未确认原执行的准确身份，保留记录并重新观察。'}];
  repository.saveConversation(saved,revision);
  const current=f.service.connections.read('codex');
  f.service.connections.upgradeProgram('codex',{expectedRevision:current.revision,expectedVersion:'0.166.0'});
  await f.wait(()=>f.service.connections.programUpdates().programs[0]?.upgrade?.state==='completed');
  assert.equal(f.service.connections.read('codex').executable,f.installed);
  const stale=f.service.conversations.read('workspace',chat.id).retainedRuns?.find(run=>run.generation==='dead-generation');
  assert.equal(stale?.status,'unknown');assert.equal(stale?.resourcesReleased,undefined);assert.deepEqual(f.sent,['done']);
 }finally{await f.close();}
});

test('program upgrade still waits for an unknown run whose generation is alive',async()=>{
 const f=await fixture({upgrade:true,oldOwnerAlive:true});try{
  const chat=await f.start('done');await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.resourcesReleased===true);
  const repository=new ConversationRepository(path.join(f.root,'agent-service')),saved=repository.readConversation(chat.id)!,revision=saved.view.revision,participant=chat.participants[0];
  saved.view.retainedRuns=[{id:randomUUID(),participantId:participant.id,provider:'codex',generation:'live-generation',status:'unknown',accepted:false,tools:[],model:chat.run!.model,startedAt:'2026-11-04T05:29:32.179Z',updatedAt:'2026-11-04T05:40:09.908Z',diagnostic:'尚未确认原执行的准确身份，保留记录并重新观察。'}];
  repository.saveConversation(saved,revision);
  const current=f.service.connections.read('codex');
  f.service.connections.upgradeProgram('codex',{expectedRevision:current.revision,expectedVersion:'0.166.0'});
  await f.wait(()=>f.service.connections.programUpdates().programs[0]?.upgrade?.state==='waiting');
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(f.service.connections.programUpdates().programs[0]?.upgrade?.state,'waiting');assert.equal(f.service.connections.read('codex').executable,f.original);
 }finally{await f.close();}
});


test('natural completion automatically releases its source and gateway; historical observation releases again',async()=>{
 const f=await fixture();try{
  const chat=await f.start('done'),gateway=f.gateways.at(-1)!;
  await f.wait(()=>!f.service.activity().busy);
  assert.equal(f.closed.length,1);assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased,true);
  const response=await fetch(gateway.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gateway.apiKey},body:JSON.stringify({model:'model',messages:[]})});
  assert.equal(response.status,401,'retired gateway credentials must be revoked');await response.text();
  const opened=f.opens();await f.service.conversations.observe('workspace',chat.id);
  assert.equal(f.opens(),opened+1);await f.wait(()=>!f.service.activity().busy);
  assert.equal(f.closed.length,2);assert.deepEqual(f.sent,['done']);
  assert.equal(f.service.conversations.read('workspace',chat.id).run?.status,'completed');
 }finally{await f.close();}
});

test('automatic reclamation waits for native and model work without blocking another owner',async()=>{
 const f=await fixture({modelHold:true});try{
  const auxiliary=await f.start('auxiliary');await f.wait(f.modelStarted);
  const other=await f.start('done');await f.wait(()=>f.service.conversations.read('workspace',other.id).run?.resourcesReleased===true);
  assert.notEqual(f.service.conversations.read('workspace',auxiliary.id).run?.resourcesReleased,true);
  await f.finishModel();await f.wait(()=>!f.service.activity().busy);
  assert.equal(f.closed.length,2);assert.deepEqual(f.sent,['auxiliary','done']);
 }finally{await f.close();}
});

test('automatic release retries late native proof and preserves an unknown result',async()=>{
 const f=await fixture({executionUnknown:true});try{
  const chat=await f.start('uncertain');
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(f.closed.length,0);
  f.contexts.get(chat.participants[0].contextId)!.idle=true;
  await f.wait(()=>!f.service.activity().busy);
  const observed=f.service.conversations.read('workspace',chat.id);
  assert.equal(observed.run?.status,'unknown');assert.equal(observed.run?.executionState,'unknown');assert.equal(observed.run?.resourcesReleased,true);assert.deepEqual(f.sent,['uncertain']);
 }finally{await f.close();}
});


test('new input waits for the exact automatic close and resumes once on a fresh source',async()=>{
 const f=await fixture({closeWait:true});try{
  const chat=await f.start('done');await f.wait(()=>f.closed.length===1);
  const current=f.service.conversations.read('workspace',chat.id),draft={expectedRevision:current.revision,connectionId:'local',modelAccountId:current.run!.modelAccountId,model:'model',text:'next'};
  const preview=f.service.conversations.prepareSend('workspace',chat.id,draft);
  f.service.conversations.send('workspace',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  assert.deepEqual(f.sent,['done']);f.finishClose();
  await f.wait(()=>f.sent.length===2);await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  assert.equal(f.opens(),3);assert.equal(f.sent.filter(value=>value.endsWith('next')||value==='next').length,1);
 }finally{await f.close();}
});

for(const supported of [false,true])test('cancelled unaccepted submission releases only with exact native proof; supported='+supported,async()=>{
 const f=await fixture({unaccepted:true,unacceptedProof:supported});try{
  const first=await f.start('no-receipt'),other=await f.start('hold'),run=first.run!;
  let result=await f.service.conversations.stop('workspace',first.id,{expectedRevision:first.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  assert.equal(result.run!.status,'stopped');assert.equal(result.run!.stopRequested,true);assert.notEqual(result.run!.resourcesReleased,true);assert.equal(f.closed.length,0);
  f.contexts.get(first.participants[0].contextId)!.idle=true;await f.service.releaseIdleSources();result=f.service.conversations.read('workspace',first.id);
  assert.equal(result.run!.status,'stopped');assert.equal(result.run!.resourcesReleased===true,supported);
  if(supported){assert.equal(result.run!.executionState,'unknown');assert.match(result.run!.diagnostic!,/是否送达仍未知/);assert.equal(result.entries.find(e=>e.role==='user')!.status,'unknown');}
  assert.equal(f.service.conversations.read('workspace',other.id).run!.status,'running');assert.deepEqual(f.sent,['no-receipt','hold']);assert.equal(f.closed.length,supported?1:0);
  const stored=new ConversationRepository(path.join(f.root,'agent-service')).readConversation(first.id)!;assert.equal(stored.interruption!.cancelled,true);
 }finally{await f.close();}
});

test('an unaccepted cancellation cannot close a source shared with another executing conversation',async()=>{
 const f=await fixture({unaccepted:true,shared:true});try{
  const first=await f.start('no-receipt'),other=await f.start('hold'),run=first.run!;
  f.contexts.get(first.participants[0].contextId)!.idle=true;
  const stopped=await f.service.conversations.stop('workspace',first.id,{expectedRevision:first.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  assert.equal(stopped.run!.status,'stopped');assert.equal(stopped.run!.stopRequested,true);assert.notEqual(stopped.run!.resourcesReleased,true);assert.equal(f.closed.length,0);assert.equal(f.service.conversations.read('workspace',other.id).run!.status,'running');assert.deepEqual(f.sent,['no-receipt','hold']);
 }finally{await f.close();}
});


test('idle SDK daemon closes before physical release; post-close work still blocks proof',async()=>{
 for(const closeStartsWork of [false,true]){
  const f=await fixture({daemon:true,closeStartsWork});try{
   const chat=await f.start('done');await f.service.releaseIdleSources();
   assert.equal(f.closed.length,1,'logical quiescence must allow closing a still-live SDK daemon');
   assert.equal(f.service.conversations.read('workspace',chat.id).run?.resourcesReleased===true,!closeStartsWork,'physical release must still be verified after close');
   assert.deepEqual(f.sent,['done']);
  }finally{await f.close();}
 }
});

test('same selection isolates a held old owner but still adopts the exact context after release',async()=>{
 const f=await fixture({oldOwnerAlive:true,backendChange:{reason:'runtime-content-changed',detectedAt:'time',fromGeneration:'old-generation',fromDigest:'before',toDigest:'after'}});try{
  let chat=await f.start('done');
  const repository=new ConversationRepository(path.join(f.root,'agent-service'));
  const record=repository.readConversation(chat.id)!;
  record.view.run!.generation='old-generation';delete record.view.run!.resourcesReleased;
  repository.saveConversation(record,record.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);
  const context=chat.participants.at(-1)!.contextId;
  const choice={connectionId:chat.participants.at(-1)!.connectionId,modelAccountId:chat.run!.modelAccountId,model:'model',text:'next'};
  assert.equal(f.service.conversations.prepareSend('workspace',chat.id,{...choice,expectedRevision:chat.revision}).participantId,undefined,'held controls require an independent context, not an input blockade');
  assert.deepEqual(f.sent,['done'],'preparation never sends or stops old work');
  const released=repository.readConversation(chat.id)!;released.view.run!.resourcesReleased=true;repository.saveConversation(released,released.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);
  const input={...choice,expectedRevision:chat.revision},preview=f.service.conversations.prepareSend('workspace',chat.id,input);
  assert.equal(preview.participantId,chat.run!.participantId);
  f.service.conversations.send('workspace',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  chat=f.service.conversations.read('workspace',chat.id);
  assert.equal(chat.participants.length,1);assert.equal(chat.participants[0].contextId,context);
  const event=chat.entries.find(entry=>entry.nativeSession);
  assert.equal(event?.nativeSession?.reason,'backend-adoption');assert.equal(event?.nativeSession?.from.generation,'old-generation');
  assert.equal(event?.nativeSession?.backendChange?.fromDigest,'before');assert.equal(event?.nativeSession?.backendChange?.reason,'runtime-content-changed');
  assert.equal(event?.nativeSession?.to.contextId,context);assert.equal(event?.status,'accepted');
 }finally{await f.close();}
});

for(const released of [true,false])test('historical unknown ownership is separated from the latest completed context; released='+released,async()=>{
 const f=await fixture({oldOwnerAlive:true});try{
  let chat=await f.start('done');await f.service.releaseIdleSources();
  const repository=new ConversationRepository(path.join(f.root,'agent-service'));
  const record=repository.readConversation(chat.id)!,participantId=record.view.run!.participantId;
  record.view.run!.generation='old-generation';record.view.run!.resourcesReleased=true;
  record.view.retainedRuns=[{...record.view.run!,id:'historical-unknown',status:'unknown',executionState:'unknown',resourcesReleased:released,
   tools:[{id:'old-operation',label:'unknown side effect',status:'unknown',canStop:false}]}];
  repository.saveConversation(record,record.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);
  const input={expectedRevision:chat.revision,connectionId:'local',modelAccountId:chat.run!.modelAccountId,model:'model',text:'a genuinely new request'};
  const preview=f.service.conversations.prepareSend('workspace',chat.id,input);
  assert.equal(preview.participantId,released?participantId:undefined);
  const submission={...input,previewToken:preview.token,clientRequestId:randomUUID()};
  const next=f.service.conversations.send('workspace',chat.id,submission);
  assert.equal(f.service.conversations.send('workspace',chat.id,submission).run?.id,next.run?.id,'repeated submission does not replay');
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  const saved=repository.readConversation(chat.id)!;
  const history=saved.view.retainedRuns?.find(run=>run.id==='historical-unknown');
  assert.equal(history?.status,'unknown');assert.equal(history?.resourcesReleased,released);assert.equal(history?.tools[0].status,'unknown');
  assert.equal(f.sent.length,2);assert.equal(f.sent[0],'done');assert.ok(f.sent[1].endsWith('a genuinely new request'));
 }finally{await f.close();}
});

test('a queued same-selection instruction preserves the previous native owner and is delivered once',async()=>{
 const f=await fixture({oldOwnerAlive:true});try{
  let chat=await f.start('done');const repository=new ConversationRepository(path.join(f.root,'agent-service'));
  const record=repository.readConversation(chat.id)!;record.view.run!.generation='old-generation';delete record.view.run!.resourcesReleased;repository.saveConversation(record,record.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);const original=chat.run!.id,requestId=randomUUID();
  f.service.conversations.queueSend('workspace',chat.id,{expectedRevision:chat.revision,connectionId:'local',modelAccountId:chat.run!.modelAccountId,model:'model',text:'new queued instruction',clientRequestId:requestId});
  const pump=new PendingSends({dataRoot:f.root,service:f.service,active:()=>true,generationAlive:()=>true,conversationBusy:async()=>false});
  await pump.pump();await pump.pump();
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  const after=f.service.conversations.read('workspace',chat.id);
  assert.notEqual(after.run!.id,original);assert.equal(f.sent.length,2);
  assert.ok(f.sent[1].endsWith('new queued instruction'));
  assert.equal(after.retainedRuns?.find(run=>run.id===original)?.generation,'old-generation');
  assert.equal(after.pendingSend,undefined);await pump.pump();assert.equal(f.sent.length,2);
 }finally{await f.close();}
});


test('unrelated backend provenance is not attributed to this conversation',async()=>{
 const f=await fixture({oldOwnerAlive:true,backendChange:{reason:'runtime-content-changed',detectedAt:'time',fromGeneration:'unrelated-generation',fromDigest:'before',toDigest:'after'}});try{
  let chat=await f.start('done');
  const repository=new ConversationRepository(path.join(f.root,'agent-service'));
  const record=repository.readConversation(chat.id)!;
  record.view.run!.generation='old-generation';delete record.view.run!.resourcesReleased;
  repository.saveConversation(record,record.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);
  const context=chat.participants.at(-1)!.contextId;
  const choice={connectionId:chat.participants.at(-1)!.connectionId,modelAccountId:chat.run!.modelAccountId,model:'model',text:'next'};
  assert.equal(f.service.conversations.prepareSend('workspace',chat.id,{...choice,expectedRevision:chat.revision}).participantId,undefined);
  const released=repository.readConversation(chat.id)!;released.view.run!.resourcesReleased=true;repository.saveConversation(released,released.view.revision);
  chat=f.service.conversations.read('workspace',chat.id);
  const input={...choice,expectedRevision:chat.revision},preview=f.service.conversations.prepareSend('workspace',chat.id,input);
  assert.equal(preview.participantId,chat.run!.participantId);
  f.service.conversations.send('workspace',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
  await f.wait(()=>f.service.conversations.read('workspace',chat.id).run?.status==='completed');
  chat=f.service.conversations.read('workspace',chat.id);
  assert.equal(chat.participants.length,1);assert.equal(chat.participants[0].contextId,context);
  const event=chat.entries.find(entry=>entry.nativeSession);
  assert.equal(event?.nativeSession?.reason,'backend-adoption');assert.equal(event?.nativeSession?.from.generation,'old-generation');
  assert.equal(event?.nativeSession?.backendChange,undefined);
  assert.equal(event?.nativeSession?.to.contextId,context);assert.equal(event?.status,'accepted');
 }finally{await f.close();}
});


test('session replacement has durable source/target identities and truthful acceptance',async()=>{
 for(const rejected of [false,true]){
  const f=await fixture({rejectDispatch:rejected});try{
   let chat=await f.start('done');const originalContext=chat.participants[0].contextId;
   const input={expectedRevision:chat.revision,connectionId:'local',modelAccountId:chat.run!.modelAccountId,model:'other-model',text:rejected?'reject next':'next'};
   const preview=f.service.conversations.prepareSend('workspace',chat.id,input);
   f.service.conversations.send('workspace',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
   await f.wait(()=>['completed','failed','unknown'].includes(f.service.conversations.read('workspace',chat.id).run?.status??''));
   chat=f.service.conversations.read('workspace',chat.id);
   const event=chat.entries.find(entry=>entry.nativeSession);
   assert.equal(event?.nativeSession?.reason,'session-replacement');assert.equal(event?.nativeSession?.from.contextId,originalContext);
   assert.notEqual(event?.nativeSession?.to.contextId,originalContext);
   assert.equal(event?.status,rejected?'unknown':'accepted','a thrown send without a receipt cannot prove non-delivery');
   assert.deepEqual(new ConversationRepository(path.join(f.root,'agent-service')).readConversation(chat.id)!.view.entries.find(entry=>entry.id===event!.id),event);
  }finally{await f.close();}
 }
});

test('historical already-released retained runs opened for observation do not deadlock idle release on shared runtime',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-released-history-'));
 try{
  const contexts=new Map<string,{execution:string;backgroundWork:boolean}>();
  let activeRuntime:AgentRuntime|undefined,closeCount=0;const sent:string[]=[];
  const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
  const executor:AgentExecutor={
   descriptor:{id:'local',label:'Local',capabilities},
   async open(){
    if(activeRuntime&&!activeRuntime.closed)return activeRuntime;
    let disposed=false;const liveExecutions=new Set<string>();
    const runtime:AgentRuntime={
     get closed(){return disposed;},bindingIdentity:'released-history-fixture',capabilities,
     inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'model',label:'Model'}],beginLogin:async()=>{},cancelLogin:async()=>{},
     async createContext(){const ref={id:randomUUID(),data:{cwd:root}};contexts.set(ref.id,{execution:'',backgroundWork:false});return ref;},
     async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},
     readHistory:async()=>[],
     async send(input){
      sent.push(input.text);
      const state=contexts.get(input.contextRef.id)!;state.execution=input.clientRequestId;liveExecutions.add(input.clientRequestId);
      const executionRef={id:input.clientRequestId,data:{backgroundWork:false}};
      input.onEvent({type:'accepted',executionRef});
      state.backgroundWork=false;
      input.onEvent({type:'completed',status:'completed'});
      input.onEvent({type:'observation',observation:{status:'idle',executionRef,tools:[]}});
     },
     observe:async({executionRef})=>executionRef&&liveExecutions.has(executionRef.id)?{status:'idle',executionRef,tools:[]}:{status:'idle',tools:[]},
     reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),
     // Simulate the exact cold-vs-live asymmetry: an older already-released run's
     // historical executionRef carries backgroundWork=true so cold canRelease rejects it.
     async prepareRelease({executionRef}){return liveExecutions.has(executionRef.id)?!contexts.get(executionRef.id)?.backgroundWork:true;},
     async canRelease({executionRef}){
      if(disposed&&!liveExecutions.has(executionRef.id)&&executionRef.data?.backgroundWork===true)return false;
      return executionRef.data?.backgroundWork!==true;
     },
     async close(){if(!disposed){disposed=true;closeCount++;}},
    };
    activeRuntime=runtime;return runtime;
   },
  };
  const provider:ModelProvider={id:'fixture',label:'Fixture',async open(){return {protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'model',label:'Model',images:false,tools:true},{id:'other-model',label:'Other',images:false,tools:true}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{throw Error('unused');},close:async()=>{}};}};
  const service=createAgentService({dataRoot:root,generationAlive:()=>false,executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  try{
   await service.connections.connect('local',{expectedRevision:'unconfigured'});
   const account=await service.models.accounts.add({provider:'fixture'});
   const checked=await service.models.accounts.check(account.id);
   await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true},{id:'other-model',enabled:true}]});
   const wait=async(predicate:()=>boolean)=>{for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('state did not settle');};

   // 1. Create a conversation with an older participant (p1) and hand off to a second participant (p2).
   let chat=await service.conversations.create('workspace',{});
   const firstDraft={expectedRevision:chat.revision,connectionId:'local',modelAccountId:account.id,model:'model',text:'first'};
   const firstPreview=service.conversations.prepareSend('workspace',chat.id,firstDraft);
   service.conversations.send('workspace',chat.id,{...firstDraft,previewToken:firstPreview.token,clientRequestId:randomUUID()});
   await wait(()=>service.conversations.read('workspace',chat.id).run?.status==='completed');
   chat=service.conversations.read('workspace',chat.id);
   const handoffDraft={expectedRevision:chat.revision,connectionId:'local',modelAccountId:account.id,model:'other-model',text:'second',handoffSummary:'prior completed'};
   const handoffPreview=service.conversations.prepareSend('workspace',chat.id,handoffDraft);
   service.conversations.send('workspace',chat.id,{...handoffDraft,previewToken:handoffPreview.token,clientRequestId:randomUUID()});
   await wait(()=>service.conversations.read('workspace',chat.id).participants.length===2&&service.conversations.read('workspace',chat.id).run?.status==='completed');
   await service.releaseIdleSources();

   // 2. Persist the historical participant as already resourcesReleased with stale backgroundWork=true in executionRef.
   const repository=new ConversationRepository(path.join(root,'agent-service'));
   const stored=repository.readConversation(chat.id)!;
   const historicalRun=stored.view.retainedRuns![0]!;
   historicalRun.status='unknown';historicalRun.executionState='unknown';historicalRun.stopRequested=true;historicalRun.resourcesReleased=true;
   const historicalAttempt=stored.attempts.find(a=>a.runId===historicalRun.id)!;
   historicalAttempt.executionRef={id:historicalAttempt.executionRef!.id,data:{backgroundWork:true}};
   repository.saveConversation(stored,stored.view.revision);

   // 3. Read-only observe opens both participants onto the same shared runtime; active release + next send must succeed.
   await service.conversations.observe('workspace',chat.id);
   await service.releaseIdleSources();
   const currentBeforeThird=service.conversations.read('workspace',chat.id);
   const thirdDraft={expectedRevision:currentBeforeThird.revision,connectionId:'local',modelAccountId:account.id,model:'other-model',text:'third'};
   const thirdPreview=service.conversations.prepareSend('workspace',chat.id,thirdDraft);
   service.conversations.send('workspace',chat.id,{...thirdDraft,previewToken:thirdPreview.token,clientRequestId:randomUUID()});
   await wait(()=>service.conversations.read('workspace',chat.id).entries.some(e=>e.text==='third'&&e.status==='accepted')&&service.conversations.read('workspace',chat.id).run?.status==='completed'&&!service.activity().reasons.some(r=>['execution','title','recovery','observation'].includes(r.kind)));
   await service.releaseIdleSources();

   const afterRelease=service.conversations.read('workspace',chat.id);
   assert.equal(afterRelease.run?.status,'completed');
   assert.equal(afterRelease.run?.resourcesReleased,true);
   const preservedHistory=afterRelease.retainedRuns?.find(r=>r.id===historicalRun.id);
   assert.equal(preservedHistory?.status,'unknown');
   assert.equal(preservedHistory?.executionState,'unknown');
   assert.equal(preservedHistory?.resourcesReleased,true);
   assert.ok(closeCount>=3,'shared observation runtime must release without getting wedged in sourceReleasePending');

   // 4. Subsequent send must not throw agent_runtime_release_unconfirmed.
   const fourthDraft={expectedRevision:afterRelease.revision,connectionId:'local',modelAccountId:account.id,model:'other-model',text:'fourth'};
   const fourthPreview=service.conversations.prepareSend('workspace',chat.id,fourthDraft);
   service.conversations.send('workspace',chat.id,{...fourthDraft,previewToken:fourthPreview.token,clientRequestId:randomUUID()});
   await wait(()=>service.conversations.read('workspace',chat.id).entries.some(e=>e.text==='fourth'&&e.status==='accepted')&&service.conversations.read('workspace',chat.id).run?.status==='completed');
   assert.equal(sent.length,4);
  }finally{await service.close();}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
