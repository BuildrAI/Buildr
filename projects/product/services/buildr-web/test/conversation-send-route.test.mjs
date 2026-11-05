import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationSendRoute, refreshConversationSend, latestConversationSend } from '../src/features/agent-conversations/conversation-send-route.ts';
import { needsConversationObservation, executionLocked } from '../src/features/agent-conversations/conversation-state.ts';
import { createConversationInputAttempts, reconcileConversationInputAttempt } from '../src/features/agent-conversations/conversation-actions.ts';
const chat=(status='running',requests=[])=>({run:{id:'run',participantId:'participant',generation:'generation',status,accepted:true},requests});
const request=kind=>({id:'request',kind,runId:'run',participantId:'participant',generation:'generation'});
test('running input uses the same native round, including approval wait',()=>{
  assert.equal(conversationSendRoute(chat(),false),'supplement');
  assert.equal(conversationSendRoute(chat('waiting-approval',[request('approval')]),false),'supplement');
});
test('questions and changed selections cannot bypass a pending response',()=>{
  for(const changed of [false,true])assert.equal(conversationSendRoute(chat('waiting-question',[request('question')]),changed),'pending');
  assert.equal(conversationSendRoute(chat('waiting-approval',[request('approval')]),true),'pending');
});
test('stopping, starting and uncertain rounds cannot become new sends',()=>{
  for(const status of ['starting','stopping','tools-active'])assert.equal(conversationSendRoute(chat(status),false),'unavailable',status);
});
test('completed rounds continue and changed selections use guarded send',()=>{
  assert.equal(conversationSendRoute(chat('completed'),false),'send');
  assert.equal(conversationSendRoute(chat(),true),'send');
});
test('preview never dispatches an input or releases a pending request',()=>{
  for(const status of ['running','waiting-question','waiting-approval','unknown','completed'])for(const changed of [false,true]){
    assert.equal(conversationSendRoute(chat(status,[request('question')]),changed,true),'preview');
  }
});

test('an accepted unknown round reaches native verification instead of a local refusal',()=>{
  assert.equal(conversationSendRoute(chat('unknown'),false),'supplement');
  const stopped=chat('unknown');stopped.run.stopRequested=true;
  assert.equal(conversationSendRoute(stopped,false),'unavailable');
});
test('released uncertain control admits a new send without disabling observation or answering old decisions',async()=>{
  const released={...chat('unknown'),entries:[],run:{...chat('unknown').run,resourcesReleased:true,executionState:'unknown',tools:[]}};
  assert.equal(conversationSendRoute(released,false),'send');
  assert.equal(executionLocked(released.run),true,'observation and display still regard the outcome as uncertain');
  assert.equal(needsConversationObservation(released),true);
  assert.equal(await refreshConversationSend(released,{observe:async()=>assert.fail('released control cannot accept supplements'),apply:()=>{},isCurrent:()=>true}),released);
  for(const kind of ['question','approval']){
    assert.equal(conversationSendRoute({...released,requests:[request(kind)]},false),'pending');
  }
  assert.equal(conversationSendRoute({...released,run:{...released.run,resourcesReleased:false}},false),'supplement');
  assert.equal(conversationSendRoute(released,false,true),'preview');
});
test('unknown input facts are observed once and keep the exact round identity',async()=>{
  const before={...chat('unknown'),revision:'r1'},next={...chat(),revision:'r2'};let observes=0;const applied=[];
  const result=await refreshConversationSend(before,{observe:async value=>{assert.equal(value,before);observes++;return next;},apply:(...args)=>applied.push(args),isCurrent:()=>true});
  assert.equal(observes,1);assert.equal(result,next);assert.deepEqual(applied,[[next,'r1']]);assert.equal(conversationSendRoute(result,false),'supplement');
});
test('a still uncertain native owner is not assumed ended and new question facts remain authoritative',async()=>{
  for(const next of [chat('unknown'),chat('waiting-question',[request('question')])]){
    const result=await refreshConversationSend(chat('unknown'),{observe:async()=>next,apply:()=>{},isCurrent:()=>true});
    assert.equal(conversationSendRoute(result,false),next.run.status==='unknown'?'supplement':'pending');
  }
});
test('a changed round or owner cannot receive stale supplementary input',async()=>{
  for(const field of ['id','participantId','generation']){
    const next=chat();next.run[field]='different';
    await assert.rejects(refreshConversationSend(chat('unknown'),{observe:async()=>next,apply:()=>{},isCurrent:()=>true}),/原执行身份已变化/);
  }
});
test('selection changes while observation is pending do not dispatch or apply stale facts',async()=>{
  let current=true,applied=0;
  const result=await refreshConversationSend(chat('unknown'),{observe:async()=>{current=false;return chat();},apply:()=>{applied++;},isCurrent:()=>current});
  assert.equal(result,undefined);assert.equal(applied,0);
});
test('known running facts and preview selection do not trigger extra observation',async()=>{
  let count=0;const before=chat();
  assert.equal(await refreshConversationSend(before,{observe:async()=>{count++;return before;},apply:()=>{},isCurrent:()=>true}),before);
  assert.equal(count,0);assert.equal(conversationSendRoute(chat('unknown'),false,true),'preview');
});
test('observation cannot mutate the captured owner identity to pass the check',async()=>{
  const before=chat('unknown');
  await assert.rejects(refreshConversationSend(before,{observe:async()=>{before.run.id='replacement';return before;},apply:()=>{},isCurrent:()=>true}),/原执行身份已变化/);
});

test('sending a previously running draft reads its completed round before routing a new send',async()=>{
  const before={...chat(),id:'chat',workspaceId:'ws',revision:'old'},next={...structuredClone(before),revision:'new',run:{...before.run,status:'completed',resourcesReleased:true}};
  let reads=0,observes=0;const applied=[];
  const current=await latestConversationSend(before,{read:async()=>{reads++;return next;},observe:async()=>{observes++;throw Error('completed round needs no native observation');},apply:(...args)=>applied.push(args),isCurrent:()=>true});
  assert.equal(reads,1);assert.equal(observes,0);assert.deepEqual(applied,[[next,'old']]);assert.equal(conversationSendRoute(current,false),'send');
});

test('unbound drafts use the latest round identity and never borrow another conversation',async()=>{
  const before={...chat('completed'),id:'chat',workspaceId:'ws',revision:'old'};
  const next={...before,revision:'new',run:{...chat().run,id:'latest',participantId:'latest-participant',generation:'latest-generation'}};
  const options={read:async()=>next,observe:async()=>assert.fail('known running state needs no native observation'),apply:()=>{},isCurrent:()=>true};
  assert.equal((await latestConversationSend(before,options)).run.id,'latest');
  assert.equal(conversationSendRoute(await latestConversationSend(before,options),false),'supplement');
  await assert.rejects(latestConversationSend(before,{...options,read:async()=>({...next,id:'another-chat'})}),/对话身份已变化/);
  let selected=true,applied=0;
  assert.equal(await latestConversationSend(before,{...options,read:async()=>{selected=false;return next;},isCurrent:()=>selected,apply:()=>{applied++;}}),undefined);assert.equal(applied,0);
});

test('a definitive rejection frees an old persisted supplement so the draft can start a new round',async()=>{
  const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const before={...chat(),id:'chat',workspaceId:'ws'},attempts=createConversationInputAttempts(storage);
  const images=[{id:'image',name:'a.png',mimeType:'image/png',size:8,revision:'image-v1'}];
  const original=attempts.begin(before,'draft',images),reloaded=createConversationInputAttempts(storage),pending=reloaded.read(before);
  const result=await reconcileConversationInputAttempt(pending,{reconcile:async request=>{assert.deepEqual(request,original);throw Object.assign(Error('stale'),{status:409,code:'agent_supplement_stale'});},finish:id=>reloaded.finish(before,id),isCurrent:()=>true});
  assert.equal(result.delivery,'rejected');assert.equal(reloaded.read(before),undefined);assert.deepEqual(pending.images,images);
  assert.equal(conversationSendRoute({...before,run:{...before.run,status:'completed',resourcesReleased:true}},false),'send');
});

test('unknown receipts retain the original identity across round changes and never free a retry',async()=>{
  const before={...chat(),id:'chat',workspaceId:'ws'},attempts=createConversationInputAttempts(),original=attempts.begin(before,'draft',[]);
  let finished=0;
  const options={reconcile:async()=>({delivery:'unknown',conversation:{...before,run:{...before.run,id:'new-run'}}}),finish:()=>{finished++;},isCurrent:()=>true};
  assert.equal((await reconcileConversationInputAttempt(original,options)).delivery,'unknown');assert.equal(finished,0);assert.equal(attempts.read(before).clientRequestId,original.clientRequestId);
  for(const failure of [Error('response lost'),Object.assign(Error('unknown'),{status:503,code:'agent_operation_result_unknown'}),Object.assign(Error('conflict'),{status:409,code:'agent_request_conflict'})])await assert.rejects(reconcileConversationInputAttempt(original,{...options,reconcile:async()=>{throw failure;}}),failure);
  assert.equal(finished,0);
});

test('accepted supplements finish their exact original retry without sending a second request',async()=>{
  const before={...chat(),id:'chat',workspaceId:'ws'},attempts=createConversationInputAttempts(),original=attempts.begin(before,'draft',[]);let requests=0;
  const result=await reconcileConversationInputAttempt(original,{reconcile:async attempt=>{requests++;assert.equal(attempt.clientRequestId,original.clientRequestId);return {delivery:'accepted',conversation:before};},finish:id=>attempts.finish(before,id),isCurrent:()=>true});
  assert.equal(result.delivery,'accepted');assert.equal(requests,1);assert.equal(attempts.read(before),undefined);
});
