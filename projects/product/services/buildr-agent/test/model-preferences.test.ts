import {effectiveModel} from '../src/model-access/model-preferences.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createModelAccess} from '../src/model-access/application.ts';
import type {ModelOffering,ModelProvider} from '../src/model-access/contracts.ts';
import {modelOfferings,buildDevinRequest} from '../src/model-access/providers/devin-wire.ts';
const basic:ModelOffering={id:'m',label:'Model',contextWindow:258000,images:false,tools:true};
function provider(read:()=>ModelOffering[]):ModelProvider{return{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:read()}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>Response.json({choices:[{message:{role:'assistant',content:'ok'},finish_reason:'stop'}]}),close:async()=>{}};}};}
test('preferences persist, keep new models disabled, validate version/capacity, and isolate accepted leases',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-preferences-'));let models=[basic];const source=provider(()=>models);let app=createModelAccess({root,providers:[source]});
 try{
  const added=await app.accounts.add({provider:'fixture'}),checked=await app.accounts.check(added.id);
  assert.equal(checked.models[0].enabled,false);await assert.rejects(app.leases.create({accountId:added.id,modelId:'m',conversationId:'c',agentId:'dsh',runId:'r'}),/已停用/);
  const enabled=await app.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'m',enabled:true,contextWindow:128000}]});
  assert.equal(enabled.models[0].contextWindow,128000);assert.equal(enabled.models[0].reportedContextWindow,258000);
  await assert.rejects(app.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'m',enabled:false}]}),/已变化/);
  for(const value of [0,-1,1.5,258001,10000001])await assert.rejects(app.accounts.preferences(added.id,{expectedRevision:enabled.revision,models:[{id:'m',contextWindow:value}]}),/上下文/);
  const lease=await app.leases.create({accountId:added.id,modelId:'m',conversationId:'c',agentId:'dsh',runId:'r'});assert.equal(lease.offering.contextWindow,128000);
  const disabled=await app.accounts.preferences(added.id,{expectedRevision:enabled.revision,models:[{id:'m',enabled:false}]});
  assert.equal((await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,messages:[{role:'user',content:'continue accepted turn'}]})})).status,200);
  await assert.rejects(app.leases.create({accountId:added.id,modelId:'m',conversationId:'new',agentId:'dsh',runId:'r'}),/已停用/);
  await app.close();app=createModelAccess({root,providers:[source]});models=[{...basic,contextWindow:64000},{...basic,id:'new'}];
  const refreshed=await app.accounts.check(added.id);assert.equal(refreshed.models[0].enabled,false);assert.equal(refreshed.models[0].contextWindow,64000);assert.equal(refreshed.models[0].contextWindowOverride,128000);assert.equal(refreshed.models[1].enabled,false);
  const reset=await app.accounts.preferences(added.id,{expectedRevision:refreshed.revision,models:[{id:'m',contextWindow:null}]});assert.equal(reset.models[0].contextWindowOverride,undefined);assert.equal(reset.models[0].contextWindow,64000);assert.notEqual(reset.revision,disabled.revision);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test('legacy ordinary models keep enabled intent while combination defaults are off',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-legacy-models-'));
 await writeFile(join(root,'accounts.json'),JSON.stringify({version:1,accounts:[{id:'legacy',identity:'old',provider:'fixture',label:'old',revision:'old',enabled:true,status:'ready',models:[basic,{...basic,id:'fusion-combo'}]}]}));
 const app=createModelAccess({root,providers:[provider(()=>[basic])]});try{const view=app.accounts.read('legacy');assert.equal(view.models[0].enabled,true);assert.equal(view.models[1].enabled,false);}finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test('Devin groups family/depth/speed using only real configurations and keeps Fusion separate',()=>{
 const row=(id:string,label:string,isDefault=false,family='gpt-family')=>({id,label,isDefault,family,images:false,disabled:false,contextWindow:258000});
 const grouped=modelOfferings([row('gpt-family-medium','GPT Family Medium Thinking',true),row('gpt-family-low','GPT Family Low Thinking'),row('gpt-family-high-priority','GPT Family High Thinking Fast'),row('gpt-family-low-priority','GPT Family Low Thinking Fast'),row('fusion-family-medium-swe-high','Fusion (GPT + SWE)',false,'fusion')]);
 assert.equal(grouped.length,2);const model=grouped[0];assert.equal(model.label,'GPT Family');assert.equal(grouped[1].kind,'combination');assert.equal(model.serviceTiers?.length,2);
 const fast=model.serviceTiers!.find(tier=>tier.id.startsWith('fast:'))!;assert.deepEqual(fast.reasoningEfforts?.map(option=>option.id),['low','high']);
 const input={body:{messages:[{role:'user',content:'hello'}],service_tier:fast.id,reasoning_effort:'high'},modelId:model.id,signal:new AbortController().signal,context:{accountId:'a',agentId:'dsh',conversationId:'c',runId:'r',requestId:'i'}};
 assert.equal(buildDevinRequest(input,model,'private').model,'gpt-family-high-priority');assert.throws(()=>buildDevinRequest({...input,body:{...input.body,reasoning_effort:'medium'}},model,'private'),/unsupported/);
 assert.throws(()=>buildDevinRequest({...input,body:{...input.body,service_tier:'fake'}},model,'private'),/unsupported/);
});

test('service tiers bind exact supported capacity and cannot be changed by consumer payloads',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-tier-binding-'));const sent:unknown[]=[];
 const source=provider(()=>[{...basic,defaultServiceTier:'standard',serviceTiers:[{id:'standard',label:'Standard',contextWindow:258000},{id:'fast',label:'Fast',contextWindow:128000}]}]);
 const original=source.open;source.open=async input=>({...await original(input),infer:async value=>{sent.push(value.body.service_tier);return Response.json({choices:[{message:{role:'assistant',content:'ok'},finish_reason:'stop'}]});}});
 const app=createModelAccess({root,providers:[source]});try{
 const added=await app.accounts.add({provider:'fixture'}),checked=await app.accounts.check(added.id);await app.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'m',enabled:true}]});
 const input={accountId:added.id,modelId:'m',conversationId:'c',agentId:'codex',runId:'r'};
 const standard=await app.leases.create(input),fast=await app.leases.create({...input,serviceTier:'fast'});assert.notEqual(standard.identity,fast.identity);assert.equal(fast.offering.contextWindow,128000);
 await assert.rejects(app.leases.create({...input,serviceTier:'missing'}),/档位/);
 const response=await fetch(fast.baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+fast.apiKey,'content-type':'application/json'},body:JSON.stringify({model:fast.model,messages:[],service_tier:'standard'})});assert.equal(response.status,200);assert.deepEqual(sent,['fast']);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test('failed quota observations retain the timestamp and windows of the last successful observation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-quota-stale-'));let available=true;
 const source=provider(()=>[basic]),original=source.open;source.open=async input=>({...await original(input),inspect:async()=>({status:'ready',models:[basic],quota:{available,observedAt:available?'2026-10-25T00:00:00Z':'2026-10-25T01:00:00Z',...(available?{windows:[{id:'weekly',label:'Week',remainingPercent:93}]}:{})}})});
 const app=createModelAccess({root,providers:[source]});try{const account=await app.accounts.add({provider:'fixture'});await app.accounts.check(account.id);available=false;const view=await app.accounts.check(account.id);assert.equal(view.status,'ready');assert.equal(view.quota?.stale,true);assert.equal(view.quota?.observedAt,'2026-10-25T00:00:00Z');assert.equal(view.quota?.windows?.[0].remainingPercent,93);}finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('a configured default window is separate from the supported maximum',()=>{
 const model={...basic,contextWindow:200000,reportedContextWindow:1000000};
 assert.equal(effectiveModel(model,undefined).contextWindow,200000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:512000}).contextWindow,512000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:2000000}).contextWindow,1000000);
});
