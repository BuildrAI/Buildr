import test from 'node:test';
import assert from 'node:assert/strict';
import {ConnectionApplication} from '../../src/application/connection-application.ts';
import {ConversationApplication} from '../../src/application/conversation-application.ts';

test('queued idle release keeps the original owner and explicit global release is not swallowed',async()=>{
 for(const owner of [undefined,{workspaceId:'workspace',id:'conversation'}]){
  let settle!:()=>void;
  const calls:unknown[][]=[];
  const application={releasingIdleSources:new Promise<void>(resolve=>{settle=resolve;}),releaseIdleSources:(...args:unknown[])=>{calls.push(args);return Promise.resolve();}};
  const pending=ConversationApplication.prototype.releaseIdleSources.call(application as unknown as ConversationApplication,owner);
  assert.equal(calls.length,0);
  settle();await pending;
  assert.deepEqual(calls,[[owner]]);
 }
});


test('idle collection skips an unrelated source whose initialization never settles', async()=>{
 const app={sourceReleasePending:new Map(),sourceRuntimes:new Map([['opening',new Promise(()=>{})]]),sourceOwners:new Map(),sourceConnections:new Map(),releasingIdleSources:undefined};
 await ConversationApplication.prototype.releaseIdleSources.call(app as unknown as ConversationApplication);
 assert.equal(app.sourceRuntimes.size,1,'initialization stays owned and is not cancelled');
});


test('gateway release does not wait for an unrelated opening and preserves its ownership',async()=>{
 let closed=false;const runtime={get closed(){return closed;},async close(){closed=true;}};
 const opening=new Promise(()=>{}),app={gatewayRuntimes:new Map([['pending',opening],['ready',Promise.resolve(runtime)]]),gatewayReleases:new Map(),storage:{async released(){}}};
 await ConnectionApplication.prototype.releaseGatewayRuntime.call(app as unknown as ConnectionApplication,runtime as never);
 assert.equal(closed,true);assert.equal(app.gatewayRuntimes.get('pending'),opening);assert.equal(app.gatewayRuntimes.has('ready'),false);
});
