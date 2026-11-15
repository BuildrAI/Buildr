import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import { createAgentService } from '../../src/application/agent-service.ts';
import { PendingSends } from '../../src/process/pending-sends.ts';
import { PendingSendRepository } from '../../src/persistence/pending-send-repository.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { AgentExecutor, ContextRef, ExecutorObservation, ExecutorSendInput, SendDraft } from '../../src/contracts.ts';

function executor(id:string, question=false) {
  const contexts=new Map<string,{observation:ExecutorObservation;finish?():void}>(),inputs:ExecutorSendInput[]=[],replies:unknown[]=[];
  let stops=0,unknownStop=false,stopError:Error|undefined;
  const capabilities={text:true,images:true,questions:true,approval:true,stop:true,resume:true,maxInputBytes:128*1024};
  const get=(ref:ContextRef)=>contexts.get(ref.id)!;
  const value:AgentExecutor={descriptor:{id,label:id,capabilities},async open(){return{
    bindingIdentity:id,capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'a',label:'A'},{id:'b',label:'B'}],
    beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>{const ref={id:randomUUID()};contexts.set(ref.id,{observation:{status:'idle',tools:[]}});return ref;},
    resumeContext:async()=>{},readHistory:async()=>[],
    async send(input){
      inputs.push(input);const context=get(input.contextRef),executionRef={id:randomUUID()};
      context.observation={status:question?'waiting':'running',tools:[],executionRef,...(question?{requests:[{id:'native-question',kind:'question' as const,title:'是否验收？'}]}:{})};input.onEvent({type:'accepted',executionRef});
      if(question){
        input.onEvent({type:'request',request:{id:'native-question',kind:'question',title:'是否验收？',questions:[{id:'result',label:'结果如何？',allowOther:true,options:[{id:'later',label:'稍后确认'},{id:'ok',label:'符合预期'}]}]}});
        await new Promise<void>(resolve=>{context.finish=resolve;});
      }else{context.observation={status:'idle',tools:[],executionRef};input.onEvent({type:'item',item:{id:randomUUID(),kind:'message',role:'assistant',text:'new answer',executionId:executionRef.id}});}
      input.onEvent({type:'completed',status:context.observation.status==='stopped'?'stopped':'completed'});
    },
    observe:async({contextRef})=>structuredClone(get(contextRef).observation),
    canRelease:async({contextRef})=>['stopped','idle'].includes(get(contextRef).observation.status),
    async stop({contextRef}){stops++;if(stopError)throw stopError;const context=get(contextRef);context.observation={...context.observation,status:unknownStop?'unknown':'stopped',tools:[],requests:unknownStop?context.observation.requests:[]};if(!unknownStop)context.finish?.();return context.observation;},
    async reply({contextRef,answer}){replies.push(answer);const context=get(contextRef);context.observation={...context.observation,status:'idle'};context.finish?.();},
    close:async()=>{}
  };}};
  return{value,inputs,replies,contexts,get stops(){return stops;},setStopError(value:Error){stopError=value;},setUnknown(value:boolean){unknownStop=value;},finish(){for(const context of contexts.values()){context.observation={...context.observation,status:'stopped',tools:[]};context.finish?.();}}};
}
async function until<T>(read:()=>T|Promise<T>,check:(value:T)=>boolean):Promise<T>{for(let n=0;n<200;n++){const value=await read();if(check(value))return value;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('state did not settle: '+JSON.stringify(await read()).slice(-2000));}
async function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-question-handoff-')),old=executor('old',true),next=executor('next');
  const options={dataRoot:root,executors:[old.value,next.value],resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{}};
  const service=createAgentService(options),repository=new PendingSendRepository(path.join(root,'agent-service'));
  for(const id of ['old','next'])await service.connections.connect(id,{expectedRevision:service.connections.read(id).revision});
  const created=await service.conversations.create('scope',{}),draft={expectedRevision:created.revision,connectionId:'old',model:'a',text:'检查当前成果，必要时询问我'};
  const preview=service.conversations.prepareSend('scope',created.id,draft);
  service.conversations.send('scope',created.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  const chat=await until(()=>service.conversations.read('scope',created.id),view=>view.run?.status==='waiting-question');
  const intent:NonNullable<SendDraft['waitingHandoff']>={runId:chat.run!.id,participantId:chat.run!.participantId,generation:chat.run!.generation,requestIds:chat.requests.map(request=>request.id)};
  const queued=(text='',answers?:NonNullable<typeof intent.answers>)=>({expectedRevision:chat.revision,connectionId:'next',model:'a',text,...(!text?{continueRunId:chat.run!.id}:{}),waitingHandoff:{...intent,...(answers?{answers}:{})}});
  const pump=()=>new PendingSends({dataRoot:root,service,active:()=>true,generationAlive:()=>false,conversationBusy:async(scope,id)=>service.conversationInputBusy(scope,id)});
  return{root,old,next,service,repository,chat,intent,queued,pump,async close(){old.finish();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}

// Pending cards cannot be abandoned by ordinary send or durable handoff.
for(const selection of ['old','next'])for(const mode of ['discussion','instruction','continue','answer'] as const)for(const unknownStop of [false,true])test(selection+': pending '+mode+' preserves original wait; unknown stop='+unknownStop,async()=>{
 const f=await fixture();try{
  f.old.setUnknown(unknownStop);
  const draft:SendDraft={...f.queued(mode==='instruction'?'more context':''),connectionId:selection};
  if(mode==='discussion'){draft.text='explain first';draft.waitingHandoff={...f.intent,intent:'discussion'};delete draft.continueRunId;}
  if(mode==='answer')draft.waitingHandoff={...f.intent,answers:[{requestId:f.chat.requests[0].id,answer:'ok'}]};
  const before=f.service.conversations.read('scope',f.chat.id);
  assert.throws(()=>f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:randomUUID()}),{code:'agent_pending_response'});
  await f.pump().pump();await f.pump().pump();
  const after=f.service.conversations.read('scope',f.chat.id);
  assert.deepEqual(after.run,before.run);assert.deepEqual(after.requests,before.requests);
  assert.equal(f.old.inputs.length,1);assert.equal(f.next.inputs.length,0);assert.equal(f.old.stops,0);assert.equal(f.old.replies.length,0);
 }finally{await f.close();}
});
test('pending handoff refusal does not consume or approve the original card',async()=>{
 const f=await fixture();try{
  assert.throws(()=>f.service.conversations.queueSend('scope',f.chat.id,{...f.queued('new request'),clientRequestId:randomUUID()}),{code:'agent_pending_response'});
  const before=f.service.conversations.read('scope',f.chat.id),run=before.run!;
  await f.service.conversations.reply('scope',before.id,before.requests[0].id,{expectedRevision:before.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:{result:'ok'}});
  assert.equal(f.old.replies.length,1);assert.equal(f.old.stops,0);assert.equal(f.next.inputs.length,0);
 }finally{await f.close();}
});
