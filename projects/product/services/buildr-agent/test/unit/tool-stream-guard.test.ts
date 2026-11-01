import test from 'node:test';
import assert from 'node:assert/strict';
import {guardToolArgumentStream,MAX_TOOL_ARGUMENT_BYTES,MAX_TOOL_ARGUMENT_WHITESPACE} from '../../src/model-access/tool-stream-guard.ts';
import type {ModelProtocol} from '../../src/model-access/contracts.ts';
const encoder=new TextEncoder();
const frame=(event:unknown)=>`data: ${JSON.stringify(event)}\n\n`;
function delta(protocol:ModelProtocol,value:string,index=0):unknown {
 if(protocol==='responses')return{type:'response.function_call_arguments.delta',item_id:'call-'+index,delta:value};
 if(protocol==='anthropic-messages')return{type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:value}};
 return{choices:[{index:0,delta:{tool_calls:[{index,function:{arguments:value}}]}}]};
}
for(const protocol of ['responses','anthropic-messages','chat-completions'] as const){
 test(protocol+' stops a real fragmented whitespace flood before it reaches the executor and cancels upstream',async()=>{
  let pulls=0,cancelled=false,code='';
  const source=new ReadableStream<Uint8Array>({pull(c){pulls++;if(pulls>1000){c.close();return;}c.enqueue(encoder.encode(frame(delta(protocol,' '.repeat(128)))));},cancel(){cancelled=true;}},{highWaterMark:0});
  const guarded=guardToolArgumentStream(new Response(source,{headers:{'content-type':'text/event-stream'}}),protocol,error=>{code=error.code;});
  const text=await guarded.text();assert.equal(code,'model_tool_arguments_stalled');assert.ok(pulls<1000);assert.equal(cancelled,true);
  assert.ok(text.includes('model_tool_arguments_stalled'));assert.ok(text.length<MAX_TOOL_ARGUMENT_WHITESPACE*5);assert.ok(!text.includes('response.completed'));
 });
 test(protocol+' preserves UTF-8, CRLF boundaries, normal code and independent tool counters byte for byte',async()=>{
  const args=JSON.stringify({content:'中文代码\\nconst x = "hello";\n'+(' '.repeat(100)+'x\n').repeat(8)});
  const input=[frame(delta(protocol,args.slice(0,40),0)),frame(delta(protocol,' '.repeat(MAX_TOOL_ARGUMENT_WHITESPACE/2),1)),frame(delta(protocol,args.slice(40),0)),frame(delta(protocol,'{}',1))].join('').replaceAll('\n\n','\r\n\r\n');
  const bytes=encoder.encode(input);let offset=0;
  const source=new ReadableStream<Uint8Array>({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(offset+17,bytes.length);c.enqueue(bytes.slice(offset,end));offset=end;}});
  let failed=false;const guarded=guardToolArgumentStream(new Response(source,{headers:{'content-type':'text/event-stream'}}),protocol,()=>{failed=true;});
  assert.equal(await guarded.text(),input);assert.equal(failed,false);
 });
 test(protocol+' caps total tool argument bytes across fragments without retaining the growing object',async()=>{
  let failed='';const source=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<18;i++)c.enqueue(encoder.encode(frame(delta(protocol,'x'.repeat(65536)))));c.close();}});
  const text=await guardToolArgumentStream(new Response(source,{headers:{'content-type':'text/event-stream'}}),protocol,error=>{failed=error.code;}).text();
  assert.equal(failed,'model_tool_arguments_too_large');assert.ok(text.length<MAX_TOOL_ARGUMENT_BYTES+65536);
 });
}
