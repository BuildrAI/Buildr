import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationApplication} from '../../src/application/conversation-application.ts';

test('queued idle release preserves retention and explicit global release is not swallowed',async()=>{
 for(const owner of [undefined,{workspaceId:'workspace',id:'conversation'}]){
  for(const preserve of [false,true]){
   let settle!:()=>void;
   const calls:unknown[][]=[];
   const application={releasingIdleSources:new Promise<void>(resolve=>{settle=resolve;}),releaseIdleSources:(...args:unknown[])=>{calls.push(args);return Promise.resolve();}};
   const pending=ConversationApplication.prototype.releaseIdleSources.call(application as unknown as ConversationApplication,owner,true,preserve);
   assert.equal(calls.length,0);
   settle();await pending;
   assert.deepEqual(calls,[[owner,true,preserve]]);
  }
 }
});
