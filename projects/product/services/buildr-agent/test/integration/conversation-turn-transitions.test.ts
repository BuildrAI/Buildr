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
// Ordinary input no longer owns a question-release transition. Exercise the
// former fallback and native-release variants against the preservation contract.
for(const provider of ['codex','dsh','qoder'])for(const options of [{tools:true},{native:true},{native:true,unknown:true},{reject:true},{hold:true},{unknownNew:true}])test(provider+': pending question blocks replacement '+JSON.stringify(options),async()=>{
 const f=await fixture({provider,...options});try{
  const before=f.read(),draft={expectedRevision:before.revision,connectionId:provider,text:'new directive'};
  const preview=f.service.conversations.prepareSend('scope',before.id,draft);
  for(const token of [undefined,preview.token])assert.throws(()=>f.service.conversations.send('scope',before.id,{...draft,previewToken:token,clientRequestId:randomUUID()}),{code:'agent_pending_response'});
  assert.equal(f.sends.length,1);assert.equal(f.stops,0);assert.equal(f.releases,0);assert.equal(f.replies,0);
  assert.deepEqual(f.read().run,before.run);assert.deepEqual(f.read().requests,before.requests);
  await f.service.conversations.recoverInterrupted();
  assert.equal(f.stops,0);assert.equal(f.releases,0);assert.equal(f.sends.length,1);
 }finally{await f.close();}
});
test('refusing ordinary input leaves the original card answerable',async()=>{
 const f=await fixture({native:true});try{
  const before=f.read();assert.throws(()=>f.send('new directive'),{code:'agent_pending_response'});
  await f.service.conversations.reply('scope',before.id,before.requests[0].id,{expectedRevision:f.read().revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation,answer:'yes'});
  assert.equal(f.replies,1);assert.equal(f.releases,0);assert.equal(f.sends.length,1);
 }finally{await f.close();}
});
