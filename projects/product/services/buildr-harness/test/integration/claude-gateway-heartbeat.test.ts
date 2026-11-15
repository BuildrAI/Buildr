import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelAccess } from '../../src/model-access/application.ts';
import { bounded } from '../../src/executors/native-process.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

test('Claude gateway sends bounded SSE keepalives during a silent model pause and ends cleanly',async t=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-claude-ping-'));
  let finish:()=>void=()=>{};
  const source:ModelProvider={id:'fixture',label:'Fixture',async open(){return{
    protocol:'anthropic-messages',
    async inspect(){return{status:'ready',models:[{id:'model',label:'Model',images:false,tools:true}]};},
    async beginLogin(){},async cancelLogin(){},async close(){},
    async infer(){return new Response(new ReadableStream({
      start(controller){
        const encoder=new TextEncoder();
        controller.enqueue(encoder.encode('event: message_start\ndata: {"type":"message_start"}\n\n'));
        finish=()=>{try{controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));controller.close();}catch{/* Already cancelled. */}};
      },
    }),{headers:{'content-type':'text/event-stream'}});},
  };}};
  const access=createModelAccess({root,providers:[source]});
  try{
    const added=await access.accounts.add({provider:'fixture'}),checked=await access.accounts.check(added.id);
    await access.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true}]});
    const lease=await access.leases.create({accountId:added.id,modelId:'model',agentId:'claude-code',conversationId:'c',runId:'r'});
    t.mock.timers.enable({apis:['setInterval']});
    const response=await fetch(lease.baseUrl+'/messages',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,stream:true,messages:[]})});
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    assert.match(decoder.decode((await reader.read()).value),/message_start/);
    t.mock.timers.tick(10000);
    assert.match(decoder.decode((await bounded(reader.read(),1000)).value),/"type":"ping"/);
    finish();
    while(!(await reader.read()).done){}
    // A finished response has no keepalive write even when the mock clock advances.
    t.mock.timers.tick(10000);
    reader.releaseLock();
  }finally{finish();t.mock.timers.reset();await access.close();await rm(root,{recursive:true,force:true});}
});

test('Claude gateway never injects a keepalive into an incomplete SSE frame',async t=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-claude-split-'));
  let finish:()=>void=()=>{};
  const prefix='event: message_start\ndata: {"type":',suffix='"message_start"}\n\n';
  const source:ModelProvider={id:'fixture',label:'Fixture',async open(){return{
    protocol:'anthropic-messages',
    async inspect(){return{status:'ready',models:[{id:'model',label:'Model',images:false,tools:true}]};},
    async beginLogin(){},async cancelLogin(){},async close(){},
    async infer(){return new Response(new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode(prefix));
      finish=()=>{try{controller.enqueue(new TextEncoder().encode(suffix));controller.close();}catch{}};
    }}),{headers:{'content-type':'text/event-stream'}});},
  };}};
  const access=createModelAccess({root,providers:[source]});
  try{
    const added=await access.accounts.add({provider:'fixture'}),checked=await access.accounts.check(added.id);
    await access.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true}]});
    const lease=await access.leases.create({accountId:added.id,modelId:'model',agentId:'claude-code',conversationId:'c',runId:'r'});
    t.mock.timers.enable({apis:['setInterval']});
    const response=await fetch(lease.baseUrl+'/messages',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,stream:true,messages:[]})});
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    let text=decoder.decode((await reader.read()).value);assert.equal(text,prefix);
    t.mock.timers.tick(10000);finish();
    for(;;){const chunk=await bounded(reader.read(),1000);if(chunk.done)break;text+=decoder.decode(chunk.value);}
    assert.equal(text,prefix+suffix);reader.releaseLock();
  }finally{finish();t.mock.timers.reset();await access.close();await rm(root,{recursive:true,force:true});}
});
