import test from 'node:test';

import assert from 'node:assert/strict';

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { translateRequest, translateResponse, type OpaqueReasoning } from '../../src/model-access/protocols.ts';
import { modelQuotaFailure } from '../../src/model-access/quota.ts';
import { upstreamFailure } from '../../src/model-access/errors.ts';
import { createModelAccess } from '../../src/model-access/application.ts';
import { createCustomModelProvider } from '../../src/model-access/providers/custom.ts';

import type { CustomProviderConfigureInput, ModelProvider, ProtocolJson } from '../../src/model-access/contracts.ts';

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

const protocolFrames = (events: ProtocolJson[]) => new Response(events.map(event => 'data: '+JSON.stringify(event)+'\n\n').join(''), {headers:{'content-type':'text/event-stream'}});
const protocolOptions = (stream = true) => ({model:'fixture',stream,request:{},opaque:noOpaque,signal:new AbortController().signal});
const protocolEvents = (text: string): ProtocolJson[] => text.split('\n').filter(line=>line.startsWith('data: ')&&line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6)));
const responseCall = (id: string, name: string, args: string) => ({type:'function_call',id:'fc_'+id,call_id:id,name,arguments:args});
const addedCall = (id: string, name: string, output_index = 0) => ({type:'response.output_item.added',output_index,item:responseCall(id,name,'')});
const doneCall = (id: string, name: string, args: string, output_index = 0) => ({type:'response.output_item.done',output_index,item:responseCall(id,name,args)});
const completedCalls = (output: ProtocolJson[] = []) => ({type:'response.completed',response:{status:'completed',output,usage:{input_tokens:1,output_tokens:1}}});

test('Responses complete parameter receipts recover missing deltas without duplicating repeated snapshots', async t => {
  const args='{"file_path":"a.txt"}';
  for(const receipt of ['arguments','item','final']) await t.test(receipt,async()=>{
    const events:ProtocolJson[]=[addedCall('read','Read')];
    if(receipt==='arguments') events.push({type:'response.function_call_arguments.done',item_id:'fc_read',arguments:args});
    if(receipt==='item') events.push(doneCall('read','Read',args));
    events.push(completedCalls([responseCall('read','Read',args)]));
    const response=await translateResponse(protocolFrames(events),'responses','chat-completions',protocolOptions());
    const chunks=protocolEvents(await response.text());
    const calls=chunks.flatMap(chunk=>(chunk.choices as ProtocolJson[]).flatMap(choice=>(choice.delta as ProtocolJson).tool_calls as ProtocolJson[]??[]));
    assert.equal((calls[0].function as ProtocolJson).name,'Read');
    assert.equal(calls.map(call=>(call.function as ProtocolJson).arguments??'').join(''),args);
    assert.equal(calls.filter(call=>call.id==='read').length,1);
  });
});

test('Responses interleaved parallel calls preserve their own partial parameters, snapshots and content order', async()=>{
  const a='{"path":"a"}',b='{"command":"pwd"}';
  const source=protocolFrames([
    {type:'response.output_text.delta',delta:'before'},addedCall('a','Read'),
    {type:'response.function_call_arguments.delta',item_id:'fc_a',delta:'{"path":'},
    {type:'response.output_text.delta',delta:'between'},addedCall('b','Bash',1),
    {type:'response.function_call_arguments.delta',item_id:'fc_b',delta:b},
    {type:'response.function_call_arguments.done',item_id:'fc_a',arguments:a},
    doneCall('a','Read',a),doneCall('b','Bash',b,1),doneCall('a','Read',a),
    {type:'response.output_text.delta',delta:'after'},completedCalls([responseCall('b','Bash',b),responseCall('a','Read',a)]),
  ]);
  const response=await translateResponse(source,'responses','anthropic-messages',protocolOptions());
  const events=protocolEvents(await response.text());
  const starts=events.filter(event=>event.type==='content_block_start').map(event=>event.content_block as ProtocolJson);
  assert.deepEqual(starts.map(block=>block.type),['text','tool_use','text','tool_use','text']);
  assert.deepEqual(starts.filter(block=>block.type==='tool_use').map(block=>[block.id,block.name]),[['a','Read'],['b','Bash']]);
  assert.deepEqual(events.filter(event=>event.type==='content_block_delta'&&(event.delta as ProtocolJson).type==='input_json_delta').map(event=>(event.delta as ProtocolJson).partial_json),[a,b]);
});

test('cross-protocol conflicting complete arguments or tool identities fail before publishing a callable tool', async t=>{
  const args='{"path":"a"}';
  for(const kind of ['parameters','identity','name','repeated-snapshot']) await t.test(kind,async()=>{
    const events:ProtocolJson[]=[addedCall('a','Read'),{type:'response.function_call_arguments.delta',item_id:'fc_a',delta:args}];
    if(kind==='parameters') events.push(doneCall('a','Read','{"path":"b"}'));
    if(kind==='identity') events.push({type:'response.output_item.done',item:{...responseCall('a','Read',args),call_id:'other'}});
    if(kind==='name') events.push(doneCall('a','Bash',args));
    if(kind==='repeated-snapshot') events.push(doneCall('a','Read',args),doneCall('a','Read',args+' '));
    events.push(completedCalls());
    const response=await translateResponse(protocolFrames(events),'responses','chat-completions',protocolOptions());
    const chunks=protocolEvents(await response.text());
    assert.equal((chunks.find(chunk=>chunk.error)?.error as ProtocolJson).code,'model_tool_stream_inconsistent');
    assert.ok(!chunks.some(chunk=>(chunk.choices as ProtocolJson[]|undefined)?.some(choice=>(choice.delta as ProtocolJson).tool_calls)));
    await assert.rejects(translateResponse(protocolFrames(events),'responses','chat-completions',protocolOptions(false)),{code:'model_tool_stream_inconsistent'});
  });
});

test('fragmented Chat tool names and reordered parallel entries publish complete identities to Responses',async()=>{
  const response=await translateResponse(protocolFrames([
    {choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'read_',arguments:'{"path":'}},{index:1,id:'b',function:{name:'run_',arguments:'{"command":'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:1,function:{name:'command',arguments:'"pwd"}'}},{index:0,function:{name:'file',arguments:'"a"}'}}]},finish_reason:'tool_calls'}]},
  ]),'chat-completions','responses',protocolOptions());
  const events=protocolEvents(await response.text());
  assert.deepEqual(events.filter(event=>event.type==='response.output_item.added').map(event=>(event.item as ProtocolJson).name),['read_file','run_command']);
  const final=events.find(event=>event.type==='response.completed')!.response as ProtocolJson;
  assert.deepEqual((final.output as ProtocolJson[]).map(item=>[item.call_id,item.name,item.arguments]),[['a','read_file','{"path":"a"}'],['b','run_command','{"command":"pwd"}']]);
});

test('cross-protocol tools require complete identities and valid parameter JSON rather than inventing empty input',async()=>{
  for(const call of [{name:'Read',arguments:'{}'},{id:'a',arguments:'{}'},{id:'a',name:'Read',arguments:''},{id:'a',name:'Read',arguments:'{"path":'}]){
    const source=Response.json({choices:[{message:{tool_calls:[{id:call.id,function:{name:call.name,arguments:call.arguments}}]},finish_reason:'tool_calls'}]});
    await assert.rejects(translateResponse(source,'chat-completions','responses',protocolOptions(false)),(error:any)=>['model_tool_identity_incomplete','model_tool_arguments_invalid'].includes(error.code));
  }
});

test('Anthropic explicit empty input is preserved only when its closed block has no parameter deltas',async t=>{
  for(const variant of ['empty','deltas','missing'] as const)await t.test(variant,async()=>{
    const source:ProtocolJson[]=[{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call-a',name:'read',...(variant==='missing'?{}:{input:{}})}}];
    if(variant==='deltas')source.push({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"path":'}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'"a"}'}});
    source.push({type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'});
    const response=await translateResponse(protocolFrames(source),'anthropic-messages','responses',protocolOptions());
    const events=protocolEvents(await response.text());
    if(variant==='missing'){
      assert.equal(((events.find(event=>event.type==='response.failed')!.response as ProtocolJson).error as ProtocolJson).code,'model_tool_arguments_invalid');
      assert.ok(!events.some(event=>event.type==='response.output_item.added'));
    }else{
      const final=events.find(event=>event.type==='response.completed')!.response as ProtocolJson;
      assert.equal((final.output as ProtocolJson[])[0].arguments,variant==='empty'?'{}':'{"path":"a"}');
    }
  });
});

test('same-protocol Responses retains the original stream and its complete tool receipt unchanged',async()=>{
  const source=protocolFrames([addedCall('a','Read'),doneCall('a','Read','{"path":"a"}'),completedCalls()]);
  const expected=await source.clone().text();
  const response=await translateResponse(source,'responses','responses',protocolOptions());
  assert.equal(response,source);assert.equal(await response.text(),expected);
});

test('cross-protocol buffering is bounded after a tool while preceding text remains independently readable',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  async function* source(){yield {type:'response.output_text.delta',delta:'first'};await gate;yield addedCall('a','Read');yield doneCall('a','Read','{}');yield completedCalls();}
  const iterator=source();const encoder=new TextEncoder();
  const response=await translateResponse(new Response(new ReadableStream({async pull(controller){const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode('data: '+JSON.stringify(next.value)+'\n\n'));}}),{headers:{'content-type':'text/event-stream'}}),'responses','chat-completions',protocolOptions());
  const reader=response.body!.getReader();await reader.read();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/first/);release();while(!(await reader.read()).done){}reader.releaseLock();
  const oversized=await translateResponse(protocolFrames([addedCall('a','Read'),{type:'response.output_text.delta',delta:'x'.repeat(4*1024*1024)},{type:'response.output_text.delta',delta:'x'.repeat(4*1024*1024)},doneCall('a','Read','{}'),completedCalls()]),'responses','chat-completions',protocolOptions());
  const events=protocolEvents(await oversized.text());assert.equal((events.find(event=>event.error)?.error as ProtocolJson).code,'model_stream_too_large');
  assert.ok(!events.some(event=>(event.choices as ProtocolJson[]|undefined)?.some(choice=>(choice.delta as ProtocolJson).tool_calls)));
});

const plainProvider: ModelProvider = {
  id: 'fixture', label: 'Fixture',
  async open() { return { protocol: 'chat-completions', inspect: async () => ({ status: 'ready' as const, models: [] }), beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => Response.json({}), close: async () => {} }; },
};

test('custom accounts persist user endpoints while keeping API keys private and rejecting invalid declarations', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-account-'));
  const requests: Array<{ url: string; authorization: string | null; redirect: string | undefined }> = [];
  const mock: typeof fetch = async (url, init = {}) => {
    requests.push({ url: String(url), authorization: new Headers(init.headers).get('authorization'), redirect: init.redirect as string | undefined });
    if (String(url) === 'https://gateway.example.com/v1/models') return Response.json({ data: [{ id: 'discovered-model', name: 'Discovered Model' }] });
    throw new Error('unexpected_test_network');
  };
  const access = createModelAccess({ root, providers: [createCustomModelProvider({ fetch: mock }), plainProvider] });
  t.after(async () => { await access.close(); await rm(root, { recursive: true, force: true }); });
  assert.deepEqual(access.accounts.list().providers.map(provider => [provider.id, provider.custom]), [['custom', true], ['fixture', undefined]]);
  const config: CustomProviderConfigureInput = { label: ' 我的网关 ', baseUrl: 'https://gateway.example.com/v1/', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-private', models: [{ id: 'my-model-v2', label: 'My Model', contextWindow: 32000 }] };
  const created = await access.accounts.add({ provider: 'custom', custom: config });
  assert.equal(created.label, '我的网关');
  assert.deepEqual(created.custom, { protocol: 'chat-completions', baseUrl: 'https://gateway.example.com/v1', useApiKey: true, models: [{ id: 'my-model-v2', label: 'My Model', contextWindow: 32000 }] });
  assert.equal(created.status, 'ready');
  assert.equal(created.credentialConfigured, true);
  assert.deepEqual(created.models.map(model => [model.id, model.label, model.contextWindow, model.enabled]), [['my-model-v2', 'My Model', 32000, false]]);
  assert.ok(!JSON.stringify(access.accounts.list()).includes('sk-private'));
  assert.equal((await readFile(join(root, 'accounts.json'), 'utf8')).includes('sk-private'), false);
  if (process.platform !== 'win32') assert.equal((await stat(join(root, 'accounts', created.id, 'model-api-key.json'))).mode & 0o777, 0o600);
  assert.deepEqual(requests, [{ url: 'https://gateway.example.com/v1/models', authorization: 'Bearer sk-private', redirect: 'error' }]);
  const before = access.accounts.list().accounts.length;
  const invalid: Array<[Partial<CustomProviderConfigureInput>, string]> = [
    [{ baseUrl: 'ftp://gateway.example.com/v1' }, 'model_custom_url_invalid'],
    [{ baseUrl: 'https://user:pass@gateway.example.com/v1' }, 'model_custom_url_credentials'],
    [{ baseUrl: 'gateway.example.com/v1' }, 'model_custom_url_invalid'],
    [{ baseUrl: 'https://gateway.example.com/v1?token=1' }, 'model_custom_url_invalid'],
    [{ baseUrl: 'https://' + 'a'.repeat(2050) + '.com' }, 'model_custom_url_invalid'],
    [{ protocol: 'openai-responses' }, 'model_custom_protocol_unsupported'],
    [{ label: '   ' }, 'model_custom_name_invalid'],
  ];
  for (const [patch, code] of invalid) await assert.rejects(access.accounts.add({ provider: 'custom', custom: { ...config, ...patch } }), { code });
  assert.equal(access.accounts.list().accounts.length, before, 'invalid declarations must not create accounts');
  assert.equal(requests.length, 1, 'invalid declarations never reach the endpoint');
  await assert.rejects(access.accounts.add({ provider: 'custom' }), { code: 'model_custom_config_required' });
  await assert.rejects(access.accounts.add({ provider: 'fixture', custom: config }), { code: 'model_custom_unsupported' });
});

test('custom identity rotation releases account leases while observation-only changes keep revisions', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-identity-'));
  let tick = 0;
  const mock: typeof fetch = async url => {
    if (String(url) === 'https://gateway.example.com/v1/models') return Response.json({ data: [{ id: 'ignored' }] });
    throw new Error('unexpected_test_network');
  };
  const access = createModelAccess({ root, now: () => new Date(Date.UTC(2026, 10, 12, 0, 0, tick++)), providers: [createCustomModelProvider({ fetch: mock })] });
  t.after(async () => { await access.close(); await rm(root, { recursive: true, force: true }); });
  const base: CustomProviderConfigureInput = { label: '我的网关', baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-one', models: [{ id: 'model-a' }] };
  const added = await access.accounts.add({ provider: 'custom', custom: base });
  const enabled = await access.accounts.preferences(added.id, { expectedRevision: added.revision, models: [{ id: 'model-a', enabled: true }] });
  const lease = await access.leases.create({ accountId: added.id, modelId: 'model-a', expectedIdentity: enabled.identity, agentId: 'dsh', conversationId: 'chat', runId: 'run-one' });
  const reobserved = await access.accounts.configureCustom(added.id, { ...base, apiKey: undefined, expectedRevision: enabled.revision });
  assert.equal(reobserved.revision, enabled.revision, 'the same endpoint and credential keep the selection revision');
  assert.notEqual(reobserved.observedAt, enabled.observedAt, 'a fresh endpoint observation still records its time');
  assert.equal(reobserved.models.find(model => model.id === 'model-a')?.enabled, true, 'model enablement survives reconfiguration');
  const rotated = await access.accounts.configureCustom(added.id, { ...base, apiKey: 'sk-two', expectedRevision: reobserved.revision });
  assert.notEqual(rotated.identity, enabled.identity);
  assert.notEqual(rotated.revision, reobserved.revision);
  assert.throws(() => access.leases.updateRun(lease.identity, 'run-two'), { code: 'model_binding_missing' });
  await assert.rejects(access.leases.create({ accountId: added.id, modelId: 'model-a', expectedIdentity: enabled.identity, agentId: 'dsh', conversationId: 'chat', runId: 'run-two' }), { code: 'model_account_identity_changed' });
  const fresh = await access.leases.create({ accountId: added.id, modelId: 'model-a', expectedIdentity: rotated.identity, agentId: 'dsh', conversationId: 'chat', runId: 'run-two' });
  assert.notEqual(fresh.identity, lease.identity);
  assert.equal(fresh.baseUrl.startsWith('http://127.0.0.1:'), true);
  const stored = await readFile(join(root, 'accounts.json'), 'utf8');
  assert.ok(!stored.includes('sk-one') && !stored.includes('sk-two'));
  assert.match(await readFile(join(root, 'accounts', added.id, 'model-api-key.json'), 'utf8'), /sk-two/);
});
