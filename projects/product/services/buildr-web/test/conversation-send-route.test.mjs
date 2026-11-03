import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationSendRoute, refreshConversationSend } from '../src/features/agent-conversations/conversation-send-route.ts';
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
