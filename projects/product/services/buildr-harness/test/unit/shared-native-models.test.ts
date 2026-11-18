import test from 'node:test';

import assert from 'node:assert/strict';

import { join } from 'node:path';

import { createQoderModelProvider, unwrapQoderStream } from '../../src/model-access/providers/qoder.ts';
import { translateResponse } from '../../src/model-access/protocols.ts';
import { transientFailure } from '../../src/domain/transient-failure.ts';

const signal=()=>AbortSignal.timeout(3000);

test('Qoder preserves quota errors from HTTP and streaming envelopes instead of retryable disconnects',async()=>{
 for(const mode of ['http','envelope','body']){
  const streaming=mode!=='http';
  const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',async request(path){
   if(path==='/models')return Response.json({chat:[{key:'model',display_name:'Model',enable:true}]});
   if(path==='/usage')return Response.json({userQuota:{total:3000,remaining:0.01}});
   const error={code:'insufficient_quota',message:'credits exhausted; Bearer private-token'};
   return streaming?sse([mode==='body'?{statusCodeValue:429,body:JSON.stringify({error})}:{statusCodeValue:429,error}]):Response.json({error},{status:429});
  }}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
  try{
   assert.equal((await runtime.inspect()).quota?.remainingPercent,0.1,'a positive balance must never round down to exhausted');
   const response=await runtime.infer({modelId:'model',signal:signal(),context:{accountId:'q',agentId:'codex',conversationId:'c',runId:'r',requestId:'i'},body:{stream:streaming,messages:[]}});
   if(streaming)await assert.rejects(response.text(),(error:any)=>{assert.equal(error.code,'model_quota_exhausted');assert.equal(transientFailure(error.message),false);assert.doesNotMatch(error.message,/private-token/);return true;});
   else {assert.equal(response.status,429);const body=await response.json();assert.equal(body.error.code,'model_quota_exhausted');assert.equal(transientFailure(body.error.message),false);assert.doesNotMatch(JSON.stringify(body),/private-token/);}
  }finally{await runtime.close();}
 }
});

function sse(frames:unknown[],done:boolean|'event'=true){return new Response(frames.map(frame=>'data: '+(typeof frame==='string'?frame:JSON.stringify(frame))+'\n\n').join('')+(done==='event'?'event:finish\ndata:{"firstTokenDuration":1,"totalDuration":2,"serverDuration":1}\n\n':done?'data: [DONE]\n\n':''));}

test('Qoder loads its catalog on first inference without changing the native account',async()=>{
 const paths:string[]=[],account={status:'ready' as const,label:'Qoder account'},original=structuredClone(account);
 const runtime=await createQoderModelProvider({inspect:async()=>account,identity:async()=>'user',async request(path){paths.push(path);if(path==='/models')return Response.json({chat:[{key:'model',display_name:'Model',enable:true}]});if(path==='/usage')return Response.json({});assert.equal(path,'/chat');return sse([{statusCodeValue:200,body:JSON.stringify({choices:[{delta:{content:'catalog ready'},finish_reason:'stop'}]})}]);}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 const input={modelId:'model',signal:signal(),context:{accountId:'q',agentId:'dsh',conversationId:'c',runId:'r',requestId:'i'},body:{stream:false,messages:[{role:'user',content:'hello'}]}};
 try{
  const {infer}=runtime,first=await infer(input);assert.equal(first.status,200);assert.equal((await first.json()).choices[0].message.content,'catalog ready');assert.deepEqual(paths,['/models','/usage','/chat']);
  await(await infer(input)).json();assert.deepEqual(paths,['/models','/usage','/chat','/chat']);
  const missing=await infer({...input,modelId:'missing'});assert.equal(missing.status,404);assert.equal((await missing.json()).error.code,'model_not_available');assert.equal(paths.filter(path=>path==='/chat').length,2);assert.deepEqual(account,original);
 }finally{await runtime.close();}
});

test('Qoder preserves native tool fragments and tool results instead of parsing prompt-generated JSON',async()=>{
 const inputs:any[]=[];const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',async request(path,init){if(path==='/models')return Response.json({chat:[{key:'model',display_name:'Model',enable:true}]});inputs.push(JSON.parse(String(init?.body)));return sse([{statusCodeValue:200,body:JSON.stringify({id:'r',choices:[{delta:{tool_calls:[{index:0,id:'t',function:{name:'read',arguments:'{"p":'}}]},finish_reason:null}]})},{statusCodeValue:200,body:JSON.stringify({id:'r',choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"a"}'}}]},finish_reason:'tool_calls'}]})}]);}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 await runtime.inspect();const input={modelId:'model',signal:signal(),context:{accountId:'q',agentId:'codex',conversationId:'c',runId:'r',requestId:'i'},body:{stream:false,messages:[{role:'developer',content:'instructions'},{role:'user',content:'read'}],tools:[{type:'function',function:{name:'read',parameters:{type:'object'}}}]}};
 const result=await(await runtime.infer(input)).json();assert.equal(result.choices[0].message.tool_calls[0].function.arguments,'{"p":"a"}');assert.deepEqual(inputs[0].tools,input.body.tools);assert.equal(inputs[0].messages[0].role,'system');
 await runtime.infer({...input,body:{...input.body,messages:[...input.body.messages,result.choices[0].message,{role:'tool',content:'actual result',tool_call_id:'t'}]}});assert.equal(inputs[1].messages.at(-1).content,'actual result');await runtime.close();
});

test('Qoder completes an explicit MiniMax tool stream without a finish reason',async()=>{
 const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',async request(path){if(path==='/models')return Response.json({chat:[{key:'mmodel',display_name:'MiniMax',enable:true}]});if(path==='/usage')return Response.json({});return sse([{statusCodeValue:200,body:JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'call-bash',function:{name:'bash',arguments:'{"command":"pwd"}'}}]},finish_reason:null}]})},{statusCodeValue:200,body:JSON.stringify({usage:{prompt_tokens:10,completion_tokens:5}})}]);}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 try{
  await runtime.inspect();const upstream=await runtime.infer({modelId:'mmodel',signal:signal(),context:{accountId:'q',agentId:'dsh',conversationId:'c',runId:'r',requestId:'i'},body:{stream:true,messages:[{role:'user',content:'check cwd'}],tools:[{type:'function',function:{name:'bash',parameters:{type:'object'}}}]}});
  const response=await translateResponse(upstream,'chat-completions','responses',{model:'mmodel',stream:true,request:{tools:[{type:'function',name:'bash',parameters:{type:'object'}}]},opaque:{encode:JSON.stringify,decode:JSON.parse},signal:signal()});
  const text=await response.text();assert.doesNotMatch(text,/response\.failed/);assert.match(text,/response\.completed/);assert.match(text,/"name":"bash"/);assert.match(text,/"arguments":"\{\\"command\\":\\"pwd\\"\}"/);
 }finally{await runtime.close();}
});

test('Qoder treats the native finish event as a complete MiniMax tool stream',async()=>{
 const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',async request(path){if(path==='/models')return Response.json({chat:[{key:'mmodel',display_name:'MiniMax',enable:true}]});if(path==='/usage')return Response.json({});return sse([{statusCodeValue:200,body:JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'call-bash',function:{name:'bash',arguments:'{"command":"pwd"}'}}]},finish_reason:'tool_calls'}]})}], 'event');}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 try{
  await runtime.inspect();const upstream=await runtime.infer({modelId:'mmodel',signal:signal(),context:{accountId:'q',agentId:'dsh',conversationId:'c',runId:'r',requestId:'i'},body:{stream:true,messages:[{role:'user',content:'check cwd'}],tools:[{type:'function',function:{name:'bash',parameters:{type:'object'}}}]}});
  const response=await translateResponse(upstream,'chat-completions','responses',{model:'mmodel',stream:true,request:{tools:[{type:'function',name:'bash',parameters:{type:'object'}}]},opaque:{encode:JSON.stringify,decode:JSON.parse},signal:signal()});
  const text=await response.text();assert.doesNotMatch(text,/response\.failed/);assert.match(text,/response\.completed/);assert.match(text,/"name":"bash"/);assert.match(text,/"arguments":"\{\\"command\\":\\"pwd\\"\}"/);
 }finally{await runtime.close();}
});

test('Qoder continues past finish metadata for direct stream consumers',async()=>{
 const stream=unwrapQoderStream(sse([{statusCodeValue:200,body:JSON.stringify({choices:[{delta:{content:'done'},finish_reason:'stop'}]})}], 'event'),AbortSignal.timeout(50));
 const text=await new Response(stream).text();assert.match(text,/"finish_reason":"stop"/);assert.match(text,/data: \[DONE\]/);
});

test('Qoder normalizes null assistant tool-call content without changing history or caller input',async()=>{
 const inputs:any[]=[];const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',async request(path,init){if(path==='/models')return Response.json({chat:[{key:'model',display_name:'Model',enable:true}]});inputs.push(JSON.parse(String(init?.body)));return sse([{statusCodeValue:200,body:JSON.stringify({choices:[{delta:{content:'checked'},finish_reason:'stop'}]})}]);}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 const messages:any[]=[
  {role:'system',content:'Keep the supplied permissions.'},
  {role:'user',content:'Read the file.'},
  {role:'assistant',content:null,reasoning_content:'existing thought',reasoning_signature:'existing signature',tool_calls:[{id:'call-read',type:'function',function:{name:'exec_command',arguments:'{"cmd":"cat probe.txt"}'}}]},
  {role:'tool',tool_call_id:'call-read',content:'actual file result'},
  {role:'assistant',content:'Keep this text.',tool_calls:[{id:'call-check',type:'function',function:{name:'exec_command',arguments:'{"cmd":"pwd"}'}}]},
  {role:'tool',tool_call_id:'call-check',content:'actual directory'},
  {role:'assistant',content:null},
 ];
 const original=structuredClone(messages),expected=structuredClone(messages);expected[2].content='';
 try{
  await runtime.inspect();await runtime.infer({modelId:'model',signal:signal(),context:{accountId:'q',agentId:'codex',conversationId:'c',runId:'r',requestId:'i'},body:{stream:false,messages}});
  assert.deepEqual(inputs[0].messages,expected);assert.deepEqual(messages,original);
 }finally{await runtime.close();}
});

test('Qoder terminal truncation and upstream envelope errors cannot become completed responses',async()=>{
 for(const response of [sse([{body:JSON.stringify({choices:[{delta:{content:'partial'}}]})}],false),sse([{statusCodeValue:500,body:'error'}])])await assert.rejects(new Response(unwrapQoderStream(response,signal())).text(),/failed/);
 const controller=new AbortController();controller.abort();await assert.rejects(new Response(unwrapQoderStream(sse([]),controller.signal)).text(),/cancelled/);
});
