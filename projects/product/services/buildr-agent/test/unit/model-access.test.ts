import test from 'node:test';

import assert from 'node:assert/strict';

import { translateRequest, type OpaqueReasoning } from '../../src/model-access/protocols.ts';
import { modelQuotaFailure } from '../../src/model-access/quota.ts';
import { upstreamFailure } from '../../src/model-access/errors.ts';

import type { ProtocolJson } from '../../src/model-access/contracts.ts';

const model={id:'source-model',label:'真实来源模型',images:true,tools:true,contextWindow:32000};

const noOpaque:OpaqueReasoning={encode(value){return JSON.stringify(value);},decode(value){return JSON.parse(value);}};

test('only a fresh exhausted window blocks paid work; stale quota, free models and throttling remain distinct',()=>{
 const now=Date.now(),account={label:'Qoder',provider:'native-qoder',quota:{available:true,observedAt:new Date(now).toISOString(),remainingPercent:0}};
 assert.equal(modelQuotaFailure(account,{creditFactor:1},now)?.code,'model_quota_exhausted');
 assert.equal(modelQuotaFailure(account,{creditFactor:0},now),undefined);
 for(const quota of [{...account.quota,available:false},{...account.quota,stale:true},{...account.quota,observedAt:new Date(now-61_000).toISOString()},{...account.quota,remainingPercent:0.1}])assert.equal(modelQuotaFailure({...account,quota},undefined,now),undefined);
 assert.equal(upstreamFailure({code:'insufficient_quota',message:'quota exhausted; Bearer private-token'},429).code,'model_quota_exhausted');
 assert.doesNotMatch(upstreamFailure({code:'insufficient_quota',message:'quota exhausted; Bearer private-token'},429).message,/private-token/);
 assert.equal(upstreamFailure({code:'rate_limit_exceeded',message:'requests per minute exceeded'},429).code,'rate_limit_exceeded');
});

test('Messages preserves system authority, tool identity and images when converted to Responses',()=>{
  const converted=translateRequest({model:'m',system:[{type:'text',text:'system rule'}],messages:[{role:'user',content:[{type:'text',text:'look'},{type:'image',source:{type:'base64',media_type:'image/png',data:'abc'}}]},{role:'assistant',content:[{type:'tool_use',id:'t1',name:'read',input:{path:'a'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'value'}]}],tools:[{name:'read',input_schema:{type:'object'}}],max_tokens:42},'anthropic-messages','responses',noOpaque);
  const input=converted.input as ProtocolJson[];assert.equal(input[0].role,'system');assert.equal(input[2].call_id,'t1');assert.equal(input[3].call_id,'t1');assert.equal(converted.max_output_tokens,42);assert.equal((input[1].content as ProtocolJson[])[1].image_url,'data:image/png;base64,abc');
});

test('Responses keeps one assistant tool turn together, including separately replayed reasoning and signature',()=>{
  const thought=(thinking:string,signature?:string)=>({type:'reasoning',encrypted_content:noOpaque.encode({type:'thinking',thinking,...(signature?{signature}:{})})});
  const text=(role:string,value:string)=>({type:'message',role,content:[{type:role==='assistant'?'output_text':'input_text',text:value}]});
  const call=(call_id:string)=>({type:'function_call',call_id,name:'read',arguments:JSON.stringify({path:call_id})});
  const result=(call_id:string)=>({type:'function_call_output',call_id,output:'result '+call_id});
  const converted=translateRequest({input:[
    text('user','inspect'),text('assistant','reading'),call('a'),call('b'),thought('first thought'),thought('','first-signature'),result('a'),result('b'),
    thought('second thought','second-signature'),text('assistant','checking'),call('c'),result('c'),text('user','continue'),text('assistant','done'),
  ]},'responses','chat-completions',noOpaque);
  const messages=converted.messages as ProtocolJson[];
  assert.deepEqual(messages.map(message=>message.role),['user','assistant','tool','tool','assistant','tool','user','assistant']);
  assert.deepEqual(messages[1],{role:'assistant',content:'reading',tool_calls:['a','b'].map(id=>({id,type:'function',function:{name:'read',arguments:JSON.stringify({path:id})}})),reasoning_content:'first thought',reasoning_signature:'first-signature'});
  assert.equal(messages[4].reasoning_content,'second thought');assert.equal(messages[4].reasoning_signature,'second-signature');
  assert.deepEqual(messages.filter(message=>message.role==='tool').map(message=>[message.tool_call_id,message.content]),[['a','result a'],['b','result b'],['c','result c']]);
});

test('Chat conversion rejects multiple independent reasoning signatures instead of dropping or joining them',()=>{
  const input=['first','second'].map(signature=>({type:'reasoning',encrypted_content:noOpaque.encode({type:'thinking',thinking:signature,signature})}));
  assert.throws(()=>translateRequest({input},'responses','chat-completions',noOpaque),{code:'model_reasoning_unsupported'});
});
