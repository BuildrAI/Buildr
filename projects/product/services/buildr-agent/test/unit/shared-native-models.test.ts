import test from 'node:test';

import assert from 'node:assert/strict';

import { join } from 'node:path';

import { createQoderModelProvider, unwrapQoderStream } from '../../src/model-access/providers/qoder.ts';

const signal=()=>AbortSignal.timeout(3000);

function sse(frames:unknown[],done=true){return new Response(frames.map(frame=>'data: '+(typeof frame==='string'?frame:JSON.stringify(frame))+'\n\n').join('')+(done?'data: [DONE]\n\n':''));}

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
