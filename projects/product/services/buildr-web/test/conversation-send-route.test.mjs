import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationSendRoute } from '../src/features/agent-conversations/conversation-send-route.ts';
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
  for(const status of ['starting','stopping','unknown','tools-active'])assert.equal(conversationSendRoute(chat(status),false),'unavailable',status);
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
