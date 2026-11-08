import test from 'node:test';

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codexBody } from '../../src/model-access/providers/codex.ts';
import { createCodexModelProvider } from '../../src/model-access/providers/codex.ts';
import { createOpenAIApiModelProvider, isOpenAIChatModel, openAIResponsesBody } from '../../src/model-access/providers/openai-api.ts';

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
  for (const id of ['gpt-5','gpt-4.1','gpt-4o-mini','o3','o4-mini','chatgpt-4o-latest']) assert.equal(isOpenAIChatModel(id),true,id);
  const body = openAIResponsesBody({input:'hello',include:['reasoning.encrypted_content'],max_output_tokens:128},'gpt-5');
  assert.equal(body.model,'gpt-5'); assert.equal(body.store,false); assert.deepEqual(body.include,['reasoning.encrypted_content']);
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
