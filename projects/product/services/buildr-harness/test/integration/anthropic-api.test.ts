import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnthropicApiModelProvider } from '../../src/model-access/providers/anthropic-api.ts';

test('Anthropic API keeps validated keys private, paginates and does not replace a good key on failure',async t=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-anthropic-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const requests:Array<{url:string;key:string|null;body:any}>=[];
  const runtime=await createAnthropicApiModelProvider({fetch:async(url,init)=>{
    const target=new URL(String(url)),headers=new Headers(init?.headers),key=headers.get('x-api-key');
    requests.push({url:String(url),key,body:init?.body?JSON.parse(String(init.body)):undefined});
    assert.equal(target.origin,'https://api.anthropic.com');assert.equal(headers.get('anthropic-version'),'2023-06-01');
    if(key==='bad')return Response.json({error:{message:'secret must stay private'}},{status:401});
    if(target.pathname==='/v1/models')return Response.json({data:[{id:target.searchParams.has('after_id')?'claude-second':'claude-first',display_name:'Claude Fixture',max_input_tokens:100000,max_tokens:8192,capabilities:{image_input:{supported:true},effort:{supported:true,low:{supported:true},medium:{supported:true},high:{supported:true},max:{supported:false},xhigh:{supported:false}}}}],has_more:!target.searchParams.has('after_id'),last_id:'cursor'});
    assert.equal(target.pathname,'/v1/messages');
    return Response.json({id:'reply',type:'message',role:'assistant',content:[{type:'text',text:'ok'}],stop_reason:'end_turn'});
  }}).open({accountId:'a',configRoot:root,environment:{}});
  t.after(()=>runtime.close());
  assert.equal((await runtime.inspect()).status,'not-authenticated');
  const observed=await runtime.configure!({apiKey:'good'});
  assert.equal(observed.models.length,2);assert.equal(observed.models[0]?.images,true);assert.equal(observed.models[0]?.contextWindow,100000);assert.deepEqual(observed.models[0]?.reasoningEfforts?.map(e=>e.id),['low','medium','high']);
  assert.ok(!JSON.stringify(observed).includes('good'));
  assert.equal((await stat(join(root,'model-api-key.json'))).mode&0o777,0o600);
  await assert.rejects(runtime.configure!({apiKey:'bad'}));
  assert.equal(JSON.parse(await readFile(join(root,'model-api-key.json'),'utf8')).apiKey,'good');
  const result=await runtime.infer({modelId:'claude-first',body:{stream:false,messages:[{role:'user',content:'hello'}]},signal:new AbortController().signal,context:{accountId:'a',agentId:'claude-code',conversationId:'c',runId:'r',requestId:'i'}});
  assert.equal(result.status,200);assert.equal(requests.at(-1)?.body.model,'claude-first');
  assert.equal(requests.at(-1)?.key,'good');await assert.rejects(runtime.beginLogin(()=>{}),/API Key/);
});
