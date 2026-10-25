import {effectiveModel} from '../../src/model-access/model-preferences.ts';
import test from 'node:test';

import assert from 'node:assert/strict';

import { modelOfferings, buildDevinRequest } from '../../src/model-access/providers/devin-wire.ts';

test('Devin groups family/depth/speed using only real configurations and keeps Fusion separate',()=>{
 const row=(id:string,label:string,isDefault=false,family='gpt-family')=>({id,label,isDefault,family,images:false,disabled:false,contextWindow:258000});
 const grouped=modelOfferings([row('gpt-family-medium','GPT Family Medium Thinking',true),row('gpt-family-low','GPT Family Low Thinking'),row('gpt-family-high-priority','GPT Family High Thinking Fast'),row('gpt-family-low-priority','GPT Family Low Thinking Fast'),row('fusion-family-medium-swe-high','Fusion (GPT + SWE)',false,'fusion')]);
 assert.equal(grouped.length,2);const model=grouped[0];assert.equal(model.label,'GPT Family');assert.equal(grouped[1].kind,'combination');assert.equal(model.serviceTiers?.length,2);
 const fast=model.serviceTiers!.find(tier=>tier.id.startsWith('fast:'))!;assert.deepEqual(fast.reasoningEfforts?.map(option=>option.id),['low','high']);
 const input={body:{messages:[{role:'user',content:'hello'}],service_tier:fast.id,reasoning_effort:'high'},modelId:model.id,signal:new AbortController().signal,context:{accountId:'a',agentId:'dsh',conversationId:'c',runId:'r',requestId:'i'}};
 assert.equal(buildDevinRequest(input,model,'private').model,'gpt-family-high-priority');assert.throws(()=>buildDevinRequest({...input,body:{...input.body,reasoning_effort:'medium'}},model,'private'),/unsupported/);
 assert.throws(()=>buildDevinRequest({...input,body:{...input.body,service_tier:'fake'}},model,'private'),/unsupported/);
});

const basic={id:'m',label:'Model',contextWindow:258000,images:false,tools:true};
test('a configured default window is separate from the supported maximum',()=>{
 const model={...basic,contextWindow:200000,reportedContextWindow:1000000};
 assert.equal(effectiveModel(model,undefined).contextWindow,200000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:512000}).contextWindow,512000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:2000000}).contextWindow,1000000);
});
