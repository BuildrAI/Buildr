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
test('Devin adapts only exact known Codex descriptions and preserves tools, parameters and permission text',()=>{
 const model=modelOfferings([{id:'swe-2-high',label:'SWE-2 High Thinking',isDefault:true,family:'swe-2',images:false,disabled:false,contextWindow:128000}])[0];
 const descriptions=['Runs a command in a PTY, returning output or a session ID for ongoing interaction.','Writes characters to an existing unified exec session and returns recent output.'];
 const parameters={type:'object',properties:{session_id:{type:'number',description:'Identifier of the running session.'}},required:['session_id'],additionalProperties:false};
 const tools=['exec_command','write_stdin','custom_shell'].map((name,index)=>({type:'function',function:{name,description:descriptions[index%2],parameters,strict:false}}));
 const body={messages:[{role:'developer',content:'Keep native permission instructions unchanged.'},{role:'user',content:'read probe.txt'}],reasoning_effort:'high',tools};const before=structuredClone(body);
 const context={accountId:'a',agentId:'codex',conversationId:'c',runId:'r',requestId:'i'},input={body,modelId:model.id,signal:new AbortController().signal,context};
 const result=buildDevinRequest(input,model,'private');
 assert.deepEqual(result.tools.map(tool=>tool.name),['exec_command','write_stdin','custom_shell']);assert.equal(result.tools[0].description,'Run the specified command, optionally using a PTY. Return output and the session identifier when the command remains active.');assert.equal(result.tools[1].description,'Send characters to an existing command session, or poll its available output when chars is empty.');assert.equal(result.tools[2].description,descriptions[0]);
 assert.ok(result.tools.every(tool=>tool.parameters===JSON.stringify(parameters)&&tool.strict===false));assert.equal(result.system,'Keep native permission instructions unchanged.');assert.deepEqual(body,before);
 assert.deepEqual(buildDevinRequest({...input,context:{...context,agentId:'dsh'}},model,'private').tools.map(tool=>tool.description),tools.map(tool=>tool.function.description));
 tools[0].function.description='Custom command semantics';assert.equal(buildDevinRequest(input,model,'private').tools[0].description,'Custom command semantics');
});
test('a configured default window is separate from the supported maximum',()=>{
 const model={...basic,contextWindow:200000,reportedContextWindow:1000000};
 assert.equal(effectiveModel(model,undefined).contextWindow,200000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:512000}).contextWindow,512000);
 assert.equal(effectiveModel(model,{enabled:true,contextWindow:2000000}).contextWindow,1000000);
});
