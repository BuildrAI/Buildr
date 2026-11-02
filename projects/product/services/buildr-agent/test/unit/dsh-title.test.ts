import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDshTitle } from '../../src/executors/dsh/title.ts';

const input=()=>({contextRef:{id:'work-context'},cwd:'/work',description:JSON.stringify({messages:[{role:'user',text:'新的分支方向'}]}),signal:new AbortController().signal});

for(const protocol of ['chat-completions','anthropic-messages'] as const)test('DSH independent title is tool-free and based only on the supplied new instruction: '+protocol,async()=>{
  const title=await generateDshTitle(input(),'chosen-model',protocol,async init=>{
    const body=JSON.parse(String(init.body));
    assert.equal(body.model,'chosen-model');assert.equal(body.stream,false);assert.deepEqual(body.tools,[]);assert.equal(body.max_tokens,128);
    assert.ok(body.messages[0].content.includes('新的分支方向'));assert.ok(!JSON.stringify(body).includes('work-context'));
    return Response.json(protocol==='chat-completions'?{choices:[{message:{content:'{"title":"新的方向"}'},finish_reason:'stop'}]}:{content:[{type:'text',text:'{"title":"新的方向"}'}],stop_reason:'end_turn'});
  });
  assert.equal(title,'新的方向');
});

test('DSH title rejects tools, truncated or malformed output and oversized bodies',async()=>{
  await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{tool_calls:[{}]}}]})),/tools_forbidden/);
  await assert.rejects(generateDshTitle(input(),'m','anthropic-messages',async()=>Response.json({content:[{type:'tool_use'}]})),/tools_forbidden/);
  await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{content:'{"title":"truncated"}'},finish_reason:'length'}]})),/output_invalid/);
  await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{content:'not JSON'}}]})),/output_invalid/);
  await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>new Response('x'.repeat(33000))),/output_too_large/);
});

test('a cancelled DSH title never issues the auxiliary model request',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(generateDshTitle({...input(),signal:controller.signal},'m','chat-completions',async()=>{calls++;return Response.json({});}));
  assert.equal(calls,0);
});

for(const failure of ['network',429,503] as const)test('DSH title retries transient failure then succeeds: '+failure,async()=>{
  let calls=0;
  const title=await generateDshTitle(input(),'m','chat-completions',async()=>{
    if(++calls<3){if(failure==='network')throw new TypeError('fetch failed');return new Response('temporary',{status:failure});}
    return Response.json({choices:[{message:{content:'{"title":"恢复标题"}'},finish_reason:'stop'}]});
  });
  assert.equal(title,'恢复标题');assert.equal(calls,3);
});
test('DSH title retry budget, nonretryable errors and cancellation are bounded',async()=>{
  let calls=0;
  await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>{calls++;return new Response('',{status:503});}),/title_failed/);assert.equal(calls,3);
  calls=0;await assert.rejects(generateDshTitle(input(),'m','chat-completions',async()=>{calls++;return new Response('',{status:401});}),/title_failed/);assert.equal(calls,1);
  calls=0;const controller=new AbortController();
  await assert.rejects(generateDshTitle({...input(),signal:controller.signal},'m','chat-completions',async()=>{calls++;controller.abort();return new Response('',{status:503});}));assert.equal(calls,1);
});

test('DSH title retries a dropped response body after releasing its reader',async()=>{
 let calls=0;
 const title=await generateDshTitle(input(),'m','chat-completions',async()=>{
  if(++calls===1)return new Response(new ReadableStream({start(controller){controller.error(new TypeError('connection terminated'));}}));
  return Response.json({choices:[{message:{content:'{"title":"读取恢复"}'},finish_reason:'stop'}]});
 });
 assert.equal(title,'读取恢复');assert.equal(calls,2);
});
