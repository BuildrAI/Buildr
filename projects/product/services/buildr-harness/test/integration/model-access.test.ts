import { createHash } from 'node:crypto';
import { createCustomModelProvider } from '../../src/model-access/providers/custom.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createModelAccess } from '../../src/model-access/application.ts';
import { translateRequest, translateResponse, type OpaqueReasoning } from '../../src/model-access/protocols.ts';
import type { ModelOffering, ModelProvider, ProviderInferenceInput, ProtocolJson } from '../../src/model-access/contracts.ts';
import { createOpenAIApiModelProvider } from '../../src/model-access/providers/openai-api.ts';

const model={id:'source-model',label:'真实来源模型',images:true,tools:true,contextWindow:32000};
const noOpaque:OpaqueReasoning={encode(value){return JSON.stringify(value);},decode(value){return JSON.parse(value);}};
function provider(infer:(input:ProviderInferenceInput)=>Promise<Response>,protocol:'responses'|'chat-completions'|'anthropic-messages'='chat-completions'):ModelProvider {
  return {id:'fixture',label:'Fixture',async open(){return {protocol,async inspect(){return {status:'ready',label:'套餐账号',models:[model],quota:{available:false,observedAt:new Date().toISOString()}};},async beginLogin(update){update({state:'waiting-browser',url:'https://auth.example.com/?state=secret-login-state'});},async cancelLogin(){},infer,async close(){}};}};
}
const chat=(message:ProtocolJson)=>Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}],usage:{prompt_tokens:12,completion_tokens:4}});

test('stopping a round aborts only its model calls and rejects late calls until an explicit next round',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-stop-model-')),active=new Map<string,AbortSignal>();let calls=0;
 const access=createModelAccess({root,providers:[provider(async input=>{calls++;active.set(input.context.conversationId,input.signal);return new Promise<Response>((_,reject)=>input.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));})]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),account=await checkEnabled(access,added.id);
  const leaseInput={accountId:account.id,modelId:model.id,agentId:'dsh',conversationId:'one',runId:'r1'};
  const one=await access.leases.create(leaseInput),two=await access.leases.create({...leaseInput,conversationId:'two',runId:'r2'});
  const request=(lease:typeof one)=>fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[],stream:true})});
  const first=request(one),other=request(two);
  for(let i=0;i<100&&active.size<2;i++)await new Promise(r=>setTimeout(r,5));assert.equal(active.size,2);
  access.leases.stopRun('one','r1');await first;
  assert.equal(active.get('one')?.aborted,true);assert.equal(active.get('two')?.aborted,false);
  const late=await request(one);assert.equal(late.status,409);assert.equal((await late.json()).error.code,'model_run_stopped');assert.equal(calls,2);
  const same=await access.leases.create(leaseInput);assert.equal((await request(same)).status,409,'reopening the stopped round cannot remove its stop intent');
  access.leases.stopRun('two','r2');await other;
  access.leases.updateRun(one.identity,'r3');const next=request(one);for(let i=0;i<100&&calls<3;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,3);
  const oldSignal=active.get('one');access.leases.updateRun(one.identity,'r4');const newer=request(one);for(let i=0;i<100&&calls<4;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,4);
  access.leases.stopRun('one','r3');await next;assert.equal(oldSignal?.aborted,true);assert.equal(active.get('one')?.aborted,false,'late stop of an old round must not cancel a newer model call');
  access.leases.stopRun('one','r4');await newer;
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

for(const downstream of ['responses','chat/completions'])test('abnormal tool arguments abort upstream through the real gateway; downstream='+downstream,async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-stream-flood-'));let aborted=false;
 const access=createModelAccess({root,providers:[provider(async input=>{input.signal.addEventListener('abort',()=>{aborted=true;},{once:true});let sent=0;const body=new ReadableStream<Uint8Array>({pull(c){if(sent++>500){c.close();return;}c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'response.function_call_arguments.delta',item_id:'call',delta:' '.repeat(128)})+'\n\n'));}},{highWaterMark:0});return new Response(body,{headers:{'content-type':'text/event-stream'}});},'responses')]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),account=await checkEnabled(access,added.id),lease=await access.leases.create({accountId:account.id,modelId:model.id,agentId:'dsh',conversationId:'one',runId:'run'});
  const response=await fetch(lease.baseUrl+'/'+downstream,{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,stream:true,...(downstream==='responses'?{input:[]}:{messages:[]})})});const text=await response.text();
  assert.equal(aborted,true);assert.ok(text.includes('model_tool_arguments_stalled'));assert.ok(!text.includes('response.completed'));assert.match(access.leases.streamFailure('one','run')!,/异常空白/);
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('fresh quota exhaustion rejects new leases and retained gateway calls, without affecting another account',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-quota-'));let exhausted:string|undefined,calls=0,stale=false;
 const source:ModelProvider={id:'fixture',label:'Fixture',async open({accountId}){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[model],quota:{available:true,observedAt:new Date().toISOString(),remainingPercent:exhausted===accountId?0:50,stale}}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{calls++;return chat({content:'ok'});},close:async()=>{}};}};
 const access=createModelAccess({root,providers:[source]});
 try{
  const account=await access.accounts.add({provider:'fixture'});await checkEnabled(access,account.id);
  const other=await access.accounts.add({provider:'fixture'});await checkEnabled(access,other.id);
  const input={accountId:account.id,modelId:model.id,agentId:'codex',conversationId:'one',runId:'one'},lease=await access.leases.create(input);
  exhausted=account.id;await access.accounts.check(account.id);
  await assert.rejects(access.leases.create({...input,conversationId:'two'}),{code:'model_quota_exhausted'});
  const response=await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[]})});
  assert.equal(response.status,429);assert.equal((await response.json()).error.code,'model_quota_exhausted');assert.equal(calls,0);
  assert.ok(await access.leases.create({...input,accountId:other.id}));
  stale=true;await access.accounts.check(account.id);assert.ok(await access.leases.create({...input,conversationId:'stale-observation'}));
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('retiring model gateway observes successor account state without writing stale metadata',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-retiring-'));
  const source=provider(async()=>chat({role:'assistant',content:'ok'}));
  const old=createModelAccess({root,providers:[source]});let current:ReturnType<typeof createModelAccess>|undefined;
  try{
    const added=await old.accounts.add({provider:'fixture'}),ready=await checkEnabled(old,added.id);
    const lease=await old.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'one',runId:'one'});
    old.freezeMetadata();current=createModelAccess({root,providers:[source]});
    await current.accounts.disconnect(ready.id,{expectedRevision:ready.revision});
    const metadata=await readFile(join(root,'accounts.json'),'utf8');
    assert.equal(old.accounts.read(ready.id).enabled,false);
    await assert.rejects(old.accounts.preferences(ready.id,{expectedRevision:old.accounts.read(ready.id).revision,models:[{id:model.id,enabled:true}]}),{code:'model_owner_transferred'});
    const response=await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[{role:'user',content:'test'}]})});
    assert.equal(response.status,409);await response.body?.cancel();
    assert.equal(await readFile(join(root,'accounts.json'),'utf8'),metadata);
  }finally{await old.close();await current?.close();await rm(root,{recursive:true,force:true});}
});
function frames(values:unknown[]){return new Response(values.map(value=>'data: '+JSON.stringify(value)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}

test('gateway preserves a bounded HTTP failure before streaming without exposing credentials or HTML',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-error-'));let mode='json';
  const failures: ProtocolJson[] = [];
  const access=createModelAccess({root,diagnostics:event=>failures.push(event),providers:[provider(async()=>mode==='json'?Response.json({error:{code:'model_devin_quota_or_rate_limit',message:'Devin · 请求响应：HTTP 429 Authorization: Bearer private-token'}},{status:429}):new Response('<html>private upstream body</html>',{status:503}))]});
  try{
    const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
    const lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'one',runId:'one'});
    const request=()=>fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,input:'test',stream:true})});
    const response=await request();assert.equal(response.status,429);const result=await response.json();
    assert.equal(result.error.code,'model_devin_quota_or_rate_limit');assert.match(result.error.message,/请求响应.*429/);assert.ok(!JSON.stringify(result).includes('private-token'));
    mode='html';const other=await request();assert.equal(other.status,503);assert.ok(!(await other.text()).includes('private upstream body'));
    assert.deepEqual(failures.map(({phase,httpStatus,upstreamHttpStatus,conversationId,runId})=>({phase,httpStatus,upstreamHttpStatus,conversationId,runId})),[
      {phase:'provider-response',httpStatus:429,upstreamHttpStatus:429,conversationId:'one',runId:'one'},
      {phase:'provider-response',httpStatus:503,upstreamHttpStatus:503,conversationId:'one',runId:'one'},
    ]);
    assert.notEqual(failures[0]?.requestId,failures[1]?.requestId);
    assert.doesNotMatch(JSON.stringify(failures),/private-token|private upstream body/);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('Messages keeps parallel tool results adjacent to their call before follow-up text', () => {
  const body = translateRequest({messages:[
    {role:'user',content:'Read both files'},
    {role:'assistant',content:[
      {type:'tool_use',id:'first',name:'read',input:{}},
      {type:'tool_use',id:'second',name:'read',input:{}},
    ]},
    {role:'user',content:[
      {type:'tool_result',tool_use_id:'second',content:'second output'},
      {type:'tool_result',tool_use_id:'first',content:'first output'},
      {type:'text',text:'Follow-up context'},
    ]},
  ]},'anthropic-messages','chat-completions',noOpaque);
  const messages = body.messages as ProtocolJson[];
  assert.deepEqual(messages.map(message=>message.role),['user','assistant','tool','tool','user']);
  assert.deepEqual(messages.slice(2,4).map(message=>message.tool_call_id),['second','first']);
  assert.equal(messages[4]?.content,'Follow-up context');
});

test('account checks only rotate revisions for material changes in that account',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-revisions-')),models=new Map<string,ModelOffering[]>();let tick=0;
  const ordered:ModelOffering={id:'ordered-model',label:'Ordered',images:false,tools:true,reasoningEfforts:[{id:'high',label:'高'},{id:'low',label:'低'}],defaultServiceTier:'standard',serviceTiers:[
    {id:'standard',label:'标准',reasoningEfforts:[{id:'high',label:'高'},{id:'medium',label:'中'}],defaultReasoningEffort:'medium'},
    {id:'fast',label:'快速',reasoningEfforts:[{id:'low',label:'低'}],defaultReasoningEffort:'low'},
  ]};
  const source:ModelProvider={id:'fixture',label:'Fixture',async open({accountId}){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:structuredClone(models.get(accountId)??[model]),quota:{available:true,observedAt:new Date(Date.UTC(2026,9,25,0,0,tick++)).toISOString()}};},async beginLogin(){},async cancelLogin(){},async infer(){return Response.json({});},async close(){}};}};
  const access=createModelAccess({root,providers:[source]});
  try{
    const first=await access.accounts.add({provider:'fixture'}),second=await access.accounts.add({provider:'fixture'});
    models.set(first.id,[model,ordered]);
    for(const account of [first,second]){const checked=await access.accounts.check(account.id);await access.accounts.preferences(account.id,{expectedRevision:checked.revision,models:checked.models.map(model=>({id:model.id,enabled:true}))});}
    const firstBefore=access.accounts.read(first.id),secondBefore=access.accounts.read(second.id);
    models.set(first.id,[{...ordered,reasoningEfforts:[...ordered.reasoningEfforts!].reverse(),serviceTiers:[...ordered.serviceTiers!].reverse().map(tier=>({...tier,reasoningEfforts:[...tier.reasoningEfforts!].reverse()}))},model]);
    await access.accounts.check(first.id);await access.accounts.check(second.id);
    assert.equal(access.accounts.read(first.id).revision,firstBefore.revision,'quota, time and returned ordering alone must not rotate the revision');
    assert.equal(access.accounts.read(second.id).revision,secondBefore.revision,'other accounts keep their own revision');
    models.set(first.id,[model,{id:'new-model',label:'New model',images:false,tools:true}]);
    await access.accounts.check(first.id);
    assert.notEqual(access.accounts.read(first.id).revision,firstBefore.revision,'material catalog changes rotate the account revision');
    assert.equal(access.accounts.read(second.id).revision,secondBefore.revision,'another account is unaffected');
    const lease=await access.leases.create({accountId:second.id,modelId:model.id,expectedRevision:secondBefore.revision,agentId:'qoder',conversationId:'conversation',runId:'run'});
    assert.equal(lease.accountId,second.id);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('private metadata survives restart; stale account writes and unbound models are rejected',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-access-'));let called=0;
  const source=provider(async()=>{called++;return chat({content:'ok'});});
  let access=createModelAccess({root,providers:[source]});
  try {
    const added=await access.accounts.add({provider:'fixture'});const ready=await checkEnabled(access,added.id,{expectedRevision:added.revision});
    assert.equal(ready.status,'ready');assert.equal(ready.quota?.available,false);assert.equal(access.catalog.list().models[0].accountId,added.id);
    await assert.rejects(checkEnabled(access,added.id,{expectedRevision:added.revision}),/已变化/);
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
    const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);const lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'a',runId:'1'});
    const request=async(body:ProtocolJson,key=lease.apiKey)=>await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,...body})});
    const response=await (await request({input:'read'})).json();const reasoning=response.output.find((item:ProtocolJson)=>item.type==='reasoning');assert.ok(reasoning.encrypted_content.startsWith('buildr-v1.'));assert.ok(!reasoning.encrypted_content.includes('private reasoning'));assert.deepEqual(reasoning.summary,[{type:'summary_text',text:'private reasoning'}]);
    const tool=response.output.find((item:ProtocolJson)=>item.type==='function_call');assert.equal(tool.call_id,'call-source');
    await request({input:[...response.output,{type:'function_call_output',call_id:'call-source',output:'file result'}]});
    const messages=inputs[1].body.messages as ProtocolJson[];assert.ok(messages.some(item=>item.tool_call_id==='call-source'&&item.content==='file result'));assert.ok(messages.some(item=>item.reasoning_signature==='signed-by-source'));
    const other=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'b',runId:'2'});
    const foreign=await fetch(other.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+other.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:other.model,input:[reasoning]})});assert.equal(foreign.status,400);assert.equal(inputs.length,2);
  } finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('Responses clients receive readable reasoning summaries while opaque replay stays source bound',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-reasoning-summary-'));
  const inputs:ProtocolJson[]=[];
  const source=provider(async input=>{inputs.push(input.body);return chat({content:'done',reasoning_content:'先确认目录，再回答。',reasoning_signature:'signed'});});
  const access=createModelAccess({root,providers:[source]});
  try {
    const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
    const lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'dsh',conversationId:'summary',runId:'1'});
    const response=await (await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,input:'check'})})).json();
    const reasoning=response.output.find((item:ProtocolJson)=>item.type==='reasoning');
    assert.deepEqual(reasoning.summary,[{type:'summary_text',text:'先确认目录，再回答。'}]);
    assert.ok(reasoning.encrypted_content.startsWith('buildr-v1.')&&!reasoning.encrypted_content.includes('先确认目录'));
    const replay=await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,input:[reasoning]})});
    assert.equal(replay.status,200);await replay.arrayBuffer();
    const messages=inputs.at(-1)!.messages as ProtocolJson[];
    assert.ok(messages.some(message=>message.reasoning_content==='先确认目录，再回答。'&&message.reasoning_signature==='signed'));
    const streamed=await translateResponse(frames([{choices:[{delta:{reasoning_content:'先确认'}}]},{choices:[{delta:{content:'ok'},finish_reason:'stop'}]}]),'chat-completions','responses',{model:'route',stream:true,request:{},opaque:noOpaque,signal:new AbortController().signal});
    const events=(await streamed.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
    const done=events.find(item=>item.type==='response.output_item.done'&&item.item.type==='reasoning');
    assert.deepEqual(done.item.summary,[{type:'summary_text',text:'先确认'}]);
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

test('streamed parallel tools and a delayed reasoning signature replay as the same signed assistant turn',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-signed-turn-'));const inputs:ProviderInferenceInput[]=[];
  const source=provider(async input=>{
    inputs.push(input);
    if(inputs.length>1)return chat({content:'checked'});
    return frames([
      {choices:[{delta:{reasoning_content:'private thought'}}]},
      {choices:[{delta:{content:'reading files'}}]},
      {choices:[{delta:{tool_calls:[{index:0,id:'read-a',function:{name:'read',arguments:'{"path":"a"}'}},{index:1,id:'read-b',function:{name:'read',arguments:'{"path":"b"}'}}]}}]},
      {choices:[{delta:{reasoning_signature:'signed-turn'},finish_reason:'tool_calls'}]},
    ]);
  });
  const access=createModelAccess({root,providers:[source]});
  try{
    const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id),lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'dsh',conversationId:'signed',runId:'1'});
    const request=async(body:ProtocolJson)=>fetch(lease.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,...body})});
    const response=await request({input:'inspect',stream:true});const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
    const output=events.find(event=>event.type==='response.completed').response.output as ProtocolJson[];
    const replay=await request({input:[{role:'user',content:'inspect'},...output,...['read-a','read-b'].map(call_id=>({type:'function_call_output',call_id,output:'value '+call_id}))]});
    assert.equal(replay.status,200);await replay.arrayBuffer();
    const messages=inputs[1].body.messages as ProtocolJson[];
    assert.deepEqual(messages.map(message=>message.role),['user','assistant','tool','tool']);
    assert.deepEqual(messages[1],{role:'assistant',content:'reading files',tool_calls:['a','b'].map(path=>({id:'read-'+path,type:'function',function:{name:'read',arguments:JSON.stringify({path})}})),reasoning_content:'private thought',reasoning_signature:'signed-turn'});
    assert.deepEqual(messages.slice(2).map(message=>[message.tool_call_id,message.content]),[['read-a','value read-a'],['read-b','value read-b']]);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('corrupt model metadata does not prevent construction or overwrite retained facts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-corrupt-'));await writeFile(join(root,'accounts.json'),'not json');const access=createModelAccess({root,providers:[]});
  try {assert.throws(()=>access.accounts.list(),/不可读取/);assert.equal(await readFile(join(root,'accounts.json'),'utf8'),'not json');} finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('disconnect aborts only its owned inference and revokes its local credentials',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-cancel-'));let aborted=false;
  const source=provider(async input=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"started"}}]}\n\n'));input.signal.addEventListener('abort',()=>{aborted=true;controller.close();},{once:true});}}),{headers:{'Content-Type':'text/event-stream'}}));
  const access=createModelAccess({root,providers:[source]});
  try {const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id),lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'qoder',conversationId:'a',runId:'1'});const response=await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[],stream:true})});const reader=response.body!.getReader();await reader.read();await access.accounts.disconnect(ready.id,{expectedRevision:ready.revision});assert.equal(aborted,true);await reader.cancel().catch(()=>{});assert.equal((await fetch(lease.baseUrl+'/models',{headers:{Authorization:'Bearer '+lease.apiKey}})).status,401);} finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('new login rotates credential generation and rejects the previous source binding',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-generation-'));const access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try {const row=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,row.id);const input={accountId:row.id,modelId:model.id,agentId:'codex',conversationId:'a',runId:'1',expectedIdentity:ready.identity};const lease=await access.leases.create(input);
    const login=await access.accounts.login(row.id,{expectedRevision:ready.revision});assert.notEqual(login.identity,ready.identity);
    await checkEnabled(access,row.id);
    await assert.rejects(access.leases.create(input),/来源已变化/);
    assert.equal((await fetch(lease.baseUrl+'/models',{headers:{Authorization:'Bearer '+lease.apiKey}})).status,401);
    const fresh=await access.leases.create({...input,expectedIdentity:login.identity});assert.notEqual(fresh.identity,lease.identity);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('disconnect and reconnect create a new access generation without accepting cached credentials',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-reconnect-'));const access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try{const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);const input={accountId:added.id,modelId:model.id,agentId:'dsh',conversationId:'a',runId:'1'};const old=await access.leases.create({...input,expectedIdentity:ready.identity});const disconnected=await access.accounts.disconnect(added.id,{expectedRevision:ready.revision});assert.notEqual(disconnected.identity,ready.identity);const restored=await checkEnabled(access,added.id,{expectedRevision:disconnected.revision});assert.equal(restored.status,'ready');const fresh=await access.leases.create({...input,expectedIdentity:restored.identity});assert.notEqual(fresh.identity,old.identity);assert.notEqual(fresh.apiKey,old.apiKey);await assert.rejects(access.leases.create({...input,expectedIdentity:ready.identity}),/来源已变化/);assert.equal((await fetch(old.baseUrl+'/models',{headers:{Authorization:'Bearer '+old.apiKey}})).status,401);}finally{await access.close();await rm(root,{recursive:true,force:true});}
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
  const result=await translateResponse(chat({content:'ok',reasoning_signature:'only-signature'}),'chat-completions','responses',{model:'m',stream:false,request:{},opaque:noOpaque,signal:new AbortController().signal});const data=await result.json();const reasoning=data.output.find((item:ProtocolJson)=>item.type==='reasoning');assert.equal(JSON.parse(reasoning.encrypted_content).signature,'only-signature');assert.deepEqual(reasoning.summary,[],'签名型推理没有可读文本，摘要必须为空');
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

async function checkEnabled(application:any,id:string,input:any={}){const row=await application.accounts.check(id,input);const disabled=row.models.filter((model:any)=>model.enabled===false);return disabled.length?await application.accounts.preferences(id,{expectedRevision:row.revision,models:disabled.map((model:any)=>({id:model.id,enabled:true}))}):row;}

test('ChatGPT API account uses a private key, fixed upstream and revokes old leases on key replacement', {timeout:10000}, async()=>{
  const root = await mkdtemp(join(tmpdir(), 'buildr-openai-api-account-'));
  const valid = new Set(['sk-old']);
  const upstream: Array<{url:string;authorization:string|null;body?:ProtocolJson}> = [];
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url), authorization = new Headers(init.headers).get('authorization');
    if (target === 'https://api.openai.com/v1/models') {
      upstream.push({url:target,authorization});
      if (!authorization || !valid.has(authorization.replace(/^Bearer /,''))) return new Response('private', {status:401});
      return Response.json({data:[{id:'gpt-5'},{id:'text-embedding-3-small'}]});
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(String(init.body)) as ProtocolJson;
      upstream.push({url:target,authorization,body});
      return Response.json({id:'resp_fixture',object:'response',status:'completed',model:'gpt-5',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'api answer'}]}],usage:{input_tokens:2,output_tokens:2,total_tokens:4}});
    }
    throw new Error('unexpected_test_network');
  };
  const access = createModelAccess({root,providers:[createOpenAIApiModelProvider({fetch:mock})]});
  try {
    const added = await access.accounts.add({provider:'openai'});
    assert.equal(added.authType,'api-key'); assert.equal(added.modeLabel,'API Key'); assert.equal(added.group?.label,'ChatGPT'); assert.equal(added.credentialConfigured,false);
    const configured = await access.accounts.configure(added.id,{expectedRevision:added.revision,apiKey:'sk-old'});
    assert.equal(configured.status,'ready'); assert.equal(configured.credentialConfigured,true); assert.deepEqual(configured.models.map(model=>model.id),['gpt-5']);
    assert.equal(JSON.stringify(access.accounts.list()).includes('sk-old'),false);
    assert.equal((await readFile(join(root,'accounts.json'),'utf8')).includes('sk-old'),false);
    if (process.platform !== 'win32') assert.equal((await stat(join(root,'accounts',added.id,'model-api-key.json'))).mode & 0o777,0o600);
    const enabled = await access.accounts.preferences(added.id,{expectedRevision:configured.revision,models:[{id:'gpt-5',enabled:true}]});
    const input={accountId:added.id,modelId:'gpt-5',agentId:'codex',conversationId:'api-chat',runId:'run-one'};
    const lease = await access.leases.create(input);
    const response = await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,input:'hello'})});
    assert.equal(response.status,200); assert.equal((await response.json()).output[0].content[0].text,'api answer');
    assert.equal(upstream.at(-1)?.url,'https://api.openai.com/v1/responses'); assert.equal(upstream.at(-1)?.authorization,'Bearer sk-old'); assert.equal(upstream.at(-1)?.body?.store,false);
    await assert.rejects(access.accounts.configure(added.id,{expectedRevision:enabled.revision,apiKey:'sk-invalid'}),{code:'model_openai_api_key_invalid'});
    assert.equal(access.accounts.read(added.id).identity,enabled.identity);
    access.freezeMetadata();
    await assert.rejects(access.accounts.configure(added.id,{expectedRevision:enabled.revision,apiKey:'sk-after-freeze'}),{code:'model_access_closed'});
    access.freezeMetadata(false);
    valid.add('sk-new');
    const replaced = await access.accounts.configure(added.id,{expectedRevision:enabled.revision,apiKey:'sk-new'});
    assert.notEqual(replaced.identity,enabled.identity);
    const stale = await fetch(lease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,input:'late'})});
    assert.equal(stale.status,401);
  } finally { await access.close(); await rm(root,{recursive:true,force:true}); }
});

test('ChatGPT API streams tools and cancellation through the gateway for multiple executors', {timeout:10000}, async()=>{
  const root = await mkdtemp(join(tmpdir(), 'buildr-openai-api-gateway-'));
  const upstream: Array<{url:string;body:ProtocolJson}> = [];
  let cancelStarted!:()=>void;
  const cancelReady = new Promise<void>(resolve=>{cancelStarted=resolve;});
  let cancelled = false;
  const sse = (events:unknown[])=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  const mock: typeof fetch = async (url, init = {}) => {
    const target=String(url);
    if(target==='https://api.openai.com/v1/models')return Response.json({data:[{id:'gpt-5'}]});
    if(target!=='https://api.openai.com/v1/responses')throw new Error('unexpected_test_network');
    const body=JSON.parse(String(init.body)) as ProtocolJson;
    upstream.push({url:target,body});
    if(JSON.stringify(body).includes('cancel-request')){
      return new Response(new ReadableStream<Uint8Array>({
        start(controller){
          cancelStarted();
          init.signal?.addEventListener('abort',()=>{cancelled=true;controller.close();},{once:true});
        },
      }),{headers:{'content-type':'text/event-stream'}});
    }
    return sse([
      {type:'response.output_text.delta',delta:'checking'},
      {type:'response.output_item.added',output_index:1,item:{id:'call_1',type:'function_call',call_id:'call_1',name:'read_file',arguments:''}},
      {type:'response.function_call_arguments.delta',item_id:'call_1',output_index:1,delta:'{"path":"README.md"}'},
      {type:'response.function_call_arguments.done',item_id:'call_1',arguments:'{"path":"README.md"}'},
      {type:'response.completed',response:{status:'completed',output:[],usage:{input_tokens:3,output_tokens:2}}},
    ]);
  };
  const access=createModelAccess({root,providers:[createOpenAIApiModelProvider({fetch:mock})]});
  try{
    const added=await access.accounts.add({provider:'openai'});
    const configured=await access.accounts.configure(added.id,{expectedRevision:added.revision,apiKey:'sk-gateway'});
    const enabled=await access.accounts.preferences(added.id,{expectedRevision:configured.revision,models:[{id:'gpt-5',enabled:true}]});
    const leaseInput={accountId:enabled.id,modelId:'gpt-5'};
    const codex=await access.leases.create({...leaseInput,agentId:'codex',conversationId:'tool-chat',runId:'tool-run'});
    const qoder=await access.leases.create({...leaseInput,agentId:'qoder',conversationId:'qoder-chat',runId:'qoder-run'});
    const tool={type:'function',name:'read_file',description:'Read a file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}};
    const responses=await fetch(codex.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+codex.apiKey,'content-type':'application/json'},body:JSON.stringify({model:codex.model,stream:true,input:'inspect',tools:[tool]})});
    const responsesText=await responses.text();
    assert.equal(responses.status,200);assert.match(responsesText,/read_file/);assert.match(responsesText,/README\.md/);assert.match(responsesText,/response\.completed/);
    const chat=await fetch(qoder.baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+qoder.apiKey,'content-type':'application/json'},body:JSON.stringify({model:qoder.model,stream:true,messages:[{role:'user',content:'inspect'}],tools:[{type:'function',function:{name:'read_file',description:'Read a file',parameters:tool.parameters}}]})});
    const chatText=await chat.text();
    assert.equal(chat.status,200);assert.match(chatText,/read_file/);assert.match(chatText,/README\.md/);assert.match(chatText,/\[DONE\]/);
    assert.ok(upstream.length>=2);assert.ok(upstream.every(row=>row.url==='https://api.openai.com/v1/responses'));assert.ok(upstream.every(row=>String(row.body.model)==='gpt-5'));assert.ok(upstream.some(row=>JSON.stringify(row.body).includes('read_file')));
    const cancelLease=await access.leases.create({...leaseInput,agentId:'codex',conversationId:'cancel-chat',runId:'cancel-run'});
    const pending=fetch(cancelLease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+cancelLease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:cancelLease.model,stream:true,input:'cancel-request'})});
    await cancelReady;access.leases.stopRun('cancel-chat','cancel-run');
    await pending.catch(()=>undefined);
    for(let i=0;i<100&&!cancelled;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(cancelled,true);
    const late=await fetch(cancelLease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+cancelLease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:cancelLease.model,stream:true,input:'cancel-request'})});
    assert.equal(late.status,409);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('ChatGPT subscription and API-key sources remain usable at the same time', {timeout:10000}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-chatgpt-parallel-sources-'));
  const group={id:'chatgpt',label:'ChatGPT'};
  const subscription:ModelProvider={...provider(async()=>chat({content:'subscription answer'})),id:'subscription',label:'ChatGPT',authentication:{type:'oauth',label:'订阅'},group,modeLabel:'订阅'};
  const mock:typeof fetch=async(url,init={})=>{
    const target=String(url);
    if(target==='https://api.openai.com/v1/models')return Response.json({data:[{id:'gpt-5'}]});
    if(target==='https://api.openai.com/v1/responses')return Response.json({id:'resp_parallel',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'api answer'}]}]});
    throw new Error('unexpected_test_network');
  };
  const access=createModelAccess({root,providers:[subscription,createOpenAIApiModelProvider({fetch:mock})]});
  try{
    const subscriptionAdded=await access.accounts.add({provider:'subscription'});
    const subscriptionReady=await checkEnabled(access,subscriptionAdded.id);
    await access.accounts.preferences(subscriptionAdded.id,{expectedRevision:subscriptionReady.revision,models:[{id:model.id,enabled:true}]});
    const apiAdded=await access.accounts.add({provider:'openai'});
    const apiConfigured=await access.accounts.configure(apiAdded.id,{expectedRevision:apiAdded.revision,apiKey:'sk-parallel'});
    await access.accounts.preferences(apiAdded.id,{expectedRevision:apiConfigured.revision,models:[{id:'gpt-5',enabled:true}]});
    const available=access.catalog.list().models.filter(item=>item.available);
    assert.deepEqual(new Set(available.map(item=>item.accountId)),new Set([subscriptionAdded.id,apiAdded.id]));
    assert.equal(access.accounts.read(subscriptionAdded.id).status,'ready');
    assert.equal(access.accounts.read(apiAdded.id).status,'ready');
    const subscriptionLease=await access.leases.create({accountId:subscriptionAdded.id,modelId:model.id,agentId:'codex',conversationId:'subscription-chat',runId:'subscription-run'});
    const apiLease=await access.leases.create({accountId:apiAdded.id,modelId:'gpt-5',agentId:'qoder',conversationId:'api-chat',runId:'api-run'});
    const [subscriptionResponse,apiResponse]=await Promise.all([
      fetch(subscriptionLease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+subscriptionLease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:subscriptionLease.model,input:'hello'})}),
      fetch(apiLease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+apiLease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:apiLease.model,input:'hello'})}),
    ]);
    assert.equal(subscriptionResponse.status,200);assert.equal(apiResponse.status,200);
    assert.equal((await subscriptionResponse.text()).includes('subscription answer'),true);
    assert.equal((await apiResponse.text()).includes('api answer'),true);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('single generation uses the selected account without tools or persistent conversation and rejects stale identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-generate-'));const inputs:ProviderInferenceInput[]=[];
 const access=createModelAccess({root,providers:[provider(async input=>{inputs.push(input);return chat({content:'{"commitMessage":"ok"}'});})]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
  const input={accountId:ready.id,modelId:model.id,expectedIdentity:ready.identity,expectedRevision:ready.revision,agentId:'commit-message',conversationId:'temporary-1',runId:'run-1',prompt:'only supplied material',signal:new AbortController().signal};
  assert.equal(await access.generate(input),'{"commitMessage":"ok"}');
  assert.deepEqual(inputs[0].body.tools,[]);assert.deepEqual(inputs[0].body.messages,[{role:'user',content:'only supplied material'}]);assert.equal(inputs[0].modelId,model.id);
  await assert.rejects(access.generate({...input,expectedIdentity:'other'}),/来源已变化/);assert.equal(inputs.length,1);
  await access.generate({...input,conversationId:'temporary-2',runId:'run-2'});assert.equal(inputs[1].context.conversationId,'temporary-2');
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('single generation honors explicit reasoning in the selected tier and rejects unsupported effort before inference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-generate-reasoning-')),inputs:ProviderInferenceInput[]=[];
 const offering:ModelOffering={...model,reasoningEfforts:[{id:'high',label:'高'},{id:'low',label:'低'}],defaultServiceTier:'standard',serviceTiers:[
  {id:'standard',label:'标准',reasoningEfforts:[{id:'high',label:'高'},{id:'low',label:'低'}]},
  {id:'fast',label:'快速',reasoningEfforts:[{id:'medium',label:'中'}]}]};
 const source:ModelProvider={id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[offering]};},async beginLogin(){},async cancelLogin(){},async infer(input){inputs.push(input);return chat({content:'ok'});},async close(){}};}};
 const access=createModelAccess({root,providers:[source]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
  const base={accountId:ready.id,modelId:model.id,expectedIdentity:ready.identity,expectedRevision:ready.revision,agentId:'commit-message',conversationId:'temporary-reasoning',runId:'run-reasoning',prompt:'given material',signal:new AbortController().signal};
  await access.generate({...base,serviceTier:'standard',reasoningEffort:'high'});assert.equal(inputs.at(-1)!.body.reasoning_effort,'high');assert.deepEqual(inputs.at(-1)!.body.tools,[]);
  await access.generate({...base,serviceTier:'standard'});assert.equal(inputs.at(-1)!.body.reasoning_effort,'low','omitting effort keeps the existing minimum-cost default, not the previous explicit choice');
  await access.generate({...base,serviceTier:'fast',reasoningEffort:'medium'});assert.equal(inputs.at(-1)!.body.reasoning_effort,'medium');
  const before=inputs.length;
  for(const [serviceTier,reasoningEffort] of [['fast','high'],['standard','medium'],['standard','invented']]) await assert.rejects(access.generate({...base,serviceTier,reasoningEffort}),{code:'model_reasoning_effort_invalid'});
  assert.equal(inputs.length,before,'invalid tier reasoning must not reach the provider');
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('single generation rejects unsolicited tool calls and abort propagates to only that request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-generate-cancel-'));let started!:()=>void;const start=new Promise<void>(resolve=>{started=resolve;});let signal:AbortSignal|undefined;
 let mode='tool';const access=createModelAccess({root,providers:[provider(async input=>{
  if(mode==='tool')return chat({tool_calls:[{id:'x',type:'function',function:{name:'write_file',arguments:'{}'}}]});
  signal=input.signal;started();return new Promise<Response>((_,reject)=>input.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));
 })]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
  const controller=new AbortController(),input={accountId:ready.id,modelId:model.id,expectedIdentity:ready.identity,expectedRevision:ready.revision,agentId:'commit-message',conversationId:'one',runId:'one',prompt:'given',signal:controller.signal};
  await assert.rejects(access.generate(input),/纯文本/);mode='wait';const pending=access.generate({...input,conversationId:'two'});await start;controller.abort();await assert.rejects(pending);
  for(let i=0;i<20&&!signal?.aborted;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(signal?.aborted,true);
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('incomplete checks retain usable observations; confirmed logout and identity changes do not',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-check-'));
  let state:'ready'|'failed'|'expired'|'not-authenticated'|'throw'='ready',identity='account-a',checks=0,incomplete=true;
  const source:ModelProvider={id:'fixture',label:'Fixture',async open(){return{
    protocol:'chat-completions',async inspect(){checks++;if(state==='throw')throw new Error('timeout');return{status:state,incomplete:state==='failed'&&incomplete,identity,models:state==='ready'?[model]:[],...(state==='failed'?{diagnostic:'inspection_unfinished'}:{})};},
    async beginLogin(){},async cancelLogin(){},async infer(){return Response.json({});},async close(){},
  };}};
  const access=createModelAccess({root,providers:[source]});
  try{
    const added=await access.accounts.add({provider:'fixture'});await checkEnabled(access,added.id);
    const before=access.accounts.read(added.id);
    for(let i=0;i<5;i++)access.catalog.list();
    assert.equal(checks,1,'cached reads must not issue inspections or invalidate models');
    for(const incomplete of ['throw','failed'] as const){
      state=incomplete;const result=await access.accounts.check(added.id);
      assert.equal(result.status,'ready');assert.equal(result.revision,before.revision);
      assert.equal(result.observedAt,before.observedAt);assert.ok(result.diagnostic);
      assert.equal(access.catalog.list().models[0].available,true);
    }
    state='ready';assert.equal((await access.accounts.check(added.id)).diagnostic,undefined);
    for(const confirmed of ['expired','not-authenticated'] as const){
      state=confirmed;assert.equal((await access.accounts.check(added.id)).status,confirmed);
      assert.equal(access.catalog.list().models[0].available,false);
      state='ready';await access.accounts.check(added.id);
    }
    state='failed';incomplete=false;
    assert.equal((await access.accounts.check(added.id)).status,'failed','confirmed failure must remain unavailable');
    assert.equal(access.catalog.list().models[0].available,false);
    state='ready';await access.accounts.check(added.id);incomplete=true;
    identity='account-b';state='failed';
    assert.equal((await access.accounts.check(added.id)).status,'failed');
    assert.deepEqual(access.catalog.list().models,[],'a different identity must not inherit the previous account catalog');
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('native decimal balances survive account persistence and failed observations without rotating selection revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-wallet-observation-'));
  let fail = false;
  const balances = [{currency:'CNY',total:'123.45',toppedUp:'120.00',granted:'3.45'}];
  const source: ModelProvider = {id:'wallet',label:'Wallet',async open(){return {
    protocol:'chat-completions',async inspect(){return {status:'ready',models:[model],quota:{available:!fail,observedAt:new Date().toISOString(),...(fail?{}:{balances})}};},
    async beginLogin(){},async cancelLogin(){},async infer(){return Response.json({});},async close(){},
  };}};
  let access = createModelAccess({root,providers:[source]});
  try {
    const added = await access.accounts.add({provider:'wallet'}), ready = await access.accounts.check(added.id);
    assert.deepEqual(ready.quota?.balances, balances);
    fail = true;
    const failed = await access.accounts.check(added.id);
    assert.equal(failed.status, 'ready'); assert.equal(failed.revision,ready.revision);
    assert.equal(failed.quota?.stale,true); assert.deepEqual(failed.quota?.balances,balances);
    await access.close(); access = createModelAccess({root,providers:[source]});
    assert.deepEqual(access.accounts.read(added.id).quota?.balances,balances);
  } finally { await access.close(); await rm(root,{recursive:true,force:true}); }
});

test('gateway bounds actual output to provider capability without overwriting native request defaults',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-output-capability-'));const seen:ProtocolJson[]=[];
 const source=provider(async input=>{seen.push(structuredClone(input.body));return chat({role:'assistant',content:'ok'});});
 const originalOpen=source.open;source.open=async input=>{const runtime=await originalOpen(input),inspect=runtime.inspect;runtime.inspect=async()=>{const value=await inspect();return {...value,models:value.models.map(model=>({...model,maxOutputTokens:2048}))};};return runtime;};
 const access=createModelAccess({root,providers:[source]});
 try{
  const added=await access.accounts.add({provider:'fixture'}),account=await checkEnabled(access,added.id),lease=await access.leases.create({accountId:account.id,modelId:model.id,agentId:'dsh',conversationId:'one',runId:'run'});
  for(const max_tokens of [128000,512,undefined]){
   const response=await fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,messages:[],...(max_tokens?{max_tokens}:{})})});assert.equal(response.status,200);await response.text();
  }
  assert.deepEqual(seen.map(body=>body.max_tokens),[2048,512,undefined]);assert.equal(lease.offering.maxOutputTokens,2048);
 }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('legacy custom account keeps its identity and model preferences after reading the catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-model-legacy-catalog-'));
  const baseUrl = 'https://gateway.example.com/v1';
  const legacyIdentity = createHash('sha256').update(`custom:chat-completions:${baseUrl}:anonymous`).digest('hex');
  const requests:string[]=[];
  const provider = createCustomModelProvider({fetch:async input => {requests.push(String(input));return Response.json({data:[{id:'manual-model'}]});}});
  const accountId = 'existing-custom';
  await writeFile(join(root,'accounts.json'),JSON.stringify({
    version:1, accounts:[{id:accountId,provider:'custom',label:'现有网关',identity:legacyIdentity,revision:'old',enabled:true,status:'ready',
      custom:{baseUrl,protocol:'chat-completions',useApiKey:false,models:[{id:'manual-model'}]},
      models:[{id:'manual-model',label:'旧模型',images:false,tools:true}]}],
    preferences:{[accountId]:{'manual-model':{enabled:true,contextWindow:16000}}},
  }),{mode:0o600});
  const access=createModelAccess({root,providers:[provider]});
  try {
    const refreshed=await access.accounts.check(accountId);
    assert.equal(refreshed.identity,legacyIdentity);
    assert.equal(refreshed.models[0]?.enabled,true);
    assert.equal(refreshed.models[0]?.contextWindow,16000);
    await assert.rejects(access.accounts.add({provider:'custom',custom:{label:'重复网关',baseUrl,protocol:'chat-completions',useApiKey:false}}),/已接入/);
    await access.accounts.discoverCustom({accountId,baseUrl,protocol:'chat-completions',modelsPath:'/catalog',useApiKey:false});
    assert.equal(requests.at(-1),baseUrl+'/catalog');
    const configuration={label:'现有网关',baseUrl,protocol:'chat-completions' as const,useApiKey:false};
    const removed=await access.accounts.configureCustom(accountId,{...configuration,expectedRevision:refreshed.revision,models:[]});
    assert.equal(removed.identity,legacyIdentity);
    assert.deepEqual(removed.models,[]);
    const restored=await access.accounts.configureCustom(accountId,{...configuration,expectedRevision:removed.revision,models:[{id:'manual-model'}]});
    assert.equal(restored.models[0]?.contextWindow,16000);
    assert.equal(restored.models[0]?.enabled,true);
  } finally {await access.close();await rm(root,{recursive:true,force:true});}
});

test('legacy duplicate accounts of a singleton source are retired with their private roots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-singleton-'));
  const singleton:ModelProvider={id:'singleton-fixture',label:'Singleton',singleton:true,async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[model]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>chat({content:'ok'}),close:async()=>{}};}};
  const account=(id:string,status:'ready'|'failed',models:ModelOffering[])=>({id,identity:'identity-'+id,provider:'singleton-fixture',label:'Singleton',revision:'revision-'+id,enabled:true,status,models});
  try{
    await mkdir(root,{recursive:true,mode:0o700});
    for(const id of ['legacy-ready','legacy-invalid'])await mkdir(join(root,'accounts',id),{recursive:true,mode:0o700});
    await writeFile(join(root,'accounts.json'),JSON.stringify({version:1,accounts:[account('legacy-invalid','failed',[]),account('legacy-ready','ready',[model])],preferences:{'legacy-invalid':{'stale-model':{enabled:true}},'legacy-ready':{}}})+'\n',{mode:0o600});
    const access=createModelAccess({root,providers:[singleton]});
    try{
      assert.deepEqual(access.accounts.list({includeDisabled:true}).accounts.map(item=>item.id),['legacy-ready']);
      await assert.rejects(stat(join(root,'accounts','legacy-invalid')),{code:'ENOENT'});
      assert.ok((await stat(join(root,'accounts','legacy-ready'))).isDirectory());
      const stored=JSON.parse(await readFile(join(root,'accounts.json'),'utf8')) as {accounts:Array<{id:string}>;preferences:Record<string,unknown>};
      assert.deepEqual(stored.accounts.map(item=>item.id),['legacy-ready']);
      assert.equal(stored.preferences['legacy-invalid'],undefined);
    }finally{await access.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('deleting an independent source removes its private credentials and keeps other accounts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-delete-'));
  const access=createModelAccess({root,providers:[provider(async()=>chat({content:'ok'}))]});
  try{
    const target=await access.accounts.add({provider:'fixture'}),other=await access.accounts.add({provider:'fixture'});
    const targetRoot=join(root,'accounts',target.id),otherRoot=join(root,'accounts',other.id);
    await mkdir(targetRoot,{recursive:true,mode:0o700});await mkdir(otherRoot,{recursive:true,mode:0o700});
    await writeFile(join(targetRoot,'model-api-key.json'),'{"apiKey":"private-target"}\n',{mode:0o600});
    await writeFile(join(otherRoot,'model-api-key.json'),'{"apiKey":"private-other"}\n',{mode:0o600});
    await assert.rejects(access.accounts.remove(target.id,{expectedRevision:'stale'}),{code:'model_revision_conflict'});
    const remaining=await access.accounts.remove(target.id,{expectedRevision:target.revision});
    assert.ok(!remaining.accounts.some(account=>account.id===target.id));
    assert.ok(remaining.accounts.some(account=>account.id===other.id));
    await assert.rejects(stat(targetRoot),{code:'ENOENT'});
    assert.equal(JSON.parse(await readFile(join(otherRoot,'model-api-key.json'),'utf8')).apiKey,'private-other');
    assert.throws(()=>access.accounts.read(target.id),{code:'model_account_missing'});
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('deleting a source with an active model request is rejected until the run stops',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-delete-active-'));let release:(()=>void)|undefined;
  const access=createModelAccess({root,providers:[provider(async input=>{await new Promise<void>(resolve=>{release=resolve;input.signal.addEventListener('abort',()=>resolve(),{once:true});});return chat({content:'ok'});})]});
  try{
    const added=await access.accounts.add({provider:'fixture'}),ready=await checkEnabled(access,added.id);
    const lease=await access.leases.create({accountId:ready.id,modelId:model.id,agentId:'codex',conversationId:'active',runId:'run'});
    const response=fetch(lease.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+lease.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:lease.model,messages:[]})});
    for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(release);
    await assert.rejects(access.accounts.remove(ready.id,{expectedRevision:ready.revision}),{code:'model_account_in_use'});
    assert.equal(access.accounts.read(ready.id).id,ready.id);
    release();await response;
    const remaining=await access.accounts.remove(ready.id,{expectedRevision:ready.revision});
    assert.equal(remaining.accounts.length,0);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('agent-managed accounts cannot be deleted from the model source list',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-delete-managed-'));
  const managed:ModelProvider={id:'managed-fixture',label:'Managed',connectionId:'fixture',async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[model]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>chat({content:'ok'}),close:async()=>{}};}};
  const access=createModelAccess({root,providers:[managed]});
  try{
    await access.ensureLinked();
    const account=access.accounts.read('managed-fixture');
    await assert.rejects(access.accounts.remove(account.id,{expectedRevision:account.revision}),{code:'model_managed_account'});
    assert.equal(access.accounts.read(account.id).id,account.id);
    const providers=access.accounts.list().providers;
    assert.deepEqual(providers.map(item=>[item.id,item.connectionId,item.linked]),[['managed-fixture','fixture',undefined]]);
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

test('deleted linked sources stay suppressed until an explicit re-add clears the marker',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-model-delete-linked-'));
  const linked:ModelProvider={id:'linked-fixture',label:'Linked',linked:true,async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[model]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>chat({content:'ok'}),close:async()=>{}};}};
  const access=createModelAccess({root,providers:[linked]});
  try{
    await access.ensureLinked();
    const account=access.accounts.read('linked-fixture');
    const accountRoot=join(root,'accounts','linked-fixture');
    await mkdir(accountRoot,{recursive:true,mode:0o700});await writeFile(join(accountRoot,'model-credential.json'),'{}\n',{mode:0o600});
    await access.accounts.remove(account.id,{expectedRevision:account.revision});
    assert.ok(!access.accounts.list({includeDisabled:true}).accounts.some(item=>item.id==='linked-fixture'));
    await access.ensureLinked();
    assert.throws(()=>access.accounts.read('linked-fixture'),{code:'model_account_missing'});
    const providers=access.accounts.list().providers;
    assert.deepEqual(providers.map(item=>[item.id,item.connectionId,item.linked]),[['linked-fixture',undefined,true]]);
    const readded=await access.accounts.add({provider:'linked-fixture'});
    assert.equal(readded.id,'linked-fixture');
    assert.equal(readded.status,'not-authenticated');
    assert.ok(access.accounts.list({includeDisabled:true}).accounts.some(item=>item.id==='linked-fixture'));
  }finally{await access.close();await rm(root,{recursive:true,force:true});}
});

for (const route of ['responses', 'messages'] as const) {
  test('Google AI OAuth through the local gateway preserves signed tool calls for ' + route, { timeout: 60_000 }, async t => {
    const { createGoogleAiSubscriptionProvider } = await import('../../src/model-access/providers/google-ai-subscription.ts');
    const root = await mkdtemp(join(tmpdir(), 'buildr-google-ai-'));
    t.after(async () => { await rm(root, { recursive: true, force: true }); });
    const requests: any[] = [];
    let status = 200, nativeRun = false, nativeAgent = '', refreshes = 0, subject = 'test-user';
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        const form = new URLSearchParams(String(init?.body));
        if (form.get('grant_type') === 'refresh_token') {
          assert.equal(form.get('refresh_token'), 'test-refresh');
          refreshes++;
        } else {
          assert.equal(form.get('code'), 'test-code');
          assert.ok(form.get('code_verifier'));
        }
        return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-access');
      if (url.endsWith('/userinfo')) return Response.json({ sub: subject });
      if (url.endsWith(':loadCodeAssist')) return Response.json({ cloudaicompanionProject: 'test-project' });
      if (url.endsWith(':fetchAvailableModels')) return Response.json({ models: { 'gemini-test': { displayName: 'Gemini Test' } } });
      if (url.endsWith(':retrieveUserQuotaSummary')) {
        return Response.json({ groups: [{ displayName: 'Gemini Models', buckets: [
          { bucketId: 'gemini-week', displayName: 'Weekly Limit', window: 'weekly', remainingFraction: 0.99 },
          { bucketId: 'gemini-five-hours', displayName: 'Five Hour Limit', window: '5h', remainingFraction: 0.97 },
        ] }] });
      }
      assert.ok(url.endsWith(':streamGenerateContent?alt=sse'));
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.project, 'test-project');
      assert.equal(payload.enabledCreditTypes, undefined);
      requests.push(payload);
      if (status !== 200) return new Response('private error', { status });
      const toolResult = payload.request.contents.flatMap((message: any) => message.parts).find((part: any) => part.functionResponse);
      if (nativeRun && toolResult) {
        assert.match(JSON.stringify(toolResult), /google-ai-native-ok/);
        assert.equal(toolResult.functionResponse.id, 'call_native');
      }
      const declarations = payload.request.tools?.flatMap((tool: any) => tool.functionDeclarations ?? []) ?? [];
      const shell = declarations.find((tool: any) => /^(bash|exec_command|shell|shell_command)$/i.test(tool.name));
      const nativeTool = shell && { name: shell.name, args: {
        [shell.name === 'exec_command' ? 'cmd' : 'command']: 'printf google-ai-native-ok',
        ...(shell.parameters?.properties?.description ? { description: 'Print fixture marker' } : {}),
      } };
      if (nativeRun && !toolResult && declarations.length) assert.ok(nativeTool, JSON.stringify(declarations.map((tool: any) => tool.name)));
      const parts = nativeRun && !toolResult && nativeTool && !String(payload.request.contents?.at(-1)?.parts?.[0]?.text).includes('compaction')
        ? [{ functionCall: { id: 'call_native', ...nativeTool }, thoughtSignature: 'test-signature' }]
        : requests.length === 1
        ? [{ functionCall: { id: 'call_google', name: 'read_file', args: { path: 'a.txt' } }, thoughtSignature: 'test-signature' }]
        : [{ text: 'Read complete' }];
      return frames([{ response: { candidates: [{ content: { parts }, finishReason: 'STOP' }] } }]);
    };
    const access = createModelAccess({ root, providers: [createGoogleAiSubscriptionProvider({ clientId: 'test-client', fetch: fakeFetch })] });
    try {
      const account = await access.accounts.add({ provider: 'google-ai-subscription' });
      await access.accounts.login(account.id, { expectedRevision: account.revision });
      let pending = access.accounts.read(account.id);
      for (let tries = 0; !pending.loginAttempt?.url && tries < 100; tries++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        pending = access.accounts.read(account.id);
      }
      const cancelledUrl = new URL(new URL(pending.loginAttempt!.url!).searchParams.get('redirect_uri')!);
      const cancelled = await access.accounts.cancelLogin(account.id, pending.loginAttempt!.id, { expectedRevision: pending.revision });
      assert.equal(cancelled.loginAttempt?.state, 'cancelled');
      await assert.rejects(fetch(cancelledUrl));
      async function authorize() {
        await access.accounts.login(account.id, { expectedRevision: access.accounts.read(account.id).revision });
        let current = access.accounts.read(account.id);
        for (let tries = 0; !current.loginAttempt?.url && tries < 100; tries++) {
          await new Promise(resolve => setTimeout(resolve, 10));
          current = access.accounts.read(account.id);
        }
        const auth = new URL(current.loginAttempt!.url!);
        const callback = new URL(auth.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', 'test-code');
        callback.searchParams.set('state', auth.searchParams.get('state')!);
        assert.equal((await fetch(callback)).status, 200);
        for (let tries = 0; current.loginAttempt?.state !== 'completed' && tries < 100; tries++) {
          await new Promise(resolve => setTimeout(resolve, 10));
          current = access.accounts.read(account.id);
        }
        assert.equal(current.loginAttempt?.state, 'completed', current.loginAttempt?.diagnostic);
        return current;
      }
      const current = await authorize();
      assert.deepEqual(current.quota?.windows?.map(window => window.remainingPercent), [99, 97]);
      const lease = await access.leases.create({
        accountId: account.id, modelId: 'gemini-test', agentId: route === 'responses' ? 'codex' : 'claude-code',
        conversationId: 'google-test', runId: 'test-run',
      });
      const send = (body: ProtocolJson) => fetch(lease.baseUrl + '/' + route, {
        method: 'POST', headers: { authorization: 'Bearer ' + lease.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ model: lease.model, stream: true, ...body }),
      });
      const firstBody = route === 'responses'
        ? { input: 'Read a.txt', tools: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }] }
        : { messages: [{ role: 'user', content: 'Read a.txt' }], tools: [{ name: 'read_file', input_schema: { type: 'object' } }], max_tokens: 128 };
      const first = await send(firstBody), wire = await first.text();
      assert.equal(first.status, 200, wire);
      assert.ok(!wire.includes('test-signature'));
      const events = wire.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
      let next: ProtocolJson;
      if (route === 'responses') {
        const output = events.find(event => event.type === 'response.completed')?.response.output;
        assert.ok(output?.some((item: any) => item.type === 'function_call' && item.call_id === 'call_google'), wire);
        next = { ...firstBody, input: [
          { role: 'user', content: 'Read a.txt' }, ...output,
          { type: 'function_call_output', call_id: 'call_google', output: 'tool result' },
        ] };
      } else {
        const blocks = events.filter(event => event.type === 'content_block_start').map(event => event.content_block);
        assert.ok(blocks.some(block => block.type === 'redacted_thinking'), wire);
        const tool = blocks.find(block => block.type === 'tool_use');
        assert.equal(tool?.id, 'call_google', wire);
        tool.input = { path: 'a.txt' };
        next = { ...firstBody, messages: [
          { role: 'user', content: 'Read a.txt' }, { role: 'assistant', content: blocks },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_google', content: 'tool result' }] },
        ] };
      }
      assert.match(await (await send(next)).text(), /Read complete/);
      const parts = requests[1].request.contents.flatMap((message: any) => message.parts);
      assert.deepEqual(parts.find((part: any) => part.functionCall), {
        functionCall: { name: 'read_file', args: { path: 'a.txt' }, id: 'call_google' }, thoughtSignature: 'test-signature',
      });
      assert.equal(parts.find((part: any) => part.functionResponse).functionResponse.id, 'call_google');
      for (status of [403, 429]) {
        const failure = await send(firstBody);
        assert.equal(failure.status, status);
        assert.equal((await failure.json()).error.code, 'google_ai_upstream_' + status);
      }
      const agents = route === 'responses'
        ? [['codex', process.env.BUILDR_TEST_CODEX_BINARY], ['dsh', process.env.BUILDR_TEST_DSH_BINARY]]
        : [['claude-code', process.env.BUILDR_TEST_CLAUDE_BINARY], ['qoder', process.env.BUILDR_TEST_QODER_BINARY]];
      for (const [agentId, executable] of agents) {
        if (!agentId || !executable) continue;
        nativeAgent = agentId;
        const initialRequests = requests.length;
        status = 200;
        nativeRun = true;
        const executor = agentId === 'dsh' ? (await import('../../src/executors/dsh/index.ts')).createDshExecutor()
          : agentId === 'qoder' ? (await import('../../src/executors/qoder/index.ts')).createQoderExecutor()
          : agentId === 'codex' ? (await import('../../src/executors/codex/index.ts')).createCodexExecutor()
          : (await import('../../src/executors/claude/index.ts')).createClaudeExecutor();
        const nativeLease = await access.leases.create({
          accountId: account.id, modelId: 'gemini-test', agentId, conversationId: 'native-test-' + agentId, runId: 'native-run',
        });
        const runtime = await executor.open({
          connectionId: agentId, configRoot: join(root, 'native-' + agentId), executable,
          ...(agentId === 'qoder' && process.env.BUILDR_TEST_QODER_ACCOUNT_ROOT ? { nativeAccountConfigRoot: process.env.BUILDR_TEST_QODER_ACCOUNT_ROOT } : {}),
          environment: { PATH: process.env.PATH ?? '', HOME: root },
          gateway: { identity: nativeLease.identity, baseUrl: nativeLease.baseUrl, apiKey: nativeLease.apiKey,
            models: [{ id: nativeLease.model, label: 'Gemini Test', tools: true, vision: false, contextWindow: 200000, maxOutputTokens: 4096 }] },
        });
        try {
          const cwd = join(root, 'workspace-' + agentId);
          await mkdir(cwd);
          if (agentId === 'qoder') {
            const account = await runtime.inspectAccount();
            assert.equal(account.status, 'ready', account.diagnostic ?? 'Qoder requires its own platform login');
          }
          const contextRef = await runtime.createContext({ cwd, permissionMode: 'full-access' });
          const items: Array<{ text?: string }> = [];
          let executionRef: import('../../src/contracts.ts').ExecutionRef | undefined;
          const replies: Promise<void>[] = [];
          await runtime.send({
            cwd, contextRef, text: 'Run the read-only fixture command.', images: [], model: nativeLease.model, permissionMode: 'full-access',
            clientRequestId: 'fb300092-3242-4c06-84ba-142ae75327a3',
            onEvent(event) {
              if (event.type === 'item') items.push(event.item);
              if (event.type === 'accepted') executionRef = event.executionRef;
              if (event.type === 'request' && event.request.kind === 'approval' && executionRef && runtime.reply) {
                const safeFixture = event.request.title === '允许 Bash？' && event.request.description?.trim() === 'printf google-ai-native-ok';
                const reply = runtime.reply({ contextRef, executionRef, requestId: event.request.id, answer: safeFixture ? 'approve' : 'deny' });
                void reply.catch(() => {});
                replies.push(reply);
              }
            },
          });
          await Promise.all(replies);
          const nativeRequests = requests.slice(initialRequests);
          assert.ok(nativeRequests.length >= 2, nativeAgent);
          assert.ok(items.some(item => item.text === 'Read complete'), JSON.stringify(items).slice(-1800));
          const replayed = nativeRequests.find(request => request.request.contents.some((message: any) =>
            message.parts.some((part: any) => part.functionResponse?.id === 'call_native')));
          assert.ok(replayed, 'Native tool result must reach the Google upstream');
          const replayedParts = replayed.request.contents.flatMap((message: any) => message.parts);
          assert.equal(replayedParts.find((part: any) => part.functionCall?.id === 'call_native')?.thoughtSignature, 'test-signature');
        } finally {
          await runtime.close();
        }
      }
      const credentialPath = join(root, 'accounts', account.id, 'model-credential.json');
      const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
      await writeFile(credentialPath, JSON.stringify({ ...credential, expiresAt: 1 }));
      status = 429;
      nativeRun = false;
      const responses = await Promise.all([send(firstBody), send(firstBody)]);
      for (const response of responses) {
        assert.equal(response.status, 429);
        await response.body?.cancel();
      }
      assert.equal(refreshes, 1);
      subject = 'different-user';
      const replacement = await authorize();
      assert.notEqual(replacement.identity, current.identity);
      assert.equal((await send(firstBody)).status, 401);
      const disconnected = await access.accounts.disconnect(account.id, { expectedRevision: access.accounts.read(account.id).revision });
      assert.equal((await send(firstBody)).status, 401);
      await access.accounts.remove(account.id, { expectedRevision: disconnected.revision });
      assert.ok(!access.accounts.list({ includeDisabled: true }).accounts.some(row => row.id === account.id));
    } finally {
      await access.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('a replacement provider retires only its verified legacy source and preserves stored bindings', async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-google-ai-migration-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const infer = async () => chat({ role: 'assistant', content: 'ok' });
  const old = { ...provider(infer), id: 'custom' };
  const replacement = {
    ...provider(infer), id: 'google-ai-subscription', linked: true,
    replacesSource: (account: { id: string }) => account.id === 'legacy-google',
    async open(input: Parameters<ModelProvider['open']>[0]) {
      const runtime = await provider(infer).open(input);
      return { ...runtime, inspect: async () => ({ ...await runtime.inspect(), credentialConfigured: true }) };
    },
  };
  const rows = ['legacy-google', 'unrelated'].map(id => ({
    id, provider: 'custom', label: id, revision: 'old', identity: id, status: 'ready', enabled: true, models: [model],
  }));
  await writeFile(join(root, 'accounts.json'), JSON.stringify({ version: 1, accounts: rows }));
  const access = createModelAccess({ root, providers: [old, replacement] });
  try {
    await access.ensureLinked();
    const input = { accountId: 'legacy-google', modelId: model.id, agentId: 'codex', conversationId: 'history', runId: 'new' };
    assert.ok(await access.leases.create(input));
    const ready = await access.accounts.check(replacement.id);
    assert.equal(ready.status, 'ready');
    assert.deepEqual(access.accounts.list({ includeDisabled: true }).accounts.map(row => row.id), ['unrelated', replacement.id]);
    assert.equal(access.accounts.read('legacy-google').identity, 'legacy-google');
    assert.ok(!access.catalog.list().models.some(row => row.accountId === 'legacy-google'));
    await assert.rejects(access.leases.create(input), { code: 'model_source_migrated' });
    await access.accounts.disconnect(ready.id, { expectedRevision: ready.revision });
    assert.ok(!access.accounts.list().accounts.some(row => row.id === 'legacy-google'));
  } finally {
    await access.close();
    await rm(root, { recursive: true, force: true });
  }
});
