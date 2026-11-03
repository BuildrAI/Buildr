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

test('explicit discussion starts a new turn and ends the old wait without answering', async () => {
  const f = await fixture();
  try {
    const draft: SendDraft = { expectedRevision: f.chat.revision, connectionId: 'old', model: 'a', text: '为什么推荐这个方案？先解释，不要验收。', waitingHandoff: { ...f.intent, intent: 'discussion' } };
    const preview = f.service.conversations.prepareSend('scope', f.chat.id, draft);
    assert.equal(preview.fits, true);
    assert.match(preview.handoff!.body, /仅解释和调查/);
    assert.equal(f.old.stops, 0);
    assert.throws(() => f.service.conversations.prepareSend('scope', f.chat.id, { ...draft, connectionId: 'next' }), { code: 'agent_discussion_invalid' });
    assert.throws(() => f.service.conversations.prepareSend('scope', f.chat.id, { ...draft, waitingHandoff: { ...draft.waitingHandoff!, answers: [{ requestId: f.chat.requests[0].id, answer: 'ok' }] } }), { code: 'agent_handoff_invalid' });
    const requestId = randomUUID();
    f.service.conversations.queueSend('scope', f.chat.id, { ...draft, clientRequestId: requestId });
    const pump = f.pump();
    await until(async () => { await pump.pump(); return f.old.inputs.length; }, value => value === 2);
    assert.equal(f.old.stops, 1);
    assert.equal(f.next.inputs.length, 0);
    assert.deepEqual(f.old.replies, []);
    assert.notEqual(f.old.inputs[0].contextRef.id, f.old.inputs[1].contextRef.id);
    const current = f.service.conversations.read('scope', f.chat.id);
    assert.equal(current.retainedRuns?.[0]?.id, f.intent.runId);
    assert.ok(!current.requests.some(request => request.id === f.intent.requestIds[0]));
    assert.match(f.old.inputs[1].text, /先解释/);
    assert.match(f.old.inputs[1].text, /用户要求先讨论/);
    assert.match(f.old.inputs[1].text, /未回答/);
    await f.pump().pump();
    assert.equal(f.old.inputs.length, 2, 'a durable discussion is delivered once');
  } finally { await f.close(); }
});

test('discussion isolates a new native context when the exact old stop is unknown', async () => {
  const f = await fixture();
  try {
    f.old.setUnknown(true);
    const draft: SendDraft = { expectedRevision: f.chat.revision, connectionId: 'old', model: 'a', text: '先说明依据', waitingHandoff: { ...f.intent, intent: 'discussion' } };
    const requestId = randomUUID();
    f.service.conversations.queueSend('scope', f.chat.id, { ...draft, clientRequestId: requestId });
    const pump = f.pump();
    await until(async () => { await pump.pump(); return f.old.inputs.length; }, count => count === 2);
    assert.equal(f.old.stops, 1);
    assert.notEqual(f.old.inputs[0].contextRef.id, f.old.inputs[1].contextRef.id);
    assert.equal(f.old.replies.length, 0);
    const current = f.service.conversations.read('scope', f.chat.id);
    assert.equal(current.retainedRuns?.[0]?.id, f.intent.runId);
    assert.ok(!current.requests.some(request => request.id === f.intent.requestIds[0]));
  } finally { await f.close(); }
});

for(const mode of ['answer','instruction','continue'] as const)test('waiting handoff '+mode+' keeps exact questions and delivers once without answering the old model',async()=>{
  const f=await fixture();
  try{
    const draft=f.queued(mode==='instruction'?'先处理新的失败路径':'',mode==='answer'?[{requestId:f.chat.requests[0]!.id,answer:{result:'ok'}}]:undefined);
    const preview=await f.service.conversations.prepareHandoff('scope',f.chat.id,draft);
    assert.equal(preview.fits,true);assert.equal(f.old.stops,0);assert.equal(f.old.replies.length,0);assert.equal(f.next.inputs.length,0);
    assert.match(preview.handoff!.body,/是否验收/);assert.match(preview.handoff!.body,mode==='answer'?/用户已提交回答/:/未回答/);
    assert.throws(()=>f.service.conversations.send('scope',f.chat.id,{...draft,previewToken:preview.token,clientRequestId:'not-queued'}),{code:'agent_handoff_queue_required'});
    const requestId=randomUUID();let queued=f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});
    assert.equal(queued.pendingSend?.waitingQuestions?.[0]?.title,'是否验收？');
    assert.throws(()=>f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:randomUUID(),waitingHandoff:{...draft.waitingHandoff!,answers:[{requestId:f.chat.requests[0]!.id,answer:{result:''}}]}}),{code:'agent_question_answer_invalid'});
    await assert.rejects(f.service.conversations.reply('scope',f.chat.id,f.chat.requests[0]!.id,{expectedRevision:queued.revision,runId:f.intent.runId,participantId:f.intent.participantId,generation:f.intent.generation,answer:{result:'later'}}),{code:'agent_handoff_pending'});
    const sends=f.pump();await sends.pump();await until(async()=>{await sends.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.id!==f.intent.runId&&view.run?.status==='completed');
    await f.pump().pump();
    assert.equal(f.next.inputs.length,1);assert.equal(f.old.stops,1);assert.equal(f.old.replies.length,0);
    assert.match(f.next.inputs[0]!.text,/是否验收/);assert.match(f.next.inputs[0]!.text,mode==='answer'?/"回答":\{"result":"ok"\}/:/未回答/);
    const read=f.service.conversations.read('scope',f.chat.id);
    assert.equal(read.pendingSend,undefined);assert.equal(read.entries.filter(entry=>entry.id.startsWith('waiting-handoff-')).length,1);
    assert.equal(read.entries.find(entry=>entry.id.startsWith('waiting-handoff-'))?.role,mode==='answer'?'user':'system');
    assert.equal(read.entries.filter(entry=>entry.role==='user'&&entry.kind==='message').length,mode==='instruction'?2:1);
    queued=f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});assert.equal(queued.pendingSend,undefined);assert.equal(f.next.inputs.length,1);
  }finally{await f.close();}
});

test('failed target validation and cancellation leave no submitted business answer in future history',async()=>{
  const f=await fixture();
  try{
    const requestId=randomUUID(),draft=f.queued('',[{requestId:f.chat.requests[0]!.id,answer:{result:'ok'}}]);
    f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});
    const next=f.service.connections.read('next');await f.service.connections.disconnect('next',{expectedRevision:next.revision});
    const sends=f.pump();
    await until(async()=>{await sends.pump();return f.repository.read('scope',f.chat.id);},row=>row?.state==='failed');
    const pending=f.repository.read('scope',f.chat.id)!;
    f.service.conversations.cancelPendingSend('scope',f.chat.id,{expectedPendingRevision:pending.revision});
    const current=f.service.conversations.read('scope',f.chat.id);
    assert.equal(current.requests[0]?.id,f.chat.requests[0]!.id,'failed target never retires the original question');
    assert.equal(current.entries.some(entry=>entry.id.startsWith('waiting-handoff-')),false);
    assert.equal(f.next.inputs.length,0);
  }finally{await f.close();}
});

test('cancellation leaves the original question actionable; unknown stop never gates a new goal',async()=>{
  const f=await fixture();try{
    const draft=f.queued('新的要求');const queued=f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:randomUUID()});
    f.service.conversations.cancelPendingSend('scope',f.chat.id,{expectedPendingRevision:queued.pendingSend!.revision});
    await f.pump().pump();assert.equal(f.old.stops,0);assert.equal(f.next.inputs.length,0);assert.equal(f.service.conversations.read('scope',f.chat.id).requests.length,1);
    f.old.setUnknown(true);
    const stopped=await f.service.conversations.stop('scope',f.chat.id,{expectedRevision:f.chat.revision,runId:f.intent.runId,participantId:f.intent.participantId,generation:f.intent.generation});
    f.service.conversations.queueSend('scope',f.chat.id,{expectedRevision:stopped.revision,connectionId:'next',model:'a',text:'新的要求',clientRequestId:randomUUID()});
    const sends=f.pump();await until(async()=>{await sends.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.id!==f.intent.runId&&view.run?.status==='completed');
    assert.equal(f.old.stops,1);assert.equal(f.next.inputs.length,1);assert.equal(f.old.replies.length,0);
    assert.equal(f.service.conversations.read('scope',f.chat.id).retainedRuns?.[0]?.status,'unknown');
  }finally{await f.close();}
});

test('an answer through another entry invalidates an old preview and changed identities cannot hand off',async()=>{
  const f=await fixture();
  try{
    const draft=f.queued('另一个要求');
    assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,{...draft,waitingHandoff:{...draft.waitingHandoff!,runId:'other-run'}}),{code:'agent_handoff_stale'});
    assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,{...f.queued(),connectionId:'old'}),{code:'agent_handoff_unchanged'});
    await f.service.conversations.reply('scope',f.chat.id,f.chat.requests[0]!.id,{expectedRevision:f.chat.revision,runId:f.intent.runId,participantId:f.intent.participantId,generation:f.intent.generation,answer:{result:'later'}});
    const latest=f.service.conversations.read('scope',f.chat.id);
    assert.throws(()=>f.service.conversations.queueSend('scope',f.chat.id,{...draft,expectedRevision:latest.revision,clientRequestId:randomUUID()}),{code:'agent_handoff_answered'});
    assert.equal(f.old.stops,0);assert.equal(f.next.inputs.length,0);
  }finally{await f.close();}
});

test('a newly arrived approval or question invalidates the saved intent before stopping',async()=>{
  for(const kind of ['approval','question'] as const){
    const f=await fixture();
    try{
      f.service.conversations.queueSend('scope',f.chat.id,{...f.queued('new work'),clientRequestId:randomUUID()});
      f.old.inputs[0]!.onEvent({type:'request',request:{id:'late-'+kind,kind,title:'another decision'}});
      await f.pump().pump();
      assert.equal(f.repository.read('scope',f.chat.id)?.state,'failed');assert.equal(f.old.stops,0);assert.equal(f.next.inputs.length,0);
    }finally{await f.close();}
  }
});

test('a reply accepted by another entry before dispatch preserves the pending answer without new delivery',async()=>{
  const f=await fixture();
  try{
    const requestId=randomUUID(),draft=f.queued('',[{requestId:f.chat.requests[0]!.id,answer:{result:'later'}}]);
    f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});
    const repository=new ConversationRepository(path.join(f.root,'agent-service'));
    {
      const record=repository.readConversation(f.chat.id)!,prior=record.view.revision;
      record.view.entries.push({id:'reply-'+f.chat.requests[0]!.id,kind:'notice',role:'user',text:'accepted by an older reply route',sequence:record.view.entries.at(-1)!.sequence+1,status:'accepted',runId:f.intent.runId,createdAt:new Date().toISOString()});
      record.view.revision=randomUUID();repository.saveConversation(record,prior);
    }
    await f.pump().pump();
    const pending=f.repository.read('scope',f.chat.id)!;
    assert.equal(pending.state,'failed');assert.match(pending.reason,/已有答复/);assert.deepEqual(pending.draft.waitingHandoff?.answers,draft.waitingHandoff?.answers);
    assert.equal(f.next.inputs.length,0);
  }finally{await f.close();}
});


test('同组合新要求不能隐式停止或接替待答问题',async()=>{
 const f=await fixture();try{
  const draft={...f.queued('先优化新指出的问题'),connectionId:'old'};
  assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,draft),{code:'agent_handoff_unchanged'});
  assert.throws(()=>f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:'replace-wait'}),{code:'agent_handoff_unchanged'});
  assert.equal(f.old.stops,0);assert.equal(f.old.replies.length,0);assert.equal(f.old.inputs.length,1);
  assert.equal(f.service.conversations.read('scope',f.chat.id).requests[0]!.id,f.intent.requestIds[0]);
 }finally{await f.close();}
});

for(const media of ['image','video'] as const)test('正式交接回答保全同对话原件与抽样来源：'+media,async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');
  const frame=f.service.conversations.addAttachment('scope',f.chat.id,{expectedRevision:f.chat.revision,mimeType:'image/png',bytes});
  const original=media==='image'?frame:f.service.conversations.addAttachment('scope',f.chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'),video:{duration:2,frames:[{id:frame.id,time:0}]}});
  const draft={...f.queued('',[{requestId:f.chat.requests[0]!.id,answer:{result:{text:'请核对材料',attachmentIds:[original.id]}}}]),expectedRevision:original.revision};
  const preview=await f.service.conversations.prepareHandoff('scope',f.chat.id,draft);assert.equal(preview.fits,true);assert.equal(f.old.stops,0);assert.equal(f.old.replies.length,0);assert.equal(f.next.inputs.length,0);
  f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:randomUUID()});
  const sends=f.pump();await until(async()=>{await sends.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.id!==f.intent.runId&&view.run?.status==='completed');
  assert.equal(f.next.inputs.length,1);assert.equal(f.old.replies.length,0);assert.equal(f.old.stops,1);assert.ok(f.next.inputs[0]!.images.some(image=>image.id===frame.id));assert.match(f.next.inputs[0]!.text,/请核对材料/);
  const history=f.service.conversations.read('scope',f.chat.id).entries.find(entry=>entry.id.startsWith('waiting-handoff-'))!;assert.deepEqual(history.attachments,[original.id]);
  if(media==='video'){assert.match(f.next.inputs[0]!.text,/不含音轨/);assert.match(history.text,/不能据此声称连续观看/);assert.match(history.text,new RegExp(original.id));assert.match(history.text,new RegExp(frame.id));}
 }finally{await f.close();}
});

for(const viaHandoff of [false,true])test('confirmed switch retires old questions atomically, stops once and rejects late native snapshots; handoff='+viaHandoff,async()=>{
 const f=await fixture();try{
  f.old.setUnknown(true);
  const requestId=randomUUID(),draft=viaHandoff?f.queued('continue with this choice'):{expectedRevision:f.chat.revision,connectionId:'next',model:'a',text:'continue with this choice'};
  f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});
  const pump=f.pump();await until(async()=>{await pump.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.status==='completed'&&view.run.id!==f.intent.runId);
  assert.equal(f.old.stops,1);assert.equal(f.next.inputs.length,1);assert.deepEqual(f.old.replies,[]);
  let current=f.service.conversations.read('scope',f.chat.id);
  assert.equal(current.requests.length,0);assert.equal(current.retainedRuns?.find(run=>run.id===f.intent.runId)?.status,'unknown');
  const oldInput=f.old.inputs[0]!,nativeRequest={id:'native-question',kind:'question' as const,title:'late question',questions:[{id:'result',label:'late'}]};
  oldInput.onEvent({type:'request',request:nativeRequest});
  oldInput.onEvent({type:'request',request:{...nativeRequest,id:'different-late-id'}});
  oldInput.onEvent({type:'observation',observation:{status:'waiting',tools:[],executionRef:f.old.contexts.get(oldInput.contextRef.id)!.observation.executionRef,requests:[nativeRequest]}});
  current=f.service.conversations.read('scope',f.chat.id);assert.equal(current.requests.length,0);
  await assert.rejects(f.service.conversations.reply('scope',f.chat.id,f.intent.requestIds[0],{expectedRevision:current.revision,runId:f.intent.runId,participantId:f.intent.participantId,generation:f.intent.generation,answer:{result:'ok'}}),{code:'agent_request_stale'});
  f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:requestId});await pump.pump();
  assert.equal(f.old.stops,1);assert.equal(f.next.inputs.length,1);
 }finally{await f.close();}
});

test('startup preserves an already requested question release without replaying generic stop controls',async()=>{
 const f=await fixture();let resumed:ReturnType<typeof createAgentService>|undefined;
 try{
  f.old.setUnknown(true);f.service.conversations.queueSend('scope',f.chat.id,{...f.queued('continue'),clientRequestId:randomUUID()});
  const pump=f.pump();await until(async()=>{await pump.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.status==='completed'&&view.run.id!==f.intent.runId);
  assert.equal(f.old.stops,1);
  const calls:Array<{runId:string;action:string}>=[];
  resumed=createAgentService({dataRoot:f.root,executors:[f.old.value,f.next.value],resolveWorkspace:()=>({rootPath:f.root}),generationAlive:generation=>generation===f.service.generation,controlSupersededRun:async(_scope,_id,input,action)=>{calls.push({runId:input.runId,action});}});
  await resumed.conversations.recoverInterrupted();
  assert.deepEqual(calls,[]);assert.equal(f.old.stops,1);
  assert.equal(resumed.conversations.read('scope',f.chat.id).requests.length,0);
 }finally{await resumed?.close();await f.close();}
});

test('a revision conflict after stop admission is uncertain and never repeats the native stop',async()=>{
 const f=await fixture();try{
  f.old.setStopError(new AgentServiceError('agent_revision_conflict','native stop callback conflicted',409));
  f.service.conversations.queueSend('scope',f.chat.id,{...f.queued('continue safely'),clientRequestId:randomUUID()});
  const pump=f.pump();await until(async()=>{await pump.pump();return f.service.conversations.read('scope',f.chat.id);},view=>view.run?.status==='completed'&&view.run.id!==f.intent.runId);
  assert.equal(f.old.stops,1);assert.equal(f.next.inputs.length,1);assert.equal(f.old.replies.length,0);
  const current=f.service.conversations.read('scope',f.chat.id);assert.equal(current.requests.length,0);
  assert.equal(current.retainedRuns?.find(run=>run.id===f.intent.runId)?.status,'unknown');
 }finally{await f.close();}
});

test('new-turn abandons answering and starts a fresh context in the same conversation', async () => {
  const f=await fixture();
  try {
    const draft:SendDraft={expectedRevision:f.chat.revision,connectionId:'old',model:'a',text:'跳过这次验收，检查另一个文件',waitingHandoff:{...f.intent,intent:'new-turn'}};
    const preview=f.service.conversations.prepareSend('scope',f.chat.id,draft);
    assert.equal(preview.fits,true);
    assert.match(preview.handoff!.body,/放弃本次卡片回答/);
    assert.doesNotMatch(preview.handoff!.body,/仅解释和调查/);
    assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,{...draft,waitingHandoff:{...draft.waitingHandoff!,answers:[{requestId:f.chat.requests[0].id,answer:{result:'ok'}}]}}),{code:'agent_handoff_invalid'});
    assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,{...draft,connectionId:'next'}),{code:'agent_new_turn_invalid'});
    assert.throws(()=>f.service.conversations.prepareSend('scope',f.chat.id,{...draft,waitingHandoff:{...draft.waitingHandoff!,generation:'stale'}}),{code:'agent_handoff_stale'});
    f.service.conversations.queueSend('scope',f.chat.id,{...draft,clientRequestId:randomUUID()});
    const pump=f.pump();
    await until(async()=>{await pump.pump();return f.old.inputs.length;},count=>count===2);
    const current=await until(()=>f.service.conversations.read('scope',f.chat.id),view=>!view.requests.some(request=>f.intent.requestIds.includes(request.id)));
    assert.equal(current.id,f.chat.id);
    assert.equal(current.requests.some(request=>f.intent.requestIds.includes(request.id)),false);
    assert.equal(current.retainedRuns?.find(run=>run.id===f.intent.runId)?.questionsEndedBy,current.run!.id);
    await until(()=>f.old.stops,count=>count===1);
    assert.notEqual(current.run!.id,f.intent.runId);
    assert.notEqual(f.old.inputs[0].contextRef.id,f.old.inputs[1].contextRef.id);
    assert.deepEqual(f.old.replies,[]);
    assert.match(f.old.inputs[1].text,/未回答；用户放弃本次卡片回答/);
    assert.equal(current.entries.some(entry=>entry.id.startsWith('reply-')),false);
    await pump.pump();assert.equal(f.old.inputs.length,2);
  } finally {await f.close();}
});
