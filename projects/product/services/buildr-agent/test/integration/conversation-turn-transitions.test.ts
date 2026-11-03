import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/application/agent-service.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { ExecutorInputRejected, type AgentExecutor, type AgentRuntime, type ExecutorObservation, type ExecutorSendInput } from '../../src/contracts.ts';
function gate() { let resolve!:()=>void; const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve}; }
async function until<T>(read:()=>T, check:(value:T)=>boolean):Promise<T> { for(let n=0;n<400;n++){const value=read();if(check(value))return value;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('state did not settle: '+JSON.stringify(read()).slice(-2500)); }
async function fixture(options:{provider?:string;native?:boolean;tools?:boolean;reject?:boolean;hold?:boolean;unknown?:boolean;holdRelease?:boolean;unknownNew?:boolean}={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-turn-transition-')),admission=gate(),releaseAdmission=gate(),contexts=new Map<string,{observation:ExecutorObservation;finish:()=>void;input?:ExecutorSendInput}>(),sends:ExecutorSendInput[]=[];
 let stops=0,releases=0,replies=0;
 const capabilities={endQuestionWait:Boolean(options.native),text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:131072};
 const finish=(ref:{id:string})=>{const context=contexts.get(ref.id)!;context.observation={...context.observation,status:options.unknown?'unknown':'stopped',requests:options.unknown?context.observation.requests:[],tools:[]};if(!options.unknown)context.finish();return structuredClone(context.observation);};
 const executor:AgentExecutor={descriptor:{id:options.provider??'local',label:'Fixture',capabilities},async open(){const runtime:AgentRuntime={
  bindingIdentity:'transition-fixture',capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'model',label:'Model'}],beginLogin:async()=>{},cancelLogin:async()=>{},
  createContext:async()=>{const ref={id:randomUUID()};contexts.set(ref.id,{observation:{status:'idle',tools:[]},finish:()=>{}});return ref;},resumeContext:async()=>{},readHistory:async()=>[],
  async send(input){sends.push(input);const context=contexts.get(input.contextRef.id)!;context.input=input;const executionRef={id:randomUUID()};
   if(input.text.includes('new directive')){if(options.hold)await admission.promise;if(options.reject)throw new ExecutorInputRejected('new input rejected');if(options.unknownNew)throw new Error('native receipt lost');context.observation={status:'idle',executionRef,tools:[]};input.onEvent({type:'accepted',executionRef});input.onEvent({type:'completed',status:'completed'});return;}
   context.observation={status:'waiting',executionRef,tools:options.tools?[{id:'live-tool',label:'keep working',status:'running',canStop:true}]:[],requests:[{id:'native-question',kind:'question',blocking:false,title:'May I restart?'}]};
   input.onEvent({type:'accepted',executionRef});input.onEvent({type:'request',request:context.observation.requests![0]});if(options.tools)input.onEvent({type:'observation',observation:structuredClone(context.observation)});
   await new Promise<void>(resolve=>{context.finish=resolve;});input.onEvent({type:'completed',status:'stopped'});
  },
  observe:async({contextRef})=>structuredClone(contexts.get(contextRef.id)!.observation),reply:async()=>{replies++;},stop:async({contextRef})=>{stops++;return finish(contextRef);},
  ...(options.native?{endQuestionWait:async(input:{contextRef:{id:string}})=>{releases++;if(options.holdRelease)await releaseAdmission.promise;return finish(input.contextRef);}}:{}),close:async()=>{for(const context of contexts.values())context.finish();}
 };return runtime;}};
 const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:[],resolveWorkspace:()=>({rootPath:root})});const provider=options.provider??'local';await service.connections.connect(provider,{expectedRevision:service.connections.read(provider).revision});const chat=await service.conversations.create('scope',{});
 const read=()=>service.conversations.read('scope',chat.id);
 const send=(text:string,clientRequestId=randomUUID())=>service.conversations.send('scope',chat.id,{expectedRevision:read().revision,connectionId:provider,text,clientRequestId});
 send('original goal');const old=await until(read,value=>value.requests.length===1);
 return {service,root,read,send,old,sends,contexts,admission,releaseAdmission,get replies(){return replies;},get stops(){return stops;},get releases(){return releases;},async close(){admission.resolve();releaseAdmission.resolve();for(const context of contexts.values())context.finish();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}
for(const provider of ['codex','dsh','qoder'])test(provider+': service fallback preserves an active tool while admitting a new turn and closing only the old question',async()=>{
 const f=await fixture({provider,tools:true});try{const submission=f.send('new directive');const participant=submission.run.participantId;
  const next=await until(f.read,value=>value.run!.accepted&&value.run!.id!==f.old.run!.id);
  assert.equal(next.requests.length,0);assert.equal(f.stops,0);assert.equal(f.releases,0);assert.notEqual(participant,f.old.run!.participantId);assert.equal(next.run!.participantId,participant);
  assert.equal(next.retainedRuns![0].tools[0].status,'running');assert.equal(next.retainedRuns![0].supersededBy,undefined);
  f.sends[0].onEvent({type:'request',request:{id:'late-question',kind:'question',title:'late'}});assert.equal(f.read().requests.length,0);
 }finally{await f.close();}
});
test('independent new input rejection preserves the original question and its execution',async()=>{
 const f=await fixture({reject:true});try{f.send('new directive');const failed=await until(f.read,value=>value.run!.status==='failed');assert.equal(failed.requests[0].id,f.old.requests[0].id);assert.equal(f.stops,0);assert.equal(f.releases,0);assert.equal(failed.retainedRuns![0].supersededBy,undefined);}finally{await f.close();}
});
test('saving a new input is not native acceptance; old question remains until the exact receipt',async()=>{
 const f=await fixture({hold:true});try{const submitted=f.send('new directive');assert.equal(submitted.run.accepted,false);await until(()=>f.sends.length,value=>value===2);assert.equal(f.read().requests[0].id,f.old.requests[0].id);assert.equal(f.stops,0);f.admission.resolve();await until(f.read,value=>value.run!.accepted&&value.requests.length===0);await until(()=>f.stops,value=>value===1);assert.equal(f.read().run!.participantId,submitted.run.participantId);}finally{await f.close();}
});
test('declared native question release reuses a context without changing the submitted participant identity',async()=>{
 const f=await fixture({native:true});try{const next=f.send('new directive');assert.equal(next.run.participantId,f.old.run!.participantId);const done=await until(f.read,value=>value.run!.accepted&&value.run!.id===next.run.id);assert.equal(f.releases,1);assert.equal(f.stops,0);assert.equal(done.run!.participantId,next.run.participantId);assert.equal(f.sends[0].contextRef.id,f.sends[1].contextRef.id);}finally{await f.close();}
});
test('failed same-context native release keeps its fixed identity and does not dispatch a new native input',async()=>{
 const f=await fixture({native:true,unknown:true});try{const next=f.send('new directive');const failed=await until(f.read,value=>value.run!.status==='failed');assert.equal(failed.run!.participantId,next.run.participantId);assert.equal(f.sends.length,1);assert.equal(f.releases,1);assert.equal(failed.requests[0].id,f.old.requests[0].id);}finally{await f.close();}
});
test('unknown generic release is persisted and cannot be replayed by recovery or repeated control',async()=>{
 const f=await fixture({unknown:true});try{f.send('new directive');await until(()=>f.stops,value=>value===1);const repository=new ConversationRepository(path.join(f.root,'agent-service'));const record=repository.readConversation(f.old.id)!;const attempt=record.attempts.find(attempt=>attempt.runId===f.old.run!.id)!;assert.equal(attempt.questionReleaseRequested,true);assert.ok(record.view.retainedRuns?.find(run=>run.id===f.old.run!.id)?.questionsEndedBy);
  await f.service.conversations.recoverInterrupted();
  await f.service.conversations.releaseQuestionWait('scope',f.old.id,{expectedRevision:f.read().revision,runId:f.old.run!.id,participantId:f.old.run!.participantId,generation:f.old.run!.generation});assert.equal(f.stops,1);
 }finally{await f.close();}
});

test('a native release and a card reply cannot dispatch concurrently',async()=>{
 const f=await fixture({native:true,holdRelease:true});try{f.send('new directive');await until(()=>f.releases,value=>value===1);const current=f.read();
  await assert.rejects(f.service.conversations.reply('scope',f.old.id,f.old.requests[0].id,{expectedRevision:current.revision,runId:f.old.run!.id,participantId:f.old.run!.participantId,generation:f.old.run!.generation,answer:'yes'}),{code:'agent_question_transition_in_flight'});
  assert.equal(f.replies,0);f.releaseAdmission.resolve();await until(f.read,value=>value.run!.accepted);assert.equal(f.replies,0);
 }finally{await f.close();}
});
test('same-context start failure records the already released wait instead of pretending to roll it back',async()=>{
 const f=await fixture({native:true,reject:true});try{const next=f.send('new directive');const failed=await until(f.read,value=>value.run!.status==='failed');assert.equal(failed.requests.length,0);assert.equal(f.releases,1);assert.equal(failed.run!.participantId,next.run.participantId);assert.equal(f.sends.length,2);assert.ok(failed.entries.some(entry=>entry.role==='user'&&entry.text==='new directive'));}finally{await f.close();}
});
test('a missing native receipt preserves the original card and repeated submission does not replay the input',async()=>{
 const f=await fixture({unknownNew:true});try{const requestId=randomUUID();f.send('new directive',requestId);const unknown=await until(f.read,value=>value.run!.status==='unknown');assert.equal(unknown.requests[0].id,f.old.requests[0].id);f.send('new directive',requestId);assert.equal(f.sends.length,2);assert.equal(f.stops,0);}finally{await f.close();}
});

test('a retained older writer cannot make an ended question actionable again through the read model',async()=>{
 const f=await fixture({tools:true});try{f.send('new directive');await until(f.read,value=>value.run!.accepted&&value.requests.length===0);
  const repository=new ConversationRepository(path.join(f.root,'agent-service')),record=repository.readConversation(f.old.id)!,revision=record.view.revision;
  const stale={...f.old.requests[0],id:'legacy-reported-again'};record.view.requests.push(stale);record.requests[stale.id]={nativeId:'native-question',executionRef:record.attempts.find(attempt=>attempt.runId===f.old.run!.id)!.executionRef!};record.view.revision=randomUUID();repository.saveConversation(record,revision);
  const current=f.read();assert.equal(current.requests.length,0);assert.equal(current.retainedRuns![0].questionsEndedBy,current.run!.id);assert.equal(current.retainedRuns![0].tools[0].status,'running');assert.equal(f.stops,0);
 }finally{await f.close();}
});

test('polling a finished retained tool releases only its remaining question wait',async()=>{
 const f=await fixture({tools:true});try{f.send('new directive');await until(f.read,value=>value.run!.accepted&&value.requests.length===0);assert.equal(f.stops,0);
  const context=f.contexts.get(f.sends[0].contextRef.id)!;context.observation.tools=[];
  await f.service.conversations.observeRun('scope',f.old.id,{expectedRevision:f.read().revision,runId:f.old.run!.id,participantId:f.old.run!.participantId,generation:f.old.run!.generation});
  await until(()=>f.stops,value=>value===1);assert.equal(f.read().run!.status,'completed');assert.equal(f.read().retainedRuns![0].tools.length,0);
 }finally{await f.close();}
});
