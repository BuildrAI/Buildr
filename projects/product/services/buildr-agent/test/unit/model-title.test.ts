import assert from 'node:assert/strict';
import test from 'node:test';
import { generateGatewayTitle, generateModelTitle, lowestReasoningEffort, titleAbortError, titleTokenCap } from '../../src/executors/model-title.ts';

const input=()=>({contextRef:{id:'work-context'},cwd:'/work',description:JSON.stringify({messages:[{role:'user',text:'新的分支方向'}]}),signal:new AbortController().signal});

for(const protocol of ['chat-completions','anthropic-messages'] as const)test('model title is tool-free and based only on the supplied new instruction: '+protocol,async()=>{
  const title=await generateModelTitle(input(),'chosen-model',protocol,async init=>{
    const body=JSON.parse(String(init.body));
    assert.equal(body.model,'chosen-model');assert.equal(body.stream,false);assert.deepEqual(body.tools,[]);assert.equal(body.max_tokens,128);
    assert.ok(body.messages[0].content.includes('新的分支方向'));assert.ok(!JSON.stringify(body).includes('work-context'));
    return Response.json(protocol==='chat-completions'?{choices:[{message:{content:'{"title":"新的方向"}'},finish_reason:'stop'}]}:{content:[{type:'text',text:'{"title":"新的方向"}'}],stop_reason:'end_turn'});
  });
  assert.equal(title,'新的方向');
});

test('title rejects tools, truncated or malformed output and oversized bodies',async()=>{
  await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{tool_calls:[{}]}}]})),/tools_forbidden/);
  await assert.rejects(generateModelTitle(input(),'m','anthropic-messages',async()=>Response.json({content:[{type:'tool_use'}]})),/tools_forbidden/);
  await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{content:'{"title":"truncated"}'},finish_reason:'length'}]})),/output_invalid/);
  await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>Response.json({choices:[{message:{content:'not JSON'}}]})),/output_invalid/);
  await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>new Response('x'.repeat(33000))),/output_too_large/);
});

test('a cancelled DSH title never issues the auxiliary model request',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(generateModelTitle({...input(),signal:controller.signal},'m','chat-completions',async()=>{calls++;return Response.json({});}));
  assert.equal(calls,0);
});

for(const failure of ['network',429,503] as const)test('DSH title retries transient failure then succeeds: '+failure,async()=>{
  let calls=0;
  const title=await generateModelTitle(input(),'m','chat-completions',async()=>{
    if(++calls<3){if(failure==='network')throw new TypeError('fetch failed');return new Response('temporary',{status:failure});}
    return Response.json({choices:[{message:{content:'{"title":"恢复标题"}'},finish_reason:'stop'}]});
  });
  assert.equal(title,'恢复标题');assert.equal(calls,3);
});
test('DSH title retry budget, nonretryable errors and cancellation are bounded',async()=>{
  let calls=0;
  await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>{calls++;return new Response('',{status:503});}),/title_failed/);assert.equal(calls,3);
  calls=0;await assert.rejects(generateModelTitle(input(),'m','chat-completions',async()=>{calls++;return new Response('',{status:401});}),/title_failed/);assert.equal(calls,1);
  calls=0;const controller=new AbortController();
  await assert.rejects(generateModelTitle({...input(),signal:controller.signal},'m','chat-completions',async()=>{calls++;controller.abort();return new Response('',{status:503});}));assert.equal(calls,1);
});

test('DSH title retries a dropped response body after releasing its reader',async()=>{
 let calls=0;
 const title=await generateModelTitle(input(),'m','chat-completions',async()=>{
  if(++calls===1)return new Response(new ReadableStream({start(controller){controller.error(new TypeError('connection terminated'));}}));
  return Response.json({choices:[{message:{content:'{"title":"读取恢复"}'},finish_reason:'stop'}]});
 });
 assert.equal(title,'读取恢复');assert.equal(calls,2);
});


test('lowestReasoningEffort selects lowest advertised option and honors allowed set', () => {
  assert.equal(lowestReasoningEffort(undefined), undefined);
  assert.equal(lowestReasoningEffort([]), undefined);
  assert.equal(lowestReasoningEffort(['high', 'low', 'medium']), 'low');
  assert.equal(lowestReasoningEffort([{ id: 'high' }, { id: 'minimal' }, { id: 'low' }]), 'minimal');
  assert.equal(lowestReasoningEffort([{ id: 'low' }, { id: 'none' }, { id: 'off' }]), 'none');
  assert.equal(
    lowestReasoningEffort([{ id: 'off' }, { id: 'minimal' }, { id: 'medium' }, { id: 'low' }], new Set(['low', 'medium', 'high'])),
    'low',
  );
  assert.equal(lowestReasoningEffort([{ id: 'off' }], new Set(['low', 'high'])), undefined);
});

test('titleTokenCap widens budget only for active thinking while honoring model cap', () => {
  assert.equal(titleTokenCap(undefined, undefined), 128);
  assert.equal(titleTokenCap(8192, undefined), 128);
  assert.equal(titleTokenCap(8192, 'off'), 128);
  assert.equal(titleTokenCap(8192, 'none'), 128);
  assert.equal(titleTokenCap(8192, 'disabled'), 128);
  assert.equal(titleTokenCap(64, 'off'), 64);
  assert.equal(titleTokenCap(undefined, 'low'), 512);
  assert.equal(titleTokenCap(8192, 'minimal'), 512);
  assert.equal(titleTokenCap(256, 'high'), 256);
});

test('generateModelTitle and generateGatewayTitle forward protocol-specific reasoning effort and token headroom', async () => {
  const seen: Array<Record<string, unknown>> = [];
  for (const protocol of ['chat-completions', 'anthropic-messages'] as const) {
    const title = await generateModelTitle(input(), 'reasoner', protocol, async init => {
      seen.push(JSON.parse(String(init.body)));
      return Response.json(protocol === 'chat-completions'
        ? { choices: [{ message: { content: '{"title":"协议标题"}' }, finish_reason: 'stop' }] }
        : { content: [{ type: 'text', text: '{"title":"协议标题"}' }], stop_reason: 'end_turn' });
    }, titleTokenCap(4096, 'low'), 'low');
    assert.equal(title, '协议标题');
  }
  assert.equal(seen[0]!.reasoning_effort, 'low');
  assert.equal(seen[0]!.max_tokens, 512);
  assert.equal('output_config' in seen[0]!, false);
  assert.deepEqual(seen[1]!.output_config, { effort: 'low' });
  assert.equal(seen[1]!.max_tokens, 512);
  assert.equal('reasoning_effort' in seen[1]!, false);

  const http = await import('node:http');
  const requests: Array<{ url?: string; auth?: string; body: Record<string, unknown> }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: '{"title":"网关标题"}' }], stop_reason: 'end_turn' }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as { port: number };
    const title = await generateGatewayTitle({
      identity: 'gw-1',
      baseUrl: `http://127.0.0.1:${port}/`,
      apiKey: 'secret-token',
      models: [{ id: 'gw-model', label: 'GW', maxOutputTokens: 2048, reasoningEfforts: [{ id: 'off', label: 'Off' }, { id: 'low', label: 'Low' }] }],
    }, input(), 'anthropic-messages', new Set(['low', 'medium', 'high']));
    assert.equal(title, '网关标题');
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, '/messages');
    assert.equal(requests[0]!.auth, 'Bearer secret-token');
    assert.deepEqual(requests[0]!.body.output_config, { effort: 'low' });
    assert.equal(requests[0]!.body.max_tokens, 512);
  } finally {
    server.close();
  }
});

test('titleAbortError distinguishes agent_title_timeout from external cancellation AbortError', async () => {
  const timeoutController = new AbortController();
  timeoutController.abort(new Error('agent_title_timeout'));
  const timeoutErr = titleAbortError(timeoutController.signal);
  assert.equal(timeoutErr.message, 'agent_title_timeout');
  assert.notEqual(timeoutErr.name, 'AbortError');
  await assert.rejects(
    generateModelTitle({ ...input(), signal: timeoutController.signal }, 'm', 'chat-completions', async () => Response.json({})),
    err => err instanceof Error && err.message === 'agent_title_timeout' && err.name !== 'AbortError',
  );

  const cancelController = new AbortController();
  cancelController.abort();
  const cancelErr = titleAbortError(cancelController.signal);
  assert.equal(cancelErr.message, 'agent_title_cancelled');
  assert.equal(cancelErr.name, 'AbortError');
  await assert.rejects(
    generateModelTitle({ ...input(), signal: cancelController.signal }, 'm', 'chat-completions', async () => Response.json({})),
    err => err instanceof Error && err.message === 'agent_title_cancelled' && err.name === 'AbortError',
  );
});
