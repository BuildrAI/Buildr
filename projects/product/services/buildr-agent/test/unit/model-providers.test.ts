import test from 'node:test';

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codexBody } from '../../src/model-access/providers/codex.ts';
import { createCodexModelProvider } from '../../src/model-access/providers/codex.ts';
import { createOpenAIApiModelProvider, isOpenAIChatModel, openAIResponsesBody } from '../../src/model-access/providers/openai-api.ts';
import { createQoderModelProvider } from '../../src/model-access/providers/qoder.ts';
import { createCustomModelProvider, customProtocolLabel, customProviderIdentity, normalizeCustomProtocol } from '../../src/model-access/providers/custom.ts';
import { translateRequest } from '../../src/model-access/protocols.ts';
import { validateOperation } from '../../src/process/operations.ts';
import { modelQuotaFailure } from '../../src/model-access/quota.ts';

import { fields, integer, splitFrames } from '../../src/model-access/providers/devin-codec.ts';

import type { ProviderInferenceInput } from '../../src/model-access/contracts.ts';

const sourceContext = { accountId: 'account', agentId: 'dsh', conversationId: 'one', runId: 'run', requestId: 'request' };

const input = (body: Record<string, unknown>, modelId = 'test', signal = new AbortController().signal): ProviderInferenceInput => ({ body, modelId, signal, context: sourceContext });

test('Codex account refresh overlaps catalog and quota and rejects a changed native identity', async () => {
  for(const changed of [false,true]){
    const calls:string[]=[];let release!:()=>void,identityReads=0;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const runtime=await createCodexModelProvider({owner:{
      inspect:async()=>({status:'ready'}),identity:async()=>++identityReads===1||!changed?'account-a':'account-b',
      async request(path){calls.push(path);if(path.startsWith('/codex/models')){await held;return Response.json({models:[{slug:'model'}]});}return Response.json({plan_type:'personal',rate_limit:{primary_window:{used_percent:20}}});},
    }}).open({accountId:'native-codex',configRoot:'unused',environment:{}});
    try{
      const pending=runtime.inspect();await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(calls.length,2,'quota does not wait for catalog completion');assert.equal(calls[1],'/wham/usage');release();
      const result=await pending;assert.equal(result.status,changed?'failed':'ready');
      if(changed){assert.deepEqual(result.models,[]);assert.equal(result.quota,undefined);assert.equal(result.identity,'account-b');}
      else assert.equal(result.quota?.remainingPercent,80);
    }finally{release();await runtime.close();}
  }
});

test('Devin codec rejects corrupt protobuf, oversize and invalid compressed frames', () => {
  assert.throws(() => fields(Buffer.from([0x0a, 0x02, 0x61])), /truncated/); assert.throws(() => fields(Buffer.from([0x08, 0x80])), /invalid/);
  assert.deepEqual(fields(Buffer.from([0x08, 0x96, 0x01]))[0], { field: 1, wire: 0, integer: 150n });
  const oversize = Buffer.from([0, 1, 0, 0, 1]); assert.throws(() => splitFrames(oversize), /invalid/);
  assert.throws(() => splitFrames(Buffer.from([1, 0, 0, 0, 1, 0])), /header|buffer|data|gzip|file/i);
});

test('Codex negotiation preserves tools, content order and encrypted reasoning input', () => {
  const body = codexBody({ input: [{ type: 'reasoning', encrypted_content: 'opaque' }, { type: 'function_call_output', call_id: 'call', output: 'result' }], tools: [{ type: 'function', name: 'read', parameters: { type: 'object' } }], instructions: 'system', max_output_tokens: 4096 }, 'model');
  assert.deepEqual(body.input, [{ type: 'reasoning', encrypted_content: 'opaque' }, { type: 'function_call_output', call_id: 'call', output: 'result' }]); assert.equal(body.max_output_tokens, undefined); assert.ok(Array.isArray(body.tools));
});

test('ChatGPT API keeps its key private, validates before replacement and uses the fixed Responses endpoint', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-openai-api-source-'));
  const requests: Array<{url:string;headers:Headers;body?:Record<string,unknown>}> = [];
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url), headers = new Headers(init.headers), authorization = headers.get('authorization');
    if (target === 'https://api.openai.com/v1/models') {
      requests.push({url:target,headers});
      if (authorization === 'Bearer sk-invalid') return new Response('private upstream body', {status:401});
      return Response.json({data:[
        {id:'gpt-5'},{id:'gpt-4o'},{id:'text-embedding-3-small'},{id:'gpt-image-1'},{id:'gpt-4o-transcribe'},{id:'gpt-4o-realtime-preview'},
      ]});
    }
    if (target === 'https://api.openai.com/v1/responses') {
      requests.push({url:target,headers,body:JSON.parse(String(init.body))});
      return new Response('data: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n', {headers:{'content-type':'text/event-stream'}});
    }
    throw new Error('unexpected_test_network');
  };
  const runtime = await createOpenAIApiModelProvider({fetch:mock}).open({accountId:'account',configRoot:root,environment:{}});
  t.after(async()=>{await runtime.close();await rm(root,{recursive:true,force:true});});
  const configure = runtime.configure?.bind(runtime);
  assert.ok(configure);
  const noKey = await runtime.inspect(); assert.equal(noKey.status,'not-authenticated'); assert.equal(noKey.credentialConfigured,false);
  const old = await configure({apiKey:'sk-old'});
  assert.equal(old.status,'ready'); assert.deepEqual(old.models.map(model=>model.id),['gpt-5','gpt-4o']);
  assert.ok(old.identity && !JSON.stringify(old).includes('sk-old'));
  if (process.platform !== 'win32') assert.equal((await stat(join(root,'model-api-key.json'))).mode & 0o777, 0o600);
  await assert.rejects(()=>configure({apiKey:'sk-invalid'}),{code:'model_openai_api_key_invalid'});
  assert.match(await readFile(join(root,'model-api-key.json'),'utf8'),/sk-old/);
  const response = await runtime.infer(input({input:'hello',stream:true},'gpt-5'));
  assert.equal(response.headers.get('content-type'),'text/event-stream'); await response.text();
  assert.equal(requests.at(-1)?.url,'https://api.openai.com/v1/responses');
  assert.equal(requests.at(-1)?.headers.get('authorization'),'Bearer sk-old');
  assert.equal(requests.at(-1)?.body?.store,false);
  assert.equal(requests.at(-1)?.body?.model,'gpt-5');
  assert.deepEqual(requests.at(-1)?.body?.include,['reasoning.encrypted_content']);
  const replacement = await configure({apiKey:'sk-new'});
  assert.notEqual(replacement.identity,old.identity); assert.match(await readFile(join(root,'model-api-key.json'),'utf8'),/sk-new/);
});

test('ChatGPT API filters non-chat models and normalizes Responses bodies without inventing capabilities', () => {
  for (const id of ['text-embedding-3-large','whisper-1','gpt-4o-transcribe','gpt-image-1','gpt-4o-realtime-preview','omni-moderation-latest','sora-2']) assert.equal(isOpenAIChatModel(id),false,id);
  for (const id of ['gpt-live-1','gpt-5-search-api','gpt-5-search-api-2025-10-14']) assert.equal(isOpenAIChatModel(id),false,id);
  for (const id of ['gpt-5','gpt-4.1','gpt-4o-mini','o3','o4-mini','chatgpt-4o-latest']) assert.equal(isOpenAIChatModel(id),true,id);
  const body = openAIResponsesBody({input:'hello',include:['reasoning.encrypted_content'],max_output_tokens:128},'gpt-5');
  assert.equal(body.model,'gpt-5'); assert.equal(body.store,false); assert.deepEqual(body.include,['reasoning.encrypted_content']);
});

test('ChatGPT API uses official model-page capabilities, labels and conservative fallback', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-openai-api-capabilities-'));
  const mock: typeof fetch = async url => {
    if (String(url) !== 'https://api.openai.com/v1/models') throw new Error('unexpected_test_network');
    return Response.json({data:[
      {id:'gpt-6.1-sol'},
      {id:'gpt-5.4-mini-2026-03-17'},
      {id:'gpt-live-1'},
      {id:'gpt-5-search-api'},
      {id:'gpt-future-chat'},
    ]});
  };
  const runtime = await createOpenAIApiModelProvider({fetch:mock}).open({accountId:'account',configRoot:root,environment:{}});
  t.after(async()=>{await runtime.close();await rm(root,{recursive:true,force:true});});
  const configure = runtime.configure?.bind(runtime);
  assert.ok(configure);
  const result = await configure({apiKey:'sk-capabilities'});
  assert.deepEqual(result.models.map(model=>model.id),['gpt-6.1-sol','gpt-5.4-mini-2026-03-17','gpt-future-chat']);
  const sol = result.models.find(model=>model.id==='gpt-6.1-sol')!;
  assert.equal(sol.label,'GPT-6.1-Sol');
  assert.equal(sol.family,'GPT-6.1');
  assert.equal(sol.images,true);
  assert.equal(sol.tools,true);
  assert.equal(sol.contextWindow,1_050_000);
  assert.equal(sol.maxOutputTokens,128_000);
  assert.deepEqual(sol.reasoningEfforts?.map(effort=>effort.id),['low','medium','high','xhigh','max']);
  assert.equal(sol.defaultReasoningEffort,'medium');
  const snapshot = result.models.find(model=>model.id==='gpt-5.4-mini-2026-03-17')!;
  assert.equal(snapshot.label,'GPT-5.4-Mini');
  assert.equal(snapshot.contextWindow,400_000);
  assert.equal(snapshot.id,'gpt-5.4-mini-2026-03-17');
  const unknown = result.models.find(model=>model.id==='gpt-future-chat')!;
  assert.equal(unknown.label,'GPT-Future-Chat');
  assert.equal(unknown.images,false);
  assert.equal(unknown.contextWindow,undefined);
  assert.equal(unknown.reasoningEfforts,undefined);
});

test('Qoder merges app-only models and uses add-on quota instead of reporting exhaustion', {timeout:10000}, async t => {
  const calls:string[]=[];
  const owner={
    inspect:async()=>({status:'ready' as const}),
    identity:async()=> 'qoder-personal',
    async request(path:string){
      calls.push(path);
      if(path==='/models')return Response.json({
        chat:[{key:'auto',display_name:'Auto',enable:true,is_vl:true,is_reasoning:false,context_config:{'200K':{token_count:200000,is_default:true}}}],
        app:[
          {key:'auto',display_name:'Auto',enable:true,is_vl:true,is_reasoning:false,context_config:{'200K':{token_count:200000,is_default:true}}},
          {key:'lmodel',display_name:'QoDuck',enable:true,is_vl:true,is_reasoning:true,thinking_config:{enabled:{efforts:{low:{},high:{is_default:true}},is_default:true}},context_config:{'1M':{token_count:1000000},'200K':{token_count:200000,is_default:true}}},
        ],
      });
      if(path==='/usage')return Response.json({
        userType:'personal_lite',isQuotaExceeded:false,expiresAt:1795276800000,
        userQuota:{total:1000,used:1000,remaining:0,percentage:1,unit:'credits'},
        addOnQuota:{total:2700,used:1101,remaining:1599,percentage:0.41,unit:'credits'},
      });
      throw new Error('unexpected_qoder_path');
    },
  };
  const runtime = await createQoderModelProvider(owner).open({accountId:'qoder',configRoot:'unused',environment:{}});
  t.after(async()=>{await runtime.close();});
  const result = await runtime.inspect();
  assert.equal(result.status,'ready');
  assert.deepEqual(result.models.map(model=>model.id),['auto','lmodel']);
  const duck = result.models.find(model=>model.id==='lmodel')!;
  assert.equal(duck.label,'QoDuck');
  assert.equal(duck.images,true);
  assert.deepEqual(duck.reasoningEfforts?.map(effort=>effort.id),['low','high']);
  assert.equal(duck.defaultReasoningEffort,'high');
  assert.deepEqual(result.quota?.windows?.map(window=>[window.id,window.label,window.remainingPercent,window.remainingCredits,window.totalCredits]),[['credits','套餐内 Credits',0,0,1000],['add-on','资源包',59.2,1599,2700]]);
  assert.equal(result.quota?.remainingPercent,43.2);
  assert.match(result.quota?.summary??'',/套餐 0 \/ 1,000 credits/);
  assert.match(result.quota?.summary??'',/资源包 1,599 \/ 2,700 credits/);
  assert.equal(modelQuotaFailure({provider:'native-qoder',label:'Qoder',accountLabel:'Qoder',quota:result.quota},{creditFactor:0.5},Date.now()),undefined);
  assert.equal(calls.filter(path=>path==='/models').length,1);
  assert.equal(calls.filter(path=>path==='/usage').length,1);
});

test('Qoder keeps org resource package compatibility and does not block models when quota read fails', {timeout:10000}, async t => {
  let usageStatus=200;
  const owner={
    inspect:async()=>({status:'ready' as const}),
    identity:async()=> 'qoder-team',
    async request(path:string){
      if(path==='/models')return Response.json({chat:[{key:'auto',display_name:'Auto',enable:true,is_vl:true}]});
      if(path==='/usage')return usageStatus===200
        ? Response.json({userType:'teams',userQuota:{total:1000,remaining:1000,percentage:0},orgResourcePackage:{available:true,cap:500,remaining:250}})
        : new Response('private upstream body',{status:500});
      throw new Error('unexpected_qoder_path');
    },
  };
  const runtime = await createQoderModelProvider(owner).open({accountId:'qoder',configRoot:'unused',environment:{}});
  t.after(async()=>{await runtime.close();});
  const ready = await runtime.inspect();
  assert.deepEqual(ready.quota?.windows?.map(window=>[window.id,window.remainingPercent,window.remainingCredits,window.totalCredits]),[['credits',100,1000,1000],['org-package',50,250,500]]);
  assert.equal(ready.quota?.remainingPercent,83.3);
  usageStatus=500;
  const failed = await runtime.inspect();
  assert.equal(failed.status,'ready');
  assert.deepEqual(failed.models.map(model=>model.id),['auto']);
  assert.equal(failed.quota?.available,false);
});

test('Qoder exposes dedicated resource packages as separate windows without changing account exhaustion', {timeout:10000}, async t => {
  const owner={
    inspect:async()=>({status:'ready' as const}),
    identity:async()=> 'qoder-cn',
    async request(path:string){
      if(path==='/models')return Response.json({chat:[{key:'auto',display_name:'Auto',enable:true}]});
      if(path==='/usage')return Response.json({
        userType:'personal_lite',isQuotaExceeded:false,expiresAt:1795276800000,
        userQuota:{total:1000,remaining:1000,percentage:0,unit:'credits'},
        dedicatedResourcePackages:[
          {id:'pkg-qwen',available:true,status:'ACTIVE',total:2000,remaining:2000,expiresAt:1797000000000,displayLabels:[
            {dimension:'title',valueI18n:{'zh-CN':'Qwen 专属积分','en-US':'Qwen credits'}},
            {dimension:'description',valueI18n:{'zh-CN':'在模型选择器中选择 Qwen 系列模型时优先抵扣该积分。'}},
          ]},
          {id:'pkg-expired',available:false,status:'EXPIRED',total:1000,remaining:0},
          {available:true,total:500,remaining:250},
          {id:'pkg-used',available:true,percentage:0.25},
        ],
      });
      throw new Error('unexpected_qoder_path');
    },
  };
  const runtime = await createQoderModelProvider(owner,'qoder-cn').open({accountId:'qoder-cn',configRoot:'unused',environment:{}});
  t.after(async()=>{await runtime.close();});
  const result = await runtime.inspect();
  assert.equal(result.status,'ready');
  assert.deepEqual(result.quota?.windows?.map(window=>[window.id,window.label,window.remainingPercent,window.remainingCredits,window.totalCredits]),[
    ['credits','套餐内 Credits',100,1000,1000],
    ['dedicated:pkg-qwen','Qwen 专属积分',100,2000,2000],
    ['dedicated:2','千问专属积分',50,250,500],
    ['dedicated:pkg-used','千问专属积分',75,undefined,undefined],
  ]);
  assert.equal(result.quota?.windows?.find(window=>window.id==='dedicated:pkg-qwen')?.resetsAt,new Date(1797000000000).toISOString());
  assert.equal(result.quota?.remainingPercent,100);
  assert.doesNotMatch(result.quota?.summary??'',/专属/);
});

test('ChatGPT API does not apply the catalog timeout to an in-progress model response', async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-openai-api-long-response-'));
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === 'https://api.openai.com/v1/models') return Response.json({data:[{id:'gpt-5'}]});
    if (target === 'https://api.openai.com/v1/responses') {
      assert.ok(!init.signal?.aborted);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.ok(!init.signal?.aborted);
      return Response.json({status:'completed',output:[]});
    }
    throw new Error('unexpected_test_network');
  };
  const runtime = await createOpenAIApiModelProvider({fetch:mock,requestTimeoutMs:5}).open({accountId:'account',configRoot:root,environment:{}});
  t.after(async()=>{await runtime.close();await rm(root,{recursive:true,force:true});});
  const configure = runtime.configure?.bind(runtime);
  assert.ok(configure);
  await configure({apiKey:'sk-long-response'});
  const response = await runtime.infer(input({input:'hello'},'gpt-5'));
  assert.equal(response.status,200);
});

test('custom discovery returns candidates only, omits authorization without a key and keeps failures bounded', {timeout:10000}, async () => {
  const calls: Array<{ url: string; authorization: string | null; redirect: string | undefined }> = [];
  let mode: 'json' | 'unauthorized' | 'html' | 'network' = 'json';
  const provider = createCustomModelProvider({ fetch: async (url, init = {}) => {
    calls.push({ url: String(url), authorization: new Headers(init.headers).get('authorization'), redirect: init.redirect as string | undefined });
    if (mode === 'network') throw new Error('network down Bearer sk-secret');
    if (mode === 'unauthorized') return new Response('private upstream body', { status: 401 });
    if (mode === 'html') return new Response('<html>not a catalog</html>', { headers: { 'content-type': 'text/html' } });
    return Response.json({ data: [{ id: 'alpha', display_name: 'Alpha' }, { id: 'beta' }, { id: 'bad id' }, {}] });
  } });
  const keyless = await provider.discover!({ baseUrl: 'https://gateway.example.com/v1/', protocol: 'chat-completions', useApiKey: false });
  assert.deepEqual(keyless.models, [{ id: 'alpha', label: 'Alpha' }, { id: 'beta' }]);
  assert.ok(keyless.observedAt);
  assert.deepEqual(calls.at(-1), { url: 'https://gateway.example.com/v1/models', authorization: null, redirect: 'error' });
  const keyed = await provider.discover!({ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-discovery' });
  assert.deepEqual(keyed.models.map(model => model.id), ['alpha', 'beta']);
  assert.equal(calls.at(-1)?.authorization, 'Bearer sk-discovery');
  await assert.rejects(provider.discover!({ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true }), { code: 'model_custom_api_key_required' });
  mode = 'unauthorized';
  const rejected = await provider.discover!({ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-discovery' });
  assert.equal(rejected.incomplete, true); assert.deepEqual(rejected.models, []); assert.match(rejected.diagnostic!, /认证/); assert.ok(!rejected.diagnostic!.includes('sk-discovery'));
  mode = 'html';
  const noCatalog = await provider.discover!({ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false });
  assert.equal(noCatalog.incomplete, true); assert.match(noCatalog.diagnostic!, /手动添加/);
  mode = 'network';
  const unreachable = await provider.discover!({ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false });
  assert.equal(unreachable.incomplete, true); assert.match(unreachable.diagnostic!, /无法连接/);
  assert.ok(calls.every(call => call.url === 'https://gateway.example.com/v1/models'));
});

test('custom runtime validates authentication before saving and infers through chat completions with bounded errors', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-runtime-'));
  let mode: 'ok' | 'auth' | 'forbidden' | 'limited' | 'failed' | 'network' = 'auth';
  const calls: Array<{ url: string; authorization: string | null; redirect: string | undefined; body?: Record<string, unknown> }> = [];
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url), authorization = new Headers(init.headers).get('authorization');
    if (target === 'https://gateway.example.com/v1/models') {
      calls.push({ url: target, authorization, redirect: init.redirect as string | undefined });
      if (mode === 'auth') return new Response('private upstream body', { status: 401 });
      if (mode === 'network') throw new Error('network down');
      return Response.json({ data: [{ id: 'ignored' }] });
    }
    if (target === 'https://gateway.example.com/v1/chat/completions') {
      calls.push({ url: target, authorization, redirect: init.redirect as string | undefined, body: JSON.parse(String(init.body)) });
      if (mode === 'auth') return new Response('private', { status: 401 });
      if (mode === 'forbidden') return new Response('private', { status: 403 });
      if (mode === 'limited') return new Response('private', { status: 429 });
      if (mode === 'failed') return new Response('private', { status: 500 });
      if (mode === 'network') throw new Error('network down Bearer sk-custom');
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'answer' }, finish_reason: 'stop' }] });
    }
    throw new Error('unexpected_test_network');
  };
  const runtime = await createCustomModelProvider({ fetch: mock }).open({ accountId: 'custom-account', configRoot: root, environment: {}, custom: { protocol: 'chat-completions', baseUrl: 'https://gateway.example.com/v1', useApiKey: true, models: [{ id: 'my-model-v2', label: 'My Model', contextWindow: 32000 }] } });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal(runtime.protocol, 'chat-completions');
  assert.equal((await runtime.inspect()).status, 'not-authenticated');
  const configure = { label: '我的网关', baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-custom', models: [{ id: 'my-model-v2', label: 'My Model', contextWindow: 32000 }] };
  await assert.rejects(runtime.configureCustom!(configure), { code: 'model_custom_authentication_failed' });
  await assert.rejects(readFile(join(root, 'model-api-key.json'), 'utf8'));
  mode = 'ok';
  const configured = await runtime.configureCustom!(configure);
  assert.equal(configured.status, 'ready'); assert.equal(configured.curatedModels, true);
  assert.deepEqual(configured.models.map(model => [model.id, model.label, model.contextWindow, model.images, model.tools]), [['my-model-v2', 'My Model', 32000, false, true]]);
  assert.ok(!JSON.stringify(configured).includes('sk-custom'));
  if (process.platform !== 'win32') assert.equal((await stat(join(root, 'model-api-key.json'))).mode & 0o777, 0o600);
  const response = await runtime.infer(input({ messages: [{ role: 'user', content: 'hello' }] }, 'my-model-v2'));
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/chat/completions');
  assert.equal(calls.at(-1)?.authorization, 'Bearer sk-custom');
  assert.equal(calls.at(-1)?.body?.model, 'my-model-v2');
  assert.equal(calls.at(-1)?.redirect, 'error');
  for (const [state, status, code] of [['auth', 401, 'model_custom_authentication_failed'], ['forbidden', 403, 'model_custom_permission_denied'], ['limited', 429, 'model_custom_rate_limited'], ['failed', 500, 'model_custom_upstream_failed']] as const) {
    mode = state;
    const failed = await runtime.infer(input({ messages: [] }, 'my-model-v2'));
    assert.equal(failed.status, status); assert.equal(((await failed.json()) as { error: { code: string } }).error.code, code);
  }
  mode = 'network';
  const unreachable = await runtime.infer(input({ messages: [] }, 'my-model-v2'));
  assert.equal(unreachable.status, 502); assert.equal(((await unreachable.json()) as { error: { code: string } }).error.code, 'model_custom_network_failed');
  mode = 'ok';
  const keyless = await runtime.configureCustom!({ ...configure, useApiKey: false, models: [{ id: 'my-model-v2' }] });
  assert.equal(keyless.status, 'ready'); assert.equal(keyless.credentialConfigured, false);
  await assert.rejects(readFile(join(root, 'model-api-key.json'), 'utf8'));
  await runtime.infer(input({ messages: [] }, 'my-model-v2'));
  assert.equal(calls.at(-1)?.authorization, null);
});

test('custom runtime keeps a curated catalog and succeeds when the endpoint has no model list', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-nocatalog-'));
  const runtime = await createCustomModelProvider({ fetch: async () => new Response('not found', { status: 404 }) }).open({ accountId: 'custom-account', configRoot: root, environment: {}, custom: { protocol: 'chat-completions', baseUrl: 'https://gateway.example.com/v1', useApiKey: false, models: [{ id: 'manual-a' }] } });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  const configured = await runtime.configureCustom!({ label: '手工网关', baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false, models: [{ id: 'manual-a', label: 'Manual A' }] });
  assert.equal(configured.status, 'ready'); assert.match(configured.diagnostic!, /手动维护/);
  assert.deepEqual(configured.models.map(model => model.id), ['manual-a']);
  const inspected = await runtime.inspect();
  assert.equal(inspected.status, 'ready'); assert.deepEqual(inspected.models.map(model => model.id), ['manual-a']);
});

test('custom protocols accept the four declared values, reject others and stay in runtime identity', async t => {
  const protocols = ['chat-completions', 'responses', 'anthropic-messages', 'gemini'] as const;
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-protocol-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const identities = new Set<string>();
  for (const protocol of protocols) {
    assert.equal(normalizeCustomProtocol(protocol), protocol);
    assert.ok(customProtocolLabel(protocol));
    const config = { protocol, baseUrl: 'https://gateway.example.com/v1', useApiKey: false, models: [] };
    identities.add(customProviderIdentity(config));
    const runtime = await createCustomModelProvider().open({ accountId: `custom-${protocol}`, configRoot: root, environment: {}, custom: config });
    assert.equal(runtime.protocol, protocol);
    await runtime.close();
  }
  assert.equal(identities.size, protocols.length);
  for (const value of ['openai-responses', 'Chat-Completions', '', undefined, null, 42]) assert.throws(() => normalizeCustomProtocol(value), { code: 'model_custom_protocol_unsupported' });
});

test('custom runtime builds protocol-specific endpoints, credentials and Gemini request bodies', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-protocols-'));
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/models')) return Response.json({ data: [{ id: 'ignored' }] });
    calls.push({ url: target, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return Response.json({ ok: true });
  };
  const provider = createCustomModelProvider({ fetch: mock });
  const open = (protocol: 'chat-completions' | 'responses' | 'anthropic-messages' | 'gemini', useApiKey: boolean) => provider.open({ accountId: `custom-${protocol}`, configRoot: root, environment: {}, custom: { protocol, baseUrl: 'https://gateway.example.com/v1', useApiKey, models: [{ id: 'model' }] } });
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const configure = (protocol: 'chat-completions' | 'responses' | 'anthropic-messages' | 'gemini', useApiKey: boolean, apiKey?: string) => ({ label: '网关', baseUrl: 'https://gateway.example.com/v1', protocol, useApiKey, ...(apiKey ? { apiKey } : {}), models: [{ id: 'model' }] });

  const chat = await open('chat-completions', true);
  await chat.configureCustom!(configure('chat-completions', true, 'sk-chat'));
  await chat.infer(input({ messages: [] }, 'chat-model'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/chat/completions');
  assert.equal(calls.at(-1)?.headers.get('authorization'), 'Bearer sk-chat');
  assert.equal(calls.at(-1)?.body.model, 'chat-model');
  await chat.close();

  const responses = await open('responses', true);
  await responses.configureCustom!(configure('responses', true, 'sk-responses'));
  await responses.infer(input({ input: [] }, 'responses-model'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/responses');
  assert.equal(calls.at(-1)?.headers.get('authorization'), 'Bearer sk-responses');
  assert.equal(calls.at(-1)?.body.model, 'responses-model');
  await responses.close();

  const anthropic = await open('anthropic-messages', true);
  await anthropic.configureCustom!(configure('anthropic-messages', true, 'sk-anthropic'));
  await anthropic.infer(input({ messages: [] }, 'claude-model'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/messages');
  assert.equal(calls.at(-1)?.headers.get('x-api-key'), 'sk-anthropic');
  assert.equal(calls.at(-1)?.headers.get('authorization'), 'Bearer sk-anthropic');
  assert.equal(calls.at(-1)?.headers.get('anthropic-version'), '2023-06-01');
  assert.equal(calls.at(-1)?.body.model, 'claude-model');
  await anthropic.close();

  const anthropicKeyless = await open('anthropic-messages', false);
  await anthropicKeyless.configureCustom!(configure('anthropic-messages', false));
  await anthropicKeyless.infer(input({ messages: [] }, 'claude-model'));
  assert.equal(calls.at(-1)?.headers.get('x-api-key'), null);
  assert.equal(calls.at(-1)?.headers.get('authorization'), null);
  assert.equal(calls.at(-1)?.headers.get('anthropic-version'), '2023-06-01');
  await anthropicKeyless.close();

  const gemini = await open('gemini', true);
  await gemini.configureCustom!(configure('gemini', true, 'AIza-key'));
  await gemini.infer(input({ contents: [], model: 'ignored', stream: false }, 'models/gemini-2.5-pro'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/models/gemini-2.5-pro:generateContent');
  assert.equal(calls.at(-1)?.headers.get('x-goog-api-key'), 'AIza-key');
  assert.equal(calls.at(-1)?.headers.get('authorization'), null);
  assert.equal('model' in calls.at(-1)!.body, false);
  assert.equal('stream' in calls.at(-1)!.body, false);
  await gemini.infer(input({ contents: [], model: 'ignored', stream: true }, 'gemini-2.5-pro'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/models/gemini-2.5-pro:streamGenerateContent?alt=sse');
  assert.equal(calls.at(-1)?.headers.get('accept'), 'text/event-stream');
  assert.equal('stream' in calls.at(-1)!.body, false);
  await gemini.infer(input(translateRequest({ messages: [], stream: true }, 'chat-completions', 'gemini', { encode: () => '', decode: () => ({}) }), 'gemini-2.5-pro'));
  assert.equal(calls.at(-1)?.url, 'https://gateway.example.com/v1/models/gemini-2.5-pro:streamGenerateContent?alt=sse');
  await gemini.close();

  const geminiKeyless = await open('gemini', false);
  await geminiKeyless.configureCustom!(configure('gemini', false));
  await geminiKeyless.infer(input({ contents: [] }, 'gemini-2.5-flash'));
  assert.equal(calls.at(-1)?.headers.get('x-goog-api-key'), null);
  assert.equal(calls.at(-1)?.headers.get('authorization'), null);
  await geminiKeyless.close();
});

test('custom discovery follows protocol-specific catalogs with bounded pagination', {timeout:10000}, async () => {
  const anthropicCalls: Array<{ url: string; headers: Headers }> = [];
  const anthropic = createCustomModelProvider({ fetch: async (url, init = {}) => {
    const target = String(url);
    anthropicCalls.push({ url: target, headers: new Headers(init.headers) });
    if (target.endsWith('/models?limit=1000')) return Response.json({ data: [{ id: 'claude-a', display_name: 'Claude A' }], has_more: true, last_id: 'claude-a' });
    if (target.endsWith('after_id=claude-a')) return Response.json({ data: [{ id: 'claude-b' }], has_more: false });
    throw new Error('unexpected_test_network');
  } });
  const anthropicResult = await anthropic.discover!({ baseUrl: 'https://anthropic.example.com/v1', protocol: 'anthropic-messages', useApiKey: true, apiKey: 'sk-ant' });
  assert.deepEqual(anthropicResult.models, [{ id: 'claude-a', label: 'Claude A' }, { id: 'claude-b' }]);
  assert.equal(anthropicCalls.length, 2);
  assert.equal(anthropicCalls[0]?.headers.get('x-api-key'), 'sk-ant');
  assert.equal(anthropicCalls[0]?.headers.get('authorization'), 'Bearer sk-ant');
  assert.equal(anthropicCalls[0]?.headers.get('anthropic-version'), '2023-06-01');

  let anthropicPage = 0;
  const partial = createCustomModelProvider({ fetch: async () => {
    anthropicPage++;
    if (anthropicPage === 1) return Response.json({ data: [{ id: 'claude-a' }], has_more: true, last_id: 'claude-a' });
    return new Response('private', { status: 500 });
  } });
  const partialResult = await partial.discover!({ baseUrl: 'https://anthropic.example.com/v1', protocol: 'anthropic-messages', useApiKey: false });
  assert.deepEqual(partialResult.models.map(model => model.id), ['claude-a']);
  assert.equal(partialResult.incomplete, true);
  assert.match(partialResult.diagnostic!, /后续模型列表读取失败/);

  const geminiCalls: Array<{ url: string; headers: Headers }> = [];
  let geminiMode: 'ok' | 'bad-key' = 'ok';
  const gemini = createCustomModelProvider({ fetch: async (url, init = {}) => {
    const target = String(url);
    geminiCalls.push({ url: target, headers: new Headers(init.headers) });
    if (geminiMode === 'bad-key') return new Response('private', { status: 400 });
    if (target.endsWith('/models?pageSize=1000')) return Response.json({ models: [{ name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent', 'countTokens'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'page-2' });
    if (target.endsWith('pageToken=page-2')) return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    throw new Error('unexpected_test_network');
  } });
  const geminiResult = await gemini.discover!({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', useApiKey: true, apiKey: 'AIza-key' });
  assert.deepEqual(geminiResult.models, [{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }, { id: 'gemini-2.5-flash' }]);
  assert.equal(geminiCalls.length, 2);
  assert.equal(geminiCalls[0]?.headers.get('x-goog-api-key'), 'AIza-key');
  assert.equal(geminiCalls[0]?.headers.get('authorization'), null);
  assert.equal(geminiCalls[1]?.url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=page-2');
  geminiMode = 'bad-key';
  const rejected = await gemini.discover!({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', useApiKey: true, apiKey: 'AIza-key' });
  assert.equal(rejected.incomplete, true); assert.match(rejected.diagnostic!, /认证/); assert.ok(!rejected.diagnostic!.includes('AIza-key'));
  geminiMode = 'ok';
  const keyless = await gemini.discover!({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', useApiKey: false });
  assert.equal(geminiCalls.at(-1)?.headers.get('x-goog-api-key'), null);
});

test('custom provider operations validate closed configuration and discovery inputs', () => {
  validateOperation('models.accounts.configureCustom', ['account', { label: 'Gateway', baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-x', models: [{ id: 'm' }] }]);
  validateOperation('models.accounts.discoverCustom', [{ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false }]);
  assert.throws(() => validateOperation('models.accounts.configureCustom', ['account', { label: 'Gateway', baseUrl: 'https://gateway.example.com/v1', protocol: 'openai-responses', useApiKey: false }]), { code: 'agent_process_input_invalid' });
  assert.throws(() => validateOperation('models.accounts.discoverCustom', [{ baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false, unexpected: true }]), { code: 'agent_process_input_invalid' });
});
