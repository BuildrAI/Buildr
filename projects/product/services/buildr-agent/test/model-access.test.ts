import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createModelAccess } from '../src/model-access/application.ts';
import { translateRequest, translateResponse, type OpaqueReasoning } from '../src/model-access/protocols.ts';
import type { ModelProvider, ProviderInferenceInput, ProtocolJson } from '../src/model-access/contracts.ts';

const model={id:'source-model',label:'真实来源模型',images:true,tools:true,contextWindow:32000};
const noOpaque:OpaqueReasoning={encode(value){return JSON.stringify(value);},decode(value){return JSON.parse(value);}};
function provider(infer:(input:ProviderInferenceInput)=>Promise<Response>,protocol:'responses'|'chat-completions'|'anthropic-messages'='chat-completions'):ModelProvider {
  return {id:'fixture',label:'Fixture',async open(){return {protocol,async inspect(){return {status:'ready',label:'套餐账号',models:[model],quota:{available:false,observedAt:new Date().toISOString()}};},async beginLogin(update){update({state:'waiting-browser',url:'https://auth.example.com/?state=secret-login-state'});},async cancelLogin(){},infer,async close(){}};}};
}
const chat=(message:ProtocolJson)=>Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}],usage:{prompt_tokens:12,completion_tokens:4}});
function frames(values:unknown[]){return new Response(values.map(value=>'data: '+JSON.stringify(value)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}

test('private metadata survives restart; stale account writes and unbound models are rejected',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-access-'));let called=0;
  const source=provider(async()=>{called++;return chat({content:'ok'});});
  let access=createModelAccess({root,providers:[source]});
  try {
    const added=await access.accounts.add({provider:'fixture'});const ready=await access.accounts.check(added.id,{expectedRevision:added.revision});
    assert.equal(ready.status,'ready');assert.equal(ready.quota?.available,false);assert.equal(access.catalog.list().models[0].accountId,added.id);
    await assert.rejects(access.accounts.check(added.id,{expectedRevision:added.revision}),/已变化/);
    const input={accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'conversation-a',runId:'run-a'};
    const lease=await access.leases.create(input),same=await access.leases.create({...input,runId:'run-b'});assert.equal(lease.identity,same.identity);assert.equal(lease.apiKey,same.apiKey);
    const headers={'Authorization':'Bearer '+lease.apiKey,'Content-Type':'application/json'};
    assert.equal((await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'foreign-model',messages:[]})})).status,403);
    assert.equal(called,0);
    assert.equal((await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{...headers,Authorization:'Bearer invalid'},body:'{}'})).status,401);
    const response=await fetch(lease.baseUrl+'/responses',{method:'POST',headers,body:JSON.stringify({model:lease.model,input:'hello'})});assert.equal(response.status,200);assert.equal((await response.json()).output[0].content[0].text,'ok');assert.equal(called,1);
    const stored=await readFile(join(root,'accounts.json'),'utf8');assert.ok(!stored.includes(lease.apiKey));
    await access.close();access=createModelAccess({root,providers:[source]});assert.equal(access.accounts.read(ready.id).accountLabel,'套餐账号');
    const again=await access.leases.create(input);assert.equal(again.identity,lease.identity);assert.notEqual(again.apiKey,lease.apiKey);
  } finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('browser login URL is transient and cancelling invalidates its accurate attempt',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-login-')),access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try {
    const row=await access.accounts.add({provider:'fixture'});const login=await access.accounts.login(row.id,{expectedRevision:row.revision});
    let attempt=access.accounts.read(row.id);for(let i=0;i<100&&!attempt.loginAttempt?.url;i++){await new Promise(resolve=>setTimeout(resolve,5));attempt=access.accounts.read(row.id);}
    assert.equal(attempt.loginAttempt?.state,'waiting-browser');assert.ok(attempt.loginAttempt?.url?.startsWith('https://auth.example.com'));
    assert.ok(!(await readFile(join(root,'accounts.json'),'utf8')).includes('secret-login-state'));
    const cancelled=await access.accounts.cancelLogin(row.id,login.loginAttempt!.id,{expectedRevision:attempt.revision});assert.equal(cancelled.loginAttempt?.state,'cancelled');assert.equal(cancelled.loginAttempt?.url,undefined);
  } finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('Responses tool output returns to the exact source call; signed reasoning is private and source bound',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-tool-'));const inputs:ProviderInferenceInput[]=[];
  const source=provider(async input=>{inputs.push(input);return chat({content:'before',reasoning_content:'private reasoning',reasoning_signature:'signed-by-source',tool_calls:[{id:'call-source',type:'function',function:{name:'read_file',arguments:'{"path":"a.txt"}'}}]});});
  const access=createModelAccess({root,providers:[source]});
  try {
    const added=await access.accounts.add({provider:'fixture'}),ready=await access.accounts.check(added.id);const lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'a',runId:'1'});
    const request=async(body:ProtocolJson,key=lease.apiKey)=>await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,...body})});
    const response=await (await request({input:'read'})).json();const reasoning=response.output.find((item:ProtocolJson)=>item.type==='reasoning');assert.ok(reasoning.encrypted_content.startsWith('buildr-v1.'));assert.ok(!reasoning.encrypted_content.includes('private reasoning'));
    const tool=response.output.find((item:ProtocolJson)=>item.type==='function_call');assert.equal(tool.call_id,'call-source');
    await request({input:[...response.output,{type:'function_call_output',call_id:'call-source',output:'file result'}]});
    const messages=inputs[1].body.messages as ProtocolJson[];assert.ok(messages.some(item=>item.tool_call_id==='call-source'&&item.content==='file result'));assert.ok(messages.some(item=>item.reasoning_signature==='signed-by-source'));
    const other=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'b',runId:'2'});
    const foreign=await fetch(other.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+other.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:other.model,input:[reasoning]})});assert.equal(foreign.status,400);assert.equal(inputs.length,2);
  } finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('cross-protocol streams preserve content order and never complete a truncated upstream',async()=>{
  const upstream=frames([
    {choices:[{delta:{content:'first'}}]},
    {choices:[{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'shell',arguments:'{"command":'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"pwd"}'}}]}}]},
    {choices:[{delta:{content:'last'},finish_reason:'tool_calls'}]},
  ]);
  const response=await translateResponse(upstream,'chat-completions','responses',{model:'route',stream:true,request:{},opaque:noOpaque,signal:new AbortController().signal});
  const output=await response.text();const final=output.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6))).find(item=>item.type==='response.completed');
  assert.deepEqual(final.response.output.map((item:ProtocolJson)=>item.type),['message','function_call','message']);assert.equal(final.response.output[1].arguments,'{"command":"pwd"}');
  const truncated=await translateResponse(frames([{choices:[{delta:{content:'partial'}}]}]),'chat-completions','responses',{model:'route',stream:true,request:{},opaque:noOpaque,signal:new AbortController().signal});const text=await truncated.text();assert.ok(text.includes('response.failed'));assert.ok(!text.includes('response.completed'));
});

test('Messages preserves system authority, tool identity and images when converted to Responses',()=>{
  const converted=translateRequest({model:'m',system:[{type:'text',text:'system rule'}],messages:[{role:'user',content:[{type:'text',text:'look'},{type:'image',source:{type:'base64',media_type:'image/png',data:'abc'}}]},{role:'assistant',content:[{type:'tool_use',id:'t1',name:'read',input:{path:'a'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'value'}]}],tools:[{name:'read',input_schema:{type:'object'}}],max_tokens:42},'anthropic-messages','responses',noOpaque);
  const input=converted.input as ProtocolJson[];assert.equal(input[0].role,'system');assert.equal(input[2].call_id,'t1');assert.equal(input[3].call_id,'t1');assert.equal(converted.max_output_tokens,42);assert.equal((input[1].content as ProtocolJson[])[1].image_url,'data:image/png;base64,abc');
});

test('corrupt model metadata does not prevent construction or overwrite retained facts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-corrupt-'));await writeFile(join(root,'accounts.json'),'not json');const access=createModelAccess({root,providers:[]});
  try {assert.throws(()=>access.accounts.list(),/不可读取/);assert.equal(await readFile(join(root,'accounts.json'),'utf8'),'not json');} finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('disconnect aborts only its owned inference and revokes its local credentials',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-cancel-'));let aborted=false;
  const source=provider(async input=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"started"}}]}\n\n'));input.signal.addEventListener('abort',()=>{aborted=true;controller.close();},{once:true});}}),{headers:{'Content-Type':'text/event-stream'}}));
  const access=createModelAccess({root,providers:[source]});
  try {const added=await access.accounts.add({provider:'fixture'}),ready=await access.accounts.check(added.id),lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'qoder',conversationId:'a',runId:'1'});const response=await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[],stream:true})});const reader=response.body!.getReader();await reader.read();await access.accounts.disconnect(ready.id,{expectedRevision:ready.revision});assert.equal(aborted,true);await reader.cancel().catch(()=>{});assert.equal((await fetch(lease.baseUrl+'/models',{headers:{Authorization:'Bearer '+lease.apiKey}})).status,401);} finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('new login rotates credential generation and rejects the previous source binding',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-generation-'));const access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try {const row=await access.accounts.add({provider:'fixture'}),ready=await access.accounts.check(row.id);const input={accountId:row.id,modelId:model.id,agentId:'codex',conversationId:'a',runId:'1',expectedIdentity:ready.identity};const lease=await access.leases.create(input);
    const login=await access.accounts.login(row.id,{expectedRevision:ready.revision});assert.notEqual(login.identity,ready.identity);
    await access.accounts.check(row.id);
    await assert.rejects(access.leases.create(input),/来源已变化/);
    assert.equal((await fetch(lease.baseUrl+'/models',{headers:{Authorization:'Bearer '+lease.apiKey}})).status,401);
    const fresh=await access.leases.create({...input,expectedIdentity:login.identity});assert.notEqual(fresh.identity,lease.identity);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('disconnect and reconnect create a new access generation without accepting cached credentials',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-reconnect-'));const access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try{const added=await access.accounts.add({provider:'fixture'}),ready=await access.accounts.check(added.id);const input={accountId:added.id,modelId:model.id,agentId:'dsh',conversationId:'a',runId:'1'};const old=await access.leases.create({...input,expectedIdentity:ready.identity});const disconnected=await access.accounts.disconnect(added.id,{expectedRevision:ready.revision});assert.notEqual(disconnected.identity,ready.identity);const restored=await access.accounts.check(added.id,{expectedRevision:disconnected.revision});assert.equal(restored.status,'ready');const fresh=await access.leases.create({...input,expectedIdentity:restored.identity});assert.notEqual(fresh.identity,old.identity);assert.notEqual(fresh.apiKey,old.apiKey);await assert.rejects(access.leases.create({...input,expectedIdentity:ready.identity}),/来源已变化/);assert.equal((await fetch(old.baseUrl+'/models',{headers:{Authorization:'Bearer '+old.apiKey}})).status,401);}finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('Messages cross-protocol stream closes each content block before opening the next',async()=>{
  const source=frames([{choices:[{delta:{reasoning_content:'think'}}]},{choices:[{delta:{reasoning_signature:'signature'}}]},{choices:[{delta:{tool_calls:[{index:0,id:'call-a',function:{name:'one',arguments:'{"a":'}}]}}]},{choices:[{delta:{tool_calls:[{index:1,id:'call-b',function:{name:'two',arguments:'{}'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'1}'}}]}}]},{choices:[{delta:{content:'after tools'},finish_reason:'tool_calls'}]}]);
  const response=await translateResponse(source,'chat-completions','anthropic-messages',{model:'m',stream:true,request:{},opaque:noOpaque,signal:new AbortController().signal});
  const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));let open:number|undefined;
  for(const event of events){if(event.type==='content_block_start'){assert.equal(open,undefined);open=event.index;}if(event.type==='content_block_delta')assert.equal(event.index,open);if(event.type==='content_block_stop'){assert.equal(event.index,open);open=undefined;}}
  assert.equal(open,undefined);assert.ok(events.some(event=>event.type==='message_stop'));assert.deepEqual(events.filter(event=>event.type==='content_block_start').map(event=>event.content_block.type),['thinking','tool_use','tool_use','text']);
});

test('Messages effort and tool selection survive translation including signature-only replies',async()=>{
  for(const [type,expected]of [['auto','auto'],['none','none'],['any','required']]) {const body=translateRequest({messages:[],tool_choice:{type,disable_parallel_tool_use:true},output_config:{effort:'high'}},'anthropic-messages','chat-completions',noOpaque);assert.equal(body.tool_choice,expected);assert.equal(body.reasoning_effort,'high');assert.equal(body.parallel_tool_calls,false);}
  const result=await translateResponse(chat({content:'ok',reasoning_signature:'only-signature'}),'chat-completions','responses',{model:'m',stream:false,request:{},opaque:noOpaque,signal:new AbortController().signal});const data=await result.json();assert.equal(JSON.parse(data.output.find((item:ProtocolJson)=>item.type==='reasoning').encrypted_content).signature,'only-signature');
});

test('Codex namespace tools flatten reversibly through Chat requests, streamed calls and history',async()=>{
  const request:ProtocolJson={model:'m',stream:true,tools:[{type:'namespace',name:'multi_agent_v1',description:'Agent tools',tools:[{type:'function',name:'wait_agent',description:'Wait for exact targets',parameters:{type:'object',properties:{targets:{type:'array',items:{type:'string'}}},required:['targets']}}]}],tool_choice:{type:'function',namespace:'multi_agent_v1',name:'wait_agent'},input:'inspect agent'};
  const translated=translateRequest(request,'responses','chat-completions',noOpaque);const tools=translated.tools as ProtocolJson[];
  assert.equal((tools[0].function as ProtocolJson).name,'multi_agent_v1__wait_agent');assert.equal(((translated.tool_choice as ProtocolJson).function as ProtocolJson).name,'multi_agent_v1__wait_agent');
  const upstream=frames([{choices:[{delta:{tool_calls:[{index:0,id:'call-namespace',function:{name:'multi_agent_v1__wait_agent',arguments:'{"targets":'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'["missing"]}'}}]},finish_reason:'tool_calls'}]}]);
  const response=await translateResponse(upstream,'chat-completions','responses',{model:'m',stream:true,request,opaque:noOpaque,signal:new AbortController().signal});
  const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));const call=events.find(item=>item.type==='response.completed').response.output[0];
  assert.equal(call.name,'wait_agent');assert.equal(call.namespace,'multi_agent_v1');assert.equal(call.call_id,'call-namespace');
  assert.equal(events.find(item=>item.type==='response.output_item.added').item.namespace,'multi_agent_v1');
  const replay=translateRequest({...request,input:[call,{type:'function_call_output',call_id:'call-namespace',output:'agent not found'}]},'responses','chat-completions',noOpaque);const messages=replay.messages as ProtocolJson[];
  assert.equal((((messages[0].tool_calls as ProtocolJson[])[0]).function as ProtocolJson).name,'multi_agent_v1__wait_agent');assert.equal(messages[1].tool_call_id,'call-namespace');
});

test('long namespace names and custom tool formats keep deterministic names and restored identities',async()=>{
  const namespace='namespace_'.repeat(8),name='apply_patch';const request:ProtocolJson={input:'patch',tools:[{type:'namespace',name:namespace,tools:[{type:'custom',name,description:'Apply patch',format:{type:'grammar',syntax:'lark',definition:'start: "patch"'}}]}]};
  const converted=translateRequest(request,'responses','chat-completions',noOpaque),fn=(converted.tools as ProtocolJson[])[0].function as ProtocolJson;
  assert.ok(String(fn.name).length<=64);assert.ok(String(fn.description).includes('grammar'));assert.equal(((translateRequest(request,'responses','chat-completions',noOpaque).tools as ProtocolJson[])[0].function as ProtocolJson).name,fn.name);
  const response=await translateResponse(chat({tool_calls:[{id:'patch-call',type:'function',function:{name:fn.name,arguments:JSON.stringify({input:'*** Begin Patch\n*** End Patch'})}}]}),'chat-completions','responses',{model:'m',stream:false,request,opaque:noOpaque,signal:new AbortController().signal});const call=(await response.json()).output[0];assert.equal(call.type,'custom_tool_call');assert.equal(call.name,name);assert.equal(call.namespace,namespace);assert.equal(call.input,'*** Begin Patch\n*** End Patch');
});

test('login remains checking until model discovery completes and cancelled discovery cannot revive it',async()=>{
  for(const cancelled of [false,true]) {
    const root=await mkdtemp(join(tmpdir(),'buildr-login-discovery-'));let release!:()=>void,started=false;const gate=new Promise<void>(resolve=>{release=resolve;});const updates:string[]=[];
    const source:ModelProvider={id:'delayed',label:'Delayed',async open(){return {protocol:'chat-completions',async beginLogin(update){update({state:'completed'});},async cancelLogin(){},async inspect(){started=true;await gate;return {status:'ready',models:[model]};},async infer(){return chat({content:'ok'});},async close(){}};}};
    const access=createModelAccess({root,providers:[source],changed(row){updates.push(row.loginAttempt?.state??'');if(row.loginAttempt?.state==='completed'){assert.equal(row.status,'ready');assert.equal(row.models.length,1);}}});
    try {const row=await access.accounts.add({provider:'delayed'}),login=await access.accounts.login(row.id,{expectedRevision:row.revision});for(let i=0;i<100&&!started;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(started,true);assert.equal(access.accounts.read(row.id).loginAttempt?.state,'checking');assert.ok(!updates.includes('completed'));
      if(cancelled){const current=access.accounts.read(row.id);await access.accounts.cancelLogin(row.id,login.loginAttempt!.id,{expectedRevision:current.revision});}
      release();for(let i=0;i<100&&access.accounts.read(row.id).loginAttempt?.state==='checking';i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(resolve=>setTimeout(resolve,10));const final=access.accounts.read(row.id);assert.equal(final.loginAttempt?.state,cancelled?'cancelled':'completed');assert.equal(final.models.length,cancelled?0:1);
    } finally {release();await access.close();await rm(root,{recursive:true,force:true});}
  }
});
